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

/**
 * QA / entornos sin Apache `/nexus-api/` correcto: proxy local vía vite preview
 * (mismo patrón que admin `/admin/api` → :3092). Montaje: `{prefix}/nexus-api`.
 */
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
