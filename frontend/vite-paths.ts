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
    /\/api(\/|$)/.test(pathname)
    || /\/files(\/|$)/.test(pathname)
    || /\/docs(\/|$)/.test(pathname)
    || pathname.endsWith('/docs.json')
  );
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
