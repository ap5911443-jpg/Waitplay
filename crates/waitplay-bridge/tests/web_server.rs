//! The `web` subcommand's server (port of apps/web/serve.cjs): static files, SPA fallback and the bridge proxy.

mod common;

use common::*;
use futures_util::{SinkExt, StreamExt};
use serde_json::json;
use std::net::SocketAddr;
use std::path::PathBuf;
use std::time::Duration;
use tokio::net::TcpListener;
use tokio_tungstenite::tungstenite::protocol::Message;
use waitplay_bridge::web::{self, WebConfig};

fn make_dist() -> PathBuf {
    let dist = std::env::temp_dir().join(format!("waitplay-web-dist-{}-{}", std::process::id(), waitplay_core::now_ms()));
    std::fs::create_dir_all(dist.join("assets")).unwrap();
    std::fs::write(dist.join("index.html"), "<html>spa</html>").unwrap();
    std::fs::write(dist.join("assets").join("app.js"), "console.log(1)").unwrap();
    std::fs::write(dist.join("assets").join("style.CSS"), "body{}").unwrap();
    std::fs::write(dist.join("assets").join("blob.bin"), [1u8, 2, 3]).unwrap();
    std::fs::write(dist.join("secret-sibling.txt"), "s").unwrap();
    dist
}

async fn start_web(bridge_port: u16) -> (SocketAddr, tokio::task::JoinHandle<()>) {
    isolate_env();
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    let dist = make_dist();
    let handle = tokio::spawn(web::serve(listener, WebConfig { port: addr.port(), bridge_port, dist }));
    (addr, handle)
}

#[test]
fn proxied_prefixes() {
    for p in ["/ws", "/events", "/health", "/sessions", "/sessions/x/reset", "/health?x=1", "/ws?a=b"] {
        assert!(web::is_proxied(p), "{p}");
    }
    for p in ["/", "/state", "/wsx", "/healthz", "/assets/index.js", "/events2", "/sessionsfoo", "/auth", "/auth/token"] {
        assert!(!web::is_proxied(p), "{p}");
    }
}

#[tokio::test]
async fn serves_files_with_mime_types_and_spa_fallback() {
    let (addr, task) = start_web(1).await;

    let index = get(addr, "/").await;
    assert_eq!(index.status, 200);
    assert_eq!(index.header("content-type"), Some("text/html; charset=utf-8"));
    assert_eq!(index.header("cache-control"), Some("no-cache"));
    assert_eq!(index.text(), "<html>spa</html>");

    let js = get(addr, "/assets/app.js").await;
    assert_eq!(js.header("content-type"), Some("text/javascript; charset=utf-8"));
    assert_eq!(js.text(), "console.log(1)");
    assert_eq!(get(addr, "/assets/style.CSS?v=2").await.header("content-type"), Some("text/css; charset=utf-8"));
    assert_eq!(get(addr, "/assets/blob.bin").await.header("content-type"), Some("application/octet-stream"));

    // unknown routes and directories fall back to index.html (SPA)
    for path in ["/dashboard/settings", "/assets", "/state", "/nope.js"] {
        let r = get(addr, path).await;
        assert_eq!(r.status, 200, "{path}");
        assert_eq!(r.text(), "<html>spa</html>", "{path}");
        assert_eq!(r.header("content-type"), Some("text/html; charset=utf-8"), "{path}");
    }
    // percent-decoding works on file names
    assert_eq!(get(addr, "/assets/app%2Ejs").await.text(), "console.log(1)");
    task.abort();
}

#[tokio::test]
async fn path_traversal_is_forbidden_and_bad_encoding_rejected() {
    let (addr, task) = start_web(1).await;
    assert_eq!(get(addr, "/..%2F..%2Fetc/passwd").await.status, 403);
    assert_eq!(get(addr, "/assets/%2e%2e/%2e%2e/x").await.status, 403);
    assert_eq!(get(addr, "/assets/..%5C..%5Cx").await.status, 403);
    // staying inside is fine
    assert_eq!(get(addr, "/assets/../index.html").await.status, 200);
    assert_eq!(get(addr, "/%E0%A4%A").await.status, 400);
    assert_eq!(get(addr, "/C:/Windows/win.ini").await.text(), "<html>spa</html>");
    task.abort();
}

