/**
 * PM2 — Módulo OCR (Desarrollo)
 *
 * Uso:
 *   pm2 start ecosystem.dev.config.js
 *   pm2 logs ocr-api
 *   pm2 logs ocr-web
 *   pm2 restart ocr-api
 *   pm2 stop ocr-api ocr-web
 */
const path = require('path');
const ROOT = __dirname;

module.exports = {
  apps: [
    {
      name: 'ocr-api',
      cwd: path.join(ROOT, 'server'),
      script: 'node_modules/.bin/nodemon',
      args: 'src/index.js',
      watch: false,
      autorestart: true,
      max_restarts: 5,
      restart_delay: 3000,
      env: {
        NODE_ENV: 'development',
        PORT: 4001,
      },
      out_file:   path.join(ROOT, 'logs', 'ocr-api.out.log'),
      error_file: path.join(ROOT, 'logs', 'ocr-api.err.log'),
      merge_logs: true,
      time: true,
    },
    {
      name: 'ocr-web',
      cwd: path.join(ROOT, 'frontend'),
      script: 'node_modules/.bin/vite',
      args: '--host',
      watch: false,
      autorestart: true,
      max_restarts: 5,
      restart_delay: 3000,
      env: {
        NODE_ENV: 'development',
      },
      out_file:   path.join(ROOT, 'logs', 'ocr-web.out.log'),
      error_file: path.join(ROOT, 'logs', 'ocr-web.err.log'),
      merge_logs: true,
      time: true,
    },
  ],
};
