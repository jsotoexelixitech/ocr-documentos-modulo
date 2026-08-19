import type { DocType, DocumentState } from '../types';

type CertOcr = {
  tipoCarnet?: string;
  tipoPlaca?: string;
  placa?: string;
  linea?: string;
  cilindrada?: string;
};

export function isBinacionalCarnet(cert?: CertOcr | null): boolean {
  if (!cert) return false;
  if (cert.tipoCarnet === 'binacional') return true;
  if (cert.tipoPlaca === 'binacional') return true;
  return false;
}

export function resolveTipoPlacaFromCert(
  cert?: CertOcr | null,
): 'nacional' | 'extranjera' | 'binacional' {
  if (!cert) return 'nacional';
  if (cert.tipoPlaca === 'binacional' || cert.tipoCarnet === 'binacional') {
    return 'binacional';
  }
  if (cert.tipoPlaca === 'extranjera') return 'extranjera';
  return 'nacional';
}

/**
 * Con carnet binacional (Colombia): solo certificado es obligatorio;
 * cédula y licencia pasan a opcionales.
 */
export function adjustDocsForBinacionalCarnet(
  requiredDocs: DocType[],
  optionalDocs: DocType[],
  documents: Record<DocType, DocumentState>,
  hasVehicle: boolean,
): { requiredDocs: DocType[]; optionalDocs: DocType[] } {
  if (!hasVehicle) {
    return { requiredDocs: [...requiredDocs], optionalDocs: [...optionalDocs] };
  }

  const cert = documents.certificado?.ocr as CertOcr | undefined;
  if (!isBinacionalCarnet(cert)) {
    return { requiredDocs: [...requiredDocs], optionalDocs: [...optionalDocs] };
  }

  const required = requiredDocs.filter((d) => d !== 'cedula' && d !== 'licencia');
  if (!required.includes('certificado')) required.push('certificado');

  const optionalSet = new Set(optionalDocs);
  if (requiredDocs.includes('cedula')) optionalSet.add('cedula');
  if (requiredDocs.includes('licencia')) optionalSet.add('licencia');

  return {
    requiredDocs: required,
    optionalDocs: [...optionalSet],
  };
}
