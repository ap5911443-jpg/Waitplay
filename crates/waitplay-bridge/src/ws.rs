//! WebSocket side of the bridge (port of wsServer.ts): a registry of connected clients, broadcasts, the per-connection
//! protocol (initial snapshot, ping/pong, request_state) and the 15 s protocol-level ping heartbeat.

use crate::server::BridgeState;
use futures_util::{SinkExt, StreamExt};
use serde_json::Value;
use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex, MutexGuard};
use std::time::Duration;
use tokio::io::{AsyncRead, AsyncWrite};
use tokio::sync::mpsc::{unbounded_channel, UnboundedReceiver, UnboundedSender};
use tokio::task::JoinHandle;
use tokio_tungstenite::tungstenite::error::{CapacityError, Error as WsError};
use tokio_tungstenite::tungstenite::protocol::frame::coding::CloseCode;
use tokio_tungstenite::tungstenite::protocol::{CloseFrame, Message, WebSocketConfig};
use tokio_tungstenite::WebSocketStream;
use waitplay_core::{now_ms, AgentEventPayload, AgentSessionInfo, BridgeClientMessage};

pub const HEARTBEAT_INTERVAL: Duration = Duration::from_secs(15);
pub const MAX_PAYLOAD: usize = 64 * 1024;

pub fn websocket_config() -> WebSocketConfig {
    WebSocketConfig::default().max_message_size(Some(MAX_PAYLOAD)).max_frame_size(Some(MAX_PAYLOAD))
}

pub struct WsHub {
    clients: Mutex<HashMap<u64, UnboundedSender<Message>>>,
    next_id: AtomicU64,
    heartbeat: Mutex<Option<JoinHandle<()>>>,
}

impl WsHub {
    pub fn new() -> Arc<WsHub> {
        Arc::new(WsHub { clients: Mutex::new(HashMap::new()), next_id: AtomicU64::new(0), heartbeat: Mutex::new(None) })
    }

    fn clients(&self) -> MutexGuard<'_, HashMap<u64, UnboundedSender<Message>>> {
        self.clients.lock().unwrap_or_else(|e| e.into_inner())
    }

    /// Starts the ping heartbeat (needs a Tokio runtime). Clients whose channel is gone are dropped from the registry.
    pub fn start_heartbeat(self: &Arc<Self>) {
        let hub = Arc::downgrade(self);
        let handle = tokio::spawn(async move {
            let mut tick = tokio::time::interval_at(tokio::time::Instant::now() + HEARTBEAT_INTERVAL, HEARTBEAT_INTERVAL);
            loop {
                tick.tick().await;
                let Some(hub) = hub.upgrade() else { break };
                hub.clients().retain(|_, tx| tx.send(Message::Ping(Vec::new().into())).is_ok());
            }
        });
        *self.heartbeat.lock().unwrap_or_else(|e| e.into_inner()) = Some(handle);
    }

    /// Adds a client; messages sent on the returned sender are written to its socket in order.
    pub fn register(&self) -> (u64, UnboundedSender<Message>, UnboundedReceiver<Message>) {
        let id = self.next_id.fetch_add(1, Ordering::Relaxed);
        let (tx, rx) = unbounded_channel();
        self.clients().insert(id, tx.clone());
        (id, tx, rx)
    }

    pub fn unregister(&self, id: u64) {
        self.clients().remove(&id);
    }

    pub fn broadcast(&self, message: &BridgeClientMessage) {
        let text = encode(message);
        self.clients().retain(|_, tx| tx.send(Message::text(text.clone())).is_ok());
    }

    pub fn broadcast_event(&self, payload: &AgentEventPayload, session: &AgentSessionInfo) {
        self.broadcast(&BridgeClientMessage::AgentEvent { payload: payload.clone() });
        self.broadcast(&BridgeClientMessage::SessionUpdated { session: session.clone() });
    }

    pub fn broadcast_session_update(&self, session: &AgentSessionInfo) {
        self.broadcast(&BridgeClientMessage::SessionUpdated { session: session.clone() });
    }

    pub fn connected_count(&self) -> usize {
        self.clients().len()
    }

    /// Stops the heartbeat and asks every client to go away (1001).
    pub fn close(&self) {
        if let Some(h) = self.heartbeat.lock().unwrap_or_else(|e| e.into_inner()).take() {
            h.abort();
        }
        let drained: Vec<_> = self.clients().drain().collect();
        for (_, tx) in drained {
            let _ = tx.send(Message::Close(Some(CloseFrame { code: CloseCode::Away, reason: "Server shutting down".into() })));
        }
    }
}

fn encode(message: &BridgeClientMessage) -> String {
    serde_json::to_string(message).expect("bridge messages always serialize")
}

fn send(tx: &UnboundedSender<Message>, message: &BridgeClientMessage) {
    let _ = tx.send(Message::text(encode(message)));
}

/// Drives one upgraded connection until either side closes it.
pub async fn run_connection<S>(ws: WebSocketStream<S>, remote: SocketAddr, hub: Arc<WsHub>, state: Arc<BridgeState>)
where
    S: AsyncRead + AsyncWrite + Unpin,
{
    let mut ws = ws;
    if !crate::security::is_allowed_remote(&remote) {
        let _ = ws.close(Some(CloseFrame { code: CloseCode::Policy, reason: "Forbidden: Non-loopback client".into() })).await;
        return;
    }

    let (id, tx, mut rx) = hub.register();
    // Current state snapshot on connect (health first, then the session list).
    send(&tx, &BridgeClientMessage::HealthCheck { health: (state.get_health)() });
    send(&tx, &BridgeClientMessage::SessionList { sessions: state.sessions.get_all_sessions() });

    let (mut sink, mut stream) = ws.split();
    loop {
        tokio::select! {
            out = rx.recv() => match out {
                Some(message) => {
                    let closing = matches!(message, Message::Close(_));
                    if sink.send(message).await.is_err() || closing {
                        break;
                    }
                }
                None => break,
            },
            incoming = stream.next() => match incoming {
                Some(Ok(Message::Text(text))) => on_client_message(text.as_bytes(), &state, &tx),
                Some(Ok(Message::Binary(bytes))) => on_client_message(&bytes, &state, &tx),
                Some(Ok(Message::Close(_))) | None => break,
                Some(Ok(_)) => {}
                Some(Err(WsError::Capacity(CapacityError::MessageTooLong { .. }))) => {
                    let _ = sink.send(Message::Close(Some(CloseFrame { code: CloseCode::Size, reason: "Max payload size exceeded".into() }))).await;
                    break;
                }
                Some(Err(_)) => break,
            },
        }
    }
    hub.unregister(id);
    let _ = sink.close().await;
}

fn on_client_message(raw: &[u8], state: &BridgeState, tx: &UnboundedSender<Message>) {
    // Malformed client messages are ignored.
    let Ok(Value::Object(message)) = serde_json::from_slice::<Value>(raw) else { return };
    match message.get("type").and_then(Value::as_str) {
        Some("ping") => send(tx, &BridgeClientMessage::Pong { timestamp: now_ms() }),
        Some("request_state") => snapshot_for_request(state, tx),
        _ => {}
    }
}

/// `request_state` answers with the session list first, then health (the reverse of the connect snapshot).
fn snapshot_for_request(state: &BridgeState, tx: &UnboundedSender<Message>) {
    send(tx, &BridgeClientMessage::SessionList { sessions: state.sessions.get_all_sessions() });
    send(tx, &BridgeClientMessage::HealthCheck { health: (state.get_health)() });
}
