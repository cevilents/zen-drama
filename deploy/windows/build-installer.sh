#!/usr/bin/env bash
# Builds deploy/ZEN-DRAMA-SERVER.bat: the single file the user double-clicks on the Windows PC.
# It is installer-header.bat followed by a marker line and the package zip (*.ps1, PANDUAN.txt,
# pointer-key.txt, server/) as base64; the header extracts it to %TEMP% and runs setup.ps1.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"   # deploy/windows
DEPLOY="$(cd "$HERE/.." && pwd)"                       # deploy
SERVER_SRC="$(cd "$DEPLOY/../server" && pwd)"
KEY_FILE="$DEPLOY/.pointer-key"
OUT="$DEPLOY/ZEN-DRAMA-SERVER.bat"
HEADER="$HERE/installer-header.bat"
SCRIPTS=(setup.ps1 run-server.ps1 run-tunnel.ps1 status.ps1 restart.ps1 stop.ps1 start.ps1 set-tunnel-token.ps1 uninstall.ps1)

[ -f "$KEY_FILE" ] || { echo "Tidak ada $KEY_FILE" >&2; exit 1; }
KEY="$(tr -d '[:space:]' < "$KEY_FILE")"
[ -n "$KEY" ] || { echo "$KEY_FILE kosong" >&2; exit 1; }

STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

# Windows text files get CRLF endings (Notepad-friendly); stripping first makes this idempotent.
to_crlf() { awk '{ sub(/\r$/, ""); printf "%s\r\n", $0 }' "$1" > "$2"; }

for f in "${SCRIPTS[@]}" PANDUAN.txt installer-header.bat; do
  [ -f "$HERE/$f" ] || { echo "File hilang: $HERE/$f" >&2; exit 1; }
  # .ps1 are read by Windows PowerShell 5.1 as ANSI, so they (and the guide) must be pure ASCII.
  if [ "$(LC_ALL=C tr -d '\000-\177' < "$HERE/$f" | wc -c | tr -d ' ')" != "0" ]; then
    echo "Karakter non-ASCII di $f (baris pertama yang kena):" >&2
    LC_ALL=C awk '/[\200-\377]/ { print NR ": " $0; exit }' "$HERE/$f" >&2
    exit 1
  fi
  to_crlf "$HERE/$f" "$STAGE/$f"
done

printf '%s\r\n' "$KEY" > "$STAGE/pointer-key.txt"

mkdir "$STAGE/server"
rsync -a --exclude='.omc' --exclude='.DS_Store' --exclude='node_modules' --exclude='*.log' \
  "$SERVER_SRC/" "$STAGE/server/"

PKG="$(mktemp -d)/paket.zip"
mv "$STAGE/installer-header.bat" "$PKG.header"
( cd "$STAGE" && COPYFILE_DISABLE=1 zip -r -X -q "$PKG" . -x '*.DS_Store' -x '__MACOSX*' )
unzip -l "$PKG"

# cmd.exe needs CRLF; the header exits before the payload, so cmd never parses the base64 lines.
{
  cat "$PKG.header"
  printf '__ZENPAYLOAD__\r\n'
  base64 < "$PKG" | tr -d '\n' | fold -w 76 | awk '{ printf "%s\r\n", $0 }'
} > "$OUT"
rm -rf "$(dirname "$PKG")"
rm -f "$DEPLOY/zen-drama-server-windows.zip"   # older zip-based package

echo "Dibuat: $OUT ($(wc -c < "$OUT" | tr -d ' ') byte)"
