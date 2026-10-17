#!/usr/bin/env bash
# Tells the pointer where the ZEN DRAMA server is: ./update-pointer.sh https://xxxx.trycloudflare.com
# The key is read from ../.pointer-key (relative to this script).
set -euo pipefail

URL="${1:-}"
if [ -z "$URL" ]; then
  echo "Pakai: $0 https://alamat-server-publik" >&2
  exit 1
fi
case "$URL" in
  https://*) ;;
  *) echo "Alamat harus diawali https://" >&2; exit 1 ;;
esac
case "$URL" in
  *[\"\\\ ]*) echo "Alamat tidak boleh berisi spasi, tanda kutip, atau backslash" >&2; exit 1 ;;
esac

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
KEY_FILE="$HERE/../.pointer-key"
[ -f "$KEY_FILE" ] || { echo "Tidak ada $KEY_FILE" >&2; exit 1; }
KEY="$(tr -d '[:space:]' < "$KEY_FILE")"
[ -n "$KEY" ] || { echo "$KEY_FILE kosong" >&2; exit 1; }

POINTER="https://zen-drama.zen-drama.workers.dev/server.json"
BODY_FILE="$(mktemp)"
trap 'rm -f "$BODY_FILE"' EXIT

# The auth header goes in via stdin so the key never shows up in `ps`.
CODE="$(printf 'Authorization: Bearer %s' "$KEY" | curl -sS --max-time 20 -o "$BODY_FILE" -w '%{http_code}' \
  -X POST "$POINTER" -H @- -H 'Content-Type: application/json' \
  --data "{\"url\":\"$URL\"}")"

cat "$BODY_FILE"; echo
case "$CODE" in
  2??) echo "OK (HTTP $CODE): pointer sekarang menunjuk ke $URL" ;;
  *) echo "GAGAL (HTTP $CODE)" >&2; exit 1 ;;
esac
