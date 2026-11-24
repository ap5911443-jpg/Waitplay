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

#[test]
fn website_loads_nothing_from_third_parties() {
    let index = fs::read_to_string(root().join("index.html")).unwrap();
    for forbidden in ["fonts.googleapis.com", "fonts.gstatic.com", "googletagmanager", "google-analytics", "cdn."] {
        assert!(!index.contains(forbidden), "index.html pulls in {forbidden}");
    }
    for tag in ["<script src=\"http", "<link rel=\"stylesheet\" href=\"http", "<link href=\"http"] {
        assert!(!index.contains(tag), "index.html loads an external resource: {tag}");
    }
    let main = fs::read_to_string(root().join("src/main.tsx")).unwrap();
    assert!(main.contains("@fontsource/figtree") && main.contains("@fontsource/eb-garamond"), "fonts must be self-hosted");
}

#[test]
fn privacy_claims_are_not_the_old_false_ones_and_the_policy_is_linked() {
    let privacy = fs::read_to_string(root().join("src/components/sections/PrivacySection.tsx")).unwrap();
    for false_claim in ["completely offline", "zero external network", "never read, stored"] {
        assert!(!privacy.contains(false_claim), "PrivacySection still claims: {false_claim}");
    }
    let faqs = fs::read_to_string(root().join("src/data/faqs.ts")).unwrap();
    assert!(!faqs.contains("never read, stored, or transmitted") && !faqs.contains("run it completely offline"), "FAQ still makes a false claim");
    let cta = fs::read_to_string(root().join("src/components/sections/FinalCTA.tsx")).unwrap();
    assert!(!cta.contains("Works Completely Offline"), "the offline claim is wrong: the app opens Instagram, X and YouTube");
    assert!(root().join("docs/PRIVACY.md").is_file(), "docs/PRIVACY.md is missing");
    assert!(root().join("SECURITY.md").is_file(), "SECURITY.md is missing");
    let footer = fs::read_to_string(root().join("src/components/layout/SiteFooter.tsx")).unwrap();
    assert!(footer.contains("docs/PRIVACY.md") && privacy.contains("docs/PRIVACY.md"), "the privacy policy must be linked from the site");
}

// ── Apple signing (audit SA-02, SA-04, SA-14) ────────────────────────────────────────────────────────────────────────────────────

#[test]
fn signing_secrets_exist_only_in_the_one_import_step_of_the_sign_job() {
    for (name, text) in workflows() {
        let (mut job, mut step, mut in_jobs) = (String::new(), String::new(), false);
        for (n, line) in text.lines().enumerate() {
            if line.starts_with("jobs:") {
                in_jobs = true;
            }
            if in_jobs && line.starts_with("  ") && !line.starts_with("   ") && line.trim_end().ends_with(':') && !line.trim_start().starts_with('#') {
                job = line.trim().trim_end_matches(':').to_string();
                step.clear();
            }
            if let Some(s) = line.trim_start().strip_prefix("- name:") {
                step = s.trim().to_string();
            }
            let signing_secret = line.contains("secrets.APPLE_");
            if signing_secret {
                assert!(in_jobs, "{name}:{}: a signing secret at workflow level is visible to every step", n + 1);
                assert_eq!(job, "sign", "{name}:{}: signing secret outside the sign job", n + 1);
                assert_eq!(step, "Import certificate and store notary credentials", "{name}:{}: signing secret outside the import step", n + 1);
            }
        }
    }
}

#[test]
fn the_sign_job_is_gated_protected_and_builds_nothing() {
    let (_, text) = workflows().into_iter().find(|(n, _)| n == "macos.yml").unwrap();
    let start = text.find("\n  sign:").expect("sign job");
    let end = text.find("\n  release:").expect("release job");
    let sign = &text[start..end];
    assert!(sign.contains("vars.APPLE_SIGNING_ENABLED == 'true'"), "signing must stay off until the membership is active");
    assert!(sign.contains("environment: release-signing"), "signing secrets belong to a protected environment");
    assert!(!sign.contains("cargo "), "the signing job must not run build scripts");
    assert!(text[..start].find("secrets.APPLE_").is_none(), "the build job must have no signing secrets");
}

#[test]
fn no_password_ever_goes_on_a_command_line() {
    let mut files: Vec<(String, String)> = workflows();
    for rel in ["packaging/macos/build_app.sh", "packaging/macos/verify_release.sh", ".github/scripts/import_signing.sh"] {
        files.push((rel.into(), fs::read_to_string(root().join(rel)).unwrap()));
    }
    for (name, text) in &files {
        for forbidden in ["--password", "--apple-id", "APPLE_APP_PASSWORD", "APPLE_ID:"] {
            for (n, line) in text.lines().enumerate() {
                if line.trim_start().starts_with('#') {
                    continue;
                }
                assert!(!line.contains(forbidden), "{name}:{}: `{forbidden}` (use a notarytool keychain profile)", n + 1);
            }
        }
    }
    let build = &files.iter().find(|(n, _)| n.ends_with("build_app.sh")).unwrap().1;
    assert!(build.contains("--keychain-profile"), "notarization must use a keychain profile");
}

#[test]
fn unsigned_development_builds_stay_possible() {
    let build = fs::read_to_string(root().join("packaging/macos/build_app.sh")).unwrap();
    assert!(build.contains("IDENTITY=\"${APPLE_SIGNING_IDENTITY:--}\""), "no identity must mean an ad-hoc build, not an error");
    let (_, mac) = workflows().into_iter().find(|(n, _)| n == "macos.yml").unwrap();
    let start = mac.find("  build:").unwrap();
    let end = mac.find("\n  sign:").unwrap();
    assert!(mac[start..end].contains("packaging/macos/build_app.sh"), "the build job still packages a development DMG");
}

