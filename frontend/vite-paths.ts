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
  { target: string; changeOrigin?: boolean; rewrite?: (path: string) => string; secure?: boolean }
>;

/**
 * QA / entornos sin Apache `/nexus-api/` correcto: proxy local vía vite preview
 * (mismo patrón que admin `/admin/api` → :3092). Montaje: `{prefix}/nexus-api`.
 */
function nexusProxyEntry(mount: string, nexusTarget: string) {
  const escaped = mount.replace(/\//g, '\\/');
  const rawTarget = nexusTarget.replace(/\/$/, '');
  // Remoto tipo https://host/nexus-api: el path público del módulo es /nexus-api/*,
  // pero el origen del proxy debe ser solo el host y reinyectar /nexus-api.
  const targetHasNexusPath = /\/nexus-api$/i.test(rawTarget);
  const target = targetHasNexusPath
    ? rawTarget.replace(/\/nexus-api$/i, '')
    : rawTarget;

  return {
    target,
    changeOrigin: true,
    secure: true,
    rewrite: (p: string) => {
      const stripped = p.replace(new RegExp(`^${escaped}`), '') || '/';
      if (!targetHasNexusPath) return stripped;
      return stripped === '/' ? '/nexus-api' : `/nexus-api${stripped}`;
    },
  };
}

export function withNexusPreviewProxy(
  proxy: ProxyRoutes,
  modulePublicPrefix: string,
  nexusTarget = 'http://127.0.0.1:3092',
): ProxyRoutes {
  const prefix = modulePublicPrefix.replace(/\/$/, '');
  if (!prefix) return proxy;

  const out = { ...proxy };
  // Ruta pública: /ocr/nexus-api/...
  out[`${prefix}/nexus-api`] = nexusProxyEntry(`${prefix}/nexus-api`, nexusTarget);
  // Apache strip /ocr/ → vite preview ve /nexus-api/... (srv001qa)
  out['/nexus-api'] = nexusProxyEntry('/nexus-api', nexusTarget);
  return out;
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

  // Apache strip (/ocr/ → :5181/) llega como /api/...; sin strip llega /ocr/api/...
  const out: Record<
    string,
    { target: string; changeOrigin?: boolean; rewrite?: (path: string) => string }
  > = { ...routes };

  for (const [path, cfg] of Object.entries(routes)) {
    out[`${root}${path}`] = {
      ...cfg,
      rewrite: (p: string) => p.slice(root.length) || '/',
    };
  }

  return out;
}
