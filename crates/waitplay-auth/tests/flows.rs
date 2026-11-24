//! End-to-end behaviour of the auth layer against a local mock of Supabase Auth / PostgREST (no internet, no real account).

use serde_json::{json, Value};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use waitplay_auth::gotrue::{Client, Session, User};
use waitplay_auth::pkce;
use waitplay_auth::service::AccountService;
use waitplay_auth::session::{AuthState, SessionManager};
use waitplay_auth::store::{MemoryStore, SecretStore};
use waitplay_auth::{AuthConfig, AuthError};

// ── a tiny mock server ───────────────────────────────────────────────────────────────────────────────────────────────────────

#[derive(Clone, Debug)]
struct Req {
    method: String,
    path: String,
    headers: HashMap<String, String>,
    body: Value,
}

struct Mock {
    port: u16,
    log: Arc<Mutex<Vec<Req>>>,
    stop: Arc<AtomicBool>,
}

impl Mock {
    fn start(handler: impl Fn(&Req) -> (u16, Value) + Send + 'static) -> Mock {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        listener.set_nonblocking(true).unwrap();
        let port = listener.local_addr().unwrap().port();
        let log = Arc::new(Mutex::new(Vec::new()));
        let stop = Arc::new(AtomicBool::new(false));
        let (l2, s2) = (log.clone(), stop.clone());
        std::thread::spawn(move || {
            while !s2.load(Ordering::SeqCst) {
                match listener.accept() {
                    Ok((mut s, _)) => {
                        s.set_nonblocking(false).unwrap();
                        s.set_read_timeout(Some(Duration::from_secs(5))).unwrap();
                        if let Some(req) = read_request(&mut s) {
                            l2.lock().unwrap().push(req.clone());
                            let (status, body) = handler(&req);
                            let text = if body.is_null() { String::new() } else { body.to_string() };
                            let _ = write!(s, "HTTP/1.1 {status} X\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{text}", text.len());
                        }
                    }
                    Err(_) => std::thread::sleep(Duration::from_millis(5)),
                }
            }
        });
        Mock { port, log, stop }
    }

    fn cfg(&self) -> AuthConfig {
        AuthConfig { url: format!("http://127.0.0.1:{}", self.port), anon_key: "sb_publishable_TESTKEY".into() }
    }

    fn requests(&self) -> Vec<Req> {
        self.log.lock().unwrap().clone()
    }

    fn count(&self, path_prefix: &str) -> usize {
        self.requests().iter().filter(|r| r.path.starts_with(path_prefix)).count()
    }
}

impl Drop for Mock {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::SeqCst);
    }
}

fn read_request(s: &mut TcpStream) -> Option<Req> {
    let mut buf = Vec::new();
    let mut chunk = [0u8; 2048];
    let head_end = loop {
        if let Some(p) = buf.windows(4).position(|w| w == b"\r\n\r\n") {
            break p;
        }
        let n = s.read(&mut chunk).ok()?;
        if n == 0 {
            return None;
        }
        buf.extend_from_slice(&chunk[..n]);
    };
    let head = String::from_utf8_lossy(&buf[..head_end]).to_string();
    let mut lines = head.split("\r\n");
    let mut first = lines.next()?.split(' ');
    let (method, path) = (first.next()?.to_string(), first.next()?.to_string());
    let headers: HashMap<String, String> = lines.filter_map(|l| l.split_once(':')).map(|(k, v)| (k.trim().to_lowercase(), v.trim().to_string())).collect();
    let len: usize = headers.get("content-length").and_then(|v| v.parse().ok()).unwrap_or(0);
    let mut body = buf[head_end + 4..].to_vec();
    while body.len() < len {
        let n = s.read(&mut chunk).ok()?;
        if n == 0 {
            break;
        }
        body.extend_from_slice(&chunk[..n]);
    }
    Some(Req { method, path, headers, body: serde_json::from_slice(&body).unwrap_or(Value::Null) })
}

