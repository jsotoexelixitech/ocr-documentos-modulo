import type { DocType, DocumentState, PersonData } from '../types';
import type { BuilderCatalogProduct } from '../types/builder-catalog';
import type { DiligenciaState } from './diligencia';
import { persistBuilderProduct } from './builder-catalog';

export const EXELIXI_OCR_HANDOFF_KEY = 'exelixi_ocr_handoff';

export type OcrDocType = 'cedula' | 'licencia' | 'certificado' | 'rif' | 'pasaporte';

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
  numeroLicencia?: string;
  propietario?: string;
  identificacionPropietario?: string;
  tipoDocPropietario?: string;
}

export interface ExelixiOcrHandoff {
  productId: string;
  product?: BuilderCatalogProduct;
  ocrData: Partial<Record<OcrDocType, OcrFields>>;
  itipoDiligencia?: 'S' | 'C';
  documentosRequeridos?: DocType[];
  documentHashes?: Partial<Record<DocType, string>>;
  diligencia?: DiligenciaState | null;
  hasDriver?: boolean;
  conductor?: Partial<PersonData>;
  sameInsured?: boolean;
  asegurado?: Partial<PersonData>;
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
  diligencia?: DiligenciaState | null,
  personRoles?: {
    hasDriver?: boolean;
    conductor?: Partial<PersonData>;
    sameInsured?: boolean;
    asegurado?: Partial<PersonData>;
  },
): ExelixiOcrHandoff {
  const ocrData: Partial<Record<OcrDocType, OcrFields>> = {};
  const types: OcrDocType[] = ['cedula', 'licencia', 'certificado', 'rif', 'pasaporte'];
  const documentHashes: Partial<Record<DocType, string>> = {};

  for (const type of types) {
    const mapped = mapDocOcr(documents[type]);
    if (mapped) ocrData[type] = mapped;
    if (documents[type]?.hash) documentHashes[type] = documents[type]!.hash;
  }

  return {
    productId,
    product,
    ocrData,
    itipoDiligencia: diligencia?.itipoDiligencia,
    documentosRequeridos: diligencia?.documentosRequeridos,
    documentHashes,
    diligencia: diligencia ?? null,
    hasDriver: personRoles?.hasDriver,
    conductor: personRoles?.conductor,
    sameInsured: personRoles?.sameInsured,
    asegurado: personRoles?.asegurado,
    savedAt: Date.now(),
  };
}

export function persistOcrHandoff(handoff: ExelixiOcrHandoff): void {
  sessionStorage.setItem(EXELIXI_OCR_HANDOFF_KEY, JSON.stringify(handoff));
}

function getModuleTokenKey(): string {
  return 'nexus_access_token_ocr';
}

function isLocalHost(): boolean {
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname;
  return host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
}

function encodeHandoffForUrl(handoff: ExelixiOcrHandoff): string {
  const json = JSON.stringify(handoff);
  const bytes = new TextEncoder().encode(json);
  let binary = '';
  bytes.forEach((b) => { binary += String.fromCharCode(b); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function isLocalAbsoluteUrl(value: string): boolean {
  return /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?/i.test(value);
}

/** Siguiente paso: módulo formulario (misma cadena que La Mundial, rama Exélixi). */
export function getFormularioContinueUrl(): string {
  const configured = (import.meta.env.VITE_FORMULARIO_CONTINUE_BASE as string | undefined)?.replace(/\/$/, '') || '';
  let base = '/formulario';

  if (isLocalHost()) {
    base = configured && !configured.startsWith('/')
      ? configured
      : 'http://localhost:5182';
  } else if (configured && !isLocalAbsoluteUrl(configured)
    && (configured.startsWith('/') || configured.startsWith('.'))) {
    base = configured;
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

  if (isLocalHost()) {
    let url = getFormularioContinueUrl();
    try {
      const u = new URL(url, window.location.origin);
      u.searchParams.set('ocr_handoff', encodeHandoffForUrl(handoff));
      url = u.toString();
    } catch {
      /* ignore */
    }
    window.location.href = url;
    return;
  }

  if (typeof window.__bridgeAdvance === 'function') {
    void window.__bridgeAdvance({
      exelixiCatalog: true,
      builderProduct: handoff.product,
      productId: handoff.productId,
      hasDriver: handoff.hasDriver,
      conductor: handoff.conductor,
      sameInsured: handoff.sameInsured,
      asegurado: handoff.asegurado,
    });
    return;
  }

  window.location.href = getFormularioContinueUrl();
}

/** @deprecated Usar continueToFormularioModule — product-builder es solo catálogo admin. */
export function continueToEmissionWizard(productId: string, handoff: ExelixiOcrHandoff): void {
  continueToFormularioModule({ ...handoff, productId });
}
