#!/usr/bin/env bash
# Multi-episode promo clip: plays full episodes <from>..<to> back-to-back (≈2-4 min) so the story
# builds and ends on an episode boundary — the built-in cliffhanger that pushes viewers to the site.
#
#   scripts/make-clip-episodes.sh <source> <id> <from_ep> <to_ep> [out.mp4] ["Judul Drama"]
#
# Example (2-4 min from 2-3 episodes):
#   scripts/make-clip-episodes.sh reelshort 6aa01736dec67ee5640992cf 1 2 promo-1-2.mp4 "Dewa Perang Berwajah Malaikat"
#
# Notes:
#  - Reads the API address from https://zendrama.web.id/server.json (the PC server must be running).
#  - -extension_picky 0 is required: the API proxies HLS segments through a path with no extension.
#  - Titles are drawn with PIL into a transparent PNG, then overlaid (this ffmpeg has no drawtext).
set -euo pipefail

SOURCE=${1:?source required}
ID=${2:?id required}
FROM=${3:?from episode required}
TO=${4:?to episode required}
OUT=${5:-clip-${SOURCE}-ep${FROM}-${TO}.mp4}
TITLE=${6:-}

FONT="/System/Library/Fonts/Supplemental/Arial Bold.ttf"
SERVER="https://zendrama.web.id/server.json"

mkdir -p clips
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

TUNNEL=$(curl -sS --max-time 10 "$SERVER" | python3 -c "import sys,json;print(json.load(sys.stdin)['url'])")

inputs=()
filter=""
n=0
for ep in $(seq "$FROM" "$TO"); do
  url=$(curl -sS --max-time 20 "$TUNNEL/api/episode?source=$SOURCE&id=$ID&ep=$ep" | python3 -c "
import sys,json
d=json.load(sys.stdin); u=d.get('url')
for q in (d.get('qualities') or []):
    if q.get('label')=='720p': u=q['url']
print(u)")
  if [ -z "$url" ]; then
    echo "ep $ep: no playable stream" >&2
    exit 1
  fi
  inputs+=(-extension_picky 0 -i "$url")
  filter+="[$n:v]scale=720:1280:force_original_aspect_ratio=decrease,pad=720:1280:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,fps=30[v$n];[$n:a]aresample=async=1:first_pts=0[a$n];"
  n=$((n + 1))
done

python3 - "$FONT" "$TITLE" "$TMP/overlay.png" <<'PY'
import sys
from PIL import Image, ImageDraw, ImageFont

font_path, title, out = sys.argv[1], sys.argv[2], sys.argv[3]
W, H = 720, 1280
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

def block(text, f, cy, maxw=W - 110, padx=18, pady=10, gap=8, bg=(0, 0, 0, 150)):
    y = cy
    for ln in wrap(text, f, maxw):
        tw = d.textlength(ln, font=f)
        x = (W - tw) / 2
        d.rounded_rectangle([x - padx, y, x + tw + padx, y + f.size + pady * 2], radius=12, fill=bg)
        d.text((x, y + pady - 2), ln, font=f, fill=(255, 255, 255, 255))
        y += f.size + pady * 2 + gap

if title.strip():
    block(title, ImageFont.truetype(font_path, 40), 96)
block('Nonton full di ZEN DRAMA', ImageFont.truetype(font_path, 30), H - 200)
block('link di bio', ImageFont.truetype(font_path, 26), H - 138)
img.save(out)
PY

pairs=""
for i in $(seq 0 $((n - 1))); do pairs+="[v$i][a$i]"; done
filter+="${pairs}concat=n=$n:v=1:a=1[cat][cata];[cat][$n:v]overlay=0:0,format=yuv420p[v]"

ffmpeg -y -loglevel error "${inputs[@]}" -loop 1 -i "$TMP/overlay.png" \
  -filter_complex "$filter" -map "[v]" -map "[cata]" -t 240 \
  -c:v libx264 -preset veryfast -crf 25 -c:a aac -b:a 128k -movflags +faststart "clips/$OUT"

echo "OK -> clips/$OUT"
ffprobe -v error -select_streams v:0 -show_entries stream=width,height -show_entries format=duration -of default=noprint_wrappers=1 "clips/$OUT"
