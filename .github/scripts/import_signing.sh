#!/usr/bin/env bash
# Imports the Developer ID certificate into a temporary keychain and stores the notarization credentials as a notarytool keychain
# profile. Used ONLY by the `sign` job, by the one step that is given the secrets as environment variables (see docs/RELEASE_SIGNING.md).
#
# Secrets read from the environment (names only are ever printed):
#   APPLE_CERTIFICATE_P12        base64 of the Developer ID Application certificate + private key (.p12)
#   APPLE_CERTIFICATE_PASSWORD   password of that .p12
#   APPLE_NOTARY_API_KEY_P8      base64 of the App Store Connect API key (AuthKey_XXXX.p8)
#   APPLE_NOTARY_KEY_ID          key id of that API key
#   APPLE_NOTARY_ISSUER_ID       issuer id of the App Store Connect team
#
# Outputs (non-secret) appended to $GITHUB_ENV for the later steps: APPLE_KEYCHAIN, APPLE_SIGNING_IDENTITY, APPLE_NOTARY_PROFILE.
set -euo pipefail
umask 077

missing=()
for name in APPLE_CERTIFICATE_P12 APPLE_CERTIFICATE_PASSWORD APPLE_NOTARY_API_KEY_P8 APPLE_NOTARY_KEY_ID APPLE_NOTARY_ISSUER_ID; do
  [ -n "${!name:-}" ] || missing+=("$name")
done
if [ ${#missing[@]} -gt 0 ]; then
  echo "error: these GitHub secrets are not set in the release-signing environment: ${missing[*]}" >&2
  echo "       see docs/RELEASE_SIGNING.md" >&2
  exit 1
fi

TMP="${RUNNER_TEMP:?RUNNER_TEMP is not set}"
KEYCHAIN="$TMP/waitplay-signing.keychain-db"
KEYCHAIN_PASSWORD="$(uuidgen)"
echo "::add-mask::$KEYCHAIN_PASSWORD"

security create-keychain -p "$KEYCHAIN_PASSWORD" "$KEYCHAIN"
security set-keychain-settings -lut 3600 "$KEYCHAIN"
security unlock-keychain -p "$KEYCHAIN_PASSWORD" "$KEYCHAIN"

# the certificate goes through a 0600 file that is removed again at once; the password never appears on a command line of ours
# except as the argument `security import -P`, which is how `security` takes it (the runner is single-use and the value is masked)
P12="$TMP/certificate.p12"
printf '%s' "$APPLE_CERTIFICATE_P12" | base64 --decode > "$P12"
security import "$P12" -P "$APPLE_CERTIFICATE_PASSWORD" -T /usr/bin/codesign -t cert -f pkcs12 -k "$KEYCHAIN"
rm -f "$P12"
security set-key-partition-list -S apple-tool:,apple: -s -k "$KEYCHAIN_PASSWORD" "$KEYCHAIN" >/dev/null
security list-keychains -d user -s "$KEYCHAIN" $(security list-keychains -d user | tr -d '"')

# the identity is looked up, not configured: exactly one Developer ID Application identity must be in the certificate
IDENTITIES="$(security find-identity -v -p codesigning "$KEYCHAIN" | sed -n 's/.*"\(Developer ID Application: .*\)"/\1/p' | sort -u)"
COUNT="$(printf '%s\n' "$IDENTITIES" | grep -c . || true)"
if [ "$COUNT" -ne 1 ]; then
  echo "error: expected exactly one 'Developer ID Application' identity in the certificate, found $COUNT" >&2
  exit 1
fi

# notarization credentials: an App Store Connect API key, stored as a keychain profile. The private key is a file (never a command
# line argument); the profile lives in the temporary keychain and is used by `notarytool --keychain-profile`.
P8="$TMP/notary-key.p8"
printf '%s' "$APPLE_NOTARY_API_KEY_P8" | base64 --decode > "$P8"
xcrun notarytool store-credentials "waitplay-notary" --key "$P8" --key-id "$APPLE_NOTARY_KEY_ID" --issuer "$APPLE_NOTARY_ISSUER_ID" --keychain "$KEYCHAIN"
rm -f "$P8"

{
  echo "APPLE_KEYCHAIN=$KEYCHAIN"
  echo "APPLE_SIGNING_IDENTITY=$IDENTITIES"
  echo "APPLE_NOTARY_PROFILE=waitplay-notary"
} >> "${GITHUB_ENV:?GITHUB_ENV is not set}"
echo "signing identity imported; notary profile stored"
