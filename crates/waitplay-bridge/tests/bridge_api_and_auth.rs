//! Port of apps/bridge/test/bridgeApiAndAuth.test.ts plus coverage for the loopback filter, CORS and body limits.

mod common;

use common::*;
use serde_json::{json, Value};
use std::net::SocketAddr;
use std::sync::Arc;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use waitplay_bridge::server::{serve_connection, BridgeState};
use waitplay_bridge::session_manager::SessionManager;
use waitplay_core::BridgeHealth;

#[tokio::test]
async fn get_health_succeeds_without_authentication() {
    let bridge = start_bridge("tok").await;
    let res = get(bridge.addr, "/health").await;
    assert_eq!(res.status, 200);
    let body: BridgeHealth = serde_json::from_value(res.json()).unwrap();
    assert_eq!(serde_json::to_value(body.status).unwrap(), "ok");
    assert_eq!(body.version, "0.1.0");
    assert_eq!(body.port, bridge.addr.port());
    bridge.shutdown();
}

#[tokio::test]
async fn get_auth_token_provides_valid_token_on_loopback() {
    let bridge = start_bridge("secret-token-value").await;
    let res = get(bridge.addr, "/auth/token").await;
    assert_eq!(res.status, 200);
    assert_eq!(res.json(), json!({"token": "secret-token-value"}));
    bridge.shutdown();
}

#[tokio::test]
async fn post_events_without_token_returns_401() {
    let bridge = start_bridge("tok").await;
    let res = post_json(bridge.addr, "/events", &[], &event("s1", "task_started")).await;
    assert_eq!(res.status, 401);
    assert_eq!(res.json()["error"], "Unauthorized");
    assert!(res.json()["message"].as_str().unwrap().contains("x-bridge-token or Authorization: Bearer"));
    bridge.shutdown();
}

#[tokio::test]
async fn post_events_with_invalid_token_returns_401() {
    let bridge = start_bridge("tok").await;
    let res = post_json(bridge.addr, "/events", &[("x-bridge-token", "wrong-bogus-token-12345")], &event("s1", "task_started")).await;
    assert_eq!(res.status, 401);
    // x-bridge-token wins even when a valid Bearer is also present.
    let res = post_json(bridge.addr, "/events", &[("x-bridge-token", "nope"), ("Authorization", "Bearer tok")], &event("s1", "task_started")).await;
    assert_eq!(res.status, 401);
    bridge.shutdown();
}

#[tokio::test]
async fn post_events_with_valid_token_via_x_bridge_token_succeeds() {
    let bridge = start_bridge("tok").await;
    let res = post_json(bridge.addr, "/events", &[("x-bridge-token", "tok")], &event("auth-test-session", "task_started")).await;
    assert_eq!(res.status, 200);
    let body = res.json();
    assert_eq!(body["status"], "received");
    assert_eq!(body["agentStatus"], "WORKING");
    assert_eq!(body["sessionId"], "auth-test-session");
    assert_eq!(body["event"], "task_started");
    assert!(body["timestamp"].as_i64().unwrap() > 0);
    bridge.shutdown();
}

#[tokio::test]
async fn post_events_with_valid_token_via_authorization_bearer_succeeds() {
    let bridge = start_bridge("tok").await;
    post_json(bridge.addr, "/events", &[("Authorization", "Bearer tok")], &event("auth-test-session", "task_started")).await;
    let res = post_json(bridge.addr, "/events", &[("Authorization", "Bearer tok")], &event("auth-test-session", "task_completed")).await;
    assert_eq!(res.status, 200);
    let body = res.json();
    assert_eq!(body["status"], "received");
    assert_eq!(body["agentStatus"], "COMPLETED");
    bridge.shutdown();
}

#[tokio::test]
async fn post_events_with_invalid_payload_returns_400() {
    let bridge = start_bridge("tok").await;
    let res = post_json(bridge.addr, "/events", &[("x-bridge-token", "tok")], &json!({"agent": "not-claude-code", "sessionId": "s1"})).await;
    assert_eq!(res.status, 400);
    let body = res.json();
    assert_eq!(body["error"], "ValidationError");
    assert_eq!(
        body["message"],
        "Invalid agent \"not-claude-code\". Expected one of: claude-code, codex, omp, opencode, cline, cursor, antigravity"
    );
    bridge.shutdown();
}

