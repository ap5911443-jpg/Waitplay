//! `waitplay-bridge` runs the bridge; `waitplay-bridge web` serves the companion web UI and proxies to the bridge.

use std::process::ExitCode;

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let runtime = tokio::runtime::Builder::new_multi_thread()
        .worker_threads(2)
        .enable_all()
        .build()
        .expect("failed to start the async runtime");
    let code = match args.first().map(String::as_str) {
        None => runtime.block_on(waitplay_bridge::bridge::run()),
        Some("bridge") if args.len() == 1 => runtime.block_on(waitplay_bridge::bridge::run()),
        Some("web") => runtime.block_on(waitplay_bridge::web::run(&args[1..])),
        Some(other) => {
            eprintln!("waitplay-bridge: unknown argument \"{}\"\nusage: waitplay-bridge [bridge | web [--dist <dir>]]", other);
            2
        }
    };
    ExitCode::from(code as u8)
}
