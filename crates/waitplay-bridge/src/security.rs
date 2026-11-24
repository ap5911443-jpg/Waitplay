//! Loopback-only enforcement, the CORS origin policy and the bridge auth token.

use std::io::Write;
use std::net::{IpAddr, Ipv4Addr, SocketAddr};
use std::path::Path;

/// Remote addresses accepted by the bridge: `127.0.0.1`, `::1` and `::ffff:127.0.0.1`.
pub fn is_allowed_ip(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => v4 == Ipv4Addr::LOCALHOST,
        IpAddr::V6(v6) => v6.is_loopback() || v6.to_ipv4_mapped() == Some(Ipv4Addr::LOCALHOST),
    }
}

pub fn is_allowed_remote(addr: &SocketAddr) -> bool {
    is_allowed_ip(addr.ip())
}

/// Result of the loopback middleware for a plain HTTP request.
pub enum LoopbackVerdict {
    Allowed,
    /// 403 Forbidden.
    NonLoopback,
    /// 400 Bad Request, carrying the offending Host header.
    BadHost(String),
}

/// Remote-IP check followed by the DNS-rebinding Host check. The Host check keeps the original quirk of comparing
/// only the text before the first ':' (so a bracketed IPv6 host never passes, which is moot on a 127.0.0.1 listener).
pub fn loopback_only(remote: &SocketAddr, host_header: Option<&str>) -> LoopbackVerdict {
    if !is_allowed_remote(remote) {
        return LoopbackVerdict::NonLoopback;
    }
    let host = host_header.unwrap_or("");
    let without_port = host.split(':').next().unwrap_or("");
    if matches!(without_port, "localhost" | "127.0.0.1" | "[::1]") {
        LoopbackVerdict::Allowed
    } else {
        LoopbackVerdict::BadHost(host.to_string())
    }
}

/// CORS origin policy: hostname of the Origin URL must be localhost, 127.0.0.1 or [::1] (any scheme/port).
pub fn origin_allowed(origin: &str) -> bool {
    match url_hostname(origin) {
        Some(h) => matches!(h.as_str(), "localhost" | "127.0.0.1" | "[::1]"),
        None => false,
    }
}

/// Lower-cased hostname (IPv6 keeps its brackets, as WHATWG `URL.hostname` does) of an absolute URL with an authority.
fn url_hostname(url: &str) -> Option<String> {
    let (scheme, rest) = url.split_once("://")?;
    let mut sc = scheme.chars();
    if !sc.next()?.is_ascii_alphabetic() || !sc.all(|c| c.is_ascii_alphanumeric() || matches!(c, '+' | '-' | '.')) {
        return None;
    }
    let end = rest.find(['/', '?', '#', '\\']).unwrap_or(rest.len());
    let authority = &rest[..end];
    let host_port = authority.rsplit_once('@').map_or(authority, |(_, h)| h);
    let host = if host_port.starts_with('[') {
        let close = host_port.find(']')?;
        let after = &host_port[close + 1..];
        if !after.is_empty() && !valid_port(after.strip_prefix(':')?) {
            return None;
        }
        &host_port[..=close]
    } else {
        match host_port.rsplit_once(':') {
            Some((h, p)) => {
                if !valid_port(p) {
                    return None;
                }
                h
            }
            None => host_port,
        }
    };
    if host.is_empty() {
        return None;
    }
    Some(host.to_ascii_lowercase())
}

fn valid_port(p: &str) -> bool {
    p.is_empty() || (p.chars().all(|c| c.is_ascii_digit()) && p.parse::<u32>().is_ok_and(|n| n <= 65535))
}

/// `BRIDGE_AUTH_TOKEN` (trimmed) when set; otherwise a fresh random 24-byte hex token that is published to `token_file` and
/// nowhere else (see [`write_private`]). An error means the clients could not learn the token, so the bridge must not start.
pub fn initialize_bridge_token(token_file: &Path) -> Result<String, String> {
    if let Ok(t) = std::env::var("BRIDGE_AUTH_TOKEN") {
        let t = t.trim();
        if !t.is_empty() {
            return Ok(t.to_string());
        }
    }
    publish_token(token_file)
}

/// A fresh random token, written to `token_file` (and nowhere else).
fn publish_token(token_file: &Path) -> Result<String, String> {
    let token = random_token();
    write_private(token_file, token.as_bytes()).map_err(|e| format!("could not publish the token to {}: {}", token_file.display(), e))?;
    Ok(token)
}

pub fn random_token() -> String {
    let mut bytes = [0u8; 24];
    getrandom::fill(&mut bytes).expect("operating system random number generator unavailable");
    let mut s = String::with_capacity(48);
    for b in bytes {
        s.push_str(&format!("{:02x}", b));
    }
    s
}

