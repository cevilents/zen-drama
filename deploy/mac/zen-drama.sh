#!/usr/bin/env bash
# Runs the ZEN DRAMA server on this Mac and makes it reachable from the app and the web.
#   Start: ~/Desktop/dracin/deploy/mac/zen-drama.sh
#   Stop:  Ctrl-C in the same window (or close the window)
# Starts the API server + a Cloudflare Quick Tunnel, sends the new tunnel address to the pointer
# (the app and web look it up there), and keeps the Mac awake while running.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER_DIR="$(cd "$HERE/../../server" && pwd)"
PORT=3030
LOG_DIR="$(mktemp -d -t zendrama)"
TUNNEL_LOG="$LOG_DIR/tunnel.log"

command -v node >/dev/null || { echo "Node.js belum terpasang." >&2; exit 1; }
command -v cloudflared >/dev/null || { echo "cloudflared belum terpasang: brew install cloudflared" >&2; exit 1; }
if lsof -nP -iTCP:$PORT -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Port $PORT sudah dipakai: server ZEN DRAMA mungkin sudah jalan di jendela lain. Matikan dulu (Ctrl-C di sana)." >&2
  exit 1
fi

PIDS=()
cleanup() {
  trap - INT TERM EXIT
  echo
  echo "Mematikan server ZEN DRAMA..."
  for pid in "${PIDS[@]}"; do kill "$pid" 2>/dev/null || true; done
  wait 2>/dev/null || true
  rm -rf "$LOG_DIR"
  echo "Server mati. Aplikasi & web tidak bisa memuat drama sampai server dinyalakan lagi."
}
trap cleanup INT TERM EXIT

# caffeinate -w keeps the Mac awake exactly as long as this script runs.
caffeinate -is -w $$ &
PIDS+=($!)

# A fixed signing secret keeps video links the app already holds valid across restarts.
SECRET_FILE="$HERE/../.proxy-secret"
if [ ! -s "$SECRET_FILE" ]; then
  ( umask 077 && openssl rand -hex 32 > "$SECRET_FILE" )
fi
PROXY_SECRET="$(tr -d '[:space:]' < "$SECRET_FILE")"
export PROXY_SECRET

echo "==> Menyalakan server (port $PORT)"
( cd "$SERVER_DIR" && exec node index.mjs ) &
PIDS+=($!)

for _ in $(seq 1 30); do
  curl -fs "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1 && break
  sleep 1
done
curl -fs "http://127.0.0.1:$PORT/api/health" >/dev/null || { echo "Server gagal menyala." >&2; exit 1; }

echo "==> Membuka tunnel ke internet"
cloudflared tunnel --no-autoupdate --url "http://127.0.0.1:$PORT" > "$TUNNEL_LOG" 2>&1 &
PIDS+=($!)

URL=""
for _ in $(seq 1 60); do
  URL="$(grep -Eo 'https://[a-z0-9-]+\.trycloudflare\.com' "$TUNNEL_LOG" | grep -v '//api\.' | head -1 || true)"
  [ -n "$URL" ] && break
  sleep 1
done
[ -n "$URL" ] || { echo "Tunnel gagal dibuat. Isi log:" >&2; cat "$TUNNEL_LOG" >&2; exit 1; }

# A fresh quick tunnel needs a few seconds (sometimes a minute) before it answers from the internet.
echo "==> Menunggu tunnel siap: $URL"
for _ in $(seq 1 30); do
  curl -fs --max-time 5 "$URL/api/health" >/dev/null 2>&1 && break
  sleep 2
done

echo "==> Mengirim alamat ke aplikasi"
"$HERE/update-pointer.sh" "$URL" || echo "Gagal mengirim alamat; aplikasi masih memakai alamat lama." >&2

echo
echo "============================================================"
echo "  Server ZEN DRAMA AKTIF: $URL"
echo "  Aplikasi & web otomatis tersambung (tunggu +-1 menit)."
echo "  Biarkan jendela ini terbuka. Tekan Ctrl-C untuk mematikan."
echo "============================================================"

# Exit (and clean up) as soon as the server or the tunnel dies.
while kill -0 "${PIDS[1]}" 2>/dev/null && kill -0 "${PIDS[2]}" 2>/dev/null; do sleep 5; done
echo "Server atau tunnel berhenti sendiri." >&2
exit 1
