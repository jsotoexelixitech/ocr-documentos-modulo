# 🔍 Módulo OCR — Exelixi Platform

<div align="center">

![Version](https://img.shields.io/badge/version-1.0.0-blue?style=flat-square)
![Node](https://img.shields.io/badge/Node.js-20%2B-339933?style=flat-square&logo=node.js&logoColor=white)
![React](https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react&logoColor=black)
![Vite](https://img.shields.io/badge/Vite-5-646CFF?style=flat-square&logo=vite&logoColor=white)
![License](https://img.shields.io/badge/license-MIT-green?style=flat-square)
![PM2](https://img.shields.io/badge/PM2-ready-2B037A?style=flat-square)

**Paso 1 del flujo RCV · Lectura inteligente de documentos con Google Gemini**

[Documentación de la API](#-api-reference) · [Despliegue](#-despliegue) · [Contribuir](CONTRIBUTING.md) · [Changelog](CHANGELOG.md)

</div>

---

## 📋 Descripción

El módulo OCR es el **punto de entrada** del flujo de contratación RCV de La Mundial de Seguros. Recibe imágenes del documento de identidad y del certificado vehicular, los procesa con **Google Gemini 2.5 Pro** y devuelve los datos extraídos en un formato estructurado listo para pre-poblar el formulario.

### Características principales

- ✅ Extracción de texto con IA (Google Gemini 2.5 Pro)
- ✅ Soporte para cédula venezolana y documentos vehiculares
- ✅ API REST documentada con Swagger/OpenAPI
- ✅ Frontend React pre-construido incluido
- ✅ Gestión de procesos con PM2 (producción y desarrollo)
- ✅ Health-check endpoint para monitoreo

---

## 🏗️ Arquitectura

```
modulo-ocr/
├── frontend/               # React 18 + Vite 5 + TailwindCSS
│   ├── src/
│   │   ├── features/ocr/   # Componentes del flujo OCR
│   │   └── ...
│   └── dist/               # Build compilado (generado)
├── server/                 # Node.js 20 + Express + Fastify
│   ├── src/
│   │   ├── routes/         # Rutas de la API
│   │   ├── services/       # Lógica de negocio (Gemini adapter)
│   │   └── ...
│   ├── .env.example        # Plantilla de variables de entorno
│   └── ...
├── logs/                   # Logs en disco (generado por PM2)
├── ecosystem.config.js     # PM2 — Producción
├── ecosystem.dev.config.js # PM2 — Desarrollo (hot-reload)
└── package.json
```

| Componente | Puerto | Proceso PM2 |
|:-----------|:------:|:-----------:|
| Backend API | `4001` | `ocr-api`  |
| Frontend    | `5181` | `ocr-web`  |
| Swagger UI  | `4001/docs` | — |

---

## 🚀 Inicio rápido

### Prerrequisitos

| Herramienta | Versión mínima |
|:------------|:--------------:|
| Node.js     | 20.x           |
| npm         | 10.x           |
| PM2         | 5.x            |

### 1. Clonar el repositorio

```bash
git clone https://github.com/jsotoexelixitech/ocr-documentos-modulo.git
cd ocr-documentos-modulo
```

### 2. Instalar dependencias

```bash
npm install --prefix server
npm install --prefix frontend
```

### 3. Configurar variables de entorno

```bash
cp server/.env.example server/.env
```

Edita `server/.env` con tus valores:

```env
NODE_ENV=production
PORT=4001
CORS_ORIGINS=http://localhost:5181

# Google Gemini
OCR_PROVIDER=gemini
GEMINI_API_KEY=TU_CLAVE_AQUI
GEMINI_MODEL=gemini-2.5-pro
GEMINI_MAX_RETRIES=2
```

> ⚠️ **Nunca comitas el archivo `.env` al repositorio.**

### 4. Compilar el frontend

```bash
npm run build --prefix frontend
```

### 5. Levantar con PM2

```bash
# Producción
pm2 start ecosystem.config.js --env production

# Desarrollo (hot-reload)
pm2 start ecosystem.dev.config.js
```

### 6. Verificar

```bash
curl http://localhost:4001/api/health
# {"status":"ok","module":"ocr","provider":"gemini","model":"gemini-2.5-pro"}
```

Abre en el navegador:
- **Frontend:** http://localhost:5181
- **Swagger:** http://localhost:4001/docs

---

## 📖 API Reference

### `GET /api/health`

Comprueba que el servicio está activo.

**Response `200`**
```json
{
  "status": "ok",
  "module": "ocr",
  "provider": "gemini",
  "model": "gemini-2.5-pro"
}
```

### `POST /api/ocr/scan`

Procesa una imagen de documento y extrae sus datos.

**Request body**
```json
{
  "imageBase64": "<base64>",
  "mimeType": "image/jpeg",
  "documentType": "cedula" 
}
```

**Response `200`**
```json
{
  "nombre": "JUAN",
  "apellido": "PEREZ",
  "identificacion": "V-12345678",
  "fechaNacimiento": "1990-05-15"
}
```

La especificación completa está disponible en **Swagger UI** en `http://localhost:4001/docs`.

---

## 🛠️ Gestión de procesos (PM2)

```bash
# Estado
pm2 show ocr-api
pm2 show ocr-web

# Logs en tiempo real
pm2 logs ocr-api
pm2 logs ocr-web --lines 100

# Reiniciar (después de cambios)
pm2 restart ocr-api
pm2 restart ocr-web

# Guardar estado para reboot
pm2 save
```

> ⚠️ **Nunca uses `pm2 stop all` / `pm2 delete all`** en un servidor compartido.

---

## 📁 Logs en disco

```
logs/
├── ocr-api.out.log   # stdout del backend
├── ocr-api.err.log   # stderr del backend
├── ocr-web.out.log   # stdout del frontend
└── ocr-web.err.log   # stderr del frontend
```

```bash
# Errores en tiempo real
tail -f logs/ocr-api.err.log
```

---

## 🔄 Actualizar el módulo

```bash
git pull origin main

npm install --prefix server
npm run build --prefix frontend

pm2 restart ocr-api
pm2 restart ocr-web
```

---

## 🗺️ Módulos relacionados

Este módulo forma parte del **flujo de suscripción RCV Exelixi**:

| # | Módulo | Repositorio |
|:-:|:-------|:-----------|
| **1** | **OCR** ← _estás aquí_ | [ocr-documentos-modulo](https://github.com/jsotoexelixitech/ocr-documentos-modulo) |
| 2 | Formulario | [Formulario-modulo](https://github.com/jsotoexelixitech/Formulario-modulo) |
| 3 | Emisión / Plan | [Emision-Plan-modulo](https://github.com/jsotoexelixitech/Emision-Plan-modulo) |
| 4 | Pagos / Póliza | [Pagos-Poliza-modulo](https://github.com/jsotoexelixitech/Pagos-Poliza-modulo) |

---

## 🤝 Contribuir

Lee [CONTRIBUTING.md](CONTRIBUTING.md) para conocer el flujo de trabajo, convenciones de commits y proceso de revisión.

---

## 📄 Licencia

Distribuido bajo la licencia **MIT**. Consulta el archivo [LICENSE](LICENSE) para más información.

---

<div align="center">
Desarrollado por <strong>Exelixi Tech</strong> · 2026
</div>
