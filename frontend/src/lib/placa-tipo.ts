/** Normaliza placa para comparación (sin espacios ni guiones). */
export function normalizePlaca(placa?: string | null): string {
  return String(placa ?? '').replace(/[\s-]/g, '').toUpperCase();
}

/** Formato INTT Venezuela (ej. AC124KB, AB12345). */
export function looksLikeVePlacaNacional(placa?: string | null): boolean {
  const p = normalizePlaca(placa);
  if (!p) return false;
  return /^[A-Z]{2}\d{3}[A-Z]{2}$/.test(p) || /^[A-Z]{2}\d{5}$/.test(p);
}

/** Formato Colombia (ej. SLD29E, SLP935) — placa extranjera en RCV Venezuela. */
export function looksLikeCoPlaca(placa?: string | null): boolean {
  const p = normalizePlaca(placa);
  if (!p) return false;
  return /^[A-Z]{3}\d{2,3}[A-Z]?$/.test(p);
}

/** Placa extranjera genérica (no VE ni Colombia). */
export function looksLikePlacaExtranjeraGenerica(placa?: string | null): boolean {
  const p = normalizePlaca(placa);
  if (p.length < 4) return false;
  if (looksLikeVePlacaNacional(p)) return false;
  if (looksLikeCoPlaca(p)) return false;
  return /[A-Z]/.test(p) && /\d/.test(p);
}

type CertHint = { tipoPlaca?: string; tipoCarnet?: string; placa?: string };

/**
 * OCR indica placa extranjera. Incluye documentos/placas colombianas (extranjero).
 * Binacional (VE hacia CO) no aplica aquí — usa tipoPlaca binacional explícito.
 */
export function ocrIndicaPlacaExtranjera(cert?: CertHint | null): boolean {
  if (!cert) return false;
  const ocrTipo = String(cert.tipoPlaca ?? '').toLowerCase().trim();
  if (ocrTipo === 'extranjera') return true;
  const tipoCarnet = String(cert.tipoCarnet ?? '').toLowerCase().trim();
  if (tipoCarnet === 'extranjero') return true;
  const p = normalizePlaca(cert.placa);
  if (looksLikeCoPlaca(p)) return true;
  if (!p || looksLikeVePlacaNacional(p)) return false;
  return looksLikePlacaExtranjeraGenerica(p);
}

/** @deprecated Usar ocrIndicaPlacaExtranjera */
export function shouldLockTipoPlacaExtranjera(
  _placa?: string | null,
  cert?: CertHint | null,
): boolean {
  return ocrIndicaPlacaExtranjera(cert);
}

export function placaPlaceholder(tipoPlaca: string): string {
  if (tipoPlaca === 'binacional') return 'SLP935';
  if (tipoPlaca === 'extranjera') return 'SLD29E';
  return 'AE123KT';
}

export function placaMaxLength(tipoPlaca: string): number {
  return tipoPlaca === 'nacional' ? 8 : 12;
}

/** Alineado con emision-api / nest validateEmissionAuto (6–8 alfanuméricos VE). */
export const PLACA_NACIONAL_MIN = 6;
export const PLACA_NACIONAL_MAX = 8;

export function validatePlacaMessage(
  placa?: string | null,
  tipoPlaca: string = 'nacional',
): string | undefined {
  const p = normalizePlaca(placa);
  if (!p) return 'La placa es obligatoria';
  if (tipoPlaca === 'nacional') {
    if (p.length < PLACA_NACIONAL_MIN) {
      return `La placa debe tener al menos ${PLACA_NACIONAL_MIN} caracteres`;
    }
    if (p.length > PLACA_NACIONAL_MAX) {
      return `La placa no puede superar ${PLACA_NACIONAL_MAX} caracteres (formato venezolano)`;
    }
    if (!/^[A-Z0-9]+$/.test(p)) {
      return 'La placa solo puede contener letras y números';
    }
    return undefined;
  }
  if (p.length < 4) return 'La placa debe tener al menos 4 caracteres';
  if (p.length > 12) return 'La placa no puede superar 12 caracteres';
  if (!/^[A-Z0-9-]+$/.test(p)) {
    return 'La placa solo puede contener letras, números o guiones';
  }
  return undefined;
}
