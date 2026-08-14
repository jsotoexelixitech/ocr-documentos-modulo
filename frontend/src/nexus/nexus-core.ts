/**
 * nexus-core.ts — NexusGuard core para modulo-ocr (Paso 1: Documentos)
 */

import { getNexusToken, persistNexusToken } from '../lib/nexus-token-client';

const STORAGE_KEY = 'nexus_access_token_ocr';

const INTERNAL_HTTP_RE = /^http:\/\/(192\.168\.|10\.|127\.0\.0\.1|localhost)(:\d+)?/i;

/** Prefijos Apache → proxy Nexus en vite preview (QA sin tocar `/nexus-api/` global). */
const MODULE_NEXUS_API: [string, string][] = [
  ['/ocr', '/ocr/nexus-api'],
  ['/formulario', '/formulario/nexus-api'],
  ['/emision', '/emision/nexus-api'],
  ['/pagos', '/pagos/nexus-api'],
];

function httpsModuleNexusApiBase(): string {
  const path = window.location.pathname.replace(/\/$/, '') || '/';
  for (const [prefix, apiPath] of MODULE_NEXUS_API) {
    if (path === prefix || path.startsWith(`${prefix}/`)) {
      return `${window.location.origin}${apiPath}`;
    }
  }
  return `${window.location.origin}/nexus-api`;
}

/**
 * Resuelve la URL de nexus-api en el navegador (dev + QA, mismo bundle).
 *
 * 1. VITE_NEXUS_API_URL HTTPS pública (ej. cierrelmds …/nexus-api) → se usa tal cual.
 * 2. HTTPS sin URL pública → {/ocr|/formulario|/emision|/pagos}/nexus-api
 *    (vite preview → 127.0.0.1:3092; no depende de Apache /nexus-api/).
 * 3. HTTP local → VITE_NEXUS_API_URL o localhost:3092.
 */
export function resolveNexusApiUrl(configured?: string): string {
  const trimmed = configured?.trim().replace(/\/$/, '');
  const pageIsHttps =
    typeof window !== 'undefined' && window.location.protocol === 'https:';

  if (trimmed && !INTERNAL_HTTP_RE.test(trimmed)) {
    return trimmed;
  }
  if (pageIsHttps && typeof window !== 'undefined') {
    return httpsModuleNexusApiBase();
  }
  if (trimmed) return trimmed;
  return 'http://localhost:3092';
}

export interface NexusVerifyResult {
  active: boolean;
  product?: 'rcv' | 'funerario';
  empresa?: { id: number; nombre: string; rif: string };
  submodulo?: {
    id: number;
    nombre: string;
    url: string | null;
    moduloNombre?: string | null;
    accessUrl: string | null;
  };
  reason?: string;
}

export async function verifyNexusAccess(nexusApiUrl: string): Promise<NexusVerifyResult> {
  const tokenFromUrl = new URLSearchParams(window.location.search).get('nexus_token');
  if (tokenFromUrl && !getNexusToken(STORAGE_KEY)) {
    persistNexusToken(STORAGE_KEY, tokenFromUrl);
  }

  const token = getNexusToken(STORAGE_KEY);

  if (!token) {
    return {
      active: false,
      reason: 'No se proporcionó token de acceso. Contacte a su administrador.',
    };
  }

  try {
    const res = await fetch(`${nexusApiUrl.replace(/\/$/, '')}/api/access/verify`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    const data = await res.json();

    if (data.active) {
      // Token deslizante: el backend reemite un nexus_token fresco en cada
      // verify. Se guarda para que la sesión no caduque (el token del navegador
      // expira en 1 h; así se renueva en cada verify sin recargar la página).
      if (data.access_token) {
        persistNexusToken(STORAGE_KEY, data.access_token);
      }
      return {
        active: true,
        product: data.product,
        empresa: data.empresa,
        submodulo: data.submodulo,
      };
    }

    return { active: false, reason: data.reason ?? 'Servicio no disponible para esta empresa.' };
  } catch {
    return { active: false, reason: 'No se pudo conectar con el servidor de autorización.' };
  }
}
