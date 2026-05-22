#!/usr/bin/env bash
# =============================================================================
#  deploy-all.sh — Orquestador maestro Exelixi / La Mundial de Seguros
#
#  Localiza los 4 módulos del flujo RCV en el servidor, instala dependencias,
#  compila los frontends y los levanta con PM2.
#
#  Uso:
#    ./deploy-all.sh                 # instalación + build + start (producción)
#    ./deploy-all.sh --dev           # sin build, usa Vite dev + nodemon
#    ./deploy-all.sh --skip-install  # omite npm install (ya instalado)
#    ./deploy-all.sh --restart       # solo reinicia procesos PM2 (sin reinstalar)
#    ./deploy-all.sh --status        # muestra estado actual sin hacer nada
#    ./deploy-all.sh --stop          # detiene todos los procesos
#
#  Variables de entorno:
#    BASE_DIR=/ruta/padre   directorio que contiene las carpetas de los módulos
#                           (por defecto: directorio padre de este script)
# =============================================================================
set -euo pipefail

# ── Colores ──────────────────────────────────────────────────────────────────
RED='\033[0;31m';  GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m';  BOLD='\033[1m';  NC='\033[0m'

# ── Helpers ───────────────────────────────────────────────────────────────────
info()    { echo -e "${CYAN}[INFO]${NC}  $*"; }
ok()      { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error()   { echo -e "${RED}[ERROR]${NC} $*" >&2; }
section() { echo -e "\n${BOLD}${BLUE}══════════════════════════════════════════${NC}"; \
            echo -e "${BOLD}${BLUE}  $*${NC}"; \
            echo -e "${BOLD}${BLUE}══════════════════════════════════════════${NC}"; }
step()    { echo -e "\n${BOLD}▶ $*${NC}"; }

# ── Flags ─────────────────────────────────────────────────────────────────────
MODE="production"        # production | dev
SKIP_INSTALL=false
RESTART_ONLY=false
STATUS_ONLY=false
STOP_ONLY=false

for arg in "$@"; do
  case "$arg" in
    --dev)            MODE="dev" ;;
    --skip-install)   SKIP_INSTALL=true ;;
    --restart)        RESTART_ONLY=true ;;
    --status)         STATUS_ONLY=true ;;
    --stop)           STOP_ONLY=true ;;
    --help|-h)
      sed -n '/^#  Uso:/,/^# =/p' "$0" | sed 's/^#  /  /' | sed 's/^# $//'
      exit 0 ;;
    *) warn "Flag desconocido: $arg (usa --help para ver las opciones)" ;;
  esac
done

# ── Directorio base ───────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BASE_DIR="${BASE_DIR:-$(dirname "$SCRIPT_DIR")}"

# ── Definición de módulos ─────────────────────────────────────────────────────
#
#  Cada módulo tiene varios nombres posibles porque el repo puede estar clonado
#  con el nombre del repositorio GitHub o con el nombre local del monorepo.
#
#    DIRS_xxx       nombres posibles de carpeta (en orden de preferencia)
#    PM2_API_xxx    nombre del proceso PM2 del backend
#    PM2_WEB_xxx    nombre del proceso PM2 del frontend
#    PORT_API_xxx   puerto del backend (para health-check)
#    PORT_WEB_xxx   puerto del frontend (para health-check)
#
declare -A MODULE_PATH   # se rellena al resolver las rutas

DIRS_OCR=(       "modulo-ocr"        "ocr-documentos-modulo"  )
DIRS_FORMULARIO=("modulo-formulario" "Formulario-modulo"       )
DIRS_EMISION=(   "modulo-emision"    "Emision-Plan-modulo"     )
DIRS_PAGOS=(     "modulo-pagos"      "Pagos-Poliza-modulo"     )

PM2_API_OCR="ocr-api";          PM2_WEB_OCR="ocr-web"
PM2_API_FORMULARIO="form-api";  PM2_WEB_FORMULARIO="form-web"
PM2_API_EMISION="emision-api";  PM2_WEB_EMISION="emision-web"
PM2_API_PAGOS="pagos-api";      PM2_WEB_PAGOS="pagos-web"

