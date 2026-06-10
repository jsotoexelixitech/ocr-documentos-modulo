import { useState, useEffect, useCallback } from 'react';
import { useProductConfig } from '../hooks/useProductConfig';
import { getProductId } from '../lib/product';
import {
  Settings2, FileText, RotateCcw, Save, CheckCircle2,
  AlertTriangle, Loader2, Plus, Trash2, ArrowLeftRight, ChevronUp, Sparkles, Maximize
} from 'lucide-react';
import { AuroraBackground } from '../components/AuroraBackground';
import { VisualTemplateBuilder } from './VisualTemplateBuilder';

const EMPRESA_ID = Number(import.meta.env.VITE_EMPRESA_ID ?? 1);

interface DocField {
  key: string;
  label: string;
  activo: boolean;
  obligatorio: boolean;
  sampleImage?: string;
  regions?: any[];
}

interface ApiMapEntry {
  internalKey: string;
  externalKey: string;
  transform?: string;
  note?: string;
}

type Tab = 'documentos' | 'mapeador';

function Toggle({ on, onChange, disabled }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={`relative rounded-full transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${on ? 'bg-indigo-500' : 'bg-slate-300'}`}
      style={{ width: 40, height: 22 }}
    >
      <span className={`absolute top-0.5 left-0.5 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-[18px]' : ''}`} style={{ width: 18, height: 18 }} />
    </button>
  );
}

