import { useCallback, useEffect, useState } from 'react';
import { ArrowRight, Car, Heart, RefreshCw, ScanLine, ShieldCheck } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { toast } from '../../store/toastStore';
import { useWizardStore } from '../../store/wizardStore';
import {
  activePlanCount,
  fetchEmitibleProducts,
  persistBuilderProduct,
} from '../../lib/builder-catalog';
import type { BuilderCatalogProduct, BuilderProductBranch } from '../../types/builder-catalog';

const BRANCH_ICON: Record<BuilderProductBranch, typeof Car> = {
  AUTOMOVIL: Car,
  SALUD: Heart,
  VIDA: ShieldCheck,
  PATRIMONIAL: Car,
  INCLUSIVO: ShieldCheck,
  RCV_OBLIGATORIO: Car,
};

interface CatalogPickerStepProps {
  onSelected: () => void;
}

export function CatalogPickerStep({ onSelected }: CatalogPickerStepProps) {
  const setBuilderProduct = useWizardStore((s) => s.setBuilderProduct);
  const [products, setProducts] = useState<BuilderCatalogProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await fetchEmitibleProducts();
      setProducts(list);
      setError(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'No se pudo cargar el catálogo';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function handleSelect(product: BuilderCatalogProduct) {
    setBuilderProduct(product);
    persistBuilderProduct(product);
    toast.success('Ramo seleccionado', `${product.commercialName} — continúa con el OCR.`);
    onSelected();
  }

  return (
    <div className="animate-fade-in">
      <header className="mb-8 lg:hidden">
        <p className="mb-2 inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-[#00AEEF]">
          <ScanLine size={11} />
          Paso 00 · Ramo
        </p>
        <h1 className="font-display text-3xl font-black tracking-tight text-[#091133] sm:text-4xl">
          Selecciona el ramo a emitir
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-500">
          Elige el producto configurado en el catálogo. Después pasarás al OCR de documentos.
        </p>
      </header>

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <p className="hidden flex-1 text-sm text-slate-500 lg:block">
          Elige el producto configurado en el catálogo. Después pasarás al OCR de documentos.
        </p>
        <Button variant="secondary" onClick={load} disabled={loading} className="gap-2">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Actualizar
        </Button>
      </div>

      {error && (
        <div className="mb-6 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </div>
      )}

      {loading && !products.length ? (
        <div className="grid gap-4 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-44 animate-pulse rounded-2xl bg-slate-100" />
          ))}
        </div>
      ) : products.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-6 py-14 text-center">
          <p className="font-bold text-[#091133]">No hay ramos disponibles</p>
          <p className="mt-1 text-sm text-slate-500">
            Configura Automóvil, Funerario y Accidentes Personales en product-builder.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-3">
          {products.map((product) => (
            <ProductCard key={product.id} product={product} onSelect={handleSelect} />
          ))}
        </div>
      )}
    </div>
  );
}

function ProductCard({
  product,
  onSelect,
}: {
  product: BuilderCatalogProduct;
  onSelect: (p: BuilderCatalogProduct) => void;
}) {
  const Icon = BRANCH_ICON[product.branch] ?? Car;
  const planCount = activePlanCount(product);
  const coverageCount = product.coverages?.length ?? 0;

  return (
    <button
      type="button"
      onClick={() => onSelect(product)}
      className="group flex flex-col rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-[#00AEEF]/50 hover:shadow-md"
    >
      <div className="mb-3 inline-flex rounded-lg bg-sky-50 p-2 text-sky-700">
        <Icon className="h-5 w-5" />
      </div>
      <h3 className="font-bold leading-snug text-[#091133] group-hover:text-[#F27121]">
        {product.commercialName}
      </h3>
      <p className="mt-1 text-xs text-slate-400">{product.internalCode}</p>
      <dl className="mt-4 grid grid-cols-2 gap-2 text-xs">
        <div>
          <dt className="text-slate-400">Planes</dt>
          <dd className="font-bold text-[#091133]">{planCount}</dd>
        </div>
        <div>
          <dt className="text-slate-400">Coberturas</dt>
          <dd className="font-bold text-[#091133]">{coverageCount}</dd>
        </div>
      </dl>
      <div className="mt-4 flex items-center gap-1 text-sm font-bold text-[#F27121]">
        Continuar
        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
      </div>
    </button>
  );
}
