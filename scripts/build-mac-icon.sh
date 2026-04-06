#!/bin/zsh

set -euo pipefail

ROOT_DIR=$(cd "$(dirname "$0")/.." && pwd)
ICON_SRC="$ROOT_DIR/build/icon.svg"
ICON_PNG="$ROOT_DIR/build/icon.png"
ICONSET_DIR="$ROOT_DIR/build/icon.iconset"
ICON_ICNS="$ROOT_DIR/build/icon.icns"

rm -rf "$ICONSET_DIR"
mkdir -p "$ICONSET_DIR"

sips -s format png "$ICON_SRC" --out "$ICON_PNG" >/dev/null

for size in 16 32 128 256 512; do
  sips -z "$size" "$size" "$ICON_PNG" --out "$ICONSET_DIR/icon_${size}x${size}.png" >/dev/null
  double=$((size * 2))
  sips -z "$double" "$double" "$ICON_PNG" --out "$ICONSET_DIR/icon_${size}x${size}@2x.png" >/dev/null
done

iconutil -c icns "$ICONSET_DIR" -o "$ICON_ICNS"
