#!/usr/bin/env bash
# Deploy QA: proxy Nexus vía vite preview (srv001qa). Usa git, no parchea archivos a mano.
# Ejecutar EN EL SERVIDOR: bash scripts/deploy-qa-nexus-proxy.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> OCR nexus proxy QA en $ROOT"

if git diff --quiet frontend/vite-paths.ts frontend/vite.config.ts frontend/vite-nexus-preview-proxy.ts 2>/dev/null; then
  git pull origin main
else
  echo "WARN: cambios locales en vite — descartando para alinear con origin/main"
  git checkout -- \
    frontend/vite-paths.ts \
    frontend/vite.config.ts \
    frontend/vite-nexus-preview-proxy.ts \
    frontend/src/nexus/nexus-core.ts \
    scripts/build-env-nexus.sh \
    scripts/build-cierrelmds.sh 2>/dev/null || true
  git pull origin main
fi

git log -1 --oneline
test -f frontend/vite-nexus-preview-proxy.ts || {
  echo "ERROR: falta frontend/vite-nexus-preview-proxy.ts — git pull incompleto"
  exit 1
}

echo "==> Build QA"
VITE_NEXUS_USE_MODULE_PROXY=1 bash scripts/build-cierrelmds.sh

unset PORT VITE_APP_BASE VITE_EMISSION_CONTINUE_BASE DATABASE_URL
pm2 restart ocr-web
sleep 2

echo "==> Health"
curl -s -o /dev/null -w "ocr-web /ocr/ → HTTP %{http_code}\n" http://127.0.0.1:5181/ocr/ || true

echo "==> Test proxy Nexus"
if [ -z "${TOKEN:-}" ]; then
  if [ -f "$HOME/nexus-api/.env" ]; then
    # shellcheck disable=SC1091
    source "$HOME/nexus-api/.env"
    TOKEN=$(psql "${DATABASE_URL%%\?*}" -tA -c \
      "SELECT emsm_tenant_token FROM empresa_submodulo WHERE emsm_empresa_id=7 AND emsm_submodulo_id=37 AND emsm_estatus=true" 2>/dev/null || true)
  fi
fi

if [ -z "${TOKEN:-}" ]; then
  echo "Define TOKEN=... o asegura ~/nexus-api/.env y vuelve a ejecutar el curl manual."
else
  echo "--- :5181/nexus-api ---"
  curl -s -w "\nHTTP %{http_code}\n" "http://127.0.0.1:5181/nexus-api/api/access/verify" \
    -H "Authorization: Bearer $TOKEN"
  echo "--- Apache /ocr/nexus-api ---"
  curl -sk -w "\nHTTP %{http_code}\n" "https://nexusqa.exelixitech.com/ocr/nexus-api/api/access/verify" \
    -H "Authorization: Bearer $TOKEN"
fi

echo "OK deploy QA OCR nexus proxy"