#[tokio::test]
async fn proxies_http_to_the_bridge() {
    let bridge = start_bridge("tok").await;
    let (addr, task) = start_web(bridge.addr.port()).await;

    let health = get(addr, "/health").await;
    assert_eq!(health.status, 200);
    assert_eq!(health.json()["port"], bridge.addr.port());

    // the bridge hands out no token any more; the web server must not invent one either
    let gone = get(addr, "/auth/token").await;
    assert!(!gone.text().contains("\"token\""), "{}", gone.text());

    let res = post_json(addr, "/events", &[("x-bridge-token", "tok")], &event("via-web", "task_started")).await;
    assert_eq!(res.status, 200);
    assert_eq!(res.json()["agentStatus"], "WORKING");

    let sessions = get_auth(addr, "/sessions").await.json();
    assert_eq!(sessions["sessions"][0]["sessionId"], "via-web");
    assert_eq!(get_auth(addr, "/sessions/via-web").await.status, 200);
    assert_eq!(get_auth(addr, "/sessions/ghost").await.status, 404);
    assert_eq!(get(addr, "/sessions").await.status, 401, "the proxy adds no credentials of its own");

    // validation errors and 401s pass through untouched
    assert_eq!(post_json(addr, "/events", &[], &event("x", "task_started")).await.status, 401);
    task.abort();
    bridge.shutdown();
}

#[tokio::test]
async fn proxies_websocket_upgrades() {
    let bridge = start_bridge("tok").await;
    let (addr, task) = start_web(bridge.addr.port()).await;

    use tokio_tungstenite::tungstenite::client::IntoClientRequest;
    let mut req = format!("ws://{addr}/ws").into_client_request().unwrap();
    req.headers_mut().insert("x-bridge-token", "tok".parse().unwrap());
    let (mut ws, _) = tokio_tungstenite::connect_async(req).await.expect("handshake through the proxy");
    let mut types = Vec::new();
    for _ in 0..2 {
        let Some(Ok(Message::Text(t))) = tokio::time::timeout(Duration::from_secs(10), ws.next()).await.unwrap() else { panic!("frame") };
        types.push(serde_json::from_str::<serde_json::Value>(t.as_str()).unwrap()["type"].as_str().unwrap().to_string());
    }
    assert_eq!(types, ["health_check", "session_list"]);

    post_json(addr, "/events", &[("x-bridge-token", "tok")], &event("ws-via-web", "task_started")).await;
    let mut saw_event = false;
    for _ in 0..3 {
        let Some(Ok(Message::Text(t))) = tokio::time::timeout(Duration::from_secs(10), ws.next()).await.unwrap() else { panic!("frame") };
        if t.as_str().contains("\"agent_event\"") {
            saw_event = true;
        }
    }
    assert!(saw_event);

    ws.send(Message::text(json!({"type": "ping"}).to_string())).await.unwrap();
    loop {
        let Some(Ok(Message::Text(t))) = ws.next().await else { panic!("frame") };
        if t.as_str().contains("\"pong\"") {
            break;
        }
    }
    task.abort();
    bridge.shutdown();
}

#[tokio::test]
async fn unreachable_bridge_gives_502() {
    // Reserve a port, then free it so nothing listens there.
    let l = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let dead = l.local_addr().unwrap().port();
    drop(l);
    let (addr, task) = start_web(dead).await;
    let res = get(addr, "/health").await;
    assert_eq!(res.status, 502);
    assert_eq!(res.text(), "bridge unavailable");
    task.abort();
}

#[tokio::test]
async fn upgrade_to_a_non_proxied_path_is_dropped() {
    let (addr, task) = start_web(1).await;
    assert!(tokio_tungstenite::connect_async(format!("ws://{addr}/not-proxied")).await.is_err());
    task.abort();
}
