#!/usr/bin/env bash
# =============================================================
#  modulo-ocr/start-dev.sh — Desarrollo local
#
#  Uso:
#    chmod +x start-dev.sh
#    ./start-dev.sh             # backend (4001) + frontend (5181)
#    ./start-dev.sh --tunnel    # + Cloudflare HTTPS público
#    ./start-dev.sh --pm2       # via PM2 (persistente)
# =============================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WITH_TUNNEL=false
WITH_PM2=false

for arg in "$@"; do
  case $arg in
    --tunnel|-t) WITH_TUNNEL=true ;;
    --pm2)       WITH_PM2=true    ;;
  esac
done

# ── Colores ───────────────────────────────────────────────────
B='\033[1m'; C='\033[36m'; G='\033[32m'; Y='\033[33m'; R='\033[31m'; N='\033[0m'
banner() { echo -e "\n${C}══════════════════════════════${N}\n${B}  $1${N}\n${C}══════════════════════════════${N}"; }
ok()     { echo -e "${G}[OK]${N} $1"; }
info()   { echo -e "${C}[>>]${N} $1"; }
warn()   { echo -e "${Y}[!!]${N} $1"; }
die()    { echo -e "${R}[ERROR]${N} $1"; exit 1; }

banner "Módulo OCR · Exelixi"

# ── Verificaciones ────────────────────────────────────────────
command -v node >/dev/null 2>&1 || die "Node.js no instalado."
command -v npm  >/dev/null 2>&1 || die "npm no encontrado."

# ── .env del servidor ─────────────────────────────────────────
if [[ ! -f "$ROOT/server/.env" ]]; then
  if [[ -f "$ROOT/server/.env.example" ]]; then
    warn ".env no existe. Copiando desde .env.example..."
    cp "$ROOT/server/.env.example" "$ROOT/server/.env"
    warn "Edita server/.env con tu GEMINI_API_KEY antes de continuar."
  else
    die "No existe server/.env ni server/.env.example"
  fi
fi

# ── Dependencias ──────────────────────────────────────────────
if [[ ! -d "$ROOT/server/node_modules" ]]; then
  info "Instalando dependencias del servidor..."
  npm install --prefix "$ROOT/server" --silent
  ok "server/node_modules listos"
fi

if [[ ! -d "$ROOT/frontend/node_modules" ]]; then
  info "Instalando dependencias del frontend..."
  npm install --prefix "$ROOT/frontend" --silent
  ok "frontend/node_modules listos"
fi

mkdir -p "$ROOT/logs"

# ── Limpiar procesos anteriores ───────────────────────────────
info "Liberando puertos 4001 / 5181..."
fuser -k 4001/tcp 2>/dev/null || true
fuser -k 5181/tcp 2>/dev/null || true
pkill -f "nodemon src/index.js" 2>/dev/null || true
pkill -f "vite --host"          2>/dev/null || true
sleep 1

# ── Modo PM2 ──────────────────────────────────────────────────
if $WITH_PM2; then
  command -v pm2 >/dev/null 2>&1 || die "PM2 no instalado. Ejecuta: npm install -g pm2"
  banner "Iniciando con PM2"
  cd "$ROOT"
  pm2 start ecosystem.dev.config.js
  pm2 save
  echo ""
  ok "ocr-api  → http://localhost:4001"
  ok "ocr-api  → http://localhost:4001/docs  (Swagger)"
  ok "ocr-web  → http://localhost:5181"
  echo ""
  info "Logs:   pm2 logs ocr-api"
  info "Estado: pm2 status"
  exit 0
fi

# ── Modo directo (foreground) ─────────────────────────────────
banner "Iniciando servicios"

# Backend en background
info "Iniciando servidor OCR (puerto 4001)..."
cd "$ROOT/server"
nohup node_modules/.bin/nodemon src/index.js \
  > "$ROOT/logs/ocr-api.out.log" 2>&1 &
API_PID=$!

sleep 2

# Verificar que levantó
if ! kill -0 $API_PID 2>/dev/null; then
  die "El servidor no pudo iniciar. Revisa: $ROOT/logs/ocr-api.out.log"
fi
ok "Servidor OCR activo (PID $API_PID)"

# Tunnel (opcional)
CF_PID=""
if $WITH_TUNNEL; then
  command -v cloudflared >/dev/null 2>&1 || die "cloudflared no instalado."
  CF_LOG="$ROOT/logs/cloudflare.log"
  export VITE_HMR_TUNNEL=1
  cloudflared tunnel --url "http://localhost:5181" > "$CF_LOG" 2>&1 &
  CF_PID=$!
  info "Esperando URL de Cloudflare..."
  for i in $(seq 1 20); do
    CF_URL=$(grep -oP 'https://[a-z0-9\-]+\.trycloudflare\.com' "$CF_LOG" 2>/dev/null | head -1 || true)
    [[ -n "$CF_URL" ]] && break
    sleep 1
  done
  echo ""
  if [[ -n "${CF_URL:-}" ]]; then
    echo -e "${B}${G}  URL pública HTTPS: $CF_URL${N}"
  else
    warn "URL de Cloudflare aún no disponible. Ver: tail -f $CF_LOG"
  fi
fi

# Frontend en foreground (Ctrl+C detiene todo)
trap "kill $API_PID ${CF_PID:-} 2>/dev/null; echo -e '\n${Y}Servicios detenidos.${N}'; exit 0" INT TERM

echo ""
echo -e "  ${B}API:${N}     ${C}http://localhost:4001/api/health${N}"
echo -e "  ${B}Swagger:${N} ${C}http://localhost:4001/docs${N}"
echo -e "  ${B}Web:${N}     ${C}http://localhost:5181${N}"
echo ""
info "Ctrl+C para detener todo"
echo ""

cd "$ROOT/frontend"
node_modules/.bin/vite --host