#[tokio::test]
async fn get_state_and_post_state_manage_companion_enabled_state() {
    let bridge = start_bridge("tok").await;
    let addr = bridge.addr;

    let res = get(addr, "/state").await;
    assert_eq!(res.status, 200);
    assert!(res.json()["enabled"].is_boolean());

    let off = post_json(addr, "/state", &[], &json!({"enabled": false})).await;
    assert_eq!(off.status, 200);
    assert_eq!(off.json(), json!({"status": "ok", "enabled": false}));
    assert_eq!(get(addr, "/state").await.json()["enabled"], false);

    // No (boolean) enabled flag toggles.
    let toggled = post_json(addr, "/state", &[], &json!({"enabled": "yes"})).await;
    assert_eq!(toggled.json(), json!({"status": "ok", "enabled": true}));

    let on = post_json(addr, "/state", &[], &json!({"enabled": true})).await;
    assert_eq!(on.status, 200);
    assert_eq!(on.json()["enabled"], true);
    assert_eq!(get(addr, "/state").await.json()["enabled"], true);
    bridge.shutdown();
}

#[tokio::test]
async fn sessions_listing_lookup_and_reset() {
    let bridge = start_bridge("tok").await;
    let addr = bridge.addr;
    post_json(addr, "/events", &[("x-bridge-token", "tok")], &event("sess one", "task_started")).await;

    let list = get(addr, "/sessions").await.json();
    assert_eq!(list["sessions"].as_array().unwrap().len(), 1);
    assert_eq!(list["sessions"][0]["sessionId"], "sess one");

    let one = get(addr, "/sessions/sess%20one").await;
    assert_eq!(one.status, 200);
    assert_eq!(one.json()["session"]["status"], "WORKING");

    let missing = get(addr, "/sessions/nope").await;
    assert_eq!(missing.status, 404);
    assert_eq!(missing.json(), json!({"error": "SessionNotFound", "message": "Session nope not found"}));

    let unauth = request(addr, "POST", "/sessions/sess%20one/reset", &[], None).await;
    assert_eq!(unauth.status, 401);
    let reset = request(addr, "POST", "/sessions/sess%20one/reset", &[("x-bridge-token", "tok")], None).await;
    assert_eq!(reset.status, 200);
    assert_eq!(reset.json(), json!({"status": "reset", "sessionId": "sess one"}));
    let again = request(addr, "POST", "/sessions/sess%20one/reset", &[("x-bridge-token", "tok")], None).await;
    assert_eq!(again.status, 404);
    assert_eq!(get(addr, "/sessions").await.json()["sessions"].as_array().unwrap().len(), 0);
    bridge.shutdown();
}

#[tokio::test]
async fn routing_is_case_insensitive_and_unknown_routes_404() {
    let bridge = start_bridge("tok").await;
    assert_eq!(get(bridge.addr, "/HEALTH/").await.status, 200);
    let res = get(bridge.addr, "/nope?x=1").await;
    assert_eq!(res.status, 404);
    assert!(res.text().contains("<pre>Cannot GET /nope?x=1</pre>"));
    assert_eq!(request(bridge.addr, "PUT", "/health", &[], None).await.status, 404);
    bridge.shutdown();
}

#[tokio::test]
async fn host_header_must_be_loopback() {
    let bridge = start_bridge("tok").await;
    let res = request_with_host(bridge.addr, "GET", "/health", "evil.example.com:3150", &[], None).await;
    assert_eq!(res.status, 400);
    assert_eq!(
        res.json(),
        json!({"error": "Bad Request", "message": "Invalid host \"evil.example.com:3150\". Requests must target localhost or 127.0.0.1."})
    );
    assert_eq!(request_with_host(bridge.addr, "GET", "/health", "localhost:3150", &[], None).await.status, 200);
    bridge.shutdown();
}

#[tokio::test]
async fn non_loopback_remote_is_forbidden() {
    isolate_env();
    let state = Arc::new(BridgeState {
        sessions: Arc::new(SessionManager::default()),
        ws: None,
        get_health: Box::new(|| unreachable!("health must not be reached")),
        token: "tok".into(),
    });
    let (mut client, server) = tokio::io::duplex(8192);
    let remote: SocketAddr = "192.168.1.50:5555".parse().unwrap();
    tokio::spawn(serve_connection(server, remote, state));
    client.write_all(&build_request("GET", "/health", "127.0.0.1:3150", &[], None)).await.unwrap();
    let mut raw = Vec::new();
    client.read_to_end(&mut raw).await.unwrap();
    let res = parse_response(&raw);
    assert_eq!(res.status, 403);
    assert_eq!(res.json(), json!({"error": "Forbidden", "message": "WaitPlay bridge only accepts connections from localhost/loopback."}));
}