PORT_API_OCR=4001;       PORT_WEB_OCR=5181
PORT_API_FORMULARIO=4002; PORT_WEB_FORMULARIO=5182
PORT_API_EMISION=4004;   PORT_WEB_EMISION=5183
PORT_API_PAGOS=4003;     PORT_WEB_PAGOS=5184

MODULES=("OCR" "FORMULARIO" "EMISION" "PAGOS")

# ── Función: resolver ruta de un módulo ───────────────────────────────────────
resolve_module() {
  local key="$1"
  local -n dirs="DIRS_${key}"
  for name in "${dirs[@]}"; do
    if [[ -d "$BASE_DIR/$name" ]]; then
      MODULE_PATH[$key]="$BASE_DIR/$name"
      return 0
    fi
  done
  MODULE_PATH[$key]=""
  return 1
}

# ── Función: verificar prerequisitos ─────────────────────────────────────────
check_prerequisites() {
  step "Verificando prerequisitos"

  if ! command -v node &>/dev/null; then
    error "Node.js no está instalado. Instala Node.js 20+ y vuelve a intentarlo."
    exit 1
  fi
  local node_ver
  node_ver=$(node --version | sed 's/v//' | cut -d. -f1)
  if (( node_ver < 18 )); then
    warn "Node.js $node_ver detectado — se recomienda 20+."
  fi
  ok "Node.js $(node --version)"

  if ! command -v npm &>/dev/null; then
    error "npm no está instalado."
    exit 1
  fi
  ok "npm $(npm --version)"

  if ! command -v pm2 &>/dev/null; then
    warn "PM2 no está instalado. Instalando globalmente..."
    npm install -g pm2
    ok "PM2 instalado: $(pm2 --version)"
  else
    ok "PM2 $(pm2 --version)"
  fi
}

# ── Función: instalar dependencias ────────────────────────────────────────────
install_module() {
  local name="$1"
  local path="$2"

  step "[$name] Instalando dependencias"

  if [[ ! -f "$path/server/package.json" ]]; then
    warn "[$name] No se encontró server/package.json — omitiendo server install."
  else
    info "[$name] npm install --prefix server"
    npm install --prefix "$path/server" --no-audit --no-fund --loglevel=error \
      && ok "[$name] server — listo" \
      || { error "[$name] Falló npm install en server"; return 1; }
  fi

  if [[ ! -f "$path/frontend/package.json" ]]; then
    warn "[$name] No se encontró frontend/package.json — omitiendo frontend install."
  else
    info "[$name] npm install --prefix frontend"
    npm install --prefix "$path/frontend" --no-audit --no-fund --loglevel=error \
      && ok "[$name] frontend — listo" \
      || { error "[$name] Falló npm install en frontend"; return 1; }
  fi
}

# ── Función: compilar frontend ────────────────────────────────────────────────
build_module() {
  local name="$1"
  local path="$2"

  if [[ ! -f "$path/frontend/package.json" ]]; then
    warn "[$name] Sin frontend/package.json — omitiendo build."
    return 0
  fi

  step "[$name] Compilando frontend (Vite build)"
  npm run build --prefix "$path/frontend" --loglevel=error \
    && ok "[$name] Build completado → $path/frontend/dist/" \
    || { error "[$name] Falló el build del frontend"; return 1; }
}

# ── Función: crear directorio de logs ─────────────────────────────────────────
ensure_logs() {
  local path="$1"
  mkdir -p "$path/logs"
}

# ── Función: verificar .env ───────────────────────────────────────────────────
check_env() {
  local name="$1"
  local path="$2"
  if [[ ! -f "$path/server/.env" ]]; then
    warn "[$name] No existe server/.env"
    if [[ -f "$path/server/.env.example" ]]; then
      warn "[$name] Copia la plantilla y completa las variables:"
      warn "         cp $path/server/.env.example $path/server/.env"
    fi
    return 1
  fi
  ok "[$name] server/.env encontrado"
  return 0
}

