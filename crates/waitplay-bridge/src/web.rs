//! Static server for the production build of the companion web UI (port of apps/web/serve.cjs).
//!
//! Serves `apps/web/dist` with SPA fallback and forwards the bridge endpoints (`/ws /events /health /auth /sessions`,
//! including WebSocket upgrades) to the bridge on loopback, mirroring the Vite dev proxy.

use bytes::Bytes;
use http_body_util::combinators::BoxBody;
use http_body_util::{BodyExt, Full};
use hyper::body::Incoming;
use hyper::header::{self, HeaderMap, HeaderName};
use hyper::{Request, Response, StatusCode};
use hyper_util::rt::TokioIo;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tokio::net::{TcpListener, TcpStream};

pub const DEFAULT_WEB_PORT: u16 = 5200;
pub const DEFAULT_BRIDGE_PORT: u16 = 3150;
const BRIDGE_HOST: &str = "127.0.0.1";

/// Paths forwarded to the bridge instead of being served from disk.
const PROXY_PREFIXES: [&str; 5] = ["/ws", "/events", "/health", "/auth", "/sessions"];

type BoxError = Box<dyn std::error::Error + Send + Sync>;
type Body = BoxBody<Bytes, BoxError>;
type Resp = Response<Body>;

#[derive(Clone, Debug)]
pub struct WebConfig {
    pub port: u16,
    pub bridge_port: u16,
    pub dist: PathBuf,
}

fn boxed_full(bytes: Bytes) -> Body {
    Full::new(bytes).map_err(|never| match never {}).boxed()
}

fn plain(status: u16, text: &'static str) -> Resp {
    Response::builder()
        .status(status)
        .header(header::CONTENT_TYPE, "text/plain")
        .body(boxed_full(Bytes::from_static(text.as_bytes())))
        .expect("static response parts are valid")
}

fn mime_for(path: &Path) -> &'static str {
    let ext = path.extension().and_then(|e| e.to_str()).map(|e| format!(".{}", e.to_ascii_lowercase())).unwrap_or_default();
    match ext.as_str() {
        ".html" => "text/html; charset=utf-8",
        ".js" | ".mjs" => "text/javascript; charset=utf-8",
        ".css" => "text/css; charset=utf-8",
        ".json" | ".map" => "application/json; charset=utf-8",
        ".svg" => "image/svg+xml",
        ".png" => "image/png",
        ".jpg" | ".jpeg" => "image/jpeg",
        ".gif" => "image/gif",
        ".webp" => "image/webp",
        ".ico" => "image/x-icon",
        ".woff" => "font/woff",
        ".woff2" => "font/woff2",
        ".ttf" => "font/ttf",
        _ => "application/octet-stream",
    }
}

pub fn is_proxied(url: &str) -> bool {
    PROXY_PREFIXES.iter().any(|p| url == *p || url.strip_prefix(p).is_some_and(|rest| rest.starts_with('/') || rest.starts_with('?')))
}

/// `decodeURIComponent`; `None` when malformed.
fn percent_decode(s: &str) -> Option<String> {
    let b = s.as_bytes();
    let mut out = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        if b[i] == b'%' {
            out.push(u8::from_str_radix(s.get(i + 1..i + 3)?, 16).ok()?);
            i += 3;
        } else {
            out.push(b[i]);
            i += 1;
        }
    }
    String::from_utf8(out).ok()
}

enum Resolved {
    File(PathBuf),
    /// Escapes the dist directory.
    Forbidden,
}

/// Maps a decoded URL path to a path inside `dist`, collapsing `.`/`..` like `path.join` does. A segment that could
/// not name a file (drive prefixes, NUL) resolves to a path that does not exist, so SPA fallback applies.
fn resolve_in_dist(dist: &Path, url_path: &str) -> Resolved {
    let mut stack: Vec<&str> = Vec::new();
    for seg in url_path.split(['/', '\\']) {
        match seg {
            "" | "." => {}
            ".." => {
                if stack.pop().is_none() {
                    return Resolved::Forbidden;
                }
            }
            s => stack.push(s),
        }
    }
    let mut p = dist.to_path_buf();
    for s in stack {
        if s.contains(':') || s.contains('\0') {
            return Resolved::File(dist.join("\0missing"));
        }
        p.push(s);
    }
    Resolved::File(p)
}

