#!/usr/bin/env bash
# Build OCR — dev (cierrelmds) y QA (nexusqa): mismo script, distinto modo Nexus.
set -euo pipefail
ROOT="$(dirname "$0")/.."
cd "$ROOT/frontend"
unset PORT VITE_APP_BASE VITE_EMISSION_CONTINUE_BASE PRODUCT_BUILDER 2>/dev/null || true
export VITE_APP_BASE=/ocr/
export VITE_DEPLOY_PREFIX=/ocr
export VITE_FORMULARIO_CONTINUE_BASE=/formulario
# shellcheck source=/dev/null
source "$(dirname "$0")/build-env-nexus.sh"
echo "Build OCR VITE_APP_BASE=${VITE_APP_BASE} VITE_DEPLOY_PREFIX=${VITE_DEPLOY_PREFIX}"
npm run build
echo ""
echo "IMPORTANTE: antes de pm2 reload ejecutar:"
echo "  unset PORT VITE_APP_BASE VITE_EMISSION_CONTINUE_BASE DATABASE_URL"