# ── Función: levantar con PM2 ─────────────────────────────────────────────────
start_module() {
  local name="$1"
  local path="$2"
  local api_proc="$3"
  local web_proc="$4"
  local ecosystem="ecosystem.config.js"

  if [[ "$MODE" == "dev" ]]; then
    ecosystem="ecosystem.dev.config.js"
  fi

  if [[ ! -f "$path/$ecosystem" ]]; then
    error "[$name] No se encontró $ecosystem en $path"
    return 1
  fi

  step "[$name] Iniciando procesos PM2 ($MODE)"

  # Si ya existe el proceso, lo recarga; si no, lo registra
  for proc in "$api_proc" "$web_proc"; do
    if pm2 describe "$proc" &>/dev/null; then
      info "[$name] '$proc' ya está registrado → recargando"
      if [[ "$MODE" == "dev" ]]; then
        pm2 restart "$proc" --update-env
      else
        pm2 reload "$proc" --update-env
      fi
    fi
  done

  if [[ "$MODE" == "dev" ]]; then
    pm2 start "$path/$ecosystem" 2>/dev/null || true
  else
    pm2 start "$path/$ecosystem" --env production 2>/dev/null || true
  fi

  ok "[$name] $api_proc + $web_proc — iniciados"
}

# ── Función: reiniciar procesos PM2 ───────────────────────────────────────────
restart_module() {
  local name="$1"
  local api_proc="$2"
  local web_proc="$3"

  step "[$name] Reiniciando procesos PM2"
  for proc in "$api_proc" "$web_proc"; do
    if pm2 describe "$proc" &>/dev/null; then
      pm2 restart "$proc" --update-env && ok "[$name] '$proc' reiniciado"
    else
      warn "[$name] '$proc' no está registrado en PM2 — usa sin --restart para el primer despliegue"
    fi
  done
}

# ── Función: detener procesos PM2 ─────────────────────────────────────────────
stop_module() {
  local name="$1"
  local api_proc="$2"
  local web_proc="$3"

  step "[$name] Deteniendo procesos"
  for proc in "$api_proc" "$web_proc"; do
    if pm2 describe "$proc" &>/dev/null; then
      pm2 stop "$proc" && ok "[$name] '$proc' detenido"
    else
      info "[$name] '$proc' no estaba corriendo"
    fi
  done
}

# ── Función: health-check ─────────────────────────────────────────────────────
health_check() {
  local name="$1"
  local api_port="$2"

  sleep 1
  if curl -sf "http://localhost:$api_port/api/health" &>/dev/null; then
    ok "[$name] Health OK → http://localhost:$api_port/api/health"
  else
    warn "[$name] Health check falló en :$api_port (puede estar arrancando aún)"
  fi
}

# ── Tabla de resumen final ────────────────────────────────────────────────────
print_summary() {
  section "RESUMEN DEL DESPLIEGUE"
  echo ""
  printf "  %-20s %-30s %-12s %-12s\n" "MÓDULO" "RUTA" "API PORT" "WEB PORT"
  printf "  %-20s %-30s %-12s %-12s\n" "──────" "────" "────────" "────────"

  for key in "${MODULES[@]}"; do
    local path="${MODULE_PATH[$key]:-}"
    local api_port="PORT_API_${key}"; api_port="${!api_port}"
    local web_port="PORT_WEB_${key}"; web_port="${!web_port}"
    if [[ -n "$path" ]]; then
      printf "  ${GREEN}%-20s${NC} %-30s ${CYAN}%-12s${NC} ${CYAN}%-12s${NC}\n" \
        "$key" "$(basename "$path")" ":$api_port" ":$web_port"
    else
      printf "  ${RED}%-20s${NC} %-30s %-12s %-12s\n" \
        "$key" "NO ENCONTRADO" "-" "-"
    fi
  done

  echo ""
  info "Swagger UI disponible en:"
  for key in "${MODULES[@]}"; do
    local path="${MODULE_PATH[$key]:-}"
    local api_port="PORT_API_${key}"; api_port="${!api_port}"
    [[ -n "$path" ]] && echo -e "  ${CYAN}http://localhost:$api_port/docs${NC}  [$key]"
  done

  echo ""
  info "Comandos útiles:"
  echo -e "  ${BOLD}pm2 list${NC}               — estado de todos los procesos"
  echo -e "  ${BOLD}pm2 logs --lines 50${NC}    — logs recientes"
  echo -e "  ${BOLD}pm2 monit${NC}              — monitor en tiempo real"
  echo -e "  ${BOLD}./deploy-all.sh --restart${NC} — reiniciar sin reinstalar"
  echo -e "  ${BOLD}./deploy-all.sh --status${NC}  — ver estado actual"
  echo ""
}

