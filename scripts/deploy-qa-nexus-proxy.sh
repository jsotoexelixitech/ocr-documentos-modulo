#!/usr/bin/env bash
# Aplicar fix proxy /ocr/nexus-api en srv001qa (121) sin depender de git push.
# Ejecutar EN EL SERVIDOR: bash scripts/deploy-qa-nexus-proxy.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> Parche OCR nexus proxy en $ROOT"

cat > frontend/vite-paths.ts << 'ENDOFFILE'
/** Utilidades compartidas: base path HTTPS (cierrelmds) en vite.config. */

/** Normaliza VITE_APP_BASE a formato Vite (`/`, `/ocr/` o `./`). */
export function resolveAppBase(env: Record<string, string>): string {
  const raw = env.VITE_APP_BASE?.trim() || '/';
  if (raw === './' || raw === '.') return './';
  if (raw === '/') return '/';
  return raw.endsWith('/') ? raw : `${raw}/`;
}

/** Rutas que vite preview debe proxyar al backend — no reescribir a index.html. */
export function isBackendProxyPath(pathname: string): boolean {
  return (
    /\/nexus-api(\/|$)/.test(pathname)
    || /\/api(\/|$)/.test(pathname)
    || /\/files(\/|$)/.test(pathname)
    || /\/docs(\/|$)/.test(pathname)
    || pathname.endsWith('/docs.json')
  );
}

/** Prefijo público Apache del módulo (`/ocr`, `/formulario`, …). */
export function resolvePublicModulePrefix(
  env: Record<string, string>,
  base: string,
): string {
  const deploy = env.VITE_DEPLOY_PREFIX?.trim();
  if (deploy) return deploy.replace(/\/$/, '');
  if (base !== '/' && base !== './') return base.replace(/\/$/, '');
  return '';
}

type ProxyRoutes = Record<
  string,
  { target: string; changeOrigin?: boolean; rewrite?: (path: string) => string }
>;

/** Proxy Nexus local vía vite preview: `{prefix}/nexus-api` → :3092. */
export function withNexusPreviewProxy(
  proxy: ProxyRoutes,
  modulePublicPrefix: string,
  nexusTarget = 'http://127.0.0.1:3092',
): ProxyRoutes {
  const prefix = modulePublicPrefix.replace(/\/$/, '');
  if (!prefix) return proxy;

  const mount = `${prefix}/nexus-api`;
  const escaped = mount.replace(/\//g, '\\/');

  return {
    ...proxy,
    [mount]: {
      target: nexusTarget,
      changeOrigin: true,
      rewrite: (p: string) => p.replace(new RegExp(`^${escaped}`), '') || '/',
    },
  };
}

/** Prefija rutas de proxy cuando la app se sirve bajo un subpath. */
export function prefixDevProxy(
  base: string,
  routes: Record<string, { target: string; changeOrigin?: boolean }>,
  deployPrefix?: string,
): Record<
  string,
  { target: string; changeOrigin?: boolean; rewrite?: (path: string) => string }
> {
  const root =
    base !== '/' && base !== './'
      ? base.replace(/\/$/, '')
      : deployPrefix?.replace(/\/$/, '') ?? '';

  if (!root) return routes;
  const out: Record<
    string,
    { target: string; changeOrigin?: boolean; rewrite?: (path: string) => string }
  > = {};

  for (const [path, cfg] of Object.entries(routes)) {
    out[`${root}${path}`] = {
      ...cfg,
      rewrite: (p: string) => p.slice(root.length) || '/',
    };
  }

  return out;
}
ENDOFFILE

cat > frontend/vite.config.ts << 'ENDOFFILE'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import {
  prefixDevProxy,
  resolveAppBase,
  resolvePublicModulePrefix,
  withNexusPreviewProxy,
} from './vite-paths'
import { spaPreviewFallback } from './vite-spa-preview'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const tunnel = env.VITE_HMR_TUNNEL === '1' || env.VITE_HMR_TUNNEL === 'true'
  const base = resolveAppBase(env)

  const modulePrefix = resolvePublicModulePrefix(env, base) || '/ocr';
  const nexusTarget = env.VITE_NEXUS_API_PROXY || 'http://127.0.0.1:3092';

  const proxy = withNexusPreviewProxy(
    prefixDevProxy(base, {
      '/api/documents': { target: 'http://localhost:4001', changeOrigin: true },
      '/api/valrep': { target: 'http://localhost:4002', changeOrigin: true },
      '/api/catalogo': { target: 'http://localhost:4002', changeOrigin: true },
      '/api': { target: 'http://localhost:4001', changeOrigin: true },
      '/files': { target: 'http://localhost:4001', changeOrigin: true },
      '/docs': { target: 'http://localhost:4001', changeOrigin: true },
      '/docs.json': { target: 'http://localhost:4001', changeOrigin: true },
    }, env.VITE_DEPLOY_PREFIX),
    modulePrefix,
    nexusTarget,
  )

  return {
    base,
    plugins: [react(), tailwindcss(), spaPreviewFallback(base)],
    server: {
      host: true,
      port: 5181,
      allowedHosts: true,
      hmr: tunnel ? { clientPort: 443, protocol: 'wss' } : true,
      proxy,
    },
    preview: {
      host: true,
      allowedHosts: true,
      proxy,
    },
  }
})
ENDOFFILE

mkdir -p frontend/src/nexus
cat > frontend/src/nexus/nexus-core.ts << 'ENDOFFILE'
/**
 * nexus-core.ts — NexusGuard core para modulo-ocr (Paso 1: Documentos)
 */

