//! Guards for the supply-chain and link fixes (audit SA-03, SA-06): they fail when someone adds a mutable action reference, a
//! workflow without scoped permissions, or a placeholder download link again.

use std::fs;
use std::path::{Path, PathBuf};

fn root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../..").canonicalize().unwrap()
}

fn workflows() -> Vec<(String, String)> {
    let dir = root().join(".github/workflows");
    let mut out = Vec::new();
    for entry in fs::read_dir(dir).unwrap() {
        let path = entry.unwrap().path();
        if path.extension().is_some_and(|e| e == "yml" || e == "yaml") {
            out.push((path.file_name().unwrap().to_string_lossy().into_owned(), fs::read_to_string(&path).unwrap()));
        }
    }
    assert!(!out.is_empty(), "no workflows found");
    out
}

#[test]
fn every_action_is_pinned_to_a_full_commit_sha() {
    for (name, text) in workflows() {
        for (n, line) in text.lines().enumerate() {
            let Some(rest) = line.trim_start().trim_start_matches("- ").strip_prefix("uses:") else { continue };
            let spec = rest.trim().split_whitespace().next().unwrap_or("");
            if spec.starts_with("./") {
                continue;
            }
            let (_, version) = spec.split_once('@').unwrap_or((spec, ""));
            let pinned = version.len() == 40 && version.chars().all(|c| c.is_ascii_hexdigit());
            assert!(pinned, "{name}:{}: `{spec}` is not pinned to a commit SHA", n + 1);
        }
    }
}

#[test]
fn every_workflow_declares_least_privilege_permissions() {
    for (name, text) in workflows() {
        let top = text.lines().find(|l| l.starts_with("permissions:"));
        assert!(top.is_some(), "{name}: no top-level `permissions:` block");
        let idx = text.lines().position(|l| l.starts_with("permissions:")).unwrap();
        let next = text.lines().nth(idx + 1).unwrap_or("").trim();
        assert_eq!(next, "contents: read", "{name}: the default token must be read-only");
        // only a job named `release` may ask for more, and it must not build anything
        for (n, line) in text.lines().enumerate() {
            if line.trim() == "contents: write" {
                let header = text.lines().take(n).collect::<Vec<_>>().iter().rev().find(|l| l.starts_with("  ") && !l.starts_with("   ") && l.trim_end().ends_with(':')).map(|l| l.trim().to_string());
                assert_eq!(header.as_deref(), Some("release:"), "{name}:{}: write access outside the release job", n + 1);
            }
        }
    }
}

#[test]
fn release_jobs_run_no_build_code_and_publish_checksums_and_provenance() {
    for (name, text) in workflows() {
        let Some(start) = text.find("\n  release:") else { continue };
        let release = &text[start..];
        assert!(!release.contains("cargo "), "{name}: the release job must not build");
        assert!(release.contains("sha256sum"), "{name}: release without checksums");
        assert!(release.contains("attest-build-provenance"), "{name}: release without a provenance attestation");
        assert!(!release.contains("softprops"), "{name}: third-party release action");
    }
}

#[test]
fn website_has_no_placeholder_links() {
    fn walk(dir: &Path, hits: &mut Vec<String>) {
        for entry in fs::read_dir(dir).unwrap() {
            let path = entry.unwrap().path();
            if path.is_dir() {
                walk(&path, hits);
            } else if path.extension().is_some_and(|e| matches!(e.to_str(), Some("tsx" | "ts" | "html" | "md"))) {
                if fs::read_to_string(&path).unwrap_or_default().contains("your-username") {
                    hits.push(path.display().to_string());
                }
            }
        }
    }
    let mut hits = Vec::new();
    walk(&root().join("src"), &mut hits);
    let index = root().join("index.html");
    if fs::read_to_string(index).unwrap_or_default().contains("your-username") {
        hits.push("index.html".into());
    }
    assert!(hits.is_empty(), "placeholder GitHub account in: {hits:?}");
}