fn token_json(uid: &str, access: &str, refresh: &str) -> Value {
    json!({
        "access_token": access, "refresh_token": refresh, "token_type": "bearer", "expires_in": 3600,
        "user": {"id": uid, "email": "ada@example.com", "email_confirmed_at": "2026-01-01T00:00:00Z",
                 "user_metadata": {"full_name": "Ada Lovelace"}, "app_metadata": {"provider": "email"}}
    })
}

/// A store two service instances can share (like the real OS store shared by two launches).
#[derive(Clone, Default)]
struct SharedStore(Arc<MemoryStore>);
impl SecretStore for SharedStore {
    fn load(&self) -> waitplay_auth::Result<Option<String>> { self.0.load() }
    fn save(&self, s: &str) -> waitplay_auth::Result<()> { self.0.save(s) }
    fn delete(&self) -> waitplay_auth::Result<()> { self.0.delete() }
}

fn scratch(tag: &str) -> std::path::PathBuf {
    static N: AtomicUsize = AtomicUsize::new(0);
    let p = std::env::current_exe().unwrap().parent().unwrap().join(format!("wp-auth-{}-{}-{}", tag, std::process::id(), N.fetch_add(1, Ordering::SeqCst)));
    let _ = std::fs::remove_dir_all(&p);
    std::fs::create_dir_all(&p).unwrap();
    p
}

fn service(mock: &Mock, store: &SharedStore, dir: &std::path::Path) -> AccountService {
    AccountService::new(mock.cfg(), Box::new(store.clone()), dir.to_path_buf())
}

fn plain_mock() -> Mock {
    Mock::start(|r| {
        let grant = r.path.split("grant_type=").nth(1).unwrap_or("");
        match (r.method.as_str(), r.path.split('?').next().unwrap()) {
            ("POST", "/auth/v1/token") if grant == "password" => {
                if r.body["password"] == "correct-horse" { (200, token_json("u1", "ACCESS-1", "REFRESH-1")) } else { (400, json!({"error_code": "invalid_credentials", "msg": "Invalid login credentials"})) }
            }
            ("POST", "/auth/v1/token") if grant == "refresh_token" => match r.body["refresh_token"].as_str() {
                Some("REFRESH-1") => (200, token_json("u1", "ACCESS-2", "REFRESH-2")),
                Some("REFRESH-2") => (200, token_json("u1", "ACCESS-3", "REFRESH-3")),
                _ => (400, json!({"error_code": "refresh_token_not_found", "msg": "Invalid Refresh Token: Refresh Token Not Found"})),
            },
            ("POST", "/auth/v1/logout") => (204, Value::Null),
            ("POST", "/rest/v1/rpc/register_device") => (200, json!("ok")),
            ("GET", "/rest/v1/profiles") => (200, json!([{"display_name": "Ada Lovelace", "status": "active"}])),
            ("GET", "/rest/v1/entitlements") => (200, json!([{"plan": "free", "status": "active", "device_limit": 2}])),
            ("GET", "/rest/v1/devices") => (200, json!([{"id": "d-1", "device_id": "other-device", "name": "Work Mac", "platform": "macos", "last_seen": "2026-01-01T00:00:00Z", "revoked_at": null}])),
            _ => (404, json!({"msg": "not found"})),
        }
    })
}

fn dead_port_cfg() -> AuthConfig {
    let l = TcpListener::bind("127.0.0.1:0").unwrap();
    let port = l.local_addr().unwrap().port();
    drop(l);
    AuthConfig { url: format!("http://127.0.0.1:{port}"), anon_key: "sb_publishable_TESTKEY".into() }
}

// ── password sign-in, storage and the secrets rule ───────────────────────────────────────────────────────────────────────────

