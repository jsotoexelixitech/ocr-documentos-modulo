/**
 * PM2 — Módulo OCR (Producción)
 *
 * Uso:
 *   pm2 start ecosystem.config.js --env production
 *   pm2 reload ecosystem.config.js
 *   pm2 stop ocr-api ocr-web
 *   pm2 delete ocr-api ocr-web
 */
const path = require('path');
const ROOT = __dirname;

module.exports = {
  apps: [
    {
      name: 'ocr-api',
      cwd: path.join(ROOT, 'server'),
      script: 'src/index.js',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '256M',
      env_production: {
        NODE_ENV: 'production',
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
      script: 'node_modules/vite/bin/vite.js',
      args: 'preview --host --port 5181 --strictPort',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '256M',
      env_production: {
        NODE_ENV: 'production',
      },
      out_file:   path.join(ROOT, 'logs', 'ocr-web.out.log'),
      error_file: path.join(ROOT, 'logs', 'ocr-web.err.log'),
      merge_logs: true,
      time: true,
    },
  ],
};
