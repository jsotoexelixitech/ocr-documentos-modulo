/**
 * Etiquetas de tipo/clase en carnet INTT (Venezuela) — no son modelo comercial.
 * Filtra PASEO, SPORT WAGON, MOTO PARTICULAR, etc. cuando el OCR los confunde con modelo.
 */
const VE_CARNET_CLASS_LABELS = new Set([
  'PASEO', 'CARGA', 'PARTICULAR', 'PUBLICO', 'OFICIAL', 'DIPLOMATICO',
  'SPORT WAGON', 'SPORTWAGON', 'STATION WAGON', 'FURGON', 'RUSTICO',
  'MOTO PARTICULAR', 'CAMIONETA PARTICULAR', 'AUTOMOVIL PARTICULAR',
  'PICK UP', 'PICKUP', 'PICK-UP', 'BUS', 'CAMION', 'REMOLQUE', 'SEMIRREMOLQUE',
  'TURISMO', 'TAXI', 'RURAL', 'UTILITARIO', 'MICROBUS', 'MINIBUS',
]);

function normalizeLabel(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function isVehicleClassOrTypeLabel(value?: string | null): boolean {
  const v = normalizeLabel(String(value ?? '').trim());
  if (!v) return false;
  if (VE_CARNET_CLASS_LABELS.has(v)) return true;
  if (/\b(PARTICULAR|PUBLICO|OFICIAL)\b/.test(v) && !/\d/.test(v)) return true;
  if (!/\d/.test(v) && (v === 'PASEO' || v === 'CARGA' || v.endsWith(' WAGON'))) return true;
  return false;
}

export function resolveOcrModelo(cert?: {
  modelo?: string;
  linea?: string;
  referenciaModelo?: string;
  referencia?: string;
} | null): string {
  if (!cert) return '';
  const candidates = [cert.referenciaModelo, cert.referencia, cert.modelo, cert.linea];
  for (const raw of candidates) {
    const text = String(raw ?? '').trim();
    if (!text || isVehicleClassOrTypeLabel(text)) continue;
    return text.replace(/\s*\/\s*\d{1,2}\s*$/u, '').trim();
  }
  return '';
}

export function resolveOcrTipoPlaca(cert?: {
  tipoCarnet?: string;
  tipoPlaca?: string;
  referenciaModelo?: string;
  tipoVehiculo?: string;
  claseUso?: string;
} | null): 'nacional' | 'extranjera' | 'binacional' {
  if (!cert) return 'nacional';
  if (cert.referenciaModelo || cert.tipoVehiculo || cert.claseUso) return 'nacional';
  if (cert.tipoCarnet === 'nacional') return 'nacional';
  if (cert.tipoCarnet === 'binacional') return 'binacional';
  if (cert.tipoPlaca === 'extranjera') return 'extranjera';
  if (cert.tipoPlaca === 'binacional') return 'binacional';
  return 'nacional';
}