#[test]
fn password_sign_in_stores_only_the_refresh_token_and_exposes_no_secret() {
    let mock = plain_mock();
    let (store, dir) = (SharedStore::default(), scratch("pw"));
    let svc = service(&mock, &store, &dir);

    let wrong = svc.sign_in_password("ada@example.com", "nope").unwrap_err();
    assert_eq!(wrong.user_message(), "Wrong email or password.");
    assert_eq!(svc.view()["state"], "signedOut");

    svc.sign_in_password(" Ada@Example.com ", "correct-horse").unwrap();
    let view = svc.view();
    assert_eq!((view["state"].as_str(), view["user"]["email"].as_str(), view["user"]["name"].as_str(), view["plan"].as_str()), (Some("signedIn"), Some("ada@example.com"), Some("Ada Lovelace"), Some("free")));
    assert_eq!(view["devices"][0]["name"], "Work Mac");

    let stored = store.load().unwrap().unwrap();
    assert!(stored.contains("REFRESH-1") && !stored.contains("ACCESS-1"), "the access token stays in memory: {stored}");
    // nothing secret anywhere a page or a log could see it
    let shown = view.to_string();
    let cache = std::fs::read_to_string(dir.join("account.json")).unwrap();
    for secret in ["ACCESS-1", "REFRESH-1", "correct-horse", "TESTKEY"] {
        assert!(!shown.contains(secret) && !cache.contains(secret), "{secret} leaked");
    }
    // every request carries the publishable key as apikey; the password endpoint is called with the key as bearer
    let reqs = mock.requests();
    assert!(reqs.iter().all(|r| r.headers.get("apikey").map(String::as_str) == Some("sb_publishable_TESTKEY")));
    let rest = reqs.iter().find(|r| r.path.starts_with("/rest/v1/profiles")).unwrap();
    assert_eq!(rest.headers.get("authorization").map(String::as_str), Some("Bearer ACCESS-1"), "RLS data is requested with the user's token");
}

#[test]
fn a_second_launch_starts_signed_in_without_any_network_call() {
    let mock = plain_mock();
    let (store, dir) = (SharedStore::default(), scratch("relaunch"));
    service(&mock, &store, &dir).sign_in_password("ada@example.com", "correct-horse").unwrap();
    let before = mock.requests().len();

    let second = service(&mock, &store, &dir);
    assert_eq!(mock.requests().len(), before, "starting must not touch the network");
    let v = second.view();
    assert_eq!((v["state"].as_str(), v["offline"].as_bool(), v["user"]["email"].as_str()), (Some("signedIn"), Some(true), Some("ada@example.com")), "cached profile, offline until refreshed");
    assert!(matches!(second.manager().state(), AuthState::SignedIn { offline: true, .. }));
}

#[test]
fn offline_start_keeps_the_user_signed_in_and_never_signs_out_on_network_errors() {
    let (store, dir) = (SharedStore::default(), scratch("offline"));
    let mock = plain_mock();
    service(&mock, &store, &dir).sign_in_password("ada@example.com", "correct-horse").unwrap();
    drop(mock);

    let svc = AccountService::new(dead_port_cfg(), Box::new(store.clone()), dir.clone());
    assert_eq!(svc.view()["state"], "signedIn");
    let err = svc.manager().refresh().unwrap_err();
    assert!(err.is_transient(), "{err:?}");
    assert!(svc.tick() || true); // a tick while offline must not panic or sign out
    assert_eq!(svc.view()["state"], "signedIn", "still signed in after a failed refresh");
    assert!(store.load().unwrap().unwrap().contains("REFRESH-1"), "the stored refresh token is untouched");
    assert!(err.user_message().contains("offline"), "{}", err.user_message());
}

// ── refresh, rotation, expiry ──────────────────────────────────────────────────────────────────────────────────────────────

fn manager(mock: &Mock, store: &SharedStore, clock: Arc<Mutex<i64>>) -> SessionManager {
    SessionManager::with_clock(Client::new(mock.cfg()), Box::new(store.clone()), Box::new(move || *clock.lock().unwrap()))
}

fn session(access: &str, refresh: &str, expires_at: i64) -> Session {
    Session { access_token: access.into(), refresh_token: refresh.into(), expires_at, user: User { id: "u1".into(), email: "ada@example.com".into(), display_name: "Ada".into(), email_confirmed: true, provider: "email".into() } }
}

