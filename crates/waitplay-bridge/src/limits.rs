//! Resource limits of the bridge: every number here bounds what a local process (or a page that somehow got a socket) can make the
//! bridge allocate or do. They are far above what real agents produce (a busy agent sends a handful of events per second).

use std::sync::Mutex;
use std::time::{Duration, Instant};

/// Concurrent WebSocket clients. The macOS app opens none; the optional web dashboard opens one.
pub const MAX_WS_CLIENTS: usize = 16;
/// Messages queued for one WebSocket client before it is considered stuck and dropped.
pub const WS_CLIENT_QUEUE: usize = 256;
/// Tracked sessions. A new one beyond this evicts the least recently active.
pub const MAX_SESSIONS: usize = 256;
/// Authenticated events accepted per second, bridge-wide.
pub const EVENTS_PER_SECOND: u32 = 200;
/// Requests with a wrong or missing token answered per minute, bridge-wide (the rest get 429 without any comparison work).
pub const FAILED_AUTH_PER_MINUTE: u32 = 60;
/// SMS messages per hour when Twilio is configured.
pub const SMS_PER_HOUR: u32 = 20;

/// Fixed-window counter: at most `max` calls to [`RateLimiter::allow`] per `window`.
pub struct RateLimiter {
    max: u32,
    window: Duration,
    state: Mutex<(Instant, u32)>,
}

impl RateLimiter {
    pub fn new(max: u32, window: Duration) -> RateLimiter {
        RateLimiter { max, window, state: Mutex::new((Instant::now(), 0)) }
    }

    pub fn allow(&self) -> bool {
        let mut s = self.state.lock().unwrap_or_else(|e| e.into_inner());
        let now = Instant::now();
        if now.duration_since(s.0) >= self.window {
            *s = (now, 0);
        }
        if s.1 >= self.max {
            false
        } else {
            s.1 += 1;
            true
        }
    }
}

/// Every limiter the HTTP side needs.
pub struct Limits {
    pub events: RateLimiter,
    pub failed_auth: RateLimiter,
    /// Lets one "rejected request" line through every 10 s, so a flood cannot also flood the log.
    pub auth_log: RateLimiter,
}

impl Default for Limits {
    fn default() -> Self {
        Limits {
            events: RateLimiter::new(EVENTS_PER_SECOND, Duration::from_secs(1)),
            failed_auth: RateLimiter::new(FAILED_AUTH_PER_MINUTE, Duration::from_secs(60)),
            auth_log: RateLimiter::new(1, Duration::from_secs(10)),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn allows_up_to_the_cap_then_refuses_until_the_window_passes() {
        let l = RateLimiter::new(3, Duration::from_millis(80));
        assert!([l.allow(), l.allow(), l.allow()].iter().all(|a| *a));
        assert!(!l.allow(), "fourth call in the window");
        std::thread::sleep(Duration::from_millis(100));
        assert!(l.allow(), "a new window starts");
    }

    #[test]
    fn defaults_match_the_documented_numbers() {
        let l = Limits::default();
        assert!((0..EVENTS_PER_SECOND).all(|_| l.events.allow()));
        assert!(!l.events.allow());
        assert!(l.auth_log.allow());
        assert!(!l.auth_log.allow());
    }
}
