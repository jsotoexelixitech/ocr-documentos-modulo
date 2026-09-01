import type { DocType } from '../types';

/** Slots de cédula solo funerario. El motor OCR siempre ve `cedula`. */
export const FUNERAL_CEDULA_SLOTS: DocType[] = [
  'cedula',
  'cedula_titular',
  'cedula_beneficiario',
];

export function toOcrEngineDocType(docType: DocType): DocType {
  if (docType === 'cedula_titular' || docType === 'cedula_beneficiario') return 'cedula';
  return docType;
}

export function isCedulaOcrSlot(docType: DocType): boolean {
  return FUNERAL_CEDULA_SLOTS.includes(docType) || docType === 'cedula';
}
