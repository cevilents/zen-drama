#!/usr/bin/env bash
# Publishes the current app code everywhere in one go:
#   1. web  -> rebuild and deploy to Cloudflare (zendrama.web.id / zen-drama.zen-drama.workers.dev)
#   2. APK  -> OTA update on the "preview" channel; phones pick it up on the next app start
# Usage: deploy/publish-update.sh "pesan singkat tentang perubahan"
# Native changes (new native library, icon, app name, permissions) do not ship over OTA:
# the fingerprint runtime keeps old APKs on their current version, so build a new APK for those.
set -euo pipefail

MESSAGE="${1:-}"
if [ -z "$MESSAGE" ]; then
  echo "Pakai: $0 \"pesan perubahan\"" >&2
  exit 1
fi

APP="$(cd "$(dirname "${BASH_SOURCE[0]}")/../app" && pwd)"
cd "$APP"

echo "==> Cek kode"
npx tsc --noEmit
npx expo lint

echo "==> Web: build & unggah"
rm -rf dist
EXPO_NO_TELEMETRY=1 npx expo export --platform web
npx wrangler@4 deploy

echo "==> APK: kirim update OTA"
npx eas-cli@latest update --channel preview --platform android --environment preview --message "$MESSAGE" --non-interactive

echo "Selesai. Web sudah terbaru; HP akan dapat update saat aplikasi dibuka berikutnya."
