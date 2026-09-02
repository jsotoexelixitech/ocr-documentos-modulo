#!/usr/bin/env bash
# Deploy QA srv001qa — nexusqa.exelixitech.com (NO cierrelmds).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BRANCH="${BRANCH:-main}"
cd "$ROOT"

echo "==> OCR QA nexusqa en $ROOT rama=$BRANCH"
git fetch origin
git reset --hard "origin/$BRANCH"
test -f frontend/vite-nexus-preview-proxy.ts || { echo "ERROR: falta middleware nexus preview"; exit 1; }

echo "==> Build frontend (nexusqa proxy)"
bash scripts/build-nexusqa.sh

unset PORT VITE_APP_BASE VITE_EMISSION_CONTINUE_BASE DATABASE_URL
echo "==> PM2 ocr-web ocr-api"
pm2 restart ocr-web ocr-api

sleep 2
curl -s -o /dev/null -w "ocr-web / → HTTP %{http_code}\n" http://127.0.0.1:5181/ || true
echo "OK deploy QA OCR (nexusqa)"
