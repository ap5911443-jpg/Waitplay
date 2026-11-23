//! Port of apps/bridge/test/websocketReconnection.test.ts plus heartbeat, request_state, limits and loopback checks.

mod common;

use common::*;
use futures_util::{SinkExt, StreamExt};
use serde_json::{json, Value};
use std::net::SocketAddr;
use std::sync::Arc;
use std::time::Duration;
use tokio::net::TcpStream;
use tokio_tungstenite::tungstenite::protocol::frame::coding::CloseCode;
use tokio_tungstenite::tungstenite::protocol::{Message, Role};
use tokio_tungstenite::{MaybeTlsStream, WebSocketStream};
use waitplay_bridge::server::BridgeState;
use waitplay_bridge::session_manager::SessionManager;
use waitplay_bridge::ws::{run_connection, WsHub};

type Client = WebSocketStream<MaybeTlsStream<TcpStream>>;

async fn connect(addr: SocketAddr) -> Client {
    let (ws, _) = tokio_tungstenite::connect_async(format!("ws://{addr}/ws")).await.expect("websocket handshake");
    ws
}

/// Next text frame as JSON (skips protocol frames).
async fn next_json(ws: &mut Client) -> Value {
    loop {
        match tokio::time::timeout(Duration::from_secs(10), ws.next()).await.expect("timed out waiting for a frame") {
            Some(Ok(Message::Text(t))) => return serde_json::from_str(t.as_str()).unwrap(),
            Some(Ok(_)) => continue,
            other => panic!("connection ended: {other:?}"),
        }
    }
}

async fn next_of_type(ws: &mut Client, ty: &str) -> Value {
    loop {
        let m = next_json(ws).await;
        if m["type"] == ty {
            return m;
        }
    }
}

#[tokio::test]
async fn client_connects_and_receives_initial_state() {
    let bridge = start_bridge("tok").await;
    let mut ws = connect(bridge.addr).await;
    let first = next_json(&mut ws).await;
    let second = next_json(&mut ws).await;
    assert_eq!(first["type"], "health_check", "health first");
    assert_eq!(second["type"], "session_list");
    assert_eq!(first["health"]["status"], "ok");
    assert_eq!(first["health"]["port"], bridge.addr.port());
    assert_eq!(first["health"]["clientsConnected"], 1, "the connecting client counts itself");
    assert_eq!(second["sessions"], json!([]));
    ws.close(None).await.unwrap();
    bridge.shutdown();
}

#[tokio::test]
async fn broadcasts_agent_event_and_session_updated_when_event_is_ingested() {
    let bridge = start_bridge("tok").await;
    let mut ws = connect(bridge.addr).await;
    next_of_type(&mut ws, "session_list").await;

    let ev = event("ws-test-session", "task_started");
    let res = post_json(bridge.addr, "/events", &[("x-bridge-token", "tok")], &ev).await;
    assert_eq!(res.status, 200);

    // The status transition itself is broadcast first, then the ingest broadcast (agent_event, session_updated).
    let first = next_json(&mut ws).await;
    assert_eq!(first["type"], "session_updated");
    assert_eq!(first["session"]["status"], "WORKING");
    let agent_event = next_json(&mut ws).await;
    assert_eq!(agent_event["type"], "agent_event");
    assert_eq!(agent_event["payload"]["sessionId"], "ws-test-session");
    assert_eq!(agent_event["payload"]["event"], "task_started");
    assert_eq!(agent_event["payload"]["agent"], "claude-code");
    let updated = next_json(&mut ws).await;
    assert_eq!(updated["type"], "session_updated");
    assert_eq!(updated["session"]["sessionId"], "ws-test-session");
    ws.close(None).await.unwrap();
    bridge.shutdown();
}

#[tokio::test]
async fn reconnecting_client_receives_latest_session_state() {
    let bridge = start_bridge("tok").await;
    post_json(bridge.addr, "/events", &[("x-bridge-token", "tok")], &event("ws-test-session", "task_started")).await;
    assert!(bridge.state.sessions.get_session("ws-test-session").is_some());

    let mut first = connect(bridge.addr).await;
    next_of_type(&mut first, "session_list").await;
    first.close(None).await.unwrap();

    let mut reconnected = connect(bridge.addr).await;
    let list = next_of_type(&mut reconnected, "session_list").await;
    let found = list["sessions"].as_array().unwrap().iter().any(|s| s["sessionId"] == "ws-test-session");
    assert!(found, "Reconnected client should receive previously active session");
    reconnected.close(None).await.unwrap();
    bridge.shutdown();
}

#[tokio::test]
async fn responds_to_ping_with_pong_and_request_state_with_snapshot() {
    let bridge = start_bridge("tok").await;
    let mut ws = connect(bridge.addr).await;
    next_of_type(&mut ws, "session_list").await;

    ws.send(Message::text(json!({"type": "ping"}).to_string())).await.unwrap();
    let pong = next_of_type(&mut ws, "pong").await;
    assert!(pong["timestamp"].as_i64().unwrap() > 0);

    // request_state: session_list first, then health_check
    ws.send(Message::text(json!({"type": "request_state"}).to_string())).await.unwrap();
    assert_eq!(next_json(&mut ws).await["type"], "session_list");
    assert_eq!(next_json(&mut ws).await["type"], "health_check");

    // malformed and unknown messages are ignored; the connection keeps working
    ws.send(Message::text("not json")).await.unwrap();
    ws.send(Message::text("null")).await.unwrap();
    ws.send(Message::text(json!({"type": "mystery"}).to_string())).await.unwrap();
    ws.send(Message::text(json!({"type": "ping"}).to_string())).await.unwrap();
    next_of_type(&mut ws, "pong").await;
    ws.close(None).await.unwrap();
    bridge.shutdown();
}

