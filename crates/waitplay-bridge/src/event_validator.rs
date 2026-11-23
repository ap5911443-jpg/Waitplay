//! Request-level event validation (port of eventValidator.ts); the structural rules live in `waitplay_core::protocol`.

use serde_json::Value;
use waitplay_core::protocol::{validate_agent_event_payload, MAX_PAYLOAD_BYTES};
use waitplay_core::AgentEventPayload;

/// Size ceiling first, then the structural validation.
pub fn validate_event_input(raw: &Value, raw_body_length: Option<usize>) -> Result<AgentEventPayload, String> {
    if let Some(len) = raw_body_length {
        if len > MAX_PAYLOAD_BYTES {
            return Err(format!("Payload size ({} bytes) exceeds maximum limit of {} bytes.", len, MAX_PAYLOAD_BYTES));
        }
    }
    validate_agent_event_payload(raw)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use waitplay_core::protocol::MAX_SESSION_ID_CHARS;
    use waitplay_core::{now_ms, AgentEvent, AgentType};

    fn base() -> Value {
        json!({"agent": "claude-code", "sessionId": "session-123", "event": "task_started", "timestamp": now_ms()})
    }

    #[test]
    fn accepts_valid_payload_for_all_valid_event_types() {
        for event in AgentEvent::ALL {
            let payload = json!({
                "agent": "claude-code",
                "sessionId": "session-123",
                "event": event.as_str(),
                "timestamp": now_ms(),
                "data": {"test": true},
            });
            let result = validate_agent_event_payload(&payload).unwrap_or_else(|e| panic!("Event {} should be valid: {e}", event.as_str()));
            assert_eq!(result.event, event);
            assert_eq!(result.session_id, "session-123");
            assert_eq!(result.agent, AgentType::ClaudeCode);
        }
    }

    #[test]
    fn rejects_invalid_agents() {
        let mut p = base();
        p["agent"] = json!("unknown-agent-xyz");
        assert!(validate_agent_event_payload(&p).unwrap_err().contains("Invalid agent"));
    }

    #[test]
    fn rejects_missing_or_empty_session_id() {
        let mut p = base();
        p["sessionId"] = json!("   ");
        assert!(validate_agent_event_payload(&p).is_err());

        let mut p = base();
        p.as_object_mut().unwrap().remove("sessionId");
        assert!(validate_agent_event_payload(&p).is_err());
    }

    #[test]
    fn rejects_excessive_session_id_length() {
        let mut p = base();
        p["sessionId"] = json!("a".repeat(MAX_SESSION_ID_CHARS + 1));
        assert!(validate_agent_event_payload(&p).unwrap_err().contains("maximum length"));
    }

    #[test]
    fn rejects_unknown_event_types() {
        let mut p = base();
        p["event"] = json!("unknown_event_type");
        assert!(validate_agent_event_payload(&p).unwrap_err().contains("Invalid event"));
    }

    #[test]
    fn rejects_non_positive_or_non_finite_timestamp() {
        for ts in [json!(-100), json!(0)] {
            let mut p = base();
            p["timestamp"] = ts;
            assert!(validate_agent_event_payload(&p).is_err());
        }
    }

    #[test]
    fn rejects_payload_exceeding_max_payload_bytes_size_ceiling() {
        let raw = json!({"agent": "claude-code", "sessionId": "1", "event": "task_started", "timestamp": 1});
        let err = validate_event_input(&raw, Some(MAX_PAYLOAD_BYTES + 500)).unwrap_err();
        assert!(err.contains("exceeds maximum limit"));
        assert!(validate_event_input(&raw, Some(MAX_PAYLOAD_BYTES)).is_ok());
        assert!(validate_event_input(&raw, None).is_ok());
    }
}
