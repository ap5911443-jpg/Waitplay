//! Blocking loopback client for the bridge. Hooks and the app use it; failures are returned, never panicked on.

use crate::paths;
use crate::protocol::AgentEventPayload;
use crate::token;
use std::time::Duration;

pub struct BridgeClient {
    port: u16,
}

impl Default for BridgeClient {
    fn default() -> Self {
        Self::new()
    }
}

impl BridgeClient {
    pub fn new() -> Self {
        BridgeClient { port: paths::bridge_port() }
    }

    pub fn with_port(port: u16) -> Self {
        BridgeClient { port }
    }

    fn url(&self, path: &str) -> String {
        format!("http://127.0.0.1:{}{}", self.port, path)
    }

    fn agent(timeout: Duration) -> ureq::Agent {
        ureq::AgentBuilder::new().timeout(timeout).build()
    }

    /// POST /events. `Ok` means the bridge accepted it.
    pub fn post_event(&self, payload: &AgentEventPayload) -> Result<(), String> {
        self.post_event_json(&serde_json::to_value(payload).map_err(|e| e.to_string())?)
    }

    pub fn post_event_json(&self, payload: &serde_json::Value) -> Result<(), String> {
        let body = payload.to_string();
        Self::agent(Duration::from_millis(1000))
            .post(&self.url("/events"))
            .set("Content-Type", "application/json")
            .set("x-bridge-token", &token::find_token())
            .send_string(&body)
            .map(|_| ())
            .map_err(|e| e.to_string())
    }

    /// GET /sessions as raw JSON text, `None` when the bridge is down or slow.
    pub fn get_sessions(&self, timeout: Duration) -> Option<String> {
        Self::agent(timeout).get(&self.url("/sessions")).call().ok()?.into_string().ok()
    }

    /// POST /state: lets the bridge broadcast an ON/OFF change to web clients.
    pub fn post_state(&self, enabled: bool) {
        let _ = Self::agent(Duration::from_millis(400))
            .post(&self.url("/state"))
            .set("Content-Type", "application/json")
            .send_string(&format!("{{\"enabled\":{}}}", enabled));
    }
}
