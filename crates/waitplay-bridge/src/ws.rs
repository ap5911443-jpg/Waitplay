//! WebSocket side of the bridge (port of wsServer.ts): a registry of connected clients, broadcasts, the per-connection
//! protocol (initial snapshot, ping/pong, request_state) and the 15 s protocol-level ping heartbeat.
//!
//! Security notes: the upgrade itself is authenticated in `server.rs` (token, Origin, Host). What is sent to clients is reduced
//! to what a status display needs: event payloads carry no prompt text and sessions carry no free-text fields (see
//! [`sanitize_payload`] / [`sanitize_session`]). Each client has a bounded queue; a client that stops reading is dropped instead of
//! making the bridge buffer without limit.

use crate::limits::WS_CLIENT_QUEUE;
use crate::server::BridgeState;
use futures_util::{SinkExt, StreamExt};
use serde_json::{Map, Value};
use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex, MutexGuard};
use std::time::Duration;
use tokio::io::{AsyncRead, AsyncWrite};
use tokio::sync::mpsc::{channel, Receiver, Sender, WeakSender};
use tokio::task::JoinHandle;
use tokio_tungstenite::tungstenite::error::{CapacityError, Error as WsError};
use tokio_tungstenite::tungstenite::protocol::frame::coding::CloseCode;
use tokio_tungstenite::tungstenite::protocol::{CloseFrame, Message, WebSocketConfig};
use tokio_tungstenite::WebSocketStream;
use waitplay_core::{now_ms, AgentEventPayload, AgentSessionInfo, BridgeClientMessage};

pub const HEARTBEAT_INTERVAL: Duration = Duration::from_secs(15);
pub const MAX_PAYLOAD: usize = 64 * 1024;

/// The only event `data` fields that leave the bridge over WebSocket. Prompt text, task summaries and free-form tool arguments stay
/// out: a status display needs the model and tool name, not what the user typed.
const BROADCAST_DATA_KEYS: [&str; 4] = ["model", "tool", "terminal", "promptTime"];

pub fn websocket_config() -> WebSocketConfig {
    WebSocketConfig::default().max_message_size(Some(MAX_PAYLOAD)).max_frame_size(Some(MAX_PAYLOAD))
}

/// A copy of the event with its `data` reduced to [`BROADCAST_DATA_KEYS`].
pub fn sanitize_payload(payload: &AgentEventPayload) -> AgentEventPayload {
    let mut out = payload.clone();
    out.data = payload.data.as_ref().map(|d| {
        let mut kept = Map::new();
        for k in BROADCAST_DATA_KEYS {
            if let Some(v) = d.get(k) {
                kept.insert(k.to_string(), v.clone());
            }
        }
        kept
    });
    out
}

/// A copy of the session without its free-text fields (the user's task summary and the agent's permission question).
pub fn sanitize_session(session: &AgentSessionInfo) -> AgentSessionInfo {
    let mut out = session.clone();
    out.intent = None;
    out.waiting_for_input_prompt = None;
    out.last_error = None;
    out.cwd = None; // a path says where the user works
    out.pid = None;
    out.tty = None;
    out
}

pub struct WsHub {
    clients: Mutex<HashMap<u64, Sender<Message>>>,
    next_id: AtomicU64,
    heartbeat: Mutex<Option<JoinHandle<()>>>,
}

impl WsHub {
    pub fn new() -> Arc<WsHub> {
        Arc::new(WsHub { clients: Mutex::new(HashMap::new()), next_id: AtomicU64::new(0), heartbeat: Mutex::new(None) })
    }

    fn clients(&self) -> MutexGuard<'_, HashMap<u64, Sender<Message>>> {
        self.clients.lock().unwrap_or_else(|e| e.into_inner())
    }

    /// Starts the ping heartbeat (needs a Tokio runtime). Clients whose queue is gone or full are dropped from the registry.
    pub fn start_heartbeat(self: &Arc<Self>) {
        let hub = Arc::downgrade(self);
        let handle = tokio::spawn(async move {
            let mut tick = tokio::time::interval_at(tokio::time::Instant::now() + HEARTBEAT_INTERVAL, HEARTBEAT_INTERVAL);
            loop {
                tick.tick().await;
                let Some(hub) = hub.upgrade() else { break };
                hub.clients().retain(|_, tx| tx.try_send(Message::Ping(Vec::new().into())).is_ok());
            }
        });
        *self.heartbeat.lock().unwrap_or_else(|e| e.into_inner()) = Some(handle);
    }

    /// Adds a client. The hub keeps the only strong sender: when the hub drops a client (queue full, shutdown) the receiver ends and
    /// the connection closes. The returned weak sender is for replies to that client.
    pub fn register(&self) -> (u64, WeakSender<Message>, Receiver<Message>) {
        let id = self.next_id.fetch_add(1, Ordering::Relaxed);
        let (tx, rx) = channel(WS_CLIENT_QUEUE);
        let weak = tx.downgrade();
        self.clients().insert(id, tx);
        (id, weak, rx)
    }

    pub fn unregister(&self, id: u64) {
        self.clients().remove(&id);
    }

    pub fn broadcast(&self, message: &BridgeClientMessage) {
        let text = encode(&sanitize_message(message));
        self.clients().retain(|_, tx| tx.try_send(Message::text(text.clone())).is_ok());
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
            let _ = tx.try_send(Message::Close(Some(CloseFrame { code: CloseCode::Away, reason: "Server shutting down".into() })));
        }
    }
}

