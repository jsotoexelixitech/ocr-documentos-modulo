import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { prefixDevProxy, resolveAppBase } from './vite-paths'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const tunnel = env.VITE_HMR_TUNNEL === '1' || env.VITE_HMR_TUNNEL === 'true'
  const base = resolveAppBase(env)

  // Mismo mapa de proxy para el dev server (`vite`) y para `vite preview`
  // (producción sirve el build con preview, que NO hereda `server.proxy`).
  const proxy = prefixDevProxy(base, {
    // OCR propio
    '/api/documents': { target: 'http://localhost:4001', changeOrigin: true },
    // Catálogos valrep/INMA se obtienen desde el backend del formulario (4002)
    '/api/valrep': { target: 'http://localhost:4002', changeOrigin: true },
    '/api/catalogo': { target: 'http://localhost:4002', changeOrigin: true },
    '/api': { target: 'http://localhost:4001', changeOrigin: true },
    '/files': { target: 'http://localhost:4001', changeOrigin: true },
    '/docs': { target: 'http://localhost:4001', changeOrigin: true },
    '/docs.json': { target: 'http://localhost:4001', changeOrigin: true },
  })

  return {
    base,
    plugins: [react(), tailwindcss()],
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
