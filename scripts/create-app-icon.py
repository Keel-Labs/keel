#!/usr/bin/env python3
"""Create macOS app icon — center the blue K, let coral hang as accent."""
from PIL import Image
import os

SOURCE = "/Users/medha/Keel/Logo Badge - source.png"
OUTPUT_1024 = "/Users/medha/Keel/build/icon_1024.png"
ICONSET_DIR = "/Users/medha/Keel/AppIcon.iconset"

CREAM = (250, 246, 236, 255)

def blue_bbox(img):
    """Find bbox of blue K pixels only (ignores coral)."""
    px = img.load()
    w, h = img.size
    minx, miny, maxx, maxy = w, h, 0, 0
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            # Blue K: low R, low G, high B, opaque
            if a > 50 and b > 150 and r < 120 and g < 120:
                if x < minx: minx = x
                if y < miny: miny = y
                if x > maxx: maxx = x
                if y > maxy: maxy = y
    return (minx, miny, maxx + 1, maxy + 1)

def main():
    logo = Image.open(SOURCE).convert("RGBA")
    print(f"Loaded logo: {logo.size}")

    # Crop full content (K + coral) so coral isn't lost
    full_bbox = logo.getbbox()
    cropped = logo.crop(full_bbox)
    print(f"Full content bbox: {full_bbox}")

    # Find K's bbox within the cropped image
    kx0, ky0, kx1, ky1 = blue_bbox(cropped)
    kw, kh = kx1 - kx0, ky1 - ky0
    k_cx = (kx0 + kx1) / 2
    k_cy = (ky0 + ky1) / 2
    print(f"K bbox in cropped: ({kx0},{ky0},{kx1},{ky1}), size {kw}x{kh}")

    canvas_size = 1024
    canvas = Image.new("RGBA", (canvas_size, canvas_size), CREAM)

    # Scale so K is ~78% of canvas (dominant element)
    target_k = canvas_size * 0.78
    scale = target_k / max(kw, kh)
    cw, ch = cropped.size
    new_w, new_h = int(cw * scale), int(ch * scale)
    resized = cropped.resize((new_w, new_h), Image.LANCZOS)

    # Position so K's center lands at canvas center
    new_kcx = k_cx * scale
    new_kcy = k_cy * scale
    paste_x = int(canvas_size / 2 - new_kcx)
    paste_y = int(canvas_size / 2 - new_kcy)
    canvas.paste(resized, (paste_x, paste_y), resized)

    canvas.save(OUTPUT_1024, "PNG")
    print(f"Saved: {OUTPUT_1024}")

    os.makedirs(ICONSET_DIR, exist_ok=True)
    sizes = [
        (16, "icon_16x16.png"), (32, "icon_16x16@2x.png"),
        (32, "icon_32x32.png"), (64, "icon_32x32@2x.png"),
        (128, "icon_128x128.png"), (256, "icon_128x128@2x.png"),
        (256, "icon_256x256.png"), (512, "icon_256x256@2x.png"),
        (512, "icon_512x512.png"), (1024, "icon_512x512@2x.png"),
    ]
    for size, name in sizes:
        r = canvas.resize((size, size), Image.LANCZOS)
        rgb = Image.new("RGB", (size, size), CREAM[:3])
        rgb.paste(r, mask=r.split()[3])
        rgb.save(os.path.join(ICONSET_DIR, name), "PNG")

    print("Done.")

if __name__ == "__main__":
    main()