import { getNexusToken, persistNexusToken } from '../lib/nexus-token-client';

const STORAGE_KEY = 'nexus_access_token_ocr';

const INTERNAL_HTTP_RE = /^http:\/\/(192\.168\.|10\.|127\.0\.0\.1|localhost)(:\d+)?/i;

const MODULE_NEXUS_API: [string, string][] = [
  ['/ocr', '/ocr/nexus-api'],
  ['/formulario', '/formulario/nexus-api'],
  ['/emision', '/emision/nexus-api'],
  ['/pagos', '/pagos/nexus-api'],
];

function httpsModuleNexusApiBase(): string {
  const path = window.location.pathname.replace(/\/$/, '') || '/';
  for (const [prefix, apiPath] of MODULE_NEXUS_API) {
    if (path === prefix || path.startsWith(`${prefix}/`)) {
      return `${window.location.origin}${apiPath}`;
    }
  }
  return `${window.location.origin}/nexus-api`;
}

export function resolveNexusApiUrl(configured?: string): string {
  const trimmed = configured?.trim().replace(/\/$/, '');
  const pageIsHttps =
    typeof window !== 'undefined' && window.location.protocol === 'https:';

  if (trimmed && !INTERNAL_HTTP_RE.test(trimmed)) {
    return trimmed;
  }
  if (pageIsHttps && typeof window !== 'undefined') {
    return httpsModuleNexusApiBase();
  }
  if (trimmed) return trimmed;
  return 'http://localhost:3092';
}

export interface NexusVerifyResult {
  active: boolean;
  product?: 'rcv' | 'funerario';
  empresa?: { id: number; nombre: string; rif: string };
  submodulo?: {
    id: number;
    nombre: string;
    url: string | null;
    moduloNombre?: string | null;
    accessUrl: string | null;
  };
  reason?: string;
}

export async function verifyNexusAccess(nexusApiUrl: string): Promise<NexusVerifyResult> {
  const tokenFromUrl = new URLSearchParams(window.location.search).get('nexus_token');
  if (tokenFromUrl && !getNexusToken(STORAGE_KEY)) {
    persistNexusToken(STORAGE_KEY, tokenFromUrl);
  }

  const token = getNexusToken(STORAGE_KEY);

  if (!token) {
    return {
      active: false,
      reason: 'No se proporcionó token de acceso. Contacte a su administrador.',
    };
  }

  try {
    const res = await fetch(`${nexusApiUrl.replace(/\/$/, '')}/api/access/verify`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    const data = await res.json();

    if (data.active) {
      if (data.access_token) {
        persistNexusToken(STORAGE_KEY, data.access_token);
      }
      return {
        active: true,
        product: data.product,
        empresa: data.empresa,
        submodulo: data.submodulo,
      };
    }

    return { active: false, reason: data.reason ?? 'Servicio no disponible para esta empresa.' };
  } catch {
    return { active: false, reason: 'No se pudo conectar con el servidor de autorización.' };
  }
}
ENDOFFILE

cat > scripts/build-env-nexus.sh << 'ENDOFFILE'
#!/usr/bin/env bash
if [ "${VITE_NEXUS_USE_MODULE_PROXY:-}" = "1" ]; then
  export VITE_NEXUS_API_URL=
  echo "Nexus build: proxy del módulo → 127.0.0.1:3092"
elif [ -n "${VITE_NEXUS_API_URL:-}" ]; then
  echo "Nexus build: VITE_NEXUS_API_URL=${VITE_NEXUS_API_URL}"
else
  export VITE_NEXUS_API_URL="${NEXUS_PUBLIC_ORIGIN:-https://cierrelmds.exelixitech.com}/nexus-api"
  echo "Nexus build: VITE_NEXUS_API_URL=${VITE_NEXUS_API_URL}"
fi
ENDOFFILE
chmod +x scripts/build-env-nexus.sh

cat > scripts/build-cierrelmds.sh << 'ENDOFFILE'
#!/usr/bin/env bash
set -euo pipefail
ROOT="$(dirname "$0")/.."
cd "$ROOT/frontend"
unset PORT VITE_APP_BASE VITE_EMISSION_CONTINUE_BASE PRODUCT_BUILDER 2>/dev/null || true
export VITE_APP_BASE=/ocr/
export VITE_DEPLOY_PREFIX=/ocr
export VITE_FORMULARIO_CONTINUE_BASE=/formulario
source "$(dirname "$0")/build-env-nexus.sh"
echo "Build OCR VITE_APP_BASE=${VITE_APP_BASE} VITE_DEPLOY_PREFIX=${VITE_DEPLOY_PREFIX}"
npm run build
echo ""
echo "pm2 restart ocr-web"
ENDOFFILE
chmod +x scripts/build-cierrelmds.sh

echo "==> Build QA"
VITE_NEXUS_USE_MODULE_PROXY=1 bash scripts/build-cierrelmds.sh

unset PORT VITE_APP_BASE VITE_EMISSION_CONTINUE_BASE DATABASE_URL
pm2 restart ocr-web

echo "==> Test proxy"
TOKEN="${TOKEN:-}"
if [ -z "$TOKEN" ]; then
  echo "Define TOKEN=... y vuelve a ejecutar:"
  echo '  curl -sk "https://nexusqa.exelixitech.com/ocr/nexus-api/api/access/verify" -H "Authorization: Bearer $TOKEN"'
else
  curl -sk "https://nexusqa.exelixitech.com/ocr/nexus-api/api/access/verify" \
    -H "Authorization: Bearer $TOKEN"
  echo ""
fi
echo "OK deploy QA OCR nexus proxy"