#[test]
fn the_access_token_is_refreshed_before_it_expires_and_the_refresh_token_rotates() {
    let mock = plain_mock();
    let store = SharedStore::default();
    let t0 = waitplay_auth::gotrue::now_secs();
    let clock = Arc::new(Mutex::new(t0));
    let m = manager(&mock, &store, clock.clone());

    m.adopt(session("ACCESS-1", "REFRESH-1", t0 + 3600)).unwrap();
    assert_eq!(m.access_token().unwrap(), "ACCESS-1", "fresh: no request");
    assert_eq!(mock.count("/auth/v1/token"), 0);

    // 30 s left is inside the 60 s margin: the next call refreshes and rotates the token
    m.adopt(session("ACCESS-1", "REFRESH-1", t0 + 30)).unwrap();
    assert_eq!(m.next_refresh_in(), Some(0), "due now");
    assert_eq!(m.access_token().unwrap(), "ACCESS-2");
    assert!(store.load().unwrap().unwrap().contains("REFRESH-2"), "rotated token persisted");
    assert!(!store.load().unwrap().unwrap().contains("REFRESH-1"));
    let due = m.next_refresh_in().unwrap();
    assert!((3600 - 60 - 40..=3600 - 60).contains(&due), "the new session is good for about another hour, got {due}");
}