# ═════════════════════════════════════════════════════════════════════════════
#  MAIN
# ═════════════════════════════════════════════════════════════════════════════

section "Exelixi — Orquestador de Módulos RCV"
echo -e "  ${BOLD}Base:${NC} $BASE_DIR"
echo -e "  ${BOLD}Modo:${NC} $MODE"
echo ""

# ── 1. Resolver rutas de todos los módulos ────────────────────────────────────
step "Buscando módulos en $BASE_DIR"
FOUND=0
MISSING=0

for key in "${MODULES[@]}"; do
  if resolve_module "$key"; then
    ok "$key → ${MODULE_PATH[$key]}"
    (( FOUND++ )) || true
  else
    warn "$key → NO encontrado bajo $BASE_DIR"
    local_dirs_var="DIRS_${key}[@]"
    warn "  Nombres buscados: ${!local_dirs_var}"
    (( MISSING++ )) || true
  fi
done

echo ""
info "$FOUND módulo(s) encontrados · $MISSING no encontrados"

if [[ $FOUND -eq 0 ]]; then
  error "No se encontró ningún módulo. Asegúrate de que los repos estén clonados en:"
  error "  $BASE_DIR/"
  exit 1
fi

# ── 2. --status: solo mostrar estado PM2 ────────────────────────────────────
if [[ "$STATUS_ONLY" == true ]]; then
  section "Estado actual (PM2)"
  pm2 list
  print_summary
  exit 0
fi

# ── 3. --stop: detener todos ──────────────────────────────────────────────────
if [[ "$STOP_ONLY" == true ]]; then
  section "Deteniendo todos los módulos"
  [[ -n "${MODULE_PATH[OCR]:-}"        ]] && stop_module "OCR"        "$PM2_API_OCR"        "$PM2_WEB_OCR"
  [[ -n "${MODULE_PATH[FORMULARIO]:-}" ]] && stop_module "FORMULARIO" "$PM2_API_FORMULARIO" "$PM2_WEB_FORMULARIO"
  [[ -n "${MODULE_PATH[EMISION]:-}"    ]] && stop_module "EMISION"    "$PM2_API_EMISION"    "$PM2_WEB_EMISION"
  [[ -n "${MODULE_PATH[PAGOS]:-}"      ]] && stop_module "PAGOS"      "$PM2_API_PAGOS"      "$PM2_WEB_PAGOS"
  pm2 save
  ok "Estado PM2 guardado"
  exit 0
fi

# ── 4. --restart: solo reiniciar ─────────────────────────────────────────────
if [[ "$RESTART_ONLY" == true ]]; then
  section "Reiniciando módulos"
  [[ -n "${MODULE_PATH[OCR]:-}"        ]] && restart_module "OCR"        "$PM2_API_OCR"        "$PM2_WEB_OCR"
  [[ -n "${MODULE_PATH[FORMULARIO]:-}" ]] && restart_module "FORMULARIO" "$PM2_API_FORMULARIO" "$PM2_WEB_FORMULARIO"
  [[ -n "${MODULE_PATH[EMISION]:-}"    ]] && restart_module "EMISION"    "$PM2_API_EMISION"    "$PM2_WEB_EMISION"
  [[ -n "${MODULE_PATH[PAGOS]:-}"      ]] && restart_module "PAGOS"      "$PM2_API_PAGOS"      "$PM2_WEB_PAGOS"
  pm2 save
  section "Estado final"
  pm2 list
  exit 0
