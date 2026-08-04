import type { DocType, DocumentState } from '../types';
import type { BuilderCatalogProduct } from '../types/builder-catalog';

export const EXELIXI_OCR_HANDOFF_KEY = 'exelixi_ocr_handoff';

export type OcrDocType = 'cedula' | 'licencia' | 'certificado' | 'rif';

export interface OcrFields {
  nombre?: string;
  apellido?: string;
  identificacion?: string;
  tipoDoc?: string;
  placa?: string;
  marca?: string;
  modelo?: string;
  anio?: string;
  año?: string;
  serial?: string;
  color?: string;
  rif?: string;
  razonSocial?: string;
  fechaNacimiento?: string;
  sexo?: string;
  estadoCivil?: string;
}

export interface ExelixiOcrHandoff {
  productId: string;
  product?: BuilderCatalogProduct;
  ocrData: Partial<Record<OcrDocType, OcrFields>>;
  savedAt: number;
}

function mapDocOcr(doc?: DocumentState): OcrFields | undefined {
  if (!doc?.ocr || typeof doc.ocr !== 'object') return undefined;
  return doc.ocr as OcrFields;
}

export function buildOcrHandoff(
  productId: string,
  documents: Record<DocType, DocumentState>,
  product?: BuilderCatalogProduct,
): ExelixiOcrHandoff {
  const ocrData: Partial<Record<OcrDocType, OcrFields>> = {};
  const types: OcrDocType[] = ['cedula', 'licencia', 'certificado', 'rif'];

  for (const type of types) {
    const mapped = mapDocOcr(documents[type]);
    if (mapped) ocrData[type] = mapped;
  }

  return { productId, product, ocrData, savedAt: Date.now() };
}

export function persistOcrHandoff(handoff: ExelixiOcrHandoff): void {
  sessionStorage.setItem(EXELIXI_OCR_HANDOFF_KEY, JSON.stringify(handoff));
}

/** URL del wizard de emisión genérica (datos → planes → pago → PDF). */
export function getEmissionContinueUrl(productId: string): string {
  const configured = import.meta.env.VITE_EMISSION_CONTINUE_BASE as string | undefined;
  const base = (configured?.replace(/\/$/, '') || '/producto-builder').replace(/\/$/, '');
  const params = new URLSearchParams({
    step: 'datos',
    flow: 'exelixi-catalog',
  });
  return `${base}/emitir/${encodeURIComponent(productId)}?${params.toString()}`;
}

export function continueToEmissionWizard(productId: string, handoff: ExelixiOcrHandoff): void {
  persistOcrHandoff(handoff);
  try {
    sessionStorage.setItem('exelixi_catalog_flow', '1');
  } catch {
    /* ignore */
  }
  window.location.href = getEmissionContinueUrl(productId);
}
