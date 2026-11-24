//! The shared `BridgeClient` (used by the menu-bar app, the entertainment window and the widget) must authenticate now that
//! `/sessions` and `/state` need the token. Its own test binary, because it sets `BRIDGE_AUTH_TOKEN` for the whole process.

mod common;

use common::*;
use std::time::Duration;
use waitplay_core::BridgeClient;

#[tokio::test]
async fn client_lists_sessions_with_the_token_and_gets_nothing_with_a_wrong_one() {
    isolate_env();
    let bridge = start_bridge("client-test-token").await;
    post_json(bridge.addr, "/events", &[("x-bridge-token", "client-test-token")], &event("client-session", "task_started")).await;
    let port = bridge.addr.port();

    std::env::set_var("BRIDGE_AUTH_TOKEN", "client-test-token");
    let body = tokio::task::spawn_blocking(move || BridgeClient::with_port(port).get_sessions(Duration::from_secs(5))).await.unwrap();
    let body = body.expect("the client's request is authenticated");
    assert!(body.contains("client-session"), "{body}");

    std::env::set_var("BRIDGE_AUTH_TOKEN", "some-other-token");
    let refused = tokio::task::spawn_blocking(move || BridgeClient::with_port(port).get_sessions(Duration::from_secs(5))).await.unwrap();
    assert!(refused.is_none(), "a client with the wrong token sees nothing");
    bridge.shutdown();
}
