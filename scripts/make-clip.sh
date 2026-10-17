#!/usr/bin/env bash
# Make a vertical (9:16) promo clip from a ZEN DRAMA episode, ready for TikTok/Reels/Shorts.
#
#   scripts/make-clip.sh <source> <id> <episode> <start_sec> <duration_sec> [out.mp4] ["Judul Drama"]
#
# Example:
#   scripts/make-clip.sh reelshort 6aa01736dec67ee5640992cf 1 5 25 promo-ep1.mp4 "Dewa Perang Berwajah Malaikat"
#
# Notes:
#  - Reads the current API server address from https://zendrama.web.id/server.json (the PC server
#    must be running for the stream to resolve).
#  - -extension_picky 0 is required: the API proxies HLS segments through a path with no extension.
set -euo pipefail

SOURCE=${1:?source required}
ID=${2:?id required}
EP=${3:?episode required}
START=${4:?start seconds required}
DUR=${5:?duration seconds required}
OUT=${6:-clip-${SOURCE}-ep${EP}.mp4}
TITLE=${7:-}

FONT="/System/Library/Fonts/Supplemental/Arial Bold.ttf"
SERVER="https://zendrama.web.id/server.json"

mkdir -p clips
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

TUNNEL=$(curl -sS --max-time 10 "$SERVER" | python3 -c "import sys,json;print(json.load(sys.stdin)['url'])")
STREAM=$(curl -sS --max-time 20 "$TUNNEL/api/episode?source=$SOURCE&id=$ID&ep=$EP" | python3 -c "
import sys,json
d=json.load(sys.stdin); u=d.get('url')
for q in (d.get('qualities') or []):
    if q.get('label')=='720p': u=q['url']
print(u)")

python3 - "$FONT" "$TITLE" "$TMP/overlay.png" <<'PY'
import sys
from PIL import Image, ImageDraw, ImageFont

font_path, title, out = sys.argv[1], sys.argv[2], sys.argv[3]
W, H = 1080, 1920
img = Image.new('RGBA', (W, H), (0, 0, 0, 0))
d = ImageDraw.Draw(img)

def wrap(text, f, maxw):
    words, lines, cur = text.split(), [], ''
    for w in words:
        t = (cur + ' ' + w).strip()
        if d.textlength(t, font=f) <= maxw:
            cur = t
        else:
            if cur:
                lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines

def block(text, f, cy, maxw=W - 160, padx=28, pady=14, gap=10, bg=(0, 0, 0, 150)):
    y = cy
    for ln in wrap(text, f, maxw):
        tw = d.textlength(ln, font=f)
        x = (W - tw) / 2
        d.rounded_rectangle([x - padx, y, x + tw + padx, y + f.size + pady * 2], radius=16, fill=bg)
        d.text((x, y + pady - 3), ln, font=f, fill=(255, 255, 255, 255))
        y += f.size + pady * 2 + gap

if title.strip():
    block(title, ImageFont.truetype(font_path, 58), 140)
block('Nonton full di ZEN DRAMA', ImageFont.truetype(font_path, 46), H - 300)
block('link di bio', ImageFont.truetype(font_path, 40), H - 205)
img.save(out)
PY

ffmpeg -y -loglevel error -extension_picky 0 -ss "$START" -i "$STREAM" -loop 1 -i "$TMP/overlay.png" -t "$DUR" \
  -filter_complex "[0:v]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=black[bg];[bg][1:v]overlay=0:0,format=yuv420p[v]" \
  -map "[v]" -map "0:a?" -c:v libx264 -preset veryfast -crf 22 -c:a aac -b:a 128k -movflags +faststart "clips/$OUT"

echo "OK -> clips/$OUT"
ffprobe -v error -select_streams v:0 -show_entries stream=width,height -show_entries format=duration -of default=noprint_wrappers=1 "clips/$OUT"
