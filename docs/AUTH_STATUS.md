# Account sign-in: what is verified and what is not

Written from what was actually executed. Nothing here claims authentication is production ready.

## Verified (executed)

| Area | How |
|---|---|
| PKCE (RFC 7636 vector), base64url, constant-time compare, URL coding | unit tests (`cargo test -p waitplay-auth`) |
| Loopback callback: wrong nonce, wrong/rebinding Host, wrong method/path, empty or oversized code, request flood, cancel, timeout, **replay finds a closed port** | 5 unit tests + 3 end-to-end tests over real TCP |
| Password sign-in, sign-up with emailed code, sign-in/recovery codes, password reset, rate-limit mapping | 8 flow tests against a local mock of Supabase |
| Google flow end to end against the mock: authorize URL has `S256` challenge and no key, hostile request ignored, code exchange only succeeds when the verifier hashes to the challenge, cancelled login leaves the user signed out, bad code is rejected | flow tests |
| Refresh before expiry, **refresh-token rotation persisted before the old token is dropped**, 5xx/offline keeps the session, dead token signs out with a reason and wipes the store, garbage in the store is discarded | flow tests |
| Offline start: signed in from the cached profile with **zero network calls**; second launch sees the first launch's session | flow tests |
| Sign-out clears local state even with the server unreachable; account deletion wipes everything locally and a failed deletion keeps the user signed in; another account's cache is never shown | flow tests |
| Tokens never in `Debug` output, the view sent to the page, or `account.json` | flow test |
| Real **Windows Credential Manager** round trip (write, overwrite, read 400+ bytes, delete) | unit test on this PC |
| Real HTTPS (rustls) to the WaitPlay Supabase project: settings, wrong credentials -> "Wrong email or password.", unknown refresh token -> session expired; anonymous REST reads are refused | `cargo test -p waitplay-auth --test live -- --ignored` (found and fixed a real bug: a malformed refresh token returns `validation_failed`, now treated as expired) |
| Account window inside the real Windows app: Settings > Account... opens it; the email screen sends a wrong password to the **live** project and shows the server's answer; local validation works | driven through WebView2 (CDP) |
| Database: migration applies twice cleanly; **34 pgTAP assertions pass on Postgres 17** (user B cannot read/update/delete user A's rows, anon sees nothing, plan/status cannot be edited, device limit and revoke rules) | run in a local Docker Postgres with stand-ins for Supabase's `auth` schema (the suite found a real bug in `register_device`, fixed) |
| No privileged Supabase key or JWT anywhere in the repository; config refuses `sb_secret_`/`service_role` keys; privacy claims match the optional account | repo hygiene tests |

## Not verified yet

| Item | Why |
|---|---|
| **Google login with a real Google account** | needs the Google provider enabled in your dashboard (it is currently disabled: `/auth/v1/settings` shows `google:false`) and you signing in interactively. Not tested on Windows, macOS Intel or Apple Silicon. |
| Whether Supabase accepts the redirect pattern `http://127.0.0.1:*/auth/callback/*` | not configured yet |
| Email codes (sign-up, sign-in, reset) with real emails | needs the email templates changed to `{{ .Token }}`; sending real emails also needs a mailbox of yours and, before launch, custom SMTP |
| The migration and RLS suite **inside Supabase itself** | the migration is not applied to your project yet (REST answers `PGRST205: table not found`); pgTAP ran against stand-ins. `.github/workflows/supabase.yml` runs the suite on a real local Supabase stack in CI |
| `delete-account` Edge Function deployed and called | not deployed (needs you); its logic is covered by `deno test` in CI |
| macOS: Keychain storage and the account window | compiles in CI and the keychain test runs there; no human has used it. No Intel/Apple Silicon real-machine test. |
| Token refresh against the real server over time (rotation reuse window, expiry after an hour) | needs a real account |
| Apple sign-in | button disabled; needs the paid Apple Developer membership |
| Accessibility audit, localisation, a screen-reader pass | not done |
| Keychain prompts for **ad-hoc signed** macOS builds: the app's identity changes with each build, so macOS may ask to allow keychain access after an update | expected; disappears with Developer ID signing |

## Known limits

- **Device removal is cooperative**: a removed device signs itself out at its next background check. **Sign out of other devices** is the immediate, server-side kill.
- Account deletion asks the user to type their email (no fresh password/OTP re-authentication yet).
- Plan/billing is read-only: there is no payment provider yet; every account is Free.
