#!/usr/bin/env bash
# Build para srv001qa — nexusqa.exelixitech.com (NO cierrelmds).
# Usa proxy del módulo → nest-api local :3092.
set -euo pipefail
export VITE_NEXUS_USE_MODULE_PROXY=1
exec bash "$(dirname "$0")/build-cierrelmds.sh"