#[tokio::test]
async fn state_change_is_broadcast_to_clients() {
    let bridge = start_bridge("tok").await;
    let mut ws = connect(bridge.addr).await;
    next_of_type(&mut ws, "session_list").await;
    post_json(bridge.addr, "/state", &[], &json!({"enabled": false})).await;
    assert_eq!(next_json(&mut ws).await, json!({"type": "state_change", "enabled": false}));
    post_json(bridge.addr, "/state", &[], &json!({"enabled": true})).await;
    assert_eq!(next_json(&mut ws).await, json!({"type": "state_change", "enabled": true}));
    bridge.shutdown();
}

#[tokio::test]
async fn session_reset_broadcasts_session_list() {
    let bridge = start_bridge("tok").await;
    post_json(bridge.addr, "/events", &[("x-bridge-token", "tok")], &event("to-reset", "session_started")).await;
    let mut ws = connect(bridge.addr).await;
    next_of_type(&mut ws, "session_list").await;
    request(bridge.addr, "POST", "/sessions/to-reset/reset", &[("x-bridge-token", "tok")], None).await;
    let list = next_json(&mut ws).await;
    assert_eq!(list, json!({"type": "session_list", "sessions": []}));
    bridge.shutdown();
}

#[tokio::test(start_paused = true)]
async fn launch_timer_transition_is_broadcast_without_any_http_request() {
    let bridge = start_bridge("tok").await;
    let mut ws = connect(bridge.addr).await;
    next_of_type(&mut ws, "session_list").await;
    post_json(bridge.addr, "/events", &[("x-bridge-token", "tok")], &event("launcher", "task_started")).await;
    // WORKING (transition), agent_event, WORKING (ingest)
    next_of_type(&mut ws, "agent_event").await;
    next_of_type(&mut ws, "session_updated").await;
    // 4s later (virtual time) the launch timer fires on its own
    let launched = next_of_type(&mut ws, "session_updated").await;
    assert_eq!(launched["session"]["status"], "GAME_ACTIVE");
    bridge.shutdown();
}

#[tokio::test(start_paused = true)]
async fn server_sends_protocol_ping_every_fifteen_seconds() {
    let bridge = start_bridge("tok").await;
    let mut ws = connect(bridge.addr).await;
    let started = tokio::time::Instant::now();
    loop {
        match tokio::time::timeout(Duration::from_secs(60), ws.next()).await.expect("no ping within 60s") {
            Some(Ok(Message::Ping(_))) => break,
            Some(Ok(_)) => continue,
            other => panic!("connection ended: {other:?}"),
        }
    }
    let waited = started.elapsed();
    assert!(waited >= Duration::from_secs(14) && waited <= Duration::from_secs(16), "ping after {waited:?}");
    bridge.shutdown();
}

#[tokio::test]
async fn disconnected_clients_leave_the_registry() {
    let bridge = start_bridge("tok").await;
    let mut ws = connect(bridge.addr).await;
    next_of_type(&mut ws, "session_list").await;
    assert_eq!(bridge.hub.connected_count(), 1);
    ws.close(None).await.unwrap();
    drop(ws);
    for _ in 0..100 {
        if bridge.hub.connected_count() == 0 {
            break;
        }
        tokio::time::sleep(Duration::from_millis(20)).await;
    }
    assert_eq!(bridge.hub.connected_count(), 0);
    bridge.shutdown();
}

#[tokio::test]
async fn oversized_message_closes_with_1009() {
    let bridge = start_bridge("tok").await;
    let mut ws = connect(bridge.addr).await;
    next_of_type(&mut ws, "session_list").await;
    ws.send(Message::text("x".repeat(70 * 1024))).await.unwrap();
    loop {
        match tokio::time::timeout(Duration::from_secs(10), ws.next()).await.expect("no close") {
            Some(Ok(Message::Close(Some(frame)))) => {
                assert_eq!(frame.code, CloseCode::Size);
                break;
            }
            Some(Ok(_)) => continue,
            Some(Err(_)) | None => break,
        }
    }
    bridge.shutdown();
}

#[tokio::test]
async fn only_the_ws_path_upgrades() {
    let bridge = start_bridge("tok").await;
    let err = tokio_tungstenite::connect_async(format!("ws://{}/other", bridge.addr)).await;
    assert!(err.is_err());
    bridge.shutdown();
}

#[tokio::test]
async fn non_loopback_websocket_client_is_closed_with_1008() {
    isolate_env();
    let state = Arc::new(BridgeState {
        sessions: Arc::new(SessionManager::default()),
        ws: None,
        get_health: Box::new(|| unreachable!()),
        token: "tok".into(),
    });
    let (client_io, server_io) = tokio::io::duplex(65536);
    let server_ws = WebSocketStream::from_raw_socket(server_io, Role::Server, None).await;
    let mut client_ws = WebSocketStream::from_raw_socket(client_io, Role::Client, None).await;
    let remote: SocketAddr = "10.1.2.3:4444".parse().unwrap();
    tokio::spawn(run_connection(server_ws, remote, WsHub::new(), state));
    match client_ws.next().await {
        Some(Ok(Message::Close(Some(frame)))) => {
            assert_eq!(frame.code, CloseCode::Policy);
            assert_eq!(frame.reason.as_str(), "Forbidden: Non-loopback client");
        }
        other => panic!("expected close 1008, got {other:?}"),
    }
}
