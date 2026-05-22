# Changelog

Todos los cambios notables de este proyecto se documentan en este archivo.

El formato sigue [Keep a Changelog](https://keepachangelog.com/es/1.0.0/) y el proyecto adhiere a [Semantic Versioning](https://semver.org/lang/es/).

---

## [1.0.0] — 2026-05-22

### Added
- Extracción de datos de cédula venezolana con Google Gemini 2.5 Pro
- Extracción de datos de certificado vehicular (placa, serial, marca, modelo, año)
- API REST documentada con Swagger / OpenAPI 3.0
- Frontend React 18 + Vite 5 para captura y previsualización de documentos
- Health-check endpoint `GET /api/health`
- Soporte PM2 para producción (`ecosystem.config.js`) y desarrollo (`ecosystem.dev.config.js`)
- Reintentos automáticos configurables (`GEMINI_MAX_RETRIES`)
- Integración con el flujo RCV Exelixi (pasos 2–4 downstream)

## [1.1.0] — 2026-05-22

### Added
- `deploy-all.sh` — script orquestador maestro: detecta, instala, compila y levanta los 4 módulos del flujo RCV con un solo comando
- Soporte para flags: `--dev`, `--skip-install`, `--restart`, `--status`, `--stop`
- Health-check automático post-despliegue con resumen de puertos y URLs
- Detección automática de nombres de carpeta alternativos (nombre local y nombre del repo GitHub)
- Variable de entorno `BASE_DIR` para rutas personalizadas

---

> Para versiones futuras sigue el flujo descrito en [CONTRIBUTING.md](CONTRIBUTING.md).