async fn serve_static(cfg: &WebConfig, url: &str) -> Resp {
    let raw_path = url.split('?').next().unwrap_or("/");
    let Some(decoded) = percent_decode(if raw_path.is_empty() { "/" } else { raw_path }) else {
        return plain(400, "bad request");
    };
    let url_path = if decoded == "/" { "/index.html".to_string() } else { decoded };

    let mut file = match resolve_in_dist(&cfg.dist, &url_path) {
        Resolved::File(p) => p,
        Resolved::Forbidden => return plain(403, "forbidden"),
    };
    // SPA fallback: serve index.html for anything that is not an existing file.
    if !tokio::fs::metadata(&file).await.map(|m| m.is_file()).unwrap_or(false) {
        file = cfg.dist.join("index.html");
    }
    let content_type = mime_for(&file);
    match tokio::fs::read(&file).await {
        Ok(data) => Response::builder()
            .status(200)
            .header(header::CONTENT_TYPE, content_type)
            .header(header::CACHE_CONTROL, "no-cache")
            .body(boxed_full(Bytes::from(data)))
            .expect("static response parts are valid"),
        Err(_) => plain(404, "not found"),
    }
}

fn is_hop_by_hop(name: &HeaderName) -> bool {
    matches!(name.as_str(), "connection" | "keep-alive" | "proxy-connection" | "te" | "trailer" | "transfer-encoding" | "upgrade")
}

fn wants_upgrade(headers: &HeaderMap) -> bool {
    headers.contains_key(header::UPGRADE)
        && headers
            .get(header::CONNECTION)
            .and_then(|c| c.to_str().ok())
            .is_some_and(|c| c.split(',').any(|t| t.trim().eq_ignore_ascii_case("upgrade")))
}

fn bad_gateway() -> Resp {
    plain(502, "bridge unavailable")
}

async fn proxy(cfg: &WebConfig, mut req: Request<Incoming>) -> Resp {
    let upgrading = wants_upgrade(req.headers());
    let client_upgrade = if upgrading { Some(hyper::upgrade::on(&mut req)) } else { None };

    let Ok(tcp) = TcpStream::connect((BRIDGE_HOST, cfg.bridge_port)).await else { return bad_gateway() };
    let _ = tcp.set_nodelay(true);
    let Ok((mut sender, conn)) = hyper::client::conn::http1::handshake::<_, Incoming>(TokioIo::new(tcp)).await else {
        return bad_gateway();
    };
    tokio::spawn(async move {
        let _ = conn.with_upgrades().await;
    });

    let (parts, body) = req.into_parts();
    let mut out = Request::builder().method(parts.method).uri(parts.uri.path_and_query().map_or("/", |p| p.as_str()));
    {
        let headers = out.headers_mut().expect("builder is valid");
        for (name, value) in parts.headers.iter() {
            if upgrading || !is_hop_by_hop(name) {
                headers.append(name.clone(), value.clone());
            }
        }
    }
    let Ok(out) = out.body(body) else { return bad_gateway() };

    let Ok(mut upstream) = sender.send_request(out).await else { return bad_gateway() };

    if upstream.status() == StatusCode::SWITCHING_PROTOCOLS {
        if let Some(client_upgrade) = client_upgrade {
            let upstream_upgrade = hyper::upgrade::on(&mut upstream);
            tokio::spawn(async move {
                if let (Ok(client), Ok(server)) = (client_upgrade.await, upstream_upgrade.await) {
                    let (mut client, mut server) = (TokioIo::new(client), TokioIo::new(server));
                    let _ = tokio::io::copy_bidirectional(&mut client, &mut server).await;
                }
            });
            let mut resp = Response::builder().status(StatusCode::SWITCHING_PROTOCOLS);
            for (name, value) in upstream.headers() {
                resp = resp.header(name, value);
            }
            return resp.body(boxed_full(Bytes::new())).expect("copied headers are valid");
        }
    }

    let (mut parts, body) = upstream.into_parts();
    let hop: Vec<HeaderName> = parts.headers.keys().filter(|k| is_hop_by_hop(k)).cloned().collect();
    for k in hop {
        parts.headers.remove(k);
    }
    Response::from_parts(parts, body.map_err(|e| Box::new(e) as BoxError).boxed())
}

