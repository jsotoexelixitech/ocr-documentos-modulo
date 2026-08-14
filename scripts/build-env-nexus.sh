#!/usr/bin/env bash
# Nexus API URL en build — 120 dev (cierrelmds) · 121 QA (nexusqa)
#
# Modo A (default 120): bash scripts/build-cierrelmds.sh
# Modo B (121 QA):      VITE_NEXUS_USE_MODULE_PROXY=1 bash scripts/build-cierrelmds.sh

if [ "${VITE_NEXUS_USE_MODULE_PROXY:-}" = "1" ]; then
  export VITE_NEXUS_API_URL=
  export VITE_NEXUS_USE_MODULE_PROXY=1
  echo "Nexus build: proxy del módulo → 127.0.0.1:3092 (VITE_NEXUS_USE_MODULE_PROXY=1)"
elif [ -n "${VITE_NEXUS_API_URL:-}" ]; then
  echo "Nexus build: VITE_NEXUS_API_URL=${VITE_NEXUS_API_URL}"
else
  export VITE_NEXUS_API_URL="${NEXUS_PUBLIC_ORIGIN:-https://cierrelmds.exelixitech.com}/nexus-api"
  echo "Nexus build: VITE_NEXUS_API_URL=${VITE_NEXUS_API_URL}"
fi
