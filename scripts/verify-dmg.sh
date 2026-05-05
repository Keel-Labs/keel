#!/usr/bin/env bash
# Mount each Keel-*.dmg in dist-packages/ and verify the Electron Framework
# binary made it in at the same size as the source .app. Catches the silent
# file-drop bug in dmg-builder/dmgbuild (see comment in
# electron-builder.config.mjs).
#
# Exits non-zero on any mismatch so the build script aborts.

set -euo pipefail

DIST_DIR="${DIST_DIR:-dist-packages}"
FRAMEWORK_REL_PATH="Keel.app/Contents/Frameworks/Electron Framework.framework/Versions/A/Electron Framework"
MIN_BYTES=$((100 * 1024 * 1024)) # 100 MiB sanity floor

# Only check DMGs from the current package.json version, so leftover DMGs from
# previous releases don't cause false failures.
VERSION="$(node -p "require('./package.json').version")"

shopt -s nullglob
dmgs=("$DIST_DIR"/Keel-"$VERSION"-*.dmg)
if [[ ${#dmgs[@]} -eq 0 ]]; then
  echo "verify-dmg: no DMGs matching Keel-$VERSION-*.dmg in $DIST_DIR" >&2
  exit 1
fi

# Pick the matching unpacked source dir for an arch label (mac, mac-arm64, mac-x64, mac-universal).
source_dir_for_arch() {
  case "$1" in
    arm64)     echo "$DIST_DIR/mac-arm64" ;;
    x64)       echo "$DIST_DIR/mac" ;;
    universal) echo "$DIST_DIR/mac-universal" ;;
    "")        echo "$DIST_DIR/mac-universal" ;;
    *)         echo "" ;;
  esac
}

byte_size() { stat -f%z "$1"; }

for dmg in "${dmgs[@]}"; do
  echo "verify-dmg: checking $(basename "$dmg")"

  # Extract arch suffix from filename: Keel-0.1.1-mac-arm64.dmg -> arm64,
  # Keel-0.1.1-mac.dmg -> "" (universal-or-default).
  base="$(basename "$dmg" .dmg)"
  arch_suffix=""
  if [[ "$base" =~ -mac-(arm64|x64|universal)$ ]]; then
    arch_suffix="${BASH_REMATCH[1]}"
  fi

  src_dir="$(source_dir_for_arch "$arch_suffix")"
  src_path="$src_dir/$FRAMEWORK_REL_PATH"
  if [[ ! -f "$src_path" ]]; then
    # Fall back to whichever source dir exists, in case naming convention shifts.
    found="$(find "$DIST_DIR" -maxdepth 1 -type d -name "mac*" -print -quit 2>/dev/null || true)"
    if [[ -n "$found" && -f "$found/$FRAMEWORK_REL_PATH" ]]; then
      src_path="$found/$FRAMEWORK_REL_PATH"
    else
      echo "verify-dmg: cannot find source framework binary for $base (looked in $src_dir)" >&2
      exit 1
    fi
  fi
  src_bytes="$(byte_size "$src_path")"

  mount_point="$(mktemp -d -t keel-verify)"
  trap 'hdiutil detach "$mount_point" -quiet >/dev/null 2>&1 || true; rm -rf "$mount_point"' EXIT
  hdiutil attach "$dmg" -mountpoint "$mount_point" -nobrowse -quiet

  dmg_path="$mount_point/$FRAMEWORK_REL_PATH"
  if [[ ! -f "$dmg_path" ]]; then
    echo "verify-dmg: FAIL — $FRAMEWORK_REL_PATH missing inside $(basename "$dmg")" >&2
    hdiutil detach "$mount_point" -quiet >/dev/null 2>&1 || true
    exit 2
  fi
  dmg_bytes="$(byte_size "$dmg_path")"

  if (( dmg_bytes < MIN_BYTES )); then
    echo "verify-dmg: FAIL — framework binary in $(basename "$dmg") is only $dmg_bytes bytes (< $MIN_BYTES)" >&2
    hdiutil detach "$mount_point" -quiet >/dev/null 2>&1 || true
    exit 3
  fi

  if [[ "$dmg_bytes" != "$src_bytes" ]]; then
    echo "verify-dmg: FAIL — framework binary size mismatch for $(basename "$dmg"): dmg=$dmg_bytes src=$src_bytes" >&2
    hdiutil detach "$mount_point" -quiet >/dev/null 2>&1 || true
    exit 4
  fi

  hdiutil detach "$mount_point" -quiet >/dev/null 2>&1 || true
  rm -rf "$mount_point"
  trap - EXIT
  echo "verify-dmg: OK — $(basename "$dmg") (framework binary $dmg_bytes bytes)"
done

echo "verify-dmg: all DMGs passed"