async fn handle(cfg: Arc<WebConfig>, req: Request<Incoming>) -> Result<Resp, BoxError> {
    let url = req.uri().path_and_query().map_or("/", |p| p.as_str()).to_string();
    if is_proxied(&url) {
        return Ok(proxy(&cfg, req).await);
    }
    if wants_upgrade(req.headers()) {
        // Upgrades are only proxied; for anything else the original destroyed the socket.
        return Err("upgrade to a non-proxied path".into());
    }
    Ok(serve_static(&cfg, &url).await)
}

/// Accept loop on an already-bound listener.
pub async fn serve(listener: TcpListener, cfg: WebConfig) {
    let cfg = Arc::new(cfg);
    loop {
        let Ok((stream, _)) = listener.accept().await else {
            tokio::time::sleep(std::time::Duration::from_millis(50)).await;
            continue;
        };
        let cfg = cfg.clone();
        tokio::spawn(async move {
            let service = hyper::service::service_fn(move |req| handle(cfg.clone(), req));
            let conn = hyper::server::conn::http1::Builder::new().serve_connection(TokioIo::new(stream), service).with_upgrades();
            let _ = conn.await;
        });
    }
}

/// `Number(env || default)` for a port; `None` when set but not a valid port.
fn env_port(key: &str, default: u16) -> Option<u16> {
    match std::env::var(key).ok().filter(|v| !v.is_empty()) {
        None => Some(default),
        Some(v) => v.trim().parse::<u16>().ok(),
    }
}

/// Where the built UI lives: `--dist`, `WAITPLAY_WEB_DIST`, the checkout's `apps/web/dist`, a `web` folder next to the
/// executable, or `apps/web/dist` under the working directory.
pub fn find_dist(explicit: Option<PathBuf>) -> PathBuf {
    if let Some(p) = explicit {
        return p;
    }
    if let Ok(p) = std::env::var("WAITPLAY_WEB_DIST") {
        if !p.trim().is_empty() {
            return PathBuf::from(p.trim());
        }
    }
    if let Some(root) = waitplay_core::paths::repo_root() {
        let p = root.join("apps").join("web").join("dist");
        if p.is_dir() {
            return p;
        }
    }
    let beside = waitplay_core::paths::sibling_exe("web").with_extension("");
    if beside.join("index.html").is_file() {
        return beside;
    }
    PathBuf::from("apps").join("web").join("dist")
}

/// `waitplay-bridge web [--dist <dir>]`; returns the process exit code.
pub async fn run(args: &[String]) -> i32 {
    let mut explicit = None;
    let mut it = args.iter();
    while let Some(a) = it.next() {
        match (a.as_str(), it.clone().next()) {
            ("--dist", Some(dir)) => {
                explicit = Some(PathBuf::from(dir));
                it.next();
            }
            _ => {
                eprintln!("waitplay-bridge web: unexpected argument \"{}\"\nusage: waitplay-bridge web [--dist <dir>]", a);
                return 2;
            }
        }
    }
    let (Some(port), Some(bridge_port)) = (env_port("WAITPLAY_WEB_PORT", DEFAULT_WEB_PORT), env_port("WAITPLAY_BRIDGE_PORT", DEFAULT_BRIDGE_PORT)) else {
        eprintln!("[waitplay-web] invalid WAITPLAY_WEB_PORT / WAITPLAY_BRIDGE_PORT");
        return 1;
    };
    let dist = find_dist(explicit);
    let dist = std::fs::canonicalize(&dist).map(strip_verbatim).unwrap_or(dist);

    let listener = match TcpListener::bind((BRIDGE_HOST, port)).await {
        Ok(l) => l,
        // Another instance already owns the port: nothing to do.
        Err(e) if e.kind() == std::io::ErrorKind::AddrInUse => return 0,
        Err(e) => {
            eprintln!("[waitplay-web] server error: {}", e);
            return 1;
        }
    };
    println!("[waitplay-web] serving {} on http://127.0.0.1:{}", dist.display(), port);
    tokio::select! {
        _ = serve(listener, WebConfig { port, bridge_port, dist }) => {}
        _ = tokio::signal::ctrl_c() => {}
    }
    0
}

/// `\\?\C:\x` -> `C:\x` so the banner and path joins stay readable on Windows.
fn strip_verbatim(p: PathBuf) -> PathBuf {
    match p.to_str().and_then(|s| s.strip_prefix(r"\\?\")) {
        Some(rest) if !rest.starts_with("UNC") => PathBuf::from(rest),
        _ => p,
    }
}