/// Writes `contents` so that only the current user can read them, on every write (not only when the file is first created):
/// - the directory is forced to `0700` (unix) and the call fails if that is not possible (someone else owns it);
/// - the data goes to a new `0600` file next to the target (`create_new`: never follows a pre-planted file or symlink) which is then
///   renamed over the target, so a stale file with looser permissions, a symlink or a hard link at the target cannot leak or redirect it.
/// On Windows the file inherits the per-user ACL of the temp folder (`%TEMP%` is readable only by the user and administrators).
fn write_private(path: &Path, contents: &[u8]) -> std::io::Result<()> {
    let dir = match path.parent() {
        Some(d) if !d.as_os_str().is_empty() => d,
        _ => Path::new("."),
    };
    std::fs::create_dir_all(dir)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(dir, std::fs::Permissions::from_mode(0o700))?;
    }
    let tmp = dir.join(format!(".bridge-token.{}.tmp", std::process::id()));
    let _ = std::fs::remove_file(&tmp);
    let mut opts = std::fs::OpenOptions::new();
    opts.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        opts.mode(0o600);
    }
    let result = (|| {
        let mut f = opts.open(&tmp)?;
        f.write_all(contents)?;
        f.sync_all()?;
        std::fs::rename(&tmp, path)
    })();
    if result.is_err() {
        let _ = std::fs::remove_file(&tmp);
    }
    result
}

/// Extracts the presented token the way `requireBridgeAuth` does: `x-bridge-token` wins when present at all, else a
/// `Bearer` Authorization header. `None` means nothing usable was presented.
pub fn presented_token(x_bridge_token: Option<&str>, authorization: Option<&str>) -> Option<String> {
    let candidate = match (x_bridge_token, authorization) {
        (Some(t), _) => t.trim().to_string(),
        (None, Some(a)) if a.starts_with("Bearer ") => a[7..].trim().to_string(),
        _ => return None,
    };
    if candidate.is_empty() {
        None
    } else {
        Some(candidate)
    }
}

/// Constant-time-ish equality for secrets of any length.
pub fn tokens_equal(a: &str, b: &str) -> bool {
    let (a, b) = (a.as_bytes(), b.as_bytes());
    let mut diff = a.len() ^ b.len();
    for i in 0..a.len().max(b.len()) {
        diff |= (a.get(i).copied().unwrap_or(0) ^ b.get(i).copied().unwrap_or(0)) as usize;
    }
    diff == 0
}