/// Every message that goes to a client passes here, so no code path can forget to strip.
fn sanitize_message(message: &BridgeClientMessage) -> BridgeClientMessage {
    match message {
        BridgeClientMessage::AgentEvent { payload } => BridgeClientMessage::AgentEvent { payload: sanitize_payload(payload) },
        BridgeClientMessage::SessionUpdated { session } => BridgeClientMessage::SessionUpdated { session: sanitize_session(session) },
        BridgeClientMessage::SessionList { sessions } => BridgeClientMessage::SessionList { sessions: sessions.iter().map(sanitize_session).collect() },
        other => other.clone(),
    }
}

fn encode(message: &BridgeClientMessage) -> String {
    serde_json::to_string(message).expect("bridge messages always serialize")
}

fn send(tx: &WeakSender<Message>, message: &BridgeClientMessage) {
    if let Some(tx) = tx.upgrade() {
        let _ = tx.try_send(Message::text(encode(&sanitize_message(message))));
    }
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

fn on_client_message(raw: &[u8], state: &BridgeState, tx: &WeakSender<Message>) {
    // Malformed client messages are ignored.
    let Ok(Value::Object(message)) = serde_json::from_slice::<Value>(raw) else { return };
    match message.get("type").and_then(Value::as_str) {
        Some("ping") => send(tx, &BridgeClientMessage::Pong { timestamp: now_ms() }),
        Some("request_state") => snapshot_for_request(state, tx),
        _ => {}
    }
}

/// `request_state` answers with the session list first, then health (the reverse of the connect snapshot).
fn snapshot_for_request(state: &BridgeState, tx: &WeakSender<Message>) {
    send(tx, &BridgeClientMessage::SessionList { sessions: state.sessions.get_all_sessions() });
    send(tx, &BridgeClientMessage::HealthCheck { health: (state.get_health)() });
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use waitplay_core::{AgentEvent, AgentType};

    fn payload() -> AgentEventPayload {
        let data = json!({"prompt": "my secret prompt", "task": "refactor auth", "model": "opus", "tool": "bash", "step": "npm test", "promptTime": 5})
            .as_object()
            .cloned();
        AgentEventPayload { agent: AgentType::ClaudeCode, session_id: "s".into(), event: AgentEvent::TaskStarted, timestamp: 1, model: None, terminal: None, data }
    }

    #[test]
    fn broadcast_payload_keeps_only_status_fields() {
        let out = sanitize_payload(&payload());
        let data = out.data.unwrap();
        let mut keys: Vec<&str> = data.keys().map(String::as_str).collect();
        keys.sort();
        assert_eq!(keys, ["model", "promptTime", "tool"]);
        assert!(!serde_json::to_string(&data).unwrap().contains("secret"));
    }

    #[test]
    fn broadcast_session_has_no_free_text() {
        let mut s = serde_json::from_value::<AgentSessionInfo>(json!({
            "sessionId": "s", "agent": "claude-code", "status": "WAITING_FOR_INPUT", "startedAt": 1, "lastEventAt": 2, "totalTasksCompleted": 0,
            "waitingForInputPrompt": "rm -rf /tmp/x ?", "intent": "build the payment page", "lastError": "boom"
        }))
        .unwrap();
        s.model = Some("m".into());
        let out = sanitize_session(&s);
        assert!(out.waiting_for_input_prompt.is_none() && out.intent.is_none() && out.last_error.is_none());
        assert_eq!(out.model.as_deref(), Some("m"), "status fields stay");
    }

    #[test]
    fn every_outgoing_message_kind_is_sanitized() {
        let m = sanitize_message(&BridgeClientMessage::AgentEvent { payload: payload() });
        assert!(!encode(&m).contains("secret"));
    }

    #[tokio::test]
    async fn a_client_that_stops_reading_is_dropped_not_buffered() {
        let hub = WsHub::new();
        let (_id, _tx, _rx) = hub.register(); // never read
        assert_eq!(hub.connected_count(), 1);
        for _ in 0..(WS_CLIENT_QUEUE + 5) {
            hub.broadcast(&BridgeClientMessage::StateChange { enabled: true });
        }
        assert_eq!(hub.connected_count(), 0, "the full queue evicted the client");
    }
}