// ── test-only switches (audit SA-15) ─────────────────────────────────────────────────────────────────────────────────────────────

#[test]
fn test_switches_are_compiled_out_of_release_builds() {
    fn walk(dir: &Path, hits: &mut Vec<(String, usize, Vec<String>)>) {
        for entry in fs::read_dir(dir).unwrap() {
            let path = entry.unwrap().path();
            if path.is_dir() {
                walk(&path, hits);
            } else if path.extension().is_some_and(|e| e == "rs") {
                let text = fs::read_to_string(&path).unwrap_or_default();
                let lines: Vec<&str> = text.lines().collect();
                for (i, l) in lines.iter().enumerate() {
                    if l.contains("\"WAITPLAY_TEST_") {
                        let before = lines[i.saturating_sub(6)..i].iter().map(|s| s.trim().to_string()).collect();
                        hits.push((path.display().to_string(), i + 1, before));
                    }
                }
            }
        }
    }
    let mut hits = Vec::new();
    for krate in fs::read_dir(root().join("crates")).unwrap() {
        let src = krate.unwrap().path().join("src");
        if src.is_dir() {
            walk(&src, &mut hits);
        }
    }
    for (file, line, before) in hits {
        let gated = before.iter().any(|b| b == "#[cfg(feature = \"test-hooks\")]" || b == "#[cfg(debug_assertions)]");
        assert!(gated, "{file}:{line}: a WAITPLAY_TEST_* switch is reachable in a release build");
    }
}

#[test]
fn only_the_smoke_test_build_enables_test_hooks() {
    for (name, text) in workflows() {
        for (n, line) in text.lines().enumerate() {
            if line.contains("test-hooks") && !line.trim_start().starts_with('#') {
                assert!(name == "macos.yml" && line.contains("cargo build --release -p waitplay-app --features test-hooks"), "{name}:{}: test-hooks used outside the smoke-test-only build", n + 1);
            }
        }
    }
    let (_, mac) = workflows().into_iter().find(|(n, _)| n == "macos.yml").unwrap();
    let hooks = mac.find("--features test-hooks").unwrap();
    let uploaded = mac.find("name: binaries-").unwrap();
    assert!(hooks > uploaded, "the test-hooks build must come after the shipped binaries were uploaded for signing");
}

// ── account sign-in (Supabase): no privileged key anywhere, honest privacy copy ───────────────────────────────────────────────────

#[test]
fn no_privileged_supabase_key_or_jwt_is_committed() {
    fn walk(dir: &Path, hits: &mut Vec<String>) {
        for entry in fs::read_dir(dir).unwrap() {
            let path = entry.unwrap().path();
            let name = path.file_name().unwrap().to_string_lossy().to_string();
            if path.is_dir() {
                if !matches!(name.as_str(), "target" | "node_modules" | ".git" | "dist" | "wp_verify") {
                    walk(&path, hits);
                }
            } else if path.extension().is_some_and(|e| matches!(e.to_str(), Some("rs" | "ts" | "tsx" | "js" | "html" | "md" | "toml" | "yml" | "yaml" | "sql" | "json" | "sh" | "ps1" | "env"))) {
                let text = fs::read_to_string(&path).unwrap_or_default();
                let secret_key = text.match_indices("sb_secret_").any(|(i, _)| text[i + 10..].chars().take_while(|c| c.is_ascii_alphanumeric() || *c == '_' || *c == '-').count() >= 10);
                let jwt = text.match_indices("eyJ").any(|(i, _)| {
                    let rest = &text[i..];
                    let parts: Vec<usize> = rest.split('.').take(3).map(|p| p.chars().take_while(|c| c.is_ascii_alphanumeric() || *c == '_' || *c == '-').count()).collect();
                    parts.len() == 3 && parts.iter().all(|n| *n >= 20)
                });
                if secret_key || jwt {
                    hits.push(path.display().to_string());
                }
            }
        }
    }
    let mut hits = Vec::new();
    walk(&root(), &mut hits);
    assert!(hits.is_empty(), "a Supabase secret key or JWT-like token is committed in: {hits:?}");
}

#[test]
fn the_app_only_ever_gets_the_public_key_and_the_config_refuses_secret_keys() {
    let cfg = fs::read_to_string(root().join("crates/waitplay-auth/src/config.rs")).unwrap();
    assert!(cfg.contains("sb_publishable_") && cfg.contains("service_role") && cfg.contains("sb_secret_"), "config.rs must hold the publishable key and refuse privileged keys");
    for (name, text) in workflows() {
        assert!(!text.contains("SERVICE_ROLE") && !text.contains("service_role"), "{name}: the service-role key must never be part of a build or test workflow");
    }
}

#[test]
fn account_claims_stay_honest() {
    let policy = fs::read_to_string(root().join("docs/PRIVACY.md")).unwrap();
    assert!(policy.contains("Supabase") && policy.contains("Delete account") && policy.contains("Credential Manager"), "the privacy policy must describe the optional account");
    for (file, claims) in [
        ("src/components/sections/PrivacySection.tsx", ["has no account", "no account, no analytics"]),
        ("src/data/faqs.ts", ["has no account", "no account, no analytics"]),
        ("docs/PRIVACY.md", ["has no account", "no server of its own"]),
    ] {
        let text = fs::read_to_string(root().join(file)).unwrap();
        for c in claims {
            assert!(!text.contains(c), "{file} still claims \"{c}\" although an optional account exists");
        }
    }
}
