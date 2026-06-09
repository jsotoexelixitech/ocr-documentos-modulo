import React, { useState, useRef } from 'react';
import { X, UploadCloud, Save, Trash2, Maximize } from 'lucide-react';

export interface DocumentRegion {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  internalKey: string;
}

interface Props {
  doc: { key: string; label: string; sampleImage?: string; regions?: DocumentRegion[] };
  onClose: () => void;
  onSave: (sampleImage: string | undefined, regions: DocumentRegion[]) => void;
}

export function VisualTemplateBuilder({ doc, onClose, onSave }: Props) {
  const [image, setImage] = useState<string | null>(doc.sampleImage || null);
  const [regions, setRegions] = useState<DocumentRegion[]>(doc.regions || []);
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });
  const [currentBox, setCurrentBox] = useState<{ x: number; y: number; width: number; height: number } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        // Resize image to max 1000px width/height to save database space
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        const maxSize = 1000;

        if (width > height && width > maxSize) {
          height *= maxSize / width;
          width = maxSize;
        } else if (height > maxSize) {
          width *= maxSize / height;
          height = maxSize;
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        
        // Use JPEG with 0.7 quality to keep base64 string small
        setImage(canvas.toDataURL('image/jpeg', 0.7));
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!image) return;
    // Prevent drawing if clicking on an existing region's delete button
    if ((e.target as HTMLElement).closest('button')) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setStartPos({ x, y });
    setIsDrawing(true);
    setCurrentBox({ x, y, width: 0, height: 0 });
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDrawing || !currentBox) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const currentX = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
    const currentY = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));
    
    setCurrentBox({
      x: Math.min(startPos.x, currentX),
      y: Math.min(startPos.y, currentY),
      width: Math.abs(currentX - startPos.x),
      height: Math.abs(currentY - startPos.y)
    });
  };

  const handleMouseUp = () => {
    if (isDrawing && currentBox && currentBox.width > 2 && currentBox.height > 2) {
      const label = prompt('Escribe el nombre visible del campo (ej: Nombres Completos, Placa):');
      if (label) {
        const internalKey = prompt('Escribe la clave interna para la API (ej: nombres, vehiculo_placa):') || label.toLowerCase().replace(/\s+/g, '_');
        setRegions([...regions, {
          id: Math.random().toString(36).substring(2, 9),
          ...currentBox,
          label,
          internalKey
        }]);
      }
    }
    setIsDrawing(false);
    setCurrentBox(null);
  };

  const removeRegion = (id: string) => {
    setRegions(regions.filter(r => r.id !== id));
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-6xl h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-white">
          <div>
            <h2 className="text-xl font-black text-slate-800 flex items-center gap-2">
              <Maximize className="text-indigo-600" size={24} />
              Entrenamiento Visual OCR
            </h2>
            <p className="text-sm text-slate-500 font-medium">
              Documento: <span className="text-indigo-600 font-bold">{doc.label}</span>
            </p>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 rounded-full transition-colors">
            <X size={24} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden bg-slate-50">
          
          {/* Main Drawing Area */}
          <div className="flex-1 p-6 flex flex-col items-center justify-center overflow-auto relative">
            {!image ? (
              <div 
                onClick={() => fileInputRef.current?.click()}
                className="w-full max-w-xl h-64 border-2 border-dashed border-indigo-300 rounded-3xl bg-indigo-50/50 flex flex-col items-center justify-center cursor-pointer hover:bg-indigo-50 hover:border-indigo-400 transition-all group"
              >
                <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center shadow-sm mb-4 group-hover:scale-110 transition-transform">
                  <UploadCloud size={32} className="text-indigo-500" />
                </div>
                <h3 className="text-lg font-bold text-slate-700 mb-1">Sube un ejemplo real</h3>
                <p className="text-sm text-slate-500 text-center px-8">
                  Sube una foto nítida de un "{doc.label}" para enseñarle a la IA dónde debe buscar los datos.
                </p>
                <input 
                  type="file" 
                  accept="image/*" 
                  className="hidden" 
                  ref={fileInputRef} 
                  onChange={handleImageUpload} 
                />
              </div>
            ) : (
              <div className="flex flex-col items-center w-full h-full">
                <div className="bg-indigo-100 text-indigo-700 px-4 py-2 rounded-full text-sm font-bold mb-4 shadow-sm border border-indigo-200">
                  👆 Haz clic y arrastra sobre la imagen para definir las áreas de lectura (Bounding Boxes).
                </div>
                
                <div 
                  className="relative select-none shadow-xl border-4 border-white rounded-xl overflow-hidden cursor-crosshair max-h-full"
                  onMouseDown={handleMouseDown}
                  onMouseMove={handleMouseMove}
                  onMouseUp={handleMouseUp}
                  onMouseLeave={handleMouseUp}
                  style={{ display: 'inline-block' }}
                >
                  <img src={image} alt="Template" className="max-w-full max-h-[60vh] object-contain pointer-events-none" />
                  
                  {/* Render saved regions */}
                  {regions.map(r => (
                    <div 
                      key={r.id}
                      className="absolute border-2 border-emerald-500 bg-emerald-500/20 group"
                      style={{ left: `${r.x}%`, top: `${r.y}%`, width: `${r.width}%`, height: `${r.height}%` }}
                    >
                      <div className="absolute -top-7 left-0 bg-emerald-600 text-white text-[10px] font-bold px-2 py-1 rounded shadow-sm whitespace-nowrap z-10 flex items-center gap-2">
                        {r.label}
                        <button 
                          onMouseDown={(e) => { e.stopPropagation(); removeRegion(r.id); }}
                          className="hover:text-rose-300 transition-colors"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    </div>
                  ))}

                  {/* Render current drawing box */}
                  {isDrawing && currentBox && (
                    <div 
                      className="absolute border-2 border-dashed border-indigo-500 bg-indigo-500/20"
                      style={{ 
                        left: `${currentBox.x}%`, 
                        top: `${currentBox.y}%`, 
                        width: `${currentBox.width}%`, 
                        height: `${currentBox.height}%` 
                      }}
                    />
                  )}
                </div>
                
                <button 
                  onClick={() => {
                    if (confirm('¿Estás seguro de eliminar esta imagen? Se perderán las áreas mapeadas.')) {
                      setImage(null);
                      setRegions([]);
                    }
                  }}
                  className="mt-4 text-rose-500 hover:text-rose-600 text-sm font-bold flex items-center gap-1"
                >
                  <Trash2 size={16} /> Cambiar imagen de ejemplo
                </button>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="w-full md:w-80 bg-white border-l border-slate-100 flex flex-col h-full">
            <div className="p-5 border-b border-slate-100">
              <h3 className="font-bold text-slate-800">Campos a Extraer</h3>
              <p className="text-xs text-slate-500 mt-1">
                {regions.length === 0 ? 'No has dibujado ninguna zona.' : `${regions.length} zonas configuradas.`}
              </p>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {regions.map(r => (
                <div key={r.id} className="p-3 rounded-xl border border-slate-200 bg-slate-50 relative group">
                  <p className="font-bold text-sm text-slate-800">{r.label}</p>
                  <p className="text-[10px] text-slate-500 font-mono mt-0.5">Key: {r.internalKey}</p>
                  <button 
                    onClick={() => removeRegion(r.id)}
                    className="absolute top-3 right-3 text-slate-400 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-all"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
            <div className="p-5 border-t border-slate-100 bg-slate-50">
              <button 
                onClick={() => onSave(image || undefined, regions)}
                className="w-full flex items-center justify-center gap-2 py-3 bg-gradient-to-r from-indigo-600 to-violet-600 text-white font-bold rounded-xl shadow-lg shadow-indigo-500/30 hover:-translate-y-0.5 transition-all"
              >
                <Save size={18} /> Guardar Entrenamiento
              </button>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
