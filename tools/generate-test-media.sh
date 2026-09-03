#!/usr/bin/env bash
set -euo pipefail

# Preflight checks
if ! command -v rsvg-convert &> /dev/null; then
  echo "Error: rsvg-convert is required to rasterize SVGs." >&2
  echo "Install it via: brew install librsvg (macOS) or apt-get install librsvg2-bin (Debian/Ubuntu)" >&2
  exit 1
fi

if ! command -v ffmpeg &> /dev/null; then
  echo "Error: ffmpeg is required to encode video streams." >&2
  echo "Install it via: brew install ffmpeg (macOS) or apt-get install ffmpeg (Debian/Ubuntu)" >&2
  exit 1
fi

OUT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/web/public/media"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

mkdir -p "$OUT_DIR"

echo "==> Generating SVG Broadcast Cards..."

# 1. Content Card (Live Show)
cat << 'EOF' > "$TMP_DIR/content.svg"
<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#030712"/>
      <stop offset="50%" stop-color="#0c2340"/>
      <stop offset="100%" stop-color="#0284c7"/>
    </linearGradient>
  </defs>
  <rect width="1280" height="720" fill="url(#bg)"/>
  
  <!-- Header Bar -->
  <rect x="60" y="50" width="1160" height="70" rx="12" fill="#0f172a" fill-opacity="0.8"/>
  <circle cx="100" cy="85" r="10" fill="#ef4444"/>
  <text x="125" y="92" font-family="-apple-system, system-ui, sans-serif" font-size="20" font-weight="bold" fill="#ffffff" letter-spacing="2">LIVE BROADCAST</text>
  <text x="1170" y="92" font-family="-apple-system, system-ui, sans-serif" font-size="18" fill="#38bdf8" text-anchor="end">CHANNEL: FAST-01 (SPORTS HD)</text>

  <!-- Central Title -->
  <text x="640" y="320" font-family="-apple-system, system-ui, sans-serif" font-size="52" font-weight="900" fill="#ffffff" text-anchor="middle" letter-spacing="1">CHAMPIONSHIP FINALS</text>
  <text x="640" y="390" font-family="-apple-system, system-ui, sans-serif" font-size="28" font-weight="500" fill="#93c5fd" text-anchor="middle">GhostSlate Sports Network • 1080p60 Stream</text>

  <!-- Status Pill -->
  <rect x="460" y="470" width="360" height="50" rx="25" fill="#10b981" fill-opacity="0.2"/>
  <rect x="460" y="470" width="360" height="50" rx="25" fill="none" stroke="#10b981" stroke-width="2"/>
  <text x="640" y="502" font-family="-apple-system, system-ui, sans-serif" font-size="20" font-weight="bold" fill="#34d399" text-anchor="middle">● MAIN BROADCAST FEED ACTIVE</text>
</svg>
EOF

# 2. Slate Card (SSAI Slate Bleed)
cat << 'EOF' > "$TMP_DIR/slate.svg"
<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
  <defs>
    <linearGradient id="slateBg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#090d16"/>
      <stop offset="100%" stop-color="#1e1b4b"/>
    </linearGradient>
  </defs>
  <rect width="1280" height="720" fill="url(#slateBg)"/>
  
  <!-- Outer Card Frame -->
  <rect x="120" y="100" width="1040" height="520" rx="24" fill="#0f172a" fill-opacity="0.9"/>
  <rect x="120" y="100" width="1040" height="520" rx="24" fill="none" stroke="#6366f1" stroke-width="2" stroke-dasharray="6 6"/>

  <!-- Status Badge -->
  <rect x="440" y="150" width="400" height="44" rx="22" fill="#312e81" fill-opacity="0.8"/>
  <text x="640" y="178" font-family="-apple-system, system-ui, sans-serif" font-size="18" font-weight="bold" fill="#c7d2fe" text-anchor="middle">COMMERCIAL BREAK IN PROGRESS</text>

  <!-- Big Slate Text -->
  <text x="640" y="320" font-family="-apple-system, system-ui, sans-serif" font-size="56" font-weight="900" fill="#ffffff" text-anchor="middle">We'll be right back</text>
  <text x="640" y="380" font-family="-apple-system, system-ui, sans-serif" font-size="24" font-weight="400" fill="#94a3b8" text-anchor="middle">Coverage will resume shortly</text>

  <!-- Neutral Network Card Footer -->
  <rect x="400" y="470" width="480" height="46" rx="23" fill="#1e293b" fill-opacity="0.9"/>
  <text x="640" y="499" font-family="-apple-system, system-ui, sans-serif" font-size="16" font-weight="500" fill="#cbd5e1" text-anchor="middle">GhostSlate Network Feed • FAST-01</text>
</svg>
EOF

