import { FileText, Layers } from 'lucide-react';
import { useWizardStore } from '../../store/wizardStore';
import { publicAsset } from '../../lib/app-base';
import '../../styles/exelixi-catalog.css';

type FlowPhase = 'catalog' | 'documents';

interface ExelixiOcrFlowProps {
  phase: FlowPhase;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

export function ExelixiOcrFlow({ phase, children, footer }: ExelixiOcrFlowProps) {
  const builderProduct = useWizardStore((s) => s.builderProduct);

  return (
    <div className="exelixi-ocr min-h-screen">
      <header className="exelixi-ocr-header sticky top-0 z-40">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-10">
          <div className="flex min-w-0 items-center gap-3">
            <img
              src={publicAsset('branding/exelixi-logo-color.png')}
              alt="Exélixi technology"
              className="exelixi-ocr-logo shrink-0"
              draggable={false}
            />
            <div className="min-w-0 hidden sm:block">
              <p className="text-[0.6rem] font-bold uppercase tracking-[0.2em] text-white/50">
                Emisión genérica · Exélixi
              </p>
            </div>
          </div>
          {/* TEMP: CTA ayuda oculta hasta nuevo aviso
          <a
            href="mailto:soporte@exelixitech.com?subject=Emision%20generica%20Exelixi"
            className="inline-flex shrink-0 items-center gap-2 rounded-full bg-white/10 px-3.5 py-2 text-xs font-bold text-white/80 ring-1 ring-white/15 transition hover:bg-white/15"
          >
            <HelpCircle size={13} />
            Ayuda
          </a>
          */}
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 pb-28 pt-6 sm:px-6 lg:px-10 lg:pb-12">
        <ExelixiStepper phase={phase} productName={builderProduct?.commercialName} />
        {phase === 'catalog' && (
          <header className="mb-6 mt-6 hidden lg:block">
            <h1 className="font-display text-3xl font-black tracking-tight text-[#091133] sm:text-4xl">
              Selecciona el ramo a emitir
            </h1>
          </header>
        )}
        <section className="mt-6 overflow-hidden rounded-2xl border border-slate-200/80 bg-white/95 shadow-lg">
          <div className="p-6 sm:p-8 lg:p-10">{children}</div>
          {footer && (
            <div className="border-t border-slate-100 bg-slate-50/80 px-6 py-5 sm:px-8 lg:px-10">
              {footer}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

function ExelixiStepper({
  phase,
  productName,
}: {
  phase: FlowPhase;
  productName?: string;
}) {
  const steps = [
    { id: 'catalog' as const, n: '00', label: 'Ramo', Icon: Layers },
    { id: 'documents' as const, n: '01', label: 'Documentos', Icon: FileText },
  ];

  return (
    <nav
      className="exelixi-ocr-stepper hidden rounded-full px-5 py-3.5 lg:block"
      aria-label="Progreso emisión Exélixi"
    >
      <ol className="flex items-center gap-8">
        {steps.map(({ id, n, label, Icon }) => {
          const isActive = phase === id;
          const isDone = id === 'catalog' && phase === 'documents';
          return (
            <li key={id} className="flex items-center gap-3">
              <div
                className={`grid h-10 w-10 place-items-center rounded-full ${
                  isDone
                    ? 'bg-emerald-500 text-white'
                    : isActive
                      ? 'bg-sky-50 ring-2 ring-sky-200'
                      : 'bg-slate-100 text-slate-400'
                }`}
              >
                <Icon size={18} strokeWidth={2} />
              </div>
              <div>
                <p
                  className={`text-[0.62rem] font-bold uppercase tracking-widest ${
                    isDone ? 'exelixi-ocr-step-done' : isActive ? 'exelixi-ocr-step-active' : 'text-slate-400'
                  }`}
                >
                  Paso {n}
                </p>
                <p className={`text-sm font-bold ${isActive || isDone ? 'text-[#091133]' : 'text-slate-400'}`}>
                  {label}
                </p>
                {id === 'catalog' && isDone && productName && (
                  <p className="mt-0.5 max-w-[12rem] truncate text-xs text-[var(--exelixi-muted)]">{productName}</p>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
