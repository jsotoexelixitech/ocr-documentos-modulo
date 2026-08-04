#!/usr/bin/env bash
# Build OCR frontend para cierrelmds (evita VITE_APP_BASE contaminado del shell).
set -euo pipefail
cd "$(dirname "$0")/../frontend"
unset PORT VITE_APP_BASE VITE_EMISSION_CONTINUE_BASE PRODUCT_BUILDER 2>/dev/null || true
export VITE_APP_BASE=./
export VITE_NEXUS_API_URL="${VITE_NEXUS_API_URL:-https://cierrelmds.exelixitech.com/nexus-api}"
export VITE_FORMULARIO_CONTINUE_BASE=/formulario
echo "Build OCR VITE_APP_BASE=${VITE_APP_BASE}"
npm run build
