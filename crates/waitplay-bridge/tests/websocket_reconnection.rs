//! Port of apps/bridge/test/websocketReconnection.test.ts plus heartbeat, request_state, limits and loopback checks.

mod common;

use common::*;
use futures_util::{SinkExt, StreamExt};
use serde_json::{json, Value};
use std::net::SocketAddr;
use std::sync::Arc;
use std::time::Duration;
use tokio::net::TcpStream;
use tokio_tungstenite::tungstenite::client::IntoClientRequest;
use tokio_tungstenite::tungstenite::protocol::frame::coding::CloseCode;
use tokio_tungstenite::tungstenite::protocol::{Message, Role};
use tokio_tungstenite::{MaybeTlsStream, WebSocketStream};
use waitplay_bridge::server::BridgeState;
use waitplay_bridge::session_manager::SessionManager;
use waitplay_bridge::ws::{run_connection, WsHub};

type Client = WebSocketStream<MaybeTlsStream<TcpStream>>;

async fn connect(addr: SocketAddr) -> Client {
    let mut req = format!("ws://{addr}/ws").into_client_request().unwrap();
    req.headers_mut().insert("x-bridge-token", "tok".parse().unwrap());
    let (ws, _) = tokio_tungstenite::connect_async(req).await.expect("websocket handshake");
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
    post_auth(bridge.addr, "/state", &json!({"enabled": false})).await;
    assert_eq!(next_json(&mut ws).await, json!({"type": "state_change", "enabled": false}));
    post_auth(bridge.addr, "/state", &json!({"enabled": true})).await;
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
    let state = Arc::new(BridgeState::new(Arc::new(SessionManager::default()), None, Box::new(|| unreachable!()), "tok".into()));
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

// ── security: the upgrade is authenticated, origin-checked, limited; nothing sensitive is broadcast ─────────────────────────────

/// The handshake result as the HTTP status the server answered with (or `None` when it upgraded).
async fn handshake(addr: SocketAddr, headers: &[(&str, &str)]) -> Result<(Client, tokio_tungstenite::tungstenite::handshake::client::Response), u16> {
    let mut req = format!("ws://{addr}/ws").into_client_request().unwrap();
    for (k, v) in headers {
        req.headers_mut().insert(tokio_tungstenite::tungstenite::http::HeaderName::from_bytes(k.as_bytes()).unwrap(), v.parse().unwrap());
    }
    match tokio_tungstenite::connect_async(req).await {
        Ok(ok) => Ok(ok),
        Err(tokio_tungstenite::tungstenite::Error::Http(resp)) => Err(resp.status().as_u16()),
        Err(other) => panic!("unexpected handshake error: {other}"),
    }
}

#[tokio::test]
async fn websocket_without_a_token_is_refused() {
    let bridge = start_bridge("tok").await;
    assert_eq!(handshake(bridge.addr, &[]).await.err(), Some(401));
    assert_eq!(handshake(bridge.addr, &[("x-bridge-token", "wrong")]).await.err(), Some(401));
    assert_eq!(bridge.hub.connected_count(), 0);
    bridge.shutdown();
}

#[tokio::test]
async fn websocket_from_a_foreign_origin_is_refused_even_with_the_token() {
    let bridge = start_bridge("tok").await;
    for origin in ["https://evil.example", "http://192.168.1.36:4000", "null", "http://localhost.evil.example"] {
        let result = handshake(bridge.addr, &[("x-bridge-token", "tok"), ("origin", origin)]).await;
        assert_eq!(result.err(), Some(403), "origin {origin}");
    }
    // and without the token a foreign page is refused as well (this is the cross-site leak that was reproduced)
    assert_eq!(handshake(bridge.addr, &[("origin", "http://192.168.1.36:4000")]).await.err(), Some(403));
    assert_eq!(bridge.hub.connected_count(), 0);
    bridge.shutdown();
}

#[tokio::test]
async fn websocket_with_a_foreign_host_header_is_refused() {
    let bridge = start_bridge("tok").await;
    let key = "dGhlIHNhbXBsZSBub25jZQ==";
    let res = request_with_host(
        bridge.addr,
        "GET",
        "/ws",
        "rebind.evil.example:3150",
        &[("Upgrade", "websocket"), ("Connection", "Upgrade"), ("Sec-WebSocket-Key", key), ("Sec-WebSocket-Version", "13"), TOKEN],
        None,
    )
    .await;
    assert_eq!(res.status, 400, "DNS-rebinding style Host must not reach the upgrade");
    bridge.shutdown();
}

#[tokio::test]
async fn browsers_authenticate_through_the_subprotocol_and_the_token_is_not_echoed() {
    let bridge = start_bridge("tok").await;
    let (mut ws, resp) = handshake(bridge.addr, &[("origin", "http://localhost:5200"), ("sec-websocket-protocol", "waitplay.v1, waitplay.token.tok")])
        .await
        .expect("a local origin with the right token connects");
    assert_eq!(resp.headers().get("sec-websocket-protocol").and_then(|v| v.to_str().ok()), Some("waitplay.v1"));
    next_of_type(&mut ws, "session_list").await;
    // a wrong token in the subprotocol is refused
    let bad = handshake(bridge.addr, &[("sec-websocket-protocol", "waitplay.v1, waitplay.token.nope")]).await;
    assert_eq!(bad.err(), Some(401));
    bridge.shutdown();
}

#[tokio::test]
async fn prompts_are_never_broadcast_to_websocket_clients() {
    let bridge = start_bridge("tok").await;
    let mut ws = connect(bridge.addr).await;
    next_of_type(&mut ws, "session_list").await;

    let mut ev = event("leak-test", "task_started");
    ev["data"] = json!({"prompt": "TOP-SECRET-PROMPT", "task": "TOP-SECRET-TASK", "tool": "bash", "model": "opus", "intent": "TOP-SECRET-INTENT"});
    assert_eq!(post_auth(bridge.addr, "/events", &ev).await.status, 200);
    let mut waiting = event("leak-test", "waiting_for_input");
    waiting["data"] = json!({"prompt": "TOP-SECRET-QUESTION"});
    assert_eq!(post_auth(bridge.addr, "/events", &waiting).await.status, 200);

    let mut seen = Vec::new();
    for _ in 0..4 {
        seen.push(next_json(&mut ws).await);
    }
    let text = serde_json::to_string(&seen).unwrap();
    assert!(!text.contains("TOP-SECRET"), "free text reached a WebSocket client: {text}");
    let agent_event = seen.iter().find(|m| m["type"] == "agent_event").unwrap();
    assert_eq!(agent_event["payload"]["data"]["tool"], "bash", "status fields are still sent");
    assert_eq!(agent_event["payload"]["data"]["model"], "opus");

    // a new client's snapshot is clean as well
    let mut later = connect(bridge.addr).await;
    let snapshot = serde_json::to_string(&next_of_type(&mut later, "session_list").await).unwrap();
    assert!(!snapshot.contains("TOP-SECRET"), "{snapshot}");

    // the authenticated HTTP API keeps the details the menu-bar app shows
    let session = get_auth(bridge.addr, "/sessions/leak-test").await.json();
    assert_eq!(session["session"]["waitingForInputPrompt"], "TOP-SECRET-QUESTION");
    bridge.shutdown();
}

#[tokio::test]
async fn websocket_client_count_is_capped() {
    let bridge = start_bridge("tok").await;
    let mut open = Vec::new();
    for _ in 0..waitplay_bridge::limits::MAX_WS_CLIENTS {
        let (mut ws, _) = handshake(bridge.addr, &[TOKEN]).await.expect("within the cap");
        next_of_type(&mut ws, "session_list").await; // registered
        open.push(ws);
    }
    assert_eq!(handshake(bridge.addr, &[TOKEN]).await.err(), Some(503), "one past the cap");
    drop(open.pop());
    tokio::time::sleep(Duration::from_millis(300)).await;
    assert!(handshake(bridge.addr, &[TOKEN]).await.is_ok(), "a slot frees up when a client leaves");
    bridge.shutdown();
}
