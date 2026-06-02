#!/usr/bin/env bash
# Upload macOS release artifacts to a GitHub release tag, with a pre-flight
# check that every file electron-updater needs is present. Run from repo root.
#
# Usage: scripts/publish-mac-release.sh v0.3.4
set -euo pipefail

TAG="${1:-}"
if [[ -z "$TAG" ]]; then
  echo "usage: $0 v<version>" >&2
  exit 2
fi

VERSION="${TAG#v}"
DIST="dist-packages"

required=(
  "$DIST/latest-mac.yml"
  "$DIST/Keel-${VERSION}-mac.dmg"
  "$DIST/Keel-${VERSION}-mac.dmg.blockmap"
  "$DIST/Keel-${VERSION}-mac.zip"
  "$DIST/Keel-${VERSION}-mac.zip.blockmap"
)

missing=()
for f in "${required[@]}"; do
  [[ -f "$f" ]] || missing+=("$f")
done

if (( ${#missing[@]} > 0 )); then
  echo "Refusing to publish — missing artifacts:" >&2
  printf '  %s\n' "${missing[@]}" >&2
  echo "Re-run 'npm run dist:mac' and verify dist-packages/ before retrying." >&2
  exit 1
fi

manifest_version="$(awk '/^version:/ {print $2; exit}' "$DIST/latest-mac.yml")"
if [[ "$manifest_version" != "$VERSION" ]]; then
  echo "latest-mac.yml version ($manifest_version) does not match tag ($VERSION)." >&2
  exit 1
fi

for url in $(awk '/^[[:space:]]*- url:/ {print $3}' "$DIST/latest-mac.yml"); do
  if [[ ! -f "$DIST/$url" ]]; then
    echo "latest-mac.yml references $url but $DIST/$url is missing." >&2
    exit 1
  fi
done

echo "Uploading ${#required[@]} artifacts to $TAG..."
gh release upload "$TAG" "${required[@]}" --clobber

echo "Verifying release assets..."
assets="$(gh release view "$TAG" --json assets -q '.assets[].name')"
for f in "${required[@]}"; do
  name="$(basename "$f")"
  if ! grep -qx "$name" <<<"$assets"; then
    echo "Asset $name did not appear on $TAG after upload." >&2
    exit 1
  fi
done

echo "Done. $TAG has all macOS auto-updater artifacts."
