import { useRef, useState, useCallback } from 'react';

/**
 * CapturaE14 — Captura de foto con pipeline de compresión optimizado para E-14
 *
 * Pipeline:
 * 1. File input con capture="environment" (cámara trasera, máxima compatibilidad en PWA)
 * 2. Canvas resize a max 1200px
 * 3. Conversión a escala de grises (E-14 es documento B/N → mejor compresión)
 * 4. Compresión JPEG progresiva hasta < 200KB
 * 5. Si aún supera 200KB: reducción de resolución al 60%
 *
 * Interfaz idéntica a CapturaFoto para intercambio directo.
 * La compresión se hace en el cliente antes de guardar/enviar.
 */

const MAX_SIZE_BYTES = 200 * 1024; // 200 KB — apto para transmisión 2G/EDGE

interface CapturaE14Props {
  onFotoCapturada: (blob: Blob, preview: string) => void;
  onEliminar?: () => void;
  fotoPreview?: string | null;
  disabled?: boolean;
}

export function CapturaE14({
  onFotoCapturada,
  onEliminar,
  fotoPreview,
  disabled = false,
}: CapturaE14Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [procesando, setProcesando] = useState(false);
  const [infoCompresion, setInfoCompresion] = useState<{
    original: number;
    final: number;
  } | null>(null);

  /**
   * Comprime la imagen en canvas:
   * - Escala de grises (reduce tamaño ~40% vs color para docs B/N)
   * - JPEG progresivo hasta < 200KB
   * - Fallback: reducción de resolución al 60%
   */
  const comprimirImagen = useCallback(
    async (imageBitmap: ImageBitmap, originalSize: number): Promise<Blob> => {
      const maxWidth = 1200;
      const scale = Math.min(1, maxWidth / imageBitmap.width);

      const canvas = document.createElement('canvas');
      canvas.width = Math.round(imageBitmap.width * scale);
      canvas.height = Math.round(imageBitmap.height * scale);

      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(imageBitmap, 0, 0, canvas.width, canvas.height);

      // Conversión a escala de grises — mejora compresión ~30-40% en documentos
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const d = imageData.data;
      for (let i = 0; i < d.length; i += 4) {
        const gray = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
        d[i] = gray;
        d[i + 1] = gray;
        d[i + 2] = gray;
        // d[i+3] (alpha) sin cambio
      }
      ctx.putImageData(imageData, 0, 0);

      // Compresión JPEG progresiva
      let quality = 0.75;
      let blob: Blob | null = null;

      while (quality >= 0.15) {
        blob = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob(resolve, 'image/jpeg', quality),
        );
        if (blob && blob.size <= MAX_SIZE_BYTES) break;
        quality -= 0.05;
      }

      // Fallback: reducir resolución al 60% si aún supera límite
      if (!blob || blob.size > MAX_SIZE_BYTES) {
        const smallCanvas = document.createElement('canvas');
        smallCanvas.width = Math.round(canvas.width * 0.6);
        smallCanvas.height = Math.round(canvas.height * 0.6);
        const smallCtx = smallCanvas.getContext('2d')!;
        smallCtx.drawImage(canvas, 0, 0, smallCanvas.width, smallCanvas.height);
        blob = await new Promise<Blob | null>((resolve) =>
          smallCanvas.toBlob(resolve, 'image/jpeg', 0.3),
        );
      }

      if (!blob) throw new Error('No se pudo comprimir la imagen');

      setInfoCompresion({ original: originalSize, final: blob.size });
      return blob;
    },
    [],
  );

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setProcesando(true);
    setInfoCompresion(null);

    try {
      const originalSize = file.size;

      // Crear ImageBitmap para procesamiento en canvas
      const imageBitmap = await createImageBitmap(file);
      const blob = await comprimirImagen(imageBitmap, originalSize);
      imageBitmap.close();

      const preview = URL.createObjectURL(blob);
      onFotoCapturada(blob, preview);
    } catch (error) {
      console.error('[CapturaE14] Error al procesar imagen:', error);
      alert('Error al procesar la imagen. Intenta nuevamente.');
    } finally {
      setProcesando(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const formatKB = (bytes: number) => `${Math.round(bytes / 1024)} KB`;

  // ─── Preview de foto capturada ────────────────────────────────

  if (fotoPreview) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <div className="w-1 h-5 bg-editorial-red rounded-full" />
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">
            Foto del E-14
          </p>
        </div>

        <div className="relative rounded-2xl overflow-hidden border-2 border-green-400/60 shadow-xl">
          <img
            src={fotoPreview}
            alt="Formulario E-14"
            className="w-full h-auto object-cover"
            style={{ filter: 'grayscale(100%)' }} // Visual hint de que es B/N
          />

          <div className="absolute top-3 left-3 flex flex-col gap-1.5">
            <div className="px-3 py-1.5 bg-green-500 rounded-full shadow-lg">
              <p className="text-xs font-black text-white flex items-center gap-1.5">
                <span>✓</span>
                <span>Foto capturada</span>
              </p>
            </div>
            {infoCompresion && (
              <div className="px-2 py-1 bg-black/70 backdrop-blur-sm rounded-full">
                <p className="text-[10px] font-bold text-white">
                  {formatKB(infoCompresion.original)} → {formatKB(infoCompresion.final)}
                  {infoCompresion.final <= MAX_SIZE_BYTES ? ' ⚡ 2G' : ''}
                </p>
              </div>
            )}
          </div>
        </div>

        {!disabled && onEliminar && (
          <button
            type="button"
            onClick={onEliminar}
            className="w-full py-3 px-4 bg-gradient-to-br from-red-50 to-red-100 border-2 border-red-300 text-red-700 rounded-xl font-bold text-sm uppercase tracking-wide hover:shadow-lg active:scale-95 transition-all flex items-center justify-center gap-2"
          >
            <span className="text-lg">🗑️</span>
            <span>Volver a tomar foto</span>
          </button>
        )}
      </div>
    );
  }

  // ─── Botón de captura ────────────────────────────────────────

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="w-1 h-5 bg-editorial-red rounded-full" />
        <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">
          Foto del E-14 (Opcional)
        </p>
      </div>

      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        disabled={disabled || procesando}
        className="relative w-full overflow-hidden rounded-2xl py-6 border-2 border-dashed border-gray-300 hover:border-editorial-red/50 bg-gradient-to-br from-gray-50 to-white hover:from-editorial-red/5 hover:to-red-50 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed group"
      >
        <div className="relative flex flex-col items-center gap-3">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-editorial-red to-red-700 shadow-xl flex items-center justify-center group-hover:scale-110 transition-transform">
            {procesando ? (
              <div className="w-7 h-7 border-3 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <span className="text-3xl">📷</span>
            )}
          </div>

          <div className="text-center">
            <p className="text-base font-black text-gray-800 group-hover:text-editorial-red transition-colors">
              {procesando ? 'Comprimiendo imagen...' : 'Tomar foto del E-14'}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              {procesando
                ? 'Optimizando para transmisión 2G'
                : 'Compresión automática < 200 KB · Escala de grises'}
            </p>
          </div>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFileChange}
          className="hidden"
          disabled={disabled || procesando}
        />
      </button>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
        <p className="text-xs text-blue-700 leading-relaxed">
          <span className="font-bold">💡 Consejo:</span> Asegúrate de que toda el acta sea
          legible. La foto se comprime automáticamente para funcionar en zonas con señal 2G/EDGE.
        </p>
      </div>
    </div>
  );
}
