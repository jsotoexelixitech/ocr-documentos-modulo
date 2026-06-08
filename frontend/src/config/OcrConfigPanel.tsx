import { useState, useEffect } from 'react';
import { useProductConfig } from '../hooks/useProductConfig';
import { getProductId } from '../lib/product';
import {
  Settings2, FileText, RotateCcw, Save, CheckCircle2,
  AlertTriangle, Loader2, Eye, EyeOff, ShieldCheck
} from 'lucide-react';

const EMPRESA_ID = Number(import.meta.env.VITE_EMPRESA_ID ?? 1);

const DOC_META: Record<string, { label: string; description: string }> = {
  cedula:      { label: 'Cédula de Identidad',       description: 'Documento de identidad venezolano (V/E)' },
  licencia:    { label: 'Licencia de Conducir',       description: 'Licencia vigente del conductor habitual' },
  certificado: { label: 'Certificado de Circulación', description: 'Certificado del vehículo asegurado' },
  rif:         { label: 'RIF',                        description: 'Registro de Información Fiscal (personas naturales o jurídicas)' },
};

export function OcrConfigPanel() {
  const producto = getProductId();
  const { config, loadState, saving, saveError, saveConfig, resetConfig } = useProductConfig(EMPRESA_ID, producto, 'ocr');
  const [local, setLocal] = useState<Record<string, any> | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (config) setLocal(JSON.parse(JSON.stringify(config)));
  }, [config]);

  function toggleDoc(docType: string, field: 'activo' | 'obligatorio', val: boolean) {
    setLocal((prev) => {
      if (!prev) return prev;
      const next = { ...prev, documentos: { ...prev.documentos, [docType]: { ...prev.documentos[docType], [field]: val } } };
      // Si se desactiva el doc, tampoco puede ser obligatorio
      if (field === 'activo' && !val) next.documentos[docType].obligatorio = false;
      // Si se marca obligatorio, el doc debe estar activo
      if (field === 'obligatorio' && val) next.documentos[docType].activo = true;
      return next;
    });
    setSaved(false);
  }

  async function handleSave() {
    if (!local) return;
    await saveConfig(local);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  async function handleReset() {
    if (!confirm('¿Restaurar la configuración a los valores por defecto?')) return;
    await resetConfig();
    setSaved(false);
  }

  const docs = local?.documentos ?? {};

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50/30 p-6 lg:p-10">
      <div className="max-w-3xl mx-auto">

        {/* Header */}
        <div className="flex items-start justify-between gap-4 mb-8">
          <div>
            <div className="flex items-center gap-2.5 mb-2">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 grid place-items-center shadow-lg">
                <Settings2 size={18} className="text-white" />
              </div>
              <div>
                <p className="text-[0.65rem] font-black tracking-widest text-indigo-600 uppercase">Parametrizador</p>
                <h1 className="font-bold text-slate-900 text-xl leading-tight">Módulo OCR</h1>
              </div>
            </div>
            <p className="text-sm text-slate-500 ml-12.5">
              Configura qué documentos se solicitan en el flujo de <strong className="text-slate-700 capitalize">{producto}</strong>.
            </p>
          </div>
          <span className="px-2.5 py-1 rounded-lg bg-indigo-100 text-indigo-700 text-xs font-bold capitalize border border-indigo-200">
            {producto}
          </span>
        </div>

        {/* Loading */}
        {loadState === 'loading' && (
          <div className="flex items-center justify-center gap-3 py-20 text-slate-400">
            <Loader2 size={20} className="animate-spin" />
            <span className="text-sm font-medium">Cargando configuración...</span>
          </div>
        )}

        {/* Error */}
        {loadState === 'error' && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 flex items-start gap-3">
            <AlertTriangle size={18} className="text-amber-500 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-amber-800 text-sm">No se pudo cargar la configuración</p>
              <p className="text-amber-700 text-xs mt-1">Se está usando la configuración por defecto del módulo. Verifica que el servidor Nexus esté activo.</p>
            </div>
          </div>
        )}

        {/* Config Form */}
        {local && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 mb-4">
              <FileText size={14} className="text-slate-400" />
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Documentos</span>
            </div>

            {Object.entries(DOC_META).map(([docType, meta]) => {
              const doc = docs[docType] ?? { activo: false, obligatorio: false };
              return (
                <div
                  key={docType}
                  className={`rounded-2xl border p-5 transition-all ${
                    doc.activo
                      ? 'border-indigo-200 bg-white shadow-sm'
                      : 'border-slate-200 bg-slate-50/60 opacity-60'
                  }`}
                >
                  <div className="flex items-start gap-4">
                    <div className={`w-10 h-10 rounded-xl grid place-items-center shrink-0 ${
                      doc.activo
                        ? 'bg-gradient-to-br from-indigo-500 to-violet-500 shadow-md'
                        : 'bg-slate-200'
                    }`}>
                      <FileText size={15} className={doc.activo ? 'text-white' : 'text-slate-400'} />
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-slate-900 text-sm leading-tight">{meta.label}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{meta.description}</p>

                      <div className="flex flex-wrap gap-4 mt-3">
                        {/* Toggle Activo */}
                        <label className="flex items-center gap-2 cursor-pointer select-none">
                          <button
                            type="button"
                            onClick={() => toggleDoc(docType, 'activo', !doc.activo)}
                            className={`relative w-10 h-5.5 rounded-full transition-colors ${
                              doc.activo ? 'bg-indigo-500' : 'bg-slate-300'
                            }`}
                            style={{ width: 40, height: 22 }}
                          >
                            <span className={`absolute top-0.5 left-0.5 w-4.5 h-4.5 rounded-full bg-white shadow transition-transform ${
                              doc.activo ? 'translate-x-[18px]' : ''
                            }`} style={{ width: 18, height: 18 }} />
                          </button>
                          <span className="text-xs font-semibold text-slate-600">
                            {doc.activo ? <Eye size={12} className="inline mr-1 text-indigo-500" /> : <EyeOff size={12} className="inline mr-1 text-slate-400" />}
                            {doc.activo ? 'Activo' : 'Inactivo'}
                          </span>
                        </label>

                        {/* Toggle Obligatorio */}
                        <label className="flex items-center gap-2 cursor-pointer select-none">
                          <button
                            type="button"
                            disabled={!doc.activo}
                            onClick={() => toggleDoc(docType, 'obligatorio', !doc.obligatorio)}
                            className={`relative rounded-full transition-colors ${
                              doc.obligatorio ? 'bg-emerald-500' : 'bg-slate-300'
                            } disabled:opacity-40 disabled:cursor-not-allowed`}
                            style={{ width: 40, height: 22 }}
                          >
                            <span className={`absolute top-0.5 left-0.5 rounded-full bg-white shadow transition-transform ${
                              doc.obligatorio ? 'translate-x-[18px]' : ''
                            }`} style={{ width: 18, height: 18 }} />
                          </button>
                          <span className="text-xs font-semibold text-slate-600">
                            <ShieldCheck size={12} className={`inline mr-1 ${doc.obligatorio ? 'text-emerald-500' : 'text-slate-400'}`} />
                            {doc.obligatorio ? 'Obligatorio' : 'Opcional'}
                          </span>
                        </label>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Error banner */}
            {saveError && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 flex items-center gap-2 text-xs text-rose-700">
                <AlertTriangle size={14} />
                {saveError}
              </div>
            )}

            {/* Actions */}
            <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={handleReset}
                disabled={saving}
                className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:border-slate-300 transition-colors disabled:opacity-50"
              >
                <RotateCcw size={14} />
                Restaurar defaults
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 px-6 rounded-xl font-bold text-sm bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-lg hover:-translate-y-0.5 transition-all disabled:opacity-50"
              >
                {saving
                  ? <><Loader2 size={15} className="animate-spin" /> Guardando...</>
                  : saved
                  ? <><CheckCircle2 size={15} /> ¡Guardado!</>
                  : <><Save size={15} /> Guardar configuración</>
                }
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