fi

# ── 5. Prerequisitos ──────────────────────────────────────────────────────────
check_prerequisites

# ── 6. Verificar .env (advertir pero no abortar) ──────────────────────────────
section "Verificando archivos .env"
ENV_WARNINGS=0
for key in "${MODULES[@]}"; do
  [[ -n "${MODULE_PATH[$key]:-}" ]] && \
    check_env "$key" "${MODULE_PATH[$key]}" || (( ENV_WARNINGS++ )) || true
done
if (( ENV_WARNINGS > 0 )); then
  warn "$ENV_WARNINGS módulo(s) sin .env — pueden fallar al arrancar"
  echo -e "  Presiona ${BOLD}Ctrl+C${NC} para abortar y configurar los .env, o espera 5 segundos para continuar..."
  sleep 5
fi

# ── 7. Instalar dependencias ──────────────────────────────────────────────────
if [[ "$SKIP_INSTALL" == false ]]; then
  section "Instalando dependencias"
  for key in "${MODULES[@]}"; do
    [[ -n "${MODULE_PATH[$key]:-}" ]] && install_module "$key" "${MODULE_PATH[$key]}"
  done
fi

# ── 8. Compilar frontends (solo en producción) ────────────────────────────────
if [[ "$MODE" == "production" ]]; then
  section "Compilando frontends"
  for key in "${MODULES[@]}"; do
    [[ -n "${MODULE_PATH[$key]:-}" ]] && build_module "$key" "${MODULE_PATH[$key]}"
  done
fi

# ── 9. Crear carpetas de logs ─────────────────────────────────────────────────
section "Preparando directorios de logs"
for key in "${MODULES[@]}"; do
  if [[ -n "${MODULE_PATH[$key]:-}" ]]; then
    ensure_logs "${MODULE_PATH[$key]}"
    ok "[$key] logs/ listo"
  fi
done

# ── 10. Levantar con PM2 ──────────────────────────────────────────────────────
section "Levantando módulos con PM2"
[[ -n "${MODULE_PATH[OCR]:-}"        ]] && start_module "OCR"        "${MODULE_PATH[OCR]}"        "$PM2_API_OCR"        "$PM2_WEB_OCR"
[[ -n "${MODULE_PATH[FORMULARIO]:-}" ]] && start_module "FORMULARIO" "${MODULE_PATH[FORMULARIO]}" "$PM2_API_FORMULARIO" "$PM2_WEB_FORMULARIO"
[[ -n "${MODULE_PATH[EMISION]:-}"    ]] && start_module "EMISION"    "${MODULE_PATH[EMISION]}"    "$PM2_API_EMISION"    "$PM2_WEB_EMISION"
[[ -n "${MODULE_PATH[PAGOS]:-}"      ]] && start_module "PAGOS"      "${MODULE_PATH[PAGOS]}"      "$PM2_API_PAGOS"      "$PM2_WEB_PAGOS"

# ── 11. Guardar estado PM2 ────────────────────────────────────────────────────
section "Guardando estado PM2"
pm2 save
ok "pm2 save — los procesos sobrevivirán al reboot (si pm2 startup está activo)"

# ── 12. Health-checks ──────────────────────────────────────────────────────────
section "Health checks"
sleep 2
[[ -n "${MODULE_PATH[OCR]:-}"        ]] && health_check "OCR"        $PORT_API_OCR
[[ -n "${MODULE_PATH[FORMULARIO]:-}" ]] && health_check "FORMULARIO" $PORT_API_FORMULARIO
[[ -n "${MODULE_PATH[EMISION]:-}"    ]] && health_check "EMISION"    $PORT_API_EMISION
[[ -n "${MODULE_PATH[PAGOS]:-}"      ]] && health_check "PAGOS"      $PORT_API_PAGOS

# ── 13. Estado final ──────────────────────────────────────────────────────────
section "Estado final de PM2"
pm2 list

print_summary

echo -e "${GREEN}${BOLD}✔ Despliegue completado${NC}"
echo ""