export function OcrConfigPanel() {
  const producto = getProductId();

  const { config, loadState, saving, saveError, saveConfig, resetConfig } =
    useProductConfig(EMPRESA_ID, producto, 'ocr');

  const [docs, setDocs] = useState<DocField[]>([]);
  const [apiMap, setApiMap] = useState<ApiMapEntry[]>([]);
  const [tab, setTab] = useState<Tab>('documentos');
  const [saved, setSaved] = useState(false);
  const [newDoc, setNewDoc] = useState({ key: '', label: '', obligatorio: false });
  const [addingDoc, setAddingDoc] = useState(false);
  const [escaneoLoteBeneficiarios, setEscaneoLoteBeneficiarios] = useState(false);
  const [validarVigencia, setValidarVigencia] = useState(true);
  const [editingDocTemplate, setEditingDocTemplate] = useState<string | null>(null);

  useEffect(() => {
    if (!config) return;
    const raw = config.documentos;
    if (Array.isArray(raw)) {
      setDocs(raw as DocField[]);
    } else if (raw && typeof raw === 'object') {
      setDocs(
        Object.entries(raw as Record<string, any>).map(([key, v]) => ({
          key,
          label: v.label ?? key,
          activo: !!v.activo,
          obligatorio: !!v.obligatorio,
          sampleImage: v.sampleImage,
          regions: v.regions,
        })),
      );
    }
    setApiMap((config.apiMap as ApiMapEntry[]) ?? []);
    setEscaneoLoteBeneficiarios(config.escaneoLoteBeneficiarios ?? false);
    setValidarVigencia(config.validarVigencia ?? true);
  }, [config]);

  const updateDoc = useCallback((key: string, field: keyof DocField, val: any) => {
    setDocs(prev =>
      prev.map(d => {
        if (d.key !== key) return d;
        const next = { ...d, [field]: val };
        if (field === 'activo' && !val) next.obligatorio = false;
        if (field === 'obligatorio' && val) next.activo = true;
        return next;
      }),
    );
    setSaved(false);
  }, []);

  const removeDoc = (key: string) => {
    setDocs(prev => prev.filter(d => d.key !== key));
    setSaved(false);
  };

  const addDoc = () => {
    const key = newDoc.key.trim().toLowerCase().replace(/\s+/g, '_');
    if (!key || !newDoc.label.trim()) return;
    if (docs.find(d => d.key === key)) return;
    setDocs(prev => [...prev, { key, label: newDoc.label.trim(), activo: true, obligatorio: newDoc.obligatorio }]);
    setNewDoc({ key: '', label: '', obligatorio: false });
    setAddingDoc(false);
    setSaved(false);
  };

  const addMapEntry = () => {
    setApiMap(prev => [...prev, { internalKey: '', externalKey: '', transform: 'none', note: '' }]);
    setSaved(false);
  };

  const updateMapEntry = (idx: number, field: keyof ApiMapEntry, val: string) => {
    setApiMap(prev => prev.map((e, i) => i === idx ? { ...e, [field]: val } : e));
    setSaved(false);
  };

  const removeMapEntry = (idx: number) => {
    setApiMap(prev => prev.filter((_, i) => i !== idx));
    setSaved(false);
  };

  async function handleSave() {
    await saveConfig({ documentos: docs, apiMap, escaneoLoteBeneficiarios, validarVigencia });
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  return (
    <div className="min-h-screen relative">
      <AuroraBackground />

      <div className="pt-[40px] px-4 sm:px-6 lg:px-10 pb-12 w-full max-w-5xl mx-auto relative z-10">
        <header className="mb-8 animate-fade-in">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="min-w-0">
              <p className="text-[0.68rem] font-black tracking-[0.22em] text-indigo-500 uppercase mb-2 inline-flex items-center gap-1.5">
                <Sparkles size={11} className="text-indigo-500" />
                PARAMETRIZADOR · {producto}
              </p>
              <h1 className="font-display text-3xl sm:text-[2.5rem] font-black text-slate-900 tracking-tight leading-tight">
                Módulo OCR
              </h1>
              <p className="text-slate-500 text-sm mt-2 max-w-xl leading-relaxed">
                Configura los documentos requeridos para extracción automática y mapeo a la API.
              </p>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 grid place-items-center shadow-lg shadow-indigo-500/20">
              <Settings2 size={24} className="text-white" />
            </div>
          </div>
        </header>

        <section className="bg-white/80 backdrop-blur-xl border border-white/40 shadow-xl rounded-3xl overflow-hidden animate-fade-in">
          <div className="p-6 sm:p-8 lg:p-10">
            {/* Tabs */}
            <div className="flex flex-col sm:flex-row gap-2 mb-8 bg-slate-100/50 p-1.5 rounded-xl border border-slate-200/50 backdrop-blur-sm">
              {([['documentos', 'Documentos', FileText], ['mapeador', 'Mapeador API', ArrowLeftRight]] as const).map(([t, label, Icon]) => (
                <button
                  key={t}
                  onClick={() => setTab(t as Tab)}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-bold transition-all ${tab === t ? 'bg-white shadow-sm text-indigo-700' : 'text-slate-500 hover:text-slate-700 hover:bg-white/50'}`}
                >
                  <Icon size={15} />{label}
                </button>
              ))}
            </div>

            {loadState === 'loading' && (
              <div className="flex items-center justify-center gap-3 py-20 text-slate-400">
                <Loader2 size={20} className="animate-spin" /><span className="text-sm">Cargando configuración...</span>
              </div>
            )}

            {loadState === 'error' && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 flex items-start gap-3 mb-4">
                <AlertTriangle size={18} className="text-amber-500 shrink-0 mt-0.5" />
                <p className="text-amber-700 text-sm font-medium">No se pudo cargar la configuración. Se usan los valores por defecto.</p>
              </div>
            )}

            {loadState !== 'loading' && (
              <>
                {/* ── TAB DOCUMENTOS ── */}
                {tab === 'documentos' && (
                  <div className="space-y-4">
                    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-4 mb-6">
                      {producto === 'rcv' && (
                        <label className="flex items-start gap-3 cursor-pointer p-2 rounded-xl hover:bg-slate-50 transition-colors">
                          <input type="checkbox" checked={validarVigencia} onChange={e => { setValidarVigencia(e.target.checked); setSaved(false); }} className="rounded w-5 h-5 text-indigo-600 focus:ring-indigo-500 border-slate-300 mt-0.5" />
                          <div>
                            <span className="text-sm text-slate-800 font-bold block mb-1">Validar vigencia de carnet</span>
                            <span className="text-xs text-slate-500">Rechazar automáticamente carnets de circulación vencidos durante la extracción OCR.</span>
                          </div>
                        </label>
                      )}
                      {producto === 'funerario' && (
                        <label className="flex items-start gap-3 cursor-pointer p-2 rounded-xl hover:bg-slate-50 transition-colors">
                          <input type="checkbox" checked={escaneoLoteBeneficiarios} onChange={e => { setEscaneoLoteBeneficiarios(e.target.checked); setSaved(false); }} className="rounded w-5 h-5 text-indigo-600 focus:ring-indigo-500 border-slate-300 mt-0.5" />
                          <div>
                            <span className="text-sm text-slate-800 font-bold block mb-1">Escaneo en lote (Beneficiarios)</span>
                            <span className="text-xs text-slate-500">Permitir a los usuarios escanear múltiples cédulas consecutivamente para registrar a su grupo familiar.</span>
                          </div>
                        </label>
                      )}
                    </div>

                    <div className="flex items-center justify-between mb-4">
                      <p className="text-xs font-black text-slate-500 uppercase tracking-widest">Documentos OCR</p>
                      <button onClick={() => setAddingDoc(v => !v)} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600/10 text-indigo-700 text-xs font-bold hover:bg-indigo-600/20 transition-colors">
                        {addingDoc ? <ChevronUp size={14} /> : <Plus size={14} />}{addingDoc ? 'Cancelar' : 'Agregar documento'}
                      </button>
                    </div>

                    {addingDoc && (
                      <div className="rounded-2xl border border-indigo-200 bg-indigo-50/50 p-5 space-y-4 mb-4 animate-fade-in shadow-inner">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <label className="text-[11px] font-bold text-slate-500 block mb-1.5">Clave *</label>
                            <input className="w-full text-sm border border-indigo-100 rounded-xl px-3 py-2 font-mono outline-none focus:border-indigo-400 bg-white" placeholder="ej: cedula_identidad" value={newDoc.key} onChange={e => setNewDoc(p => ({ ...p, key: e.target.value }))} />
                          </div>
                          <div>
                            <label className="text-[11px] font-bold text-slate-500 block mb-1.5">Etiqueta visible *</label>
                            <input className="w-full text-sm border border-indigo-100 rounded-xl px-3 py-2 outline-none focus:border-indigo-400 bg-white" placeholder="ej: Cédula de Identidad" value={newDoc.label} onChange={e => setNewDoc(p => ({ ...p, label: e.target.value }))} />
                          </div>
                        </div>
                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mt-2">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" checked={newDoc.obligatorio} onChange={e => setNewDoc(p => ({ ...p, obligatorio: e.target.checked }))} className="rounded w-4 h-4 text-indigo-600 focus:ring-indigo-500 border-slate-300" />
                            <span className="text-sm text-slate-700 font-medium">Documento obligatorio</span>
                          </label>
                          <button onClick={addDoc} className="w-full sm:w-auto px-6 py-2 rounded-xl bg-indigo-600 text-white text-sm font-bold shadow-md hover:bg-indigo-700 hover:shadow-lg transition-all">✓ Guardar</button>
                        </div>
                      </div>
                    )}

                    <div className="space-y-3">
                      {docs.map(doc => (
                        <div key={doc.key} className={`rounded-2xl border p-4 flex flex-col md:flex-row md:items-center gap-4 transition-all duration-300 ${doc.activo ? 'border-slate-200 bg-white shadow-sm hover:shadow-md' : 'border-slate-200/50 bg-slate-50/50 opacity-60'}`}>
                          <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center shrink-0 hidden md:flex">
                            <FileText size={18} className={doc.activo ? 'text-indigo-500' : 'text-slate-400'} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <input
                              className="font-bold text-slate-800 text-base bg-transparent border-b border-transparent hover:border-slate-200 focus:border-indigo-400 outline-none w-full pb-0.5"
                              value={doc.label}
                              onChange={e => updateDoc(doc.key, 'label', e.target.value)}
                            />
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-xs text-slate-400 font-mono">{doc.key}</span>
                              {doc.regions && doc.regions.length > 0 && (
                                <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-bold">
                                  {doc.regions.length} zonas IA
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-4 shrink-0 bg-slate-50 px-4 py-2 rounded-xl border border-slate-100 w-full md:w-auto overflow-x-auto justify-between md:justify-end">
                            <button 
                              onClick={() => setEditingDocTemplate(doc.key)}
                              className="px-3 py-1.5 bg-indigo-100 text-indigo-700 text-[11px] font-bold rounded-lg hover:bg-indigo-200 transition-colors flex items-center gap-1.5"
                            >
                              <Maximize size={12} /> Entrenar IA
                            </button>
                            <div className="w-px h-8 bg-slate-200" />
                            <div className="flex flex-col items-center gap-1">
                              <span className="text-[9px] font-bold text-slate-400 uppercase">Activo</span>
                              <Toggle on={doc.activo} onChange={v => updateDoc(doc.key, 'activo', v)} />
                            </div>
                            <div className="w-px h-8 bg-slate-200" />
                            <div className="flex flex-col items-center gap-1">
                              <span className="text-[9px] font-bold text-slate-400 uppercase">Oblig.</span>
                              <Toggle on={doc.obligatorio} onChange={v => updateDoc(doc.key, 'obligatorio', v)} disabled={!doc.activo} />
                            </div>
                            <div className="w-px h-8 bg-slate-200" />
                            <button onClick={() => removeDoc(doc.key)} className="p-2 rounded-lg text-rose-400 hover:bg-rose-50 hover:text-rose-600 transition-colors">
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* ── TAB MAPEADOR ── */}
                {tab === 'mapeador' && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <p className="text-xs font-black text-slate-500 uppercase tracking-widest">Mapeador de campos API</p>
                        <p className="text-xs text-slate-400 mt-1">Traduce los campos leídos a la API destino.</p>
                      </div>
                      <button onClick={addMapEntry} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600/10 text-indigo-700 text-xs font-bold hover:bg-indigo-600/20 transition-colors">
                        <Plus size={14} /> Nueva regla
                      </button>
                    </div>

                    {apiMap.length === 0 && (
                      <div className="text-center py-12 text-slate-400 text-sm rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50">
                        No hay mapeos.
                      </div>
                    )}

                    <div className="space-y-3">
                      {apiMap.map((entry, idx) => (
                        <div key={idx} className="rounded-2xl border border-slate-200 bg-white p-4 grid grid-cols-1 md:grid-cols-[1fr_1fr_auto_auto] gap-4 items-end shadow-sm hover:shadow-md transition-shadow">
                          <div>
                            <label className="text-[11px] font-bold text-slate-500 block mb-1.5">Campo origen</label>
                            <input className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 font-mono outline-none focus:border-indigo-400" placeholder="ej: doc_number" value={entry.internalKey} onChange={e => updateMapEntry(idx, 'internalKey', e.target.value)} />
                          </div>
                          <div>
                            <label className="text-[11px] font-bold text-slate-500 block mb-1.5">Campo destino (API)</label>
                            <input className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 font-mono outline-none focus:border-indigo-400" placeholder="ej: p_cedula" value={entry.externalKey} onChange={e => updateMapEntry(idx, 'externalKey', e.target.value)} />
                          </div>
                          <div>
                            <label className="text-[11px] font-bold text-slate-500 block mb-1.5">Transformación</label>
                            <select className="text-sm border border-slate-200 rounded-xl px-3 py-2 bg-white outline-none focus:border-indigo-400" value={entry.transform ?? 'none'} onChange={e => updateMapEntry(idx, 'transform', e.target.value)}>
                              <option value="none">Ninguna</option>
                              <option value="date_ddmmyyyy">Fecha DD/MM/YYYY</option>
                              <option value="strip_prefix">Quitar prefijos</option>
                            </select>
                          </div>
                          <button onClick={() => removeMapEntry(idx)} className="p-2.5 rounded-xl text-rose-400 hover:bg-rose-50 hover:text-rose-600 transition-colors">
                            <Trash2 size={16} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {loadState !== 'loading' && (
            <div className="px-6 sm:px-8 lg:px-10 py-5 bg-slate-50/80 border-t border-slate-100 backdrop-blur-sm flex flex-col sm:flex-row items-center justify-between gap-4">
              {saveError && (
                <div className="w-full sm:w-auto flex items-center gap-2 text-xs text-rose-600 bg-rose-50 px-4 py-2 rounded-xl">
                  <AlertTriangle size={14} />{saveError}
                </div>
              )}
              <div className="flex gap-3 w-full sm:w-auto sm:ml-auto">
                <button onClick={() => { if (confirm('¿Restaurar originales?')) resetConfig(); }} disabled={saving} className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-bold text-slate-600 hover:border-slate-300 hover:bg-slate-50 transition-all disabled:opacity-50 shadow-sm">
                  <RotateCcw size={15} /> Restaurar defaults
                </button>
                <button onClick={handleSave} disabled={saving} className="flex-1 sm:flex-none flex items-center justify-center gap-2 py-2.5 px-8 rounded-xl font-bold text-sm bg-indigo-600 text-white shadow-lg shadow-indigo-600/20 hover:bg-indigo-700 hover:-translate-y-0.5 transition-all disabled:opacity-50">
                  {saving ? <><Loader2 size={16} className="animate-spin" /> Guardando...</> : saved ? <><CheckCircle2 size={16} /> ¡Guardado!</> : <><Save size={16} /> Guardar cambios</>}
                </button>
              </div>
            </div>
          )}
        </section>
      </div>

      {editingDocTemplate && (
        <VisualTemplateBuilder
          doc={docs.find(d => d.key === editingDocTemplate)!}
          onClose={() => setEditingDocTemplate(null)}
          onSave={(sampleImage, regions) => {
            updateDoc(editingDocTemplate, 'sampleImage', sampleImage);
            updateDoc(editingDocTemplate, 'regions', regions);
            setEditingDocTemplate(null);
          }}
        />
      )}
    </div>
  );
}