/// The token a browser puts in `Sec-WebSocket-Protocol: waitplay.v1, waitplay.token.<token>` (browsers cannot set headers on a
/// WebSocket). Only plain token characters are accepted.
pub fn ws_subprotocol_token(header_value: &str) -> Option<String> {
    header_value.split(',').map(str::trim).find_map(|p| {
        let t = p.strip_prefix("waitplay.token.")?;
        if !t.is_empty() && t.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.')) {
            Some(t.to_string())
        } else {
            None
        }
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sock(s: &str) -> SocketAddr {
        s.parse().unwrap()
    }

    #[test]
    fn allowed_ips() {
        assert!(is_allowed_remote(&sock("127.0.0.1:5")));
        assert!(is_allowed_remote(&sock("[::1]:5")));
        assert!(is_allowed_remote(&sock("[::ffff:127.0.0.1]:5")));
        assert!(!is_allowed_remote(&sock("127.0.0.2:5")));
        assert!(!is_allowed_remote(&sock("192.168.1.5:5")));
        assert!(!is_allowed_remote(&sock("[::2]:5")));
    }

    #[test]
    fn loopback_filter() {
        let ok = sock("127.0.0.1:9");
        assert!(matches!(loopback_only(&ok, Some("127.0.0.1:3150")), LoopbackVerdict::Allowed));
        assert!(matches!(loopback_only(&ok, Some("localhost")), LoopbackVerdict::Allowed));
        assert!(matches!(loopback_only(&ok, Some("evil.com:80")), LoopbackVerdict::BadHost(h) if h == "evil.com:80"));
        assert!(matches!(loopback_only(&ok, None), LoopbackVerdict::BadHost(h) if h.is_empty()));
        assert!(matches!(loopback_only(&sock("10.0.0.1:9"), Some("localhost")), LoopbackVerdict::NonLoopback));
    }

    #[test]
    fn websocket_subprotocol_carries_the_token() {
        assert_eq!(ws_subprotocol_token("waitplay.v1, waitplay.token.abc123").as_deref(), Some("abc123"));
        assert_eq!(ws_subprotocol_token("waitplay.token.abc123").as_deref(), Some("abc123"));
        assert_eq!(ws_subprotocol_token("waitplay.v1").as_deref(), None);
        assert_eq!(ws_subprotocol_token("waitplay.token.").as_deref(), None);
        assert_eq!(ws_subprotocol_token("chat, waitplay.token.a b").as_deref(), None, "a space is not a token character");
        assert_eq!(ws_subprotocol_token("").as_deref(), None);
    }

    #[test]
    fn cors_origins() {
        for ok in ["http://localhost:5200", "https://127.0.0.1", "http://[::1]:3000", "http://LOCALHOST", "http://user@localhost:1/x"] {
            assert!(origin_allowed(ok), "{ok}");
        }
        for bad in ["http://evil.com", "null", "", "http://localhost.evil.com", "http://localhost:abc", "localhost", "http://", "http://evil.com@x/localhost"] {
            assert!(!origin_allowed(bad), "{bad}");
        }
    }

    #[test]
    fn token_presentation() {
        assert_eq!(presented_token(Some(" abc "), Some("Bearer zzz")).as_deref(), Some("abc"));
        assert_eq!(presented_token(None, Some("Bearer  zzz ")).as_deref(), Some("zzz"));
        assert_eq!(presented_token(None, Some("Basic zzz")), None);
        assert_eq!(presented_token(Some("  "), Some("Bearer zzz")), None);
        assert_eq!(presented_token(None, None), None);
    }

    fn scratch(tag: &str) -> std::path::PathBuf {
        let p = std::env::current_exe().unwrap().parent().unwrap().join(format!("wp-token-{}-{}", tag, std::process::id()));
        let _ = std::fs::remove_dir_all(&p);
        std::fs::create_dir_all(&p).unwrap();
        p
    }

    #[test]
    fn the_token_is_published_to_exactly_the_given_file_and_replaced_on_every_start() {
        let dir = scratch("publish");
        let file = dir.join("waitplay").join(".bridge-token");
        write_private(&file, b"first").unwrap();
        assert_eq!(std::fs::read_to_string(&file).unwrap(), "first");
        write_private(&file, b"second").unwrap();
        assert_eq!(std::fs::read_to_string(&file).unwrap(), "second");
        let names: Vec<_> = std::fs::read_dir(file.parent().unwrap()).unwrap().map(|e| e.unwrap().file_name().to_string_lossy().into_owned()).collect();
        assert_eq!(names, [".bridge-token"], "no temp or extra copies are left behind");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn an_unwritable_location_is_an_error_not_a_silent_skip() {
        let dir = scratch("unwritable");
        let blocker = dir.join("a-file");
        std::fs::write(&blocker, "x").unwrap();
        let err = publish_token(&blocker.join(".bridge-token")).unwrap_err();
        assert!(err.contains("could not publish the token"), "{err}");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[cfg(unix)]
    #[test]
    fn permissions_are_enforced_on_every_write_not_only_on_creation() {
        use std::os::unix::fs::PermissionsExt;
        let dir = scratch("perms");
        let sig = dir.join("waitplay");
        std::fs::create_dir_all(&sig).unwrap();
        std::fs::set_permissions(&sig, std::fs::Permissions::from_mode(0o755)).unwrap();
        let file = sig.join(".bridge-token");
        std::fs::write(&file, "stale").unwrap();
        std::fs::set_permissions(&file, std::fs::Permissions::from_mode(0o644)).unwrap();

        write_private(&file, b"fresh").unwrap();
        let mode = |p: &std::path::Path| std::fs::metadata(p).unwrap().permissions().mode() & 0o777;
        assert_eq!(mode(&file), 0o600, "a stale world-readable file must not keep its mode");
        assert_eq!(mode(&sig), 0o700);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[cfg(unix)]
    #[test]
    fn a_planted_symlink_is_replaced_not_followed() {
        let dir = scratch("symlink");
        let sig = dir.join("waitplay");
        std::fs::create_dir_all(&sig).unwrap();
        let victim = dir.join("victim.txt");
        std::fs::write(&victim, "precious").unwrap();
        std::os::unix::fs::symlink(&victim, sig.join(".bridge-token")).unwrap();

        write_private(&sig.join(".bridge-token"), b"tok").unwrap();
        assert_eq!(std::fs::read_to_string(&victim).unwrap(), "precious", "the link target was overwritten");
        assert_eq!(std::fs::read_to_string(sig.join(".bridge-token")).unwrap(), "tok");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn random_tokens_are_48_hex_chars() {
        let t = random_token();
        assert_eq!(t.len(), 48);
        assert!(t.chars().all(|c| c.is_ascii_hexdigit()));
        assert_ne!(t, random_token());
        assert!(tokens_equal(&t, &t.clone()));
        assert!(!tokens_equal(&t, "x"));
    }
}
