import { useRef, useState, useCallback } from 'react';

const MAX_SIZE_BYTES = 200 * 1024;

interface Foto {
  orden: number;
  blob: Blob;
  preview: string;
}

interface CapturaMultipleE14Props {
  onFotosListas: (fotos: { orden: number; blob: Blob }[]) => void;
  disabled?: boolean;
  /** Custom label for the submit button. Defaults to "Enviar N fotos para OCR" */
  submitLabel?: string;
  /** Custom title for the header. Defaults to "Fotos del E-14 para OCR" */
  title?: string;
}

export function CapturaMultipleE14({ onFotosListas, disabled = false, submitLabel, title }: CapturaMultipleE14Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fotos, setFotos] = useState<Foto[]>([]);
  const [procesando, setProcesando] = useState(false);

  // Same compression function as CapturaE14.tsx
  const comprimirImagen = useCallback(async (imageBitmap: ImageBitmap): Promise<Blob> => {
    const maxWidth = 1200;
    const scale = Math.min(1, maxWidth / imageBitmap.width);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(imageBitmap.width * scale);
    canvas.height = Math.round(imageBitmap.height * scale);
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(imageBitmap, 0, 0, canvas.width, canvas.height);

    // Grayscale
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const d = imageData.data;
    for (let i = 0; i < d.length; i += 4) {
      const gray = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
      d[i] = d[i + 1] = d[i + 2] = gray;
    }
    ctx.putImageData(imageData, 0, 0);

    let quality = 0.75;
    let blob: Blob | null = null;
    while (quality >= 0.15) {
      blob = await new Promise<Blob | null>(res => canvas.toBlob(res, 'image/jpeg', quality));
      if (blob && blob.size <= MAX_SIZE_BYTES) break;
      quality -= 0.05;
    }
    if (!blob || blob.size > MAX_SIZE_BYTES) {
      const small = document.createElement('canvas');
      small.width = Math.round(canvas.width * 0.6);
      small.height = Math.round(canvas.height * 0.6);
      small.getContext('2d')!.drawImage(canvas, 0, 0, small.width, small.height);
      blob = await new Promise<Blob | null>(res => small.toBlob(res, 'image/jpeg', 0.3));
    }
    if (!blob) throw new Error('No se pudo comprimir la imagen');
    return blob;
  }, []);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setProcesando(true);
    try {
      const bmp = await createImageBitmap(file);
      const blob = await comprimirImagen(bmp);
      bmp.close();
      const preview = URL.createObjectURL(blob);
      setFotos(prev => {
        const next = [...prev, { orden: prev.length + 1, blob, preview }];
        return next;
      });
    } catch {
      alert('Error al procesar la imagen. Intenta nuevamente.');
    } finally {
      setProcesando(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const moverFoto = (idx: number, dir: -1 | 1) => {
    setFotos(prev => {
      const arr = [...prev];
      const target = idx + dir;
      if (target < 0 || target >= arr.length) return arr;
      [arr[idx], arr[target]] = [arr[target], arr[idx]];
      return arr.map((f, i) => ({ ...f, orden: i + 1 }));
    });
  };

  const eliminarFoto = (idx: number) => {
    setFotos(prev => prev.filter((_, i) => i !== idx).map((f, i) => ({ ...f, orden: i + 1 })));
  };

  const handleEnviar = () => {
    onFotosListas(fotos.map(f => ({ orden: f.orden, blob: f.blob })));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="w-1 h-5 bg-editorial-red rounded-full" />
        <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">
          {title ?? 'Fotos del E-14 para OCR'} ({fotos.length} foto{fotos.length !== 1 ? 's' : ''})
        </p>
      </div>

      {/* Grid de fotos */}
      {fotos.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          {fotos.map((foto, idx) => (
            <div key={idx} className="relative rounded-xl overflow-hidden border-2 border-gray-200 bg-gray-50">
              <img
                src={foto.preview}
                alt={`Pagina ${foto.orden}`}
                className="w-full h-28 object-cover"
                style={{ filter: 'grayscale(100%)' }}
              />
              <div className="absolute top-1.5 left-1.5 w-6 h-6 bg-editorial-red rounded-full flex items-center justify-center">
                <span className="text-white text-xs font-black">{foto.orden}</span>
              </div>
              <div className="absolute bottom-0 inset-x-0 bg-black/50 flex justify-between items-center p-1">
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => moverFoto(idx, -1)}
                    disabled={idx === 0}
                    className="text-white text-xs px-1.5 py-0.5 rounded bg-white/20 disabled:opacity-30"
                  >^</button>
                  <button
                    type="button"
                    onClick={() => moverFoto(idx, 1)}
                    disabled={idx === fotos.length - 1}
                    className="text-white text-xs px-1.5 py-0.5 rounded bg-white/20 disabled:opacity-30"
                  >v</button>
                </div>
                <button
                  type="button"
                  onClick={() => eliminarFoto(idx)}
                  className="text-red-300 text-xs px-1.5 py-0.5 rounded bg-white/20"
                >X</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Boton agregar */}
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        disabled={disabled || procesando}
        className="w-full py-4 border-2 border-dashed border-gray-300 rounded-2xl hover:border-editorial-red/50 bg-gray-50 hover:bg-editorial-red/5 transition-all flex items-center justify-center gap-3 disabled:opacity-50"
      >
        {procesando ? (
          <div className="w-5 h-5 border-2 border-editorial-red border-t-transparent rounded-full animate-spin" />
        ) : (
          <span className="text-2xl">+</span>
        )}
        <span className="font-bold text-gray-700 text-sm">
          {procesando ? 'Comprimiendo...' : fotos.length === 0 ? 'Tomar primera foto' : 'Agregar otra foto'}
        </span>
      </button>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileChange}
        className="hidden"
        disabled={disabled || procesando}
      />

      {/* Boton enviar */}
      {fotos.length > 0 && (
        <button
          type="button"
          onClick={handleEnviar}
          disabled={disabled || procesando}
          className="w-full py-4 bg-gradient-to-br from-editorial-red to-red-700 text-white rounded-2xl font-black text-sm uppercase tracking-wide shadow-xl hover:shadow-2xl active:scale-95 transition-all disabled:opacity-50"
        >
          {submitLabel ?? `Enviar ${fotos.length} foto${fotos.length !== 1 ? 's' : ''} para OCR`}
        </button>
      )}

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
        <p className="text-xs text-blue-700 leading-relaxed">
          <span className="font-bold">Consejo:</span> Toma una foto por seccion del acta.
          Puedes reordenarlas antes de enviar. El sistema las procesara automaticamente.
        </p>
      </div>
    </div>
  );
}
