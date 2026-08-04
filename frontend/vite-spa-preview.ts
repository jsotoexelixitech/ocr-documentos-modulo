import type { Plugin } from 'vite';

/**
 * Fallback SPA para `vite preview` bajo subpath (/ocr/).
 *
 * Casos:
 * 1. Apache bien: GET /ocr/exelixi/ → sirve /ocr/index.html
 * 2. Apache mal (strip prefix): GET /exelixi/ → redirige a /ocr/?flow=exelixi-catalog
 */
export function spaPreviewFallback(base: string): Plugin {
  const normalizedBase = base === './' ? '/' : base.endsWith('/') ? base : `${base}/`;
  const basePath = normalizedBase.replace(/\/$/, '');

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

        // ProxyPass /ocr/ → http://127.0.0.1:5181/ (sin /ocr/) — Vite ve /exelixi/
        if (
          pathname === '/exelixi'
          || pathname === '/exelixi/'
          || pathname.startsWith('/exelixi/')
        ) {
          const params = new URLSearchParams(search);
          if (!params.has('flow')) params.set('flow', 'exelixi-catalog');
          const redirect = `${normalizedBase}?${params.toString()}`;
          res.statusCode = 302;
          res.setHeader('Location', redirect);
          res.end();
          return;
        }

        // SPA: subrutas bajo /ocr/ que no son assets
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
