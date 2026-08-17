import type { DocType, DocumentState } from '../types';
import type { BuilderCatalogProduct } from '../types/builder-catalog';
import { persistBuilderProduct } from './builder-catalog';

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
  linea?: string;
  anio?: string;
  año?: string;
  serial?: string;
  serialMotor?: string;
  cilindrada?: string;
  color?: string;
  tipoCarnet?: 'nacional' | 'binacional';
  tipoPlaca?: 'nacional' | 'extranjera' | 'binacional';
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

function getModuleTokenKey(): string {
  return 'nexus_access_token_ocr';
}

function isLocalHost(): boolean {
  return typeof window !== 'undefined'
    && /localhost|127\.0\.0\.1/i.test(window.location.hostname);
}

function encodeHandoffForUrl(handoff: ExelixiOcrHandoff): string {
  const json = JSON.stringify(handoff);
  const bytes = new TextEncoder().encode(json);
  let binary = '';
  bytes.forEach((b) => { binary += String.fromCharCode(b); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

/** Siguiente paso: módulo formulario (misma cadena que La Mundial, rama Exélixi). */
export function getFormularioContinueUrl(): string {
  const configured = import.meta.env.VITE_FORMULARIO_CONTINUE_BASE as string | undefined;
  let base = (configured?.replace(/\/$/, '') || '/formulario').replace(/\/$/, '');

  // Solo local: si no hay base absoluta, el front OCR vive en :5181 y Formulario en :5182.
  if (isLocalHost() && (!configured || configured.startsWith('/'))) {
    base = 'http://localhost:5182';
  }

  const params = new URLSearchParams();

  try {
    const current = new URL(window.location.href);
    const flow = current.searchParams.get('flow');
    const product =
      current.searchParams.get('product')
      || sessionStorage.getItem('exelixi_product')
      || 'rcv';

    // Conservar flujo Exélixi solo si ya venía así. La Mundial usa ?product=rcv|funerario.
    if (flow === 'exelixi-catalog' || flow === 'exelixi') {
      params.set('flow', 'exelixi-catalog');
    } else {
      params.set('product', product);
    }

    const sid = current.searchParams.get('sid');
    const nexusToken =
      current.searchParams.get('nexus_token')
      || sessionStorage.getItem(getModuleTokenKey());
    if (sid) params.set('sid', sid);
    if (nexusToken) params.set('nexus_token', nexusToken);
  } catch {
    params.set('product', 'rcv');
  }

  return `${base}/?${params.toString()}`;
}

export function continueToFormularioModule(handoff: ExelixiOcrHandoff): void {
  persistOcrHandoff(handoff);
  persistBuilderProduct(handoff.product ?? null);

  if (typeof window.__bridgeAdvance === 'function') {
    void window.__bridgeAdvance({
      exelixiCatalog: true,
      builderProduct: handoff.product,
      productId: handoff.productId,
    });
    return;
  }

  let url = getFormularioContinueUrl();

  // Solo local cross-port: sessionStorage no se comparte entre :5181 y :5182.
  if (isLocalHost()) {
    try {
      const u = new URL(url, window.location.origin);
      u.searchParams.set('ocr_handoff', encodeHandoffForUrl(handoff));
      url = u.toString();
    } catch {
      /* ignore */
    }
  }

  window.location.href = url;
}

/** @deprecated Usar continueToFormularioModule — product-builder es solo catálogo admin. */
export function continueToEmissionWizard(productId: string, handoff: ExelixiOcrHandoff): void {
  continueToFormularioModule({ ...handoff, productId });
}
