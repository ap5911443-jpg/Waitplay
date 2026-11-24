//! What the entertainment window may load (audit SA-09).
//!
//! The window hosts Instagram, X and YouTube and must let their sign-in pop-ups finish (Facebook / Google / Apple login, 2FA), but a
//! page, an ad or a link in a post must not be able to send it to `file://…`, an app-handled scheme, plain `http` or an arbitrary
//! website that merely looks trustworthy.
//!
//! - [`popup_allowed`]: a pop-up (`window.open`) is loaded in place only when it is `https` on an approved host.
//! - [`navigation_allowed`]: every navigation of the site view (including frames) must use a safe scheme. Hosts are not restricted
//!   here, because ads, consent pages and embeds legitimately span many domains.

/// Hosts (and all their subdomains) that may be opened from a pop-up: the three sites, their login providers and nothing else.
const APPROVED_HOSTS: [&str; 11] = [
    "instagram.com",
    "facebook.com",
    "fb.com",
    "meta.com",
    "google.com",
    "youtube.com",
    "youtu.be",
    "x.com",
    "twitter.com",
    "apple.com",
    "icloud.com",
];

/// Schemes any navigation may use. `http` is excluded on purpose; `file`, `javascript` and app schemes (`fb://`, `itms-apps://`…)
/// are refused.
const SAFE_SCHEMES: [&str; 4] = ["https", "about", "blob", "data"];

/// `https://host[:443]/…` on an approved host, without credentials, backslashes or control characters.
pub fn popup_allowed(url: &str) -> bool {
    match https_host(url) {
        Some(host) => APPROVED_HOSTS.iter().any(|h| host == *h || host.strip_suffix(h).is_some_and(|rest| rest.ends_with('.'))),
        None => false,
    }
}

/// Whether the site view may start this navigation.
pub fn navigation_allowed(url: &str) -> bool {
    let Some((scheme, _)) = url.split_once(':') else { return false };
    SAFE_SCHEMES.contains(&scheme.to_ascii_lowercase().as_str())
}

/// The lower-cased host of a well-formed `https` URL, `None` for anything else.
fn https_host(url: &str) -> Option<String> {
    if url.len() > 4096 || url.chars().any(|c| c.is_control() || c.is_whitespace() || c == '\\') {
        return None;
    }
    let rest = url.get(..8).filter(|p| p.eq_ignore_ascii_case("https://")).map(|_| &url[8..])?;
    let end = rest.find(['/', '?', '#']).unwrap_or(rest.len());
    let authority = &rest[..end];
    if authority.is_empty() || authority.contains('@') || authority.starts_with('[') {
        return None;
    }
    let (host, port) = match authority.rsplit_once(':') {
        Some((h, p)) => (h, Some(p)),
        None => (authority, None),
    };
    if port.is_some_and(|p| p != "443") {
        return None;
    }
    let host = host.trim_end_matches('.').to_ascii_lowercase();
    let valid = !host.is_empty() && host.split('.').all(|l| !l.is_empty() && l.len() <= 63 && l.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-'));
    valid.then_some(host)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sites_and_their_login_providers_may_open_popups() {
        for ok in [
            "https://www.instagram.com/accounts/login/",
            "https://m.facebook.com/login.php?next=https%3A%2F%2Fexample.com",
            "https://www.facebook.com/v19.0/dialog/oauth?client_id=1",
            "https://accounts.google.com/o/oauth2/v2/auth?x=1#frag",
            "https://x.com/i/flow/login",
            "https://twitter.com/login",
            "https://appleid.apple.com/auth/authorize",
            "https://WWW.YouTube.com/watch?v=1",
            "https://youtu.be/abc",
            "https://www.instagram.com:443/",
            "HTTPS://www.instagram.com/",
        ] {
            assert!(popup_allowed(ok), "{ok}");
        }
    }

    #[test]
    fn everything_else_is_refused() {
        for bad in [
            "file:///etc/passwd",
            "file://localhost/C:/Windows/win.ini",
            "javascript:alert(1)",
            "http://www.instagram.com/",
            "fb://profile/1",
            "itms-apps://apps.apple.com/app/x",
            "ms-settings:privacy",
            "data:text/html,<script>alert(1)</script>",
            "https://evil.example/",
            "https://instagram.com.evil.example/",
            "https://evilinstagram.com/",
            "https://instagram.com@evil.example/",
            "https://evil.example\\@instagram.com/",
            "https://evil.example#@instagram.com/",
            "https://www.instagram.com:8443/",
            "https://[::1]/",
            "https://127.0.0.1/",
            "https://www.instagram.com/\u{0}",
            "https://www.instagram.com/ x",
            "https:///www.instagram.com",
            "https://",
            "https://xn--nstagram-1za.com/",
            "",
            "instagram.com",
            "//instagram.com",
        ] {
            assert!(!popup_allowed(bad), "{bad:?}");
        }
    }

    #[test]
    fn the_site_view_may_not_leave_https() {
        for ok in ["https://www.youtube.com/", "HTTPS://example.com/x", "about:blank", "about:srcdoc", "blob:https://www.instagram.com/1-2", "data:text/html,x"] {
            assert!(navigation_allowed(ok), "{ok}");
        }
        for bad in ["file:///C:/Users/x/secret.txt", "http://example.com/", "javascript:alert(1)", "fb://x", "ms-settings:privacy", "ftp://example.com/", "vbscript:x", "nonsense", ""] {
            assert!(!navigation_allowed(bad), "{bad}");
        }
    }
}
