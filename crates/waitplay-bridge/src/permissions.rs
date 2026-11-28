//! Approve / deny requests from agents (Claude Code's `PermissionRequest` hook).
//!
//! The hook posts the request and then waits, polling for the decision; the widget lists the pending requests and posts the user's
//! choice. Nothing here is persisted: a request lives for a minute and a half at most, and a hook that gets no answer lets the agent
//! show its own prompt, so losing one is never worse than not having this feature.

use serde::Serialize;
use std::sync::{Mutex, MutexGuard};
use std::time::{Duration, Instant};
use waitplay_core::now_ms;

const MAX_PENDING: usize = 16;
/// A request nobody answered is dropped after this long (the hook gives up before).
const TTL_MS: i64 = 90_000;
/// The widget counts as listening for this long after it last asked for the list; a hook does not wait for a widget that is not.
const RESPONDER_FRESH: Duration = Duration::from_secs(6);
const MAX_FIELD: usize = 300;

#[derive(Clone, Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Request {
    pub id: String,
    pub session_id: String,
    pub agent: String,
    pub tool: String,
    /// What the agent wants to do, shortened: the shell command, the file to edit.
    pub summary: String,
    pub created_at: i64,
    #[serde(skip)]
    decision: Option<String>,
}

/// What a polling hook is told.
#[derive(Debug, PartialEq)]
pub enum Decision {
    Pending,
    /// "allow", "deny" or "ask" (the user wants the agent's own prompt).
    Decided(String),
    /// Unknown, expired, or cancelled because the user answered in the terminal.
    Gone,
}

#[derive(Default)]
struct Inner {
    items: Vec<Request>,
    responder_seen: Option<Instant>,
    counter: u64,
}

#[derive(Default)]
pub struct Permissions {
    inner: Mutex<Inner>,
}

fn clip(s: &str) -> String {
    s.chars().take(MAX_FIELD).collect()
}

impl Permissions {
    fn lock(&self) -> MutexGuard<'_, Inner> {
        self.inner.lock().unwrap_or_else(|e| e.into_inner())
    }

    fn expire(inner: &mut Inner, now: i64) {
        inner.items.retain(|r| now - r.created_at <= TTL_MS);
    }

    /// Whether a widget asked for the list a moment ago.
    pub fn responder_present(&self) -> bool {
        self.lock().responder_seen.is_some_and(|t| t.elapsed() <= RESPONDER_FRESH)
    }

    /// Adds a request; `None` when too many are waiting.
    pub fn create(&self, session_id: &str, agent: &str, tool: &str, summary: &str) -> Option<String> {
        let now = now_ms();
        let mut g = self.lock();
        Self::expire(&mut g, now);
        if g.items.len() >= MAX_PENDING {
            return None;
        }
        g.counter += 1;
        let id = format!("p{}-{}", now, g.counter);
        g.items.push(Request { id: id.clone(), session_id: clip(session_id), agent: clip(agent), tool: clip(tool), summary: clip(summary), created_at: now, decision: None });
        Some(id)
    }

    /// The requests still waiting for an answer, oldest first. Asking is what makes the widget "present".
    pub fn pending(&self) -> Vec<Request> {
        let mut g = self.lock();
        g.responder_seen = Some(Instant::now());
        Self::expire(&mut g, now_ms());
        g.items.iter().filter(|r| r.decision.is_none()).cloned().collect()
    }

    /// A hook's poll. A decision is handed out once and the request is removed with it.
    pub fn take_decision(&self, id: &str) -> Decision {
        let mut g = self.lock();
        Self::expire(&mut g, now_ms());
        match g.items.iter().position(|r| r.id == id) {
            None => Decision::Gone,
            Some(i) => match g.items[i].decision.clone() {
                None => Decision::Pending,
                Some(d) => {
                    g.items.remove(i);
                    Decision::Decided(d)
                }
            },
        }
    }

    /// The user's choice. `false` when the request is unknown, already answered or the choice is not one of the three.
    pub fn decide(&self, id: &str, behavior: &str) -> bool {
        if !matches!(behavior, "allow" | "deny" | "ask") {
            return false;
        }
        let mut g = self.lock();
        match g.items.iter_mut().find(|r| r.id == id && r.decision.is_none()) {
            Some(r) => {
                r.decision = Some(behavior.to_string());
                true
            }
            None => false,
        }
    }

    /// The agent went on with that tool, so the question was answered somewhere else (in its own terminal): drop it.
    pub fn cancel_tool(&self, session_id: &str, tool: &str) {
        self.lock().items.retain(|r| !(r.session_id == session_id && r.tool == tool && r.decision.is_none()));
    }

    /// The turn or the session is over: nothing of it can still be waiting.
    pub fn cancel_session(&self, session_id: &str) {
        self.lock().items.retain(|r| r.session_id != session_id);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_request_is_answered_once_and_then_gone() {
        let p = Permissions::default();
        let id = p.create("s1", "claude-code", "Bash", "rm -rf build").unwrap();
        assert_eq!(p.take_decision(&id), Decision::Pending);
        assert_eq!(p.pending().len(), 1);
        assert!(p.decide(&id, "allow"));
        assert!(!p.decide(&id, "deny"), "the first answer stands");
        assert!(p.pending().is_empty(), "an answered request is not listed again");
        assert_eq!(p.take_decision(&id), Decision::Decided("allow".into()));
        assert_eq!(p.take_decision(&id), Decision::Gone);
    }

    #[test]
    fn only_the_three_choices_are_accepted() {
        let p = Permissions::default();
        let id = p.create("s", "a", "Bash", "x").unwrap();
        assert!(!p.decide(&id, "yes"));
        assert!(!p.decide("nope", "allow"));
        assert!(p.decide(&id, "ask"));
    }

    #[test]
    fn answering_in_the_terminal_withdraws_the_request() {
        let p = Permissions::default();
        let a = p.create("s1", "claude-code", "Bash", "ls").unwrap();
        let _b = p.create("s1", "claude-code", "Edit", "a.rs").unwrap();
        p.cancel_tool("s1", "Bash");
        assert_eq!(p.take_decision(&a), Decision::Gone);
        assert_eq!(p.pending().len(), 1, "another tool's request stays");
        p.cancel_session("s1");
        assert!(p.pending().is_empty());
    }

    #[test]
    fn the_widget_is_present_only_after_it_asked_and_the_queue_is_bounded() {
        let p = Permissions::default();
        assert!(!p.responder_present());
        p.pending();
        assert!(p.responder_present());
        for i in 0..MAX_PENDING {
            assert!(p.create("s", "a", "Bash", &i.to_string()).is_some());
        }
        assert!(p.create("s", "a", "Bash", "one too many").is_none());
        let long = "x".repeat(1000);
        let p2 = Permissions::default();
        p2.create("s", "a", "Bash", &long).unwrap();
        assert_eq!(p2.pending()[0].summary.chars().count(), MAX_FIELD);
    }
}