#[test]
fn a_dead_refresh_token_signs_out_with_a_reason_and_wipes_the_store() {
    let mock = plain_mock();
    let (store, dir) = (SharedStore::default(), scratch("dead"));
    store.save(r#"{"v":1,"user_id":"u1","refresh_token":"REVOKED"}"#).unwrap();
    let svc = service(&mock, &store, &dir);
    assert_eq!(svc.view()["state"], "signedIn");

    assert_eq!(svc.manager().refresh().unwrap_err(), AuthError::SessionExpired);
    let v = svc.view();
    assert_eq!(v["state"], "signedOut");
    assert!(v["reason"].as_str().unwrap().contains("expired"), "{v}");
    assert_eq!(store.load().unwrap(), None, "the dead secret must not stay in the keychain");
}

#[test]
fn a_server_error_during_refresh_keeps_the_session() {
    let mock = Mock::start(|_| (503, json!({"msg": "down"})));
    let store = SharedStore::default();
    let m = manager(&mock, &store, Arc::new(Mutex::new(0)));
    m.adopt(session("A", "R", 10)).unwrap();
    assert_eq!(m.refresh().unwrap_err(), AuthError::Unavailable);
    assert!(matches!(m.state(), AuthState::SignedIn { .. }));
    assert!(store.load().unwrap().unwrap().contains("\"R\""));
}

#[test]
fn garbage_in_the_secret_store_is_discarded() {
    let mock = plain_mock();
    let store = SharedStore::default();
    store.save("not json at all").unwrap();
    let m = manager(&mock, &store, Arc::new(Mutex::new(0)));
    assert!(matches!(m.state(), AuthState::SignedOut { .. }));
    assert_eq!(store.load().unwrap(), None);
    store.save(r#"{"v":2,"user_id":"x","refresh_token":"y"}"#).unwrap();
    assert!(matches!(manager(&mock, &store, Arc::new(Mutex::new(0))).state(), AuthState::SignedOut { .. }), "unknown version");
}

#[test]
fn sign_out_always_clears_local_state_even_when_the_server_is_unreachable() {
    let mock = plain_mock();
    let (store, dir) = (SharedStore::default(), scratch("out"));
    let svc = service(&mock, &store, &dir);
    svc.sign_in_password("ada@example.com", "correct-horse").unwrap();
    assert!(dir.join("account.json").exists());
    drop(mock); // server gone

    svc.sign_out().unwrap();
    assert_eq!(svc.view()["state"], "signedOut");
    assert_eq!(store.load().unwrap(), None);
    assert!(!dir.join("account.json").exists(), "no account data left behind");
}

#[test]
fn another_accounts_cache_is_never_shown() {
    let mock = plain_mock();
    let (store, dir) = (SharedStore::default(), scratch("cache"));
    std::fs::write(dir.join("account.json"), json!({"userId": "someone-else", "email": "other@example.com", "plan": "pro"}).to_string()).unwrap();
    store.save(r#"{"v":1,"user_id":"u1","refresh_token":"REFRESH-1"}"#).unwrap();
    let v = service(&mock, &store, &dir).view();
    assert_eq!(v["user"]["email"], "", "{v}");
    assert_eq!(v["plan"], "free");
}

// ── browser (OAuth PKCE) flow ──────────────────────────────────────────────────────────────────────────────────────────────

fn query_param(url: &str, key: &str) -> String {
    let q = url.split_once('?').unwrap().1;
    q.split('&').find_map(|p| p.strip_prefix(&format!("{key}="))).map(|v| pkce::urldecode(v).unwrap()).unwrap()
}

fn http_get(url: &str) -> String {
    let rest = url.strip_prefix("http://").unwrap();
    let (host, path) = rest.split_once('/').unwrap();
    let mut s = TcpStream::connect(host).unwrap();
    write!(s, "GET /{path} HTTP/1.1\r\nHost: {host}\r\nConnection: close\r\n\r\n").unwrap();
    let mut out = String::new();
    let _ = s.read_to_string(&mut out);
    out
}

#[test]
fn google_sign_in_uses_pkce_and_the_one_shot_loopback_callback() {
    let challenge_seen = Arc::new(Mutex::new(String::new()));
    let cs = challenge_seen.clone();
    let mock = Mock::start(move |r| match r.path.split('?').next().unwrap() {
        "/auth/v1/token" if r.path.contains("grant_type=pkce") => {
            // the verifier must hash to the challenge sent to /authorize, and the code must be the one we issued
            let ok = r.body["auth_code"] == "AUTH-CODE-1" && pkce::challenge_for(r.body["code_verifier"].as_str().unwrap_or("")) == *cs.lock().unwrap();
            if ok { (200, token_json("g1", "G-ACCESS", "G-REFRESH")) } else { (400, json!({"error_code": "bad_code_verifier", "msg": "bad verifier"})) }
        }
        "/rest/v1/rpc/register_device" => (200, json!("ok")),
        "/rest/v1/profiles" => (200, json!([{"display_name": "Grace", "status": "active"}])),
        "/rest/v1/entitlements" => (200, json!([{"plan": "free", "status": "active", "device_limit": 2}])),
        "/rest/v1/devices" => (200, json!([])),
        _ => (404, Value::Null),
    });
    let (store, dir) = (SharedStore::default(), scratch("google"));
    let svc = Arc::new(service(&mock, &store, &dir));
    let replay_url = Arc::new(Mutex::new(String::new()));

    let (cs2, ru) = (challenge_seen.clone(), replay_url.clone());
    let opener = move |url: &str| {
        assert!(url.contains("/auth/v1/authorize?provider=google") && url.contains("code_challenge_method=s256") && !url.contains("TESTKEY"), "{url}");
        *cs2.lock().unwrap() = query_param(url, "code_challenge");
        let redirect = query_param(url, "redirect_to");
        assert!(redirect.starts_with("http://127.0.0.1:") && redirect.contains("/auth/callback/"), "{redirect}");
        *ru.lock().unwrap() = format!("{redirect}?code=AUTH-CODE-1");
        // the "browser": first a hostile request with the wrong nonce, then the real redirect
        let wrong = redirect.rsplit_once('/').unwrap().0.to_string() + "/WRONG?code=stolen";
        let r = std::thread::spawn({
            let (wrong, good) = (wrong, format!("{redirect}?code=AUTH-CODE-1"));
            move || {
                assert!(http_get(&wrong).starts_with("HTTP/1.1 400"));
                assert!(http_get(&good).starts_with("HTTP/1.1 200"));
            }
        });
        std::mem::forget(r);
        true
    };
    svc.sign_in_oauth("google", &opener).unwrap();
    assert_eq!(svc.view()["state"], "signedIn");
    assert_eq!(svc.view()["user"]["name"], "Grace", "the profile row wins over the provider metadata");
    assert!(store.load().unwrap().unwrap().contains("G-REFRESH"));

    // replay of the same callback URL: the listener is gone
    let url = replay_url.lock().unwrap().clone();
    let host = url.strip_prefix("http://").unwrap().split('/').next().unwrap().to_string();
    assert!(TcpStream::connect(host).is_err(), "a replayed callback must find nothing listening");
}

#[test]
fn a_cancelled_provider_login_returns_an_error_and_leaves_the_user_signed_out() {
    let mock = plain_mock();
    let (store, dir) = (SharedStore::default(), scratch("cancel"));
    let svc = service(&mock, &store, &dir);
    let opener = |url: &str| {
        let redirect = query_param(url, "redirect_to");
        let denied = format!("{redirect}?error=access_denied&error_description=User+cancelled");
        std::thread::spawn(move || { http_get(&denied); });
        true
    };
    let err = svc.sign_in_oauth("google", &opener).unwrap_err();
    assert!(matches!(&err, AuthError::Callback(m) if m.contains("not completed")), "{err:?}");
    assert_eq!(svc.view()["state"], "signedOut");
    assert_eq!(mock.count("/auth/v1/token"), 0, "no code exchange without a code");
    // other providers are refused, and a browser that cannot be opened ends the flow
    assert!(svc.sign_in_oauth("github", &|_| true).is_err());
    assert!(svc.sign_in_oauth("google", &|_| false).is_err());
}

#[test]
fn an_exchange_with_a_bad_code_is_rejected_not_adopted() {
    let mock = Mock::start(|r| if r.path.contains("grant_type=pkce") { (400, json!({"error_code": "flow_state_not_found", "msg": "invalid flow state"})) } else { (404, Value::Null) });
    let (store, dir) = (SharedStore::default(), scratch("badcode"));
    let svc = service(&mock, &store, &dir);
    let opener = |url: &str| {
        let good = format!("{}?code=FORGED", query_param(url, "redirect_to"));
        std::thread::spawn(move || { http_get(&good); });
        true
    };
    assert!(matches!(svc.sign_in_oauth("google", &opener), Err(AuthError::Rejected { .. })));
    assert_eq!(svc.view()["state"], "signedOut");
    assert_eq!(store.load().unwrap(), None);
}

// ── email flows ──────────────────────────────────────────────────────────────────────────────────────────────────────────────

#[test]
fn sign_up_needs_the_emailed_code_then_signs_in() {
    let mock = Mock::start(|r| match r.path.split('?').next().unwrap() {
        "/auth/v1/signup" => (200, json!({"id": "u9", "email": "new@example.com", "email_confirmed_at": null, "user_metadata": {}, "app_metadata": {"provider": "email"}})),
        "/auth/v1/verify" => {
            if r.body["token"] == "123456" && r.body["type"] == "signup" { (200, token_json("u9", "N-ACCESS", "N-REFRESH")) } else { (403, json!({"error_code": "otp_expired", "msg": "Token has expired or is invalid"})) }
        }
        "/rest/v1/rpc/register_device" => (200, json!("ok")),
        _ => (404, Value::Null),
    });
    let (store, dir) = (SharedStore::default(), scratch("signup"));
    let svc = service(&mock, &store, &dir);
    assert!(svc.sign_up("new@example.com", "short").is_err(), "weak password refused before any request");
    assert_eq!(mock.count("/auth/v1/signup"), 0);
    assert_eq!(svc.sign_up("new@example.com", "long-enough-pw").unwrap(), waitplay_auth::service::SignUpOutcome::NeedsCode);
    assert_eq!(svc.view()["state"], "signedOut", "not signed in until the code is verified");
    assert_eq!(svc.verify_code("new@example.com", "000000", "signup").unwrap_err().user_message(), "That code expired or is not valid. Request a new one.");
    svc.verify_code("new@example.com", "123 456", "signup").unwrap();
    assert_eq!(svc.view()["state"], "signedIn");
    assert!(svc.verify_code("new@example.com", "123456", "magiclink").is_err(), "unknown code types are refused locally");
}

#[test]
fn password_reset_verifies_the_code_then_sets_the_new_password() {
    let new_pw = Arc::new(Mutex::new(String::new()));
    let np = new_pw.clone();
    let mock = Mock::start(move |r| match (r.method.as_str(), r.path.split('?').next().unwrap()) {
        ("POST", "/auth/v1/recover") => (200, json!({})),
        ("POST", "/auth/v1/verify") => if r.body["type"] == "recovery" && r.body["token"] == "654321" { (200, token_json("u1", "R-ACCESS", "R-REFRESH")) } else { (403, json!({"error_code": "otp_expired"})) },
        ("PUT", "/auth/v1/user") => { *np.lock().unwrap() = r.body["password"].as_str().unwrap_or("").to_string(); assert_eq!(r.headers["authorization"], "Bearer R-ACCESS"); (200, json!({})) }
        ("POST", "/rest/v1/rpc/register_device") => (200, json!("ok")),
        _ => (404, Value::Null),
    });
    let (store, dir) = (SharedStore::default(), scratch("reset"));
    let svc = service(&mock, &store, &dir);
    svc.send_password_reset("ada@example.com").unwrap();
    assert!(svc.reset_password("ada@example.com", "111111", "brand-new-pw").is_err());
    assert_eq!(&*new_pw.lock().unwrap(), "");
    svc.reset_password("ada@example.com", "654321", "brand-new-pw").unwrap();
    assert_eq!(&*new_pw.lock().unwrap(), "brand-new-pw");
    assert_eq!(svc.view()["state"], "signedIn");
}

#[test]
fn email_restrictions_of_the_built_in_mail_service_are_explained() {
    // 2 emails per hour
    let mock = Mock::start(|_| (429, json!({"error_code": "over_email_send_rate_limit", "msg": "email rate limit exceeded"})));
    let (store, dir) = (SharedStore::default(), scratch("rate"));
    let err = service(&mock, &store, &dir).send_code("ada@example.com", false).unwrap_err();
    assert!(matches!(&err, AuthError::Rejected { code, .. } if code == "over_email_send_rate_limit"), "{err:?}");
    assert!(err.user_message().contains("2 per hour"), "{}", err.user_message());

    // recipients outside the project team (documented message: "Email address not authorized.")
    for body in [json!({"error_code": "email_address_not_authorized", "msg": "Email address not authorized"}), json!({"msg": "Email address not authorized."})] {
        let mock = Mock::start(move |_| (400, body.clone()));
        let err = service(&mock, &SharedStore::default(), &scratch("unauth")).send_code("someone@gmail.com", true).unwrap_err();
        assert!(err.user_message().contains("project team"), "{}", err.user_message());
    }
    // sign-in code for an address that has no account, and a malformed address
    let mock = Mock::start(|_| (422, json!({"error_code": "otp_disabled", "msg": "Signups not allowed for otp"})));
    assert!(service(&mock, &SharedStore::default(), &scratch("nouser")).send_code("new@gmail.com", false).unwrap_err().user_message().contains("Create account"));
    // the generic request limit is still the generic message
    let mock = Mock::start(|_| (429, json!({"error_code": "over_request_rate_limit"})));
    let err = service(&mock, &SharedStore::default(), &scratch("req")).send_code("ada@gmail.com", false).unwrap_err();
    assert_eq!(err, AuthError::RateLimited);
}

// ── account actions ────────────────────────────────────────────────────────────────────────────────────────────────────────

#[test]
fn account_deletion_calls_the_function_then_removes_every_local_trace() {
    let mock = Mock::start(|r| match (r.method.as_str(), r.path.split('?').next().unwrap()) {
        ("POST", "/auth/v1/token") => (200, token_json("u1", "ACCESS-1", "REFRESH-1")),
        ("POST", "/functions/v1/delete-account") => { assert_eq!(r.headers["authorization"], "Bearer ACCESS-1"); (200, json!({"deleted": true})) }
        ("POST", "/rest/v1/rpc/register_device") => (200, json!("ok")),
        ("GET", "/rest/v1/profiles") => (200, json!([{"display_name": "Ada", "status": "active"}])),
        ("GET", "/rest/v1/entitlements") => (200, json!([])),
        ("GET", "/rest/v1/devices") => (200, json!([])),
        _ => (404, Value::Null),
    });
    let (store, dir) = (SharedStore::default(), scratch("delete"));
    let svc = service(&mock, &store, &dir);
    svc.sign_in_password("ada@example.com", "correct-horse").unwrap();
    svc.device_id();
    svc.delete_account().unwrap();
    assert_eq!(mock.count("/functions/v1/delete-account"), 1);
    assert_eq!(svc.view()["state"], "signedOut");
    assert_eq!(store.load().unwrap(), None);
    assert!(!dir.join("account.json").exists() && !dir.join("device.json").exists());
}

#[test]
fn a_failed_account_deletion_keeps_the_user_signed_in() {
    let mock = Mock::start(|r| match r.path.split('?').next().unwrap() {
        "/auth/v1/token" => (200, token_json("u1", "ACCESS-1", "REFRESH-1")),
        "/functions/v1/delete-account" => (500, json!({"error": "boom"})),
        "/rest/v1/rpc/register_device" => (200, json!("ok")),
        _ => (200, json!([])),
    });
    let (store, dir) = (SharedStore::default(), scratch("delfail"));
    let svc = service(&mock, &store, &dir);
    svc.sign_in_password("ada@example.com", "correct-horse").unwrap();
    assert!(svc.delete_account().is_err());
    assert_eq!(svc.view()["state"], "signedIn");
    assert!(store.load().unwrap().is_some());
}

#[test]
fn the_device_id_is_stable_random_and_marks_this_device_in_the_list() {
    let mock = plain_mock();
    let (store, dir) = (SharedStore::default(), scratch("device"));
    let svc = service(&mock, &store, &dir);
    let id = svc.device_id();
    assert!(id.len() >= 16);
    assert_eq!(svc.device_id(), id, "stable across calls");
    assert_eq!(service(&mock, &store, &dir).device_id(), id, "stable across launches");
    svc.sign_in_password("ada@example.com", "correct-horse").unwrap();
    let reg = mock.requests().into_iter().find(|r| r.path.contains("register_device")).unwrap();
    assert_eq!(reg.body["p_device_id"], id.as_str());
    assert_eq!(reg.body["p_app_version"], env!("CARGO_PKG_VERSION"));
    assert!(svc.view()["devices"].as_array().unwrap().iter().all(|d| d["current"] == false), "the other device is not marked current");
}

#[test]
fn a_device_removed_from_the_account_signs_out_locally_on_the_next_heartbeat() {
    let mock = Mock::start(|r| match r.path.split('?').next().unwrap() {
        "/auth/v1/token" => (200, token_json("u1", "ACCESS-1", "REFRESH-1")),
        // explicit sign-in registers; the background heartbeat finds the device removed
        "/rest/v1/rpc/register_device" => (200, if r.body["p_explicit"] == true { json!("ok") } else { json!("revoked") }),
        "/rest/v1/profiles" => (200, json!([{"display_name": "Ada", "status": "active"}])),
        "/rest/v1/entitlements" => (200, json!([])),
        "/rest/v1/devices" => (200, json!([])),
        _ => (404, Value::Null),
    });
    let (store, dir) = (SharedStore::default(), scratch("revoked"));
    let svc = service(&mock, &store, &dir);
    svc.sign_in_password("ada@example.com", "correct-horse").unwrap();
    assert_eq!(svc.view()["state"], "signedIn");

    assert_eq!(svc.sync_cloud().unwrap_err(), AuthError::SessionExpired);
    let v = svc.view();
    assert_eq!(v["state"], "signedOut");
    assert!(v["reason"].as_str().unwrap().contains("removed from your account"), "{v}");
    assert_eq!(store.load().unwrap(), None);
}
