//! The real `waitplay-bridge` binary: the token reaches the owner-only token file and nowhere else (audit SA-10).

use std::io::Read;
use std::net::TcpStream;
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

fn scratch(tag: &str) -> PathBuf {
    let p = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../target").join(format!("wp-token-it-{}-{}", tag, std::process::id()));
    let _ = std::fs::remove_dir_all(&p);
    std::fs::create_dir_all(&p).unwrap();
    p.canonicalize().unwrap()
}

#[test]
fn the_token_is_in_the_private_file_only_never_on_stdout_or_in_the_working_directory() {
    let temp = scratch("temp");
    let cwd = scratch("cwd");
    let port = 39000 + (std::process::id() % 900) as u16;
    let mut child = Command::new(env!("CARGO_BIN_EXE_waitplay-bridge"))
        .current_dir(&cwd)
        .env("TEMP", &temp)
        .env("TMP", &temp)
        .env("TMPDIR", &temp)
        .env("BRIDGE_PORT", port.to_string())
        .env_remove("BRIDGE_AUTH_TOKEN")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .expect("start the bridge");

    let deadline = Instant::now() + Duration::from_secs(20);
    while TcpStream::connect(("127.0.0.1", port)).is_err() {
        assert!(Instant::now() < deadline, "the bridge never started listening");
        std::thread::sleep(Duration::from_millis(100));
    }
    let token_file = temp.join("waitplay").join(".bridge-token");
    let token = std::fs::read_to_string(&token_file).expect("token file").trim().to_string();
    assert_eq!(token.len(), 48, "a 24-byte hex token");

    child.kill().unwrap();
    let mut out = String::new();
    child.stdout.take().unwrap().read_to_string(&mut out).unwrap();
    let mut err = String::new();
    child.stderr.take().unwrap().read_to_string(&mut err).unwrap();
    let _ = child.wait();

    assert!(!out.contains(&token) && !err.contains(&token), "the token was printed:\n{out}\n{err}");
    assert!(!out.contains(&token[..6]), "not even a prefix of the token may be printed");
    assert!(!cwd.join(".bridge-token").exists() && !cwd.join("waitplay").exists(), "no copy in the working directory");

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        assert_eq!(std::fs::metadata(&token_file).unwrap().permissions().mode() & 0o777, 0o600);
        assert_eq!(std::fs::metadata(token_file.parent().unwrap()).unwrap().permissions().mode() & 0o777, 0o700);
    }
    let _ = std::fs::remove_dir_all(&temp);
    let _ = std::fs::remove_dir_all(&cwd);
}
