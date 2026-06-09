import { useState, useEffect, useCallback } from 'react';
import { useProductConfig } from '../hooks/useProductConfig';
import { getProductId } from '../lib/product';
import {
  Settings2, FileText, RotateCcw, Save, CheckCircle2,
  AlertTriangle, Loader2, Eye, EyeOff, ShieldCheck,
  Plus, Trash2, ArrowLeftRight, ChevronUp,
} from 'lucide-react';

const EMPRESA_ID = Number(import.meta.env.VITE_EMPRESA_ID ?? 1);

// ── tipos ──────────────────────────────────────────────────────────────
interface DocField {
  key: string;
  label: string;
  activo: boolean;
  obligatorio: boolean;
}

interface ApiMapEntry {
  internalKey: string;
  externalKey: string;
  transform?: string; // 'none' | 'date_ddmmyyyy' | 'strip_prefix'
  note?: string;
}

type Tab = 'documentos' | 'mapeador';

// ── helpers ────────────────────────────────────────────────────────────
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

// ── panel principal ────────────────────────────────────────────────────
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

  // sync con config remota
  useEffect(() => {
    if (!config) return;
    // docs: admite array nuevo o objeto legacy
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
        })),
      );
    }
    setApiMap((config.apiMap as ApiMapEntry[]) ?? []);
  }, [config]);

  // ── doc handlers ───────────────────────────────────────────────────
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

  // ── api map handlers ──────────────────────────────────────────────
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

  // ── save ───────────────────────────────────────────────────────────
  async function handleSave() {
    await saveConfig({ documentos: docs, apiMap });
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  async function handleReset() {
    if (!confirm('¿Restaurar la configuración a los valores por defecto?')) return;
    await resetConfig();
    setSaved(false);
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50/30 p-6 lg:p-10">
      <div className="max-w-3xl mx-auto">

        {/* Header */}
        <div className="flex items-start justify-between gap-4 mb-6">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 grid place-items-center shadow-lg">
              <Settings2 size={18} className="text-white" />
            </div>
            <div>
              <p className="text-[0.65rem] font-black tracking-widest text-indigo-600 uppercase">Parametrizador</p>
              <h1 className="font-bold text-slate-900 text-xl leading-tight">Módulo OCR</h1>
            </div>
          </div>
          <span className="px-2.5 py-1 rounded-lg bg-indigo-100 text-indigo-700 text-xs font-bold capitalize border border-indigo-200">{producto}</span>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-slate-100 rounded-xl p-1">
          {(['documentos', 'mapeador'] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-semibold transition-colors capitalize ${tab === t ? 'bg-white shadow text-indigo-700' : 'text-slate-500 hover:text-slate-700'}`}
            >
              {t === 'documentos' ? <FileText size={14} /> : <ArrowLeftRight size={14} />}
              {t === 'documentos' ? 'Documentos' : 'Mapeador de API'}
            </button>
          ))}
        </div>

        {loadState === 'loading' && (
          <div className="flex items-center justify-center gap-3 py-20 text-slate-400">
            <Loader2 size={20} className="animate-spin" />
            <span className="text-sm">Cargando configuración...</span>
          </div>
        )}

        {loadState === 'error' && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 flex items-start gap-3 mb-4">
            <AlertTriangle size={18} className="text-amber-500 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-amber-800 text-sm">No se pudo cargar la configuración</p>
              <p className="text-amber-700 text-xs mt-1">Se está usando la configuración por defecto. Verifica que el servidor Nexus esté activo.</p>
            </div>
          </div>
        )}

        {loadState !== 'loading' && (
          <>
            {/* ── TAB: DOCUMENTOS ── */}
            {tab === 'documentos' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Documentos requeridos</p>
                  <button
                    onClick={() => setAddingDoc(v => !v)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 transition-colors"
                  >
                    {addingDoc ? <ChevronUp size={13} /> : <Plus size={13} />}
                    {addingDoc ? 'Cancelar' : 'Agregar documento'}
                  </button>
                </div>

                {/* Nuevo doc form */}
                {addingDoc && (
                  <div className="rounded-xl border-2 border-dashed border-indigo-300 bg-indigo-50/60 p-4 space-y-2">
                    <p className="text-xs font-bold text-indigo-700 mb-2">Nuevo documento</p>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] font-semibold text-slate-500 mb-1 block">Clave interna *</label>
                        <input
                          className="w-full text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 font-mono focus:border-indigo-400 outline-none"
                          placeholder="ej: partida_nacimiento"
                          value={newDoc.key}
                          onChange={e => setNewDoc(p => ({ ...p, key: e.target.value }))}
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-semibold text-slate-500 mb-1 block">Etiqueta visible *</label>
                        <input
                          className="w-full text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 focus:border-indigo-400 outline-none"
                          placeholder="ej: Partida de Nacimiento"
                          value={newDoc.label}
                          onChange={e => setNewDoc(p => ({ ...p, label: e.target.value }))}
                        />
                      </div>
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={newDoc.obligatorio} onChange={e => setNewDoc(p => ({ ...p, obligatorio: e.target.checked }))} className="rounded" />
                      <span className="text-xs text-slate-600 font-medium">Obligatorio</span>
                    </label>
                    <button onClick={addDoc} className="w-full py-2 rounded-lg bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 transition-colors">
                      ✓ Agregar
                    </button>
                  </div>
                )}

                {docs.map(doc => (
                  <div
                    key={doc.key}
                    className={`rounded-2xl border p-4 transition-all ${doc.activo ? 'border-indigo-200 bg-white shadow-sm' : 'border-slate-200 bg-slate-50/60 opacity-60'}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-xl grid place-items-center shrink-0 ${doc.activo ? 'bg-gradient-to-br from-indigo-500 to-violet-500 shadow-md' : 'bg-slate-200'}`}>
                        <FileText size={14} className={doc.activo ? 'text-white' : 'text-slate-400'} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <input
                          className="font-bold text-slate-900 text-sm bg-transparent border-b border-transparent hover:border-slate-200 focus:border-indigo-400 outline-none w-full"
                          value={doc.label}
                          onChange={e => updateDoc(doc.key, 'label', e.target.value)}
                        />
                        <p className="text-[10px] text-slate-400 font-mono">{doc.key}</p>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <Toggle on={doc.activo} onChange={v => updateDoc(doc.key, 'activo', v)} />
                          <span className="text-[10px] text-slate-500">{doc.activo ? <Eye size={11} className="inline text-indigo-500" /> : <EyeOff size={11} className="inline" />}</span>
                        </label>
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <Toggle on={doc.obligatorio} onChange={v => updateDoc(doc.key, 'obligatorio', v)} disabled={!doc.activo} />
                          <span className="text-[10px] text-slate-500"><ShieldCheck size={11} className={`inline ${doc.obligatorio ? 'text-emerald-500' : ''}`} /></span>
                        </label>
                        <button onClick={() => removeDoc(doc.key)} className="p-1.5 rounded-lg text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}

                {docs.length === 0 && (
                  <div className="text-center py-12 text-slate-400 text-sm">
                    No hay documentos configurados. Agrega el primero.
                  </div>
                )}
              </div>
            )}

            {/* ── TAB: MAPEADOR DE API ── */}
            {tab === 'mapeador' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Mapeador de campos API</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">Traduce los campos internos al formato que espera la API destino del cliente.</p>
                  </div>
                  <button
                    onClick={addMapEntry}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 transition-colors"
                  >
                    <Plus size={13} /> Agregar mapeo
                  </button>
                </div>

                {apiMap.length === 0 && (
                  <div className="text-center py-12 text-slate-400 text-sm rounded-xl border-2 border-dashed border-slate-200">
                    No hay mapeos configurados. Los campos se enviarán con el nombre interno.
                  </div>
                )}

                {apiMap.map((entry, idx) => (
                  <div key={idx} className="rounded-xl border border-slate-200 bg-white p-4 grid grid-cols-[1fr_1fr_auto_auto] gap-3 items-end shadow-sm">
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 block mb-1">Campo interno</label>
                      <select
                        className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:border-indigo-400 outline-none bg-white font-mono"
                        value={entry.internalKey}
                        onChange={e => updateMapEntry(idx, 'internalKey', e.target.value)}
                      >
                        <option value="">— Seleccionar —</option>
                        {docs.map(d => <option key={d.key} value={d.key}>{d.label} ({d.key})</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 block mb-1">Campo en API destino</label>
                      <input
                        className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:border-indigo-400 outline-none font-mono"
                        placeholder="ej: ccedula"
                        value={entry.externalKey}
                        onChange={e => updateMapEntry(idx, 'externalKey', e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 block mb-1">Transformación</label>
                      <select
                        className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:border-indigo-400 outline-none bg-white"
                        value={entry.transform ?? 'none'}
                        onChange={e => updateMapEntry(idx, 'transform', e.target.value)}
                      >
                        <option value="none">Sin transformar</option>
                        <option value="date_ddmmyyyy">Fecha DD/MM/YYYY</option>
                        <option value="date_yyyymmdd">Fecha YYYY-MM-DD</option>
                        <option value="strip_prefix">Quitar +58</option>
                        <option value="uppercase">MAYÚSCULAS</option>
                        <option value="lowercase">minúsculas</option>
                      </select>
                    </div>
                    <button onClick={() => removeMapEntry(idx)} className="p-2 rounded-lg text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors self-end">
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* ── Actions ── */}
            {saveError && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 flex items-center gap-2 text-xs text-rose-700 mt-4">
                <AlertTriangle size={14} />{saveError}
              </div>
            )}
            <div className="flex flex-col sm:flex-row gap-3 pt-5 mt-5 border-t border-slate-100">
              <button
                onClick={handleReset}
                disabled={saving}
                className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:border-slate-300 transition-colors disabled:opacity-50"
              >
                <RotateCcw size={14} /> Restaurar defaults
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 px-6 rounded-xl font-bold text-sm bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-lg hover:-translate-y-0.5 transition-all disabled:opacity-50"
              >
                {saving ? <><Loader2 size={15} className="animate-spin" /> Guardando...</> : saved ? <><CheckCircle2 size={15} /> ¡Guardado!</> : <><Save size={15} /> Guardar configuración</>}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
