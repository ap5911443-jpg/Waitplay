#!/usr/bin/env bash
# Verifies a release DMG the way a user's Mac will: Developer ID signature, Hardened Runtime on every executable, a stapled
# notarization ticket and a Gatekeeper "accepted" verdict. Fails (non-zero) on anything less.
#
#   bash packaging/macos/verify_release.sh path/to/WaitPlay-<version>-<arch>.dmg
set -euo pipefail

DMG="${1:?usage: verify_release.sh <dmg>}"
MNT="$(mktemp -d)"
trap 'hdiutil detach "$MNT" -quiet >/dev/null 2>&1 || true; rmdir "$MNT" 2>/dev/null || true' EXIT

fail() { echo "FAIL: $*" >&2; exit 1; }

codesign --verify --strict --verbose=2 "$DMG" || fail "the DMG is not signed"
xcrun stapler validate "$DMG" || fail "no valid notarization ticket is stapled to the DMG"
spctl --assess --type open --context context:primary-signature --verbose=2 "$DMG" || fail "Gatekeeper rejects the DMG"

hdiutil attach -nobrowse -readonly -mountpoint "$MNT" "$DMG" >/dev/null
APP="$MNT/WaitPlay.app"
codesign --verify --deep --strict --verbose=2 "$APP" || fail "the app signature is invalid"
spctl --assess --type execute --verbose=2 "$APP" || fail "Gatekeeper rejects the app"
for f in "$APP" "$APP"/Contents/MacOS/*; do
  info="$(codesign -dv --verbose=4 "$f" 2>&1)"
  echo "$info" | grep -q "Authority=Developer ID Application" || fail "$f is not signed with a Developer ID Application certificate"
  echo "$info" | grep -q "flags=.*runtime" || fail "$f has no Hardened Runtime"
  echo "$info" | grep -q "^Timestamp=" || fail "$f has no secure timestamp"
done
echo "OK: Developer ID signed, hardened, notarized and stapled: $DMG"
