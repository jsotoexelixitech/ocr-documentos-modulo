import { useWizardStore } from './store/wizardStore';
import { SidebarNav } from './components/SidebarNav';
import { TopProgressBar } from './components/TopProgressBar';
import { AuroraBackground } from './components/AuroraBackground';
import { Toaster } from './components/Toaster';
import { WelcomeSplash } from './components/WelcomeSplash';
import { Button } from './components/ui/Button';
import { OcrStep } from './features/ocr/OcrStep';
import { getProductConfig } from './lib/product';
import { toast } from './store/toastStore';
import { ChevronRight, Sparkles, ShieldCheck, HelpCircle, CheckCircle2 } from 'lucide-react';

const DOC_LABELS: Record<string, string> = {
  cedula: 'cédula',
  licencia: 'licencia',
  certificado: 'certificado',
  rif: 'RIF',
};

export default function App() {
  const { step, documents, nextStep, goTo } = useWizardStore();

  const isSuccess = step === 2;

  function handleContinuar() {
    const product = getProductConfig();
    const requiredDocs = product.docs.required;
    const allDone = requiredDocs.every((d) => documents[d].status === 'done');
    if (!allDone) {
      const lista = requiredDocs.map((d) => DOC_LABELS[d] ?? d).join(', ');
      toast.warning(
        'Documentos pendientes',
        `Procesa ${lista} para continuar.`,
      );
      return;
    }
    nextStep();
  }

  return (
    <div className="min-h-screen relative">
      <WelcomeSplash />
      <Toaster />
      <AuroraBackground />
      <TopProgressBar />

      <div className="lg:flex">
        <SidebarNav />

        <main className="flex-1 lg:ml-[300px] min-h-screen pt-[72px] lg:pt-20 px-4 sm:px-6 lg:px-10 pb-32 lg:pb-12">
          <div className="max-w-5xl mx-auto">

            {!isSuccess && (
              <header className="mb-8 animate-fade-in">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="min-w-0">
                    <p className="text-[0.68rem] font-black tracking-[0.22em] gradient-text-indigo uppercase mb-2 inline-flex items-center gap-1.5">
                      <Sparkles size={11} className="text-indigo-500" />
                      Paso 01 · Documentos
                    </p>
                    <h1 className="font-display text-3xl sm:text-[2.5rem] font-black text-slate-900 tracking-tight leading-tight">
                      Sube tus documentos
                    </h1>
                    <p className="text-slate-500 text-sm mt-2 max-w-xl leading-relaxed">
                      Los analizaremos con OCR y precargaremos tus datos automáticamente.
                    </p>
                  </div>
                  <a
                    href="mailto:soporte@lamundialdeseguros.com?subject=Suscripci%C3%B3n%20RCV%20-%20Soporte"
                    className="hidden sm:inline-flex items-center gap-2 px-3.5 py-2 rounded-full glass-light text-slate-600 hover:text-indigo-600 text-xs font-bold transition-all hover:-translate-y-0.5"
                  >
                    <HelpCircle size={13} />
                    ¿Necesitas ayuda?
                  </a>
                </div>
              </header>
            )}

            <section key={step} className="surface-card overflow-hidden step-enter">
              <div className="p-6 sm:p-8 lg:p-10">
                {!isSuccess && <OcrStep />}
                {isSuccess && (
                  <div className="flex flex-col items-center justify-center py-16 gap-4">
                    <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center">
                      <CheckCircle2 size={36} className="text-emerald-600" />
                    </div>
                    <h2 className="font-display text-2xl font-black text-slate-900">
                      ¡Documentos procesados!
                    </h2>
                    <p className="text-slate-500 text-sm text-center max-w-sm">
                      El OCR completó la lectura. Los datos han sido precargados exitosamente.
                    </p>
                    <Button variant="secondary" onClick={() => goTo(1)} className="mt-2">
                      Volver a escanear
                    </Button>
                  </div>
                )}
              </div>

              {!isSuccess && (
                <div className="hidden md:flex items-center justify-between gap-4 px-8 lg:px-10 py-5 border-t border-slate-100/80 bg-gradient-to-b from-slate-50/50 to-white/40 backdrop-blur-sm">
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <ShieldCheck size={13} className="text-emerald-500" />
                    <span className="font-medium">Cifrado de extremo a extremo · TLS 1.3</span>
                  </div>
                  <Button variant="primary" onClick={handleContinuar} className="min-w-[180px]">
                    Continuar
                    <ChevronRight size={15} />
                  </Button>
                </div>
              )}
            </section>

          </div>
        </main>
      </div>

      {!isSuccess && (
        <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 px-4 py-3 bg-white/95 backdrop-blur-md border-t border-slate-200 shadow-[0_-8px_24px_rgba(15,23,42,0.08)]">
          <Button variant="primary" className="w-full" onClick={handleContinuar}>
            Continuar
          </Button>
        </div>
      )}
    </div>
  );
}
