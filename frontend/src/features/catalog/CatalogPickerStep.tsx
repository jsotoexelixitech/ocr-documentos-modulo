import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  Car,
  Heart,
  Home,
  RefreshCw,
  ScanLine,
  ShieldCheck,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { toast } from '../../store/toastStore';
import { useWizardStore } from '../../store/wizardStore';
import {
  activePlanCount,
  fetchEmitibleProducts,
  persistBuilderProduct,
} from '../../lib/builder-catalog';
import type { BuilderCatalogProduct, BuilderProductBranch } from '../../types/builder-catalog';

const BRANCH_META: Record<
  BuilderProductBranch,
  { label: string; short: string; icon: LucideIcon }
> = {
  AUTOMOVIL: { label: 'Automóvil', short: 'Auto', icon: Car },
  SALUD: { label: 'Salud', short: 'Salud', icon: Heart },
  VIDA: { label: 'Vida', short: 'Vida', icon: ShieldCheck },
  PATRIMONIAL: { label: 'Patrimonial', short: 'Patrim.', icon: Home },
  INCLUSIVO: { label: 'Inclusivo', short: 'Inclusivo', icon: Users },
  RCV_OBLIGATORIO: { label: 'RCV obligatorio', short: 'RCV', icon: Car },
};

const BRANCH_OPTIONS = Object.entries(BRANCH_META).map(([value, meta]) => ({
  value: value as BuilderProductBranch,
  label: meta.label,
}));

interface CatalogPickerStepProps {
  onSelected: () => void;
}

export function CatalogPickerStep({ onSelected }: CatalogPickerStepProps) {
  const setBuilderProduct = useWizardStore((s) => s.setBuilderProduct);
  const [products, setProducts] = useState<BuilderCatalogProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [branchFilter, setBranchFilter] = useState<BuilderProductBranch | 'ALL'>('ALL');

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
    const timer = window.setInterval(load, 20_000);
    return () => clearInterval(timer);
  }, [load]);

  const filtered = useMemo(() => {
    if (branchFilter === 'ALL') return products;
    return products.filter((p) => p.branch === branchFilter);
  }, [products, branchFilter]);

  const byBranch = useMemo(() => {
    const map = new Map<BuilderProductBranch, BuilderCatalogProduct[]>();
    for (const p of filtered) {
      const arr = map.get(p.branch) ?? [];
      arr.push(p);
      map.set(p.branch, arr);
    }
    return map;
  }, [filtered]);

  function handleSelect(product: BuilderCatalogProduct) {
    setBuilderProduct(product);
    persistBuilderProduct(product);
    toast.success('Ramo seleccionado', `${product.commercialName} — continúa con el OCR.`);
    onSelected();
  }

  return (
    <div className="animate-fade-in">
      <header className="mb-8">
        <p className="text-[0.68rem] font-black tracking-[0.22em] uppercase text-[#00AEEF] mb-2 inline-flex items-center gap-1.5">
          <ScanLine size={11} />
          Paso 00 · Catálogo Exélixi
        </p>
        <h1 className="font-display text-3xl sm:text-[2.5rem] font-black text-slate-900 tracking-tight leading-tight">
          Selecciona el ramo a emitir
        </h1>
        <p className="text-slate-500 text-sm mt-2 max-w-2xl leading-relaxed">
          Los productos creados en product-builder aparecen aquí en tiempo real. Al elegir uno,
          el OCR sabrá qué documentos pedir y qué planes están disponibles para emitir.
        </p>
        <div className="mt-4">
          <Button variant="secondary" onClick={load} disabled={loading} className="gap-2">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Actualizar catálogo
          </Button>
        </div>
      </header>

      {error && (
        <div className="mb-6 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </div>
      )}

      <div className="mb-6 flex flex-wrap gap-2">
        <FilterChip active={branchFilter === 'ALL'} onClick={() => setBranchFilter('ALL')} label="Todos" />
        {BRANCH_OPTIONS.map(({ value, label }) => (
          <FilterChip
            key={value}
            active={branchFilter === value}
            onClick={() => setBranchFilter(value)}
            label={label}
          />
        ))}
      </div>

      {loading && !products.length ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-40 animate-pulse rounded-2xl bg-white/60 ring-1 ring-slate-200/70" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-3xl border border-slate-200/80 bg-white/80 px-6 py-14 text-center shadow-sm">
          <Car className="mx-auto h-10 w-10 text-slate-400" />
          <p className="mt-4 font-bold text-slate-800">No hay productos listos para emitir</p>
          <p className="mt-1 text-sm text-slate-500">
            Crea un producto con coberturas y planes en product-builder.
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {[...byBranch.entries()].map(([branch, items]) => {
            const meta = BRANCH_META[branch];
            const Icon = meta.icon;
            return (
              <section key={branch}>
                <div className="mb-4 flex items-center gap-2">
                  <span className="inline-flex rounded-lg bg-sky-50 p-2 text-sky-700">
                    <Icon className="h-4 w-4" />
                  </span>
                  <h2 className="text-lg font-bold text-slate-900">{meta.label}</h2>
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-800">
                    {items.length}
                  </span>
                </div>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {items.map((product) => (
                    <ProductCard key={product.id} product={product} onSelect={handleSelect} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3.5 py-1.5 text-xs font-bold transition-all ${
        active
          ? 'bg-[#091133] text-white shadow-md'
          : 'bg-white/80 text-slate-600 ring-1 ring-slate-200 hover:text-[#F27121]'
      }`}
    >
      {label}
    </button>
  );
}

function ProductCard({
  product,
  onSelect,
}: {
  product: BuilderCatalogProduct;
  onSelect: (p: BuilderCatalogProduct) => void;
}) {
  const meta = BRANCH_META[product.branch];
  const planCount = activePlanCount(product);
  const coverageCount = product.coverages?.length ?? 0;

  return (
    <button
      type="button"
      onClick={() => onSelect(product)}
      className="group flex flex-col rounded-2xl border border-slate-200/80 bg-white/90 p-5 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-[#00AEEF]/40 hover:shadow-lg"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">{meta.short}</p>
          <h3 className="mt-1 font-bold leading-snug text-[#091133] group-hover:text-[#F27121]">
            {product.commercialName}
          </h3>
          <p className="text-xs text-slate-400">{product.internalCode}</p>
        </div>
        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[0.65rem] font-bold uppercase text-emerald-800">
          Listo
        </span>
      </div>

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
        Continuar con OCR
        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
      </div>
    </button>
  );
}