#[tokio::test]
async fn cors_policy() {
    let bridge = start_bridge("tok").await;
    let addr = bridge.addr;

    let ok = request(addr, "GET", "/health", &[("Origin", "http://localhost:5200")], None).await;
    assert_eq!(ok.status, 200);
    assert_eq!(ok.header("access-control-allow-origin"), Some("http://localhost:5200"));
    assert_eq!(ok.header("vary"), Some("Origin"));

    let none = get(addr, "/health").await;
    assert_eq!(none.header("access-control-allow-origin"), None);
    assert_eq!(none.header("vary"), Some("Origin"));

    let bad = request(addr, "GET", "/health", &[("Origin", "https://evil.example.com")], None).await;
    assert_eq!(bad.status, 500);
    assert!(bad.text().contains("Not allowed by WaitPlay Bridge CORS policy"));

    let preflight = request(
        addr,
        "OPTIONS",
        "/events",
        &[("Origin", "http://127.0.0.1:5200"), ("Access-Control-Request-Method", "POST"), ("Access-Control-Request-Headers", "x-bridge-token")],
        None,
    )
    .await;
    assert_eq!(preflight.status, 204);
    assert_eq!(preflight.header("access-control-allow-origin"), Some("http://127.0.0.1:5200"));
    assert_eq!(preflight.header("access-control-allow-methods"), Some("GET,POST,OPTIONS"));
    assert_eq!(preflight.header("access-control-allow-headers"), Some("Content-Type,x-bridge-token,Authorization"));
    assert!(preflight.body.is_empty());
    bridge.shutdown();
}

#[tokio::test]
async fn body_parsing_limits_and_errors() {
    let bridge = start_bridge("tok").await;
    let addr = bridge.addr;
    let auth = [("x-bridge-token", "tok"), ("Content-Type", "application/json")];

    // malformed JSON -> 400
    let res = request(addr, "POST", "/events", &auth, Some(b"{not json")).await;
    assert_eq!(res.status, 400);
    // strict mode: scalars are rejected
    let res = request(addr, "POST", "/events", &auth, Some(b"\"hello\"")).await;
    assert_eq!(res.status, 400);
    // over 32kb -> 413
    let big = format!("{{\"agent\":\"omp\",\"pad\":\"{}\"}}", "x".repeat(40 * 1024));
    let res = request(addr, "POST", "/events", &auth, Some(big.as_bytes())).await;
    assert_eq!(res.status, 413);
    // exactly parseable body under the limit with a large (valid) data blob is accepted
    let mut ev = event("big-ok", "task_started");
    ev["data"] = json!({"blob": "y".repeat(30 * 1024)});
    assert_eq!(post_json(addr, "/events", &[("x-bridge-token", "tok")], &ev).await.status, 200);
    // empty body / non-json content type -> treated as {} -> validation error
    let res = request(addr, "POST", "/events", &[("x-bridge-token", "tok")], None).await;
    assert_eq!(res.status, 400);
    assert!(res.json()["message"].as_str().unwrap().starts_with("Invalid agent \"undefined\""));
    // array bodies parse but fail validation
    let res = request(addr, "POST", "/events", &auth, Some(b"[1]")).await;
    assert_eq!(res.status, 400);
    assert_eq!(res.json()["message"], "Payload must be a non-null JSON object");
    bridge.shutdown();
}

#[tokio::test]
async fn event_data_and_model_flow_into_the_session() {
    let bridge = start_bridge("tok").await;
    let addr = bridge.addr;
    let mut ev = event("meta", "task_started");
    ev["model"] = json!("gpt-x");
    ev["data"] = json!({"tool": "bash", "intent": "build"});
    post_json(addr, "/events", &[("x-bridge-token", "tok")], &ev).await;
    let s: Value = get(addr, "/sessions/meta").await.json()["session"].clone();
    assert_eq!(s["model"], "gpt-x");
    assert_eq!(s["tool"], "bash");
    assert_eq!(s["intent"], "build");
    assert_eq!(s["agent"], "claude-code");
    bridge.shutdown();
}
