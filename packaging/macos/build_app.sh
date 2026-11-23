#!/usr/bin/env bash
# Builds dist/<target>/WaitPlay.app and WaitPlay-<version>-<arch>.dmg from an already built `cargo build --release --target <t>`.
#
#   packaging/macos/build_app.sh [target-triple]        (default aarch64-apple-darwin)
#
# Signing is optional so local builds never need an Apple account:
#   APPLE_SIGNING_IDENTITY   "Developer ID Application: Name (TEAMID)"  -> Hardened Runtime + timestamp; unset = ad-hoc signature
#   APPLE_ID, APPLE_TEAM_ID, APPLE_APP_PASSWORD                         -> notarize and staple the DMG (needs the identity above)
set -euo pipefail

TARGET="${1:-aarch64-apple-darwin}"
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
VERSION="$(grep -m1 '^version' "$ROOT/Cargo.toml" | sed 's/.*"\(.*\)".*/\1/')"
BUILD="${WAITPLAY_BUILD:-$(git -C "$ROOT" rev-parse --short HEAD 2>/dev/null || echo dev)}"
case "$TARGET" in aarch64-*) ARCH=arm64 ;; x86_64-*) ARCH=x86_64 ;; *) ARCH="$TARGET" ;; esac
BIN="$ROOT/target/$TARGET/release"
OUT="$ROOT/dist/$TARGET"
APP="$OUT/WaitPlay.app"
DMG="$OUT/WaitPlay-$VERSION-$ARCH.dmg"

for b in waitplay waitplay-bridge waitplay-hook; do
  [ -f "$BIN/$b" ] || { echo "missing $BIN/$b: run cargo build --release --workspace --target $TARGET first" >&2; exit 1; }
done

rm -rf "$OUT"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
for b in waitplay waitplay-bridge waitplay-hook; do cp "$BIN/$b" "$APP/Contents/MacOS/$b"; done
sed -e "s/@VERSION@/$VERSION/" -e "s/@BUILD@/$BUILD/" "$HERE/Info.plist.in" > "$APP/Contents/Contents.tmp" && mv "$APP/Contents/Contents.tmp" "$APP/Contents/Info.plist"
printf 'APPL????' > "$APP/Contents/PkgInfo"

ICONSET="$OUT/WaitPlay.iconset"
python3 "$HERE/make_icon.py" "$ICONSET"
iconutil -c icns "$ICONSET" -o "$APP/Contents/Resources/WaitPlay.icns"
rm -rf "$ICONSET"

IDENTITY="${APPLE_SIGNING_IDENTITY:--}"
if [ "$IDENTITY" = "-" ]; then
  SIGN=(--force --sign -)
else
  SIGN=(--force --timestamp --options runtime --entitlements "$HERE/entitlements.plist" --sign "$IDENTITY")
fi
for b in waitplay-bridge waitplay-hook waitplay; do codesign "${SIGN[@]}" "$APP/Contents/MacOS/$b"; done
codesign "${SIGN[@]}" "$APP"
codesign --verify --deep --strict --verbose=2 "$APP"

STAGE="$OUT/dmg"
mkdir -p "$STAGE"
cp -R "$APP" "$STAGE/"
ln -s /Applications "$STAGE/Applications"
hdiutil create -volname "WaitPlay" -srcfolder "$STAGE" -ov -format UDZO "$DMG"
rm -rf "$STAGE"
[ "$IDENTITY" = "-" ] || codesign --force --timestamp --sign "$IDENTITY" "$DMG"

if [ "$IDENTITY" != "-" ] && [ -n "${APPLE_ID:-}" ] && [ -n "${APPLE_TEAM_ID:-}" ] && [ -n "${APPLE_APP_PASSWORD:-}" ]; then
  xcrun notarytool submit "$DMG" --apple-id "$APPLE_ID" --team-id "$APPLE_TEAM_ID" --password "$APPLE_APP_PASSWORD" --wait
  xcrun stapler staple "$DMG"
else
  echo "note: not notarized (no Developer ID credentials); Gatekeeper will ask to confirm the first launch"
fi
echo "built: $APP"
echo "built: $DMG"
