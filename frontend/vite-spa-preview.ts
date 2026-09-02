import type { Plugin } from 'vite';
import { isBackendProxyPath } from './vite-paths';

/**
 * Fallback SPA para `vite preview`.
 *
 * Apache hace strip: `/ocr/` → `:5181/` — Vite solo ve `/`, `/exelixi/`, etc.
 * `deployPrefix` (/ocr) se usa solo para redirects al navegador (URL pública).
 */
export function spaPreviewFallback(base: string, deployPrefix = ''): Plugin {
  const normalizedBase = base === './' ? '/' : base.endsWith('/') ? base : `${base}/`;
  const basePath = normalizedBase.replace(/\/$/, '');
  const publicPrefix = deployPrefix.replace(/\/$/, '');

  return {
    name: 'spa-preview-fallback',
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.method !== 'GET' && req.method !== 'HEAD') {
          next();
          return;
        }

        const raw = req.url ?? '/';
        const [pathname, search = ''] = raw.split('?');
        const qs = search ? `?${search}` : '';

        if (isBackendProxyPath(pathname)) {
          next();
          return;
        }

        // Apache strip — Vite ve /exelixi/; el navegador debe ir a /ocr/?flow=...
        if (
          pathname === '/exelixi'
          || pathname === '/exelixi/'
          || pathname.startsWith('/exelixi/')
        ) {
          const params = new URLSearchParams(search);
          if (!params.has('flow')) params.set('flow', 'exelixi-catalog');
          const redirectBase =
            base === './' && publicPrefix ? `/${publicPrefix}/` : normalizedBase;
          const redirect = `${redirectBase}?${params.toString()}`;
          res.statusCode = 302;
          res.setHeader('Location', redirect);
          res.end();
          return;
        }

        const isUnderBase =
          pathname === basePath
          || pathname === normalizedBase.slice(0, -1)
          || pathname.startsWith(`${basePath}/`);

        if (isUnderBase && !pathname.includes('.') && pathname !== `${basePath}/index.html`) {
          req.url = `${normalizedBase}index.html${qs}`;
        }

        next();
      });
    },
  };
}
