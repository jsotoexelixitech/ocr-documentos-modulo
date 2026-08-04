export type BuilderProductBranch =
  | 'AUTOMOVIL'
  | 'SALUD'
  | 'VIDA'
  | 'PATRIMONIAL'
  | 'INCLUSIVO'
  | 'RCV_OBLIGATORIO';

export interface BuilderRequiredDocument {
  documentKey: string;
  label: string;
  required?: boolean;
}

export interface BuilderProductPlan {
  id?: string;
  name: string;
  description?: string | null;
  badge?: string | null;
  isRecommended?: boolean;
  isActive?: boolean;
  priceFactor?: number;
  coverageIds?: string[];
}

export interface BuilderCoverage {
  id?: string;
  name: string;
  isBasicMandatory?: boolean;
}

export interface BuilderCatalogProduct {
  id: string;
  commercialName: string;
  internalCode: string;
  branch: BuilderProductBranch;
  status: string;
  emissionType?: string;
  coverages?: BuilderCoverage[];
  productPlans?: BuilderProductPlan[];
  requiredDocuments?: BuilderRequiredDocument[];
}

export type BuilderOcrDocType = 'cedula' | 'licencia' | 'certificado' | 'rif';

export interface BuilderDocSlot {
  key: string;
  label: string;
  ocrType: BuilderOcrDocType;
  required: boolean;
}
