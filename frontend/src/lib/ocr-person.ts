import type { OcrResult } from '../types';
import { inferTipoDocFromRaw, normalizeIdentificacionDigits } from './identificacion';

export function extractPersonFromOcr(ocr?: OcrResult | null): {
  nombre: string;
  apellido: string;
  identificacion: string;
  tipoDoc: string;
  licencia?: string;
  fechaNac?: string;
} | null {
  if (!ocr) return null;

  const identificacion = normalizeIdentificacionDigits(ocr.identificacion);
  const nombre = ocr.nombre ?? '';
  const apellido = ocr.apellido ?? '';

  if (!identificacion && !nombre && !apellido) return null;

  const tipoDoc =
    ocr.tipoDoc
    ?? inferTipoDocFromRaw(ocr.identificacion)
    ?? 'V';

  return {
    nombre,
    apellido,
    identificacion,
    tipoDoc,
    licencia: ocr.numeroLicencia,
    fechaNac: ocr.fechaNacimiento,
  };
}