# 3. Monetized Ad Creative
cat << 'EOF' > "$TMP_DIR/ad.svg"
<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
  <defs>
    <linearGradient id="adBg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#14532d"/>
      <stop offset="50%" stop-color="#064e3b"/>
      <stop offset="100%" stop-color="#022c22"/>
    </linearGradient>
  </defs>
  <rect width="1280" height="720" fill="url(#adBg)"/>
  
  <!-- Ad Container -->
  <rect x="120" y="100" width="1040" height="520" rx="24" fill="#022c22" fill-opacity="0.85"/>
  <rect x="120" y="100" width="1040" height="520" rx="24" fill="none" stroke="#22c55e" stroke-width="2"/>

  <!-- Sponsor Badge -->
  <rect x="460" y="150" width="360" height="44" rx="22" fill="#14532d"/>
  <text x="640" y="180" font-family="-apple-system, system-ui, sans-serif" font-size="18" font-weight="bold" fill="#86efac" text-anchor="middle">VERIFIED COMMERCIAL SPONSOR</text>

  <!-- Ad Content -->
  <text x="640" y="310" font-family="-apple-system, system-ui, sans-serif" font-size="64" font-weight="900" fill="#fef08a" text-anchor="middle" letter-spacing="2">ACME AUTOMOTIVE</text>
  <text x="640" y="380" font-family="-apple-system, system-ui, sans-serif" font-size="28" font-weight="500" fill="#ffffff" text-anchor="middle">All-Electric SUV Lineup • Summer Upgrade Event</text>
  <text x="640" y="440" font-family="-apple-system, system-ui, sans-serif" font-size="22" font-weight="bold" fill="#4ade80" text-anchor="middle">0% APR Financing for 60 Months</text>

  <!-- Monetization Tag -->
  <text x="640" y="520" font-family="Courier, monospace" font-size="16" fill="#a7f3d0" text-anchor="middle">Rate Card: $24.00 CPM • Inventory ID: INV-ACME-2026</text>
</svg>
EOF

# 4. Black-screen fallback slate
cat << 'EOF' > "$TMP_DIR/black_screen.svg"
<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
  <rect width="1280" height="720" fill="#000000"/>
</svg>
EOF

echo "==> Rendering SVGs to PNG..."
rsvg-convert -w 1280 -h 720 -o "$TMP_DIR/content.png" "$TMP_DIR/content.svg"
rsvg-convert -w 1280 -h 720 -o "$TMP_DIR/slate.png" "$TMP_DIR/slate.svg"
rsvg-convert -w 1280 -h 720 -o "$TMP_DIR/ad.png" "$TMP_DIR/ad.svg"
rsvg-convert -w 1280 -h 720 -o "$TMP_DIR/black_screen.png" "$TMP_DIR/black_screen.svg"

echo "==> Encoding Video Segments with ffmpeg..."

# 1. Content (10s)
ffmpeg -y -loop 1 -i "$TMP_DIR/content.png" -f lavfi -i sine=frequency=440:duration=10 \
  -vf "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1" \
  -c:v libx264 -t 10 -pix_fmt yuv420p -r 30 -c:a aac -b:a 128k -shortest "$OUT_DIR/content.mp4"

# 2. Slate (15s)
ffmpeg -y -loop 1 -i "$TMP_DIR/slate.png" -f lavfi -i sine=frequency=220:duration=15 \
  -vf "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1" \
  -c:v libx264 -t 15 -pix_fmt yuv420p -r 30 -c:a aac -b:a 128k -shortest "$OUT_DIR/slate.mp4"

# 3. Ad (15s)
ffmpeg -y -loop 1 -i "$TMP_DIR/ad.png" -f lavfi -i sine=frequency=660:duration=15 \
  -vf "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1" \
  -c:v libx264 -t 15 -pix_fmt yuv420p -r 30 -c:a aac -b:a 128k -shortest "$OUT_DIR/ad.mp4"

# 4. Black-screen fallback (15s)
ffmpeg -y -loop 1 -i "$TMP_DIR/black_screen.png" -f lavfi -i anullsrc=channel_layout=stereo:sample_rate=44100 \
  -vf "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1" \
  -c:v libx264 -t 15 -pix_fmt yuv420p -r 30 -c:a aac -b:a 128k -shortest "$OUT_DIR/black_screen.mp4"

echo "==> Stitching Full Test Streams (35s each)..."
cat << EOF > "$TMP_DIR/concat_slate.txt"
file '$OUT_DIR/content.mp4'
file '$OUT_DIR/slate.mp4'
file '$OUT_DIR/content.mp4'
EOF
ffmpeg -y -f concat -safe 0 -i "$TMP_DIR/concat_slate.txt" -c copy "$OUT_DIR/test_stream_slate.mp4"

cat << EOF > "$TMP_DIR/concat_ad.txt"
file '$OUT_DIR/content.mp4'
file '$OUT_DIR/ad.mp4'
file '$OUT_DIR/content.mp4'
EOF
ffmpeg -y -f concat -safe 0 -i "$TMP_DIR/concat_ad.txt" -c copy "$OUT_DIR/test_stream_ad.mp4"

cat << EOF > "$TMP_DIR/concat_black_screen.txt"
file '$OUT_DIR/content.mp4'
file '$OUT_DIR/black_screen.mp4'
file '$OUT_DIR/content.mp4'
EOF
ffmpeg -y -f concat -safe 0 -i "$TMP_DIR/concat_black_screen.txt" -c copy "$OUT_DIR/test_stream_black_screen.mp4"

# Copy reference thumbnail frames for quick evaluation
cp "$TMP_DIR/content.png" "$OUT_DIR/content_frame.png"
cp "$TMP_DIR/slate.png" "$OUT_DIR/slate_frame.png"
cp "$TMP_DIR/ad.png" "$OUT_DIR/ad_frame.png"
cp "$TMP_DIR/black_screen.png" "$OUT_DIR/black_screen_frame.png"

echo "==> Video Generation Complete! Available in $OUT_DIR:"
ls -lh "$OUT_DIR"
