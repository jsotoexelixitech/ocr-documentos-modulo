/** Base normalizada del módulo (Vite `base`). Ej. `/` o `/ocr/`. */
function normalizedBase(): string {
  return (import.meta.env.BASE_URL ?? '/').replace(/\/?$/, '/');
}

/** Base URL del módulo (Vite `base`). Ej. `/ocr/` → API en `/ocr/api`. */
export function moduleApiBase(): string {
  return `${normalizedBase()}api`;
}

/**
 * Ruta de un archivo en `public/` respetando el prefijo de despliegue.
 * Ej. publicAsset('logo.png') → `/ocr/logo.png` cuando base es `/ocr/`.
 */
export function publicAsset(path: string): string {
  const clean = path.replace(/^\//, '');
  return `${normalizedBase()}${clean}`;
}
