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

    /// GET /sessions as raw JSON text, `None` when the bridge is down, slow or refuses the token.
    pub fn get_sessions(&self, timeout: Duration) -> Option<String> {
        Self::agent(timeout).get(&self.url("/sessions")).set("x-bridge-token", &token::find_token()).call().ok()?.into_string().ok()
    }

    /// POST /permissions: asks the user (in the widget) to approve a request. Returns the request id and whether a widget is listening.
    pub fn create_permission(&self, body: &serde_json::Value) -> Result<(String, bool), String> {
        let text = Self::agent(Duration::from_millis(1000))
            .post(&self.url("/permissions"))
            .set("Content-Type", "application/json")
            .set("x-bridge-token", &token::find_token())
            .send_string(&body.to_string())
            .map_err(|e| e.to_string())?
            .into_string()
            .map_err(|e| e.to_string())?;
        let v: serde_json::Value = serde_json::from_str(&text).map_err(|e| e.to_string())?;
        let id = v.get("id").and_then(|i| i.as_str()).ok_or("no id in the answer")?.to_string();
        Ok((id, v.get("responder").and_then(|r| r.as_bool()).unwrap_or(false)))
    }

    /// GET /permissions/:id: "pending", "allow", "deny", "ask" or "gone". `None` when the bridge cannot be reached.
    pub fn permission_decision(&self, id: &str) -> Option<String> {
        let text = Self::agent(Duration::from_millis(800)).get(&self.url(&format!("/permissions/{}", id))).set("x-bridge-token", &token::find_token()).call().ok()?.into_string().ok()?;
        serde_json::from_str::<serde_json::Value>(&text).ok()?.get("decision")?.as_str().map(str::to_string)
    }

    /// GET /permissions as raw JSON text (the pending requests). Asking is what tells the hooks that a widget is listening.
    pub fn get_permissions(&self, timeout: Duration) -> Option<String> {
        Self::agent(timeout).get(&self.url("/permissions")).set("x-bridge-token", &token::find_token()).call().ok()?.into_string().ok()
    }

    /// POST /permissions/:id/decision with "allow", "deny" or "ask".
    pub fn post_permission_decision(&self, id: &str, behavior: &str) -> Result<(), String> {
        Self::agent(Duration::from_millis(1500))
            .post(&self.url(&format!("/permissions/{}/decision", id)))
            .set("Content-Type", "application/json")
            .set("x-bridge-token", &token::find_token())
            .send_string(&serde_json::json!({ "behavior": behavior }).to_string())
            .map(|_| ())
            .map_err(|e| e.to_string())
    }

    /// POST /state: lets the bridge broadcast an ON/OFF change to web clients.
    pub fn post_state(&self, enabled: bool) {
        let _ = Self::agent(Duration::from_millis(400))
            .post(&self.url("/state"))
            .set("Content-Type", "application/json")
            .set("x-bridge-token", &token::find_token())
            .send_string(&format!("{{\"enabled\":{}}}", enabled));
    }
}
