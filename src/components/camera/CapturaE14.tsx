import { useRef, useState, useCallback } from 'react';
import { guardarFotoE14 } from '../../db/indexeddb';

/**
 * CapturaE14 - Módulo de cámara optimizado para formularios E-14
 *
 * Compresión agresiva: fotos < 200KB para transmisión en redes EDGE/2G
 * Pipeline:
 * 1. Captura desde cámara trasera (preferida para documentos)
 * 2. Redimensiona a 1200px max width
 * 3. Convierte a escala de grises (E-14 es B/N)
 * 4. Compresión JPEG progresiva hasta < 200KB
 */

const MAX_SIZE_BYTES = 200 * 1024; // 200KB

interface CapturaE14Props {
  mesaId: string;
  testigoId: string;
  deviceId: string;
  onCapturada: () => void;
}

export function CapturaE14({ mesaId, testigoId, deviceId, onCapturada }: CapturaE14Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedSize, setSavedSize] = useState<number | null>(null);

  const iniciarCamara = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment', // Cámara trasera
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setCameraActive(true);
      }
    } catch (err) {
      alert('No se pudo acceder a la cámara. Verifique los permisos.');
    }
  };

  const detenerCamara = () => {
    const video = videoRef.current;
    if (video?.srcObject) {
      (video.srcObject as MediaStream).getTracks().forEach(t => t.stop());
      video.srcObject = null;
    }
    setCameraActive(false);
  };

  /**
   * Comprime imagen progresivamente hasta estar bajo 200KB.
   * Convierte a escala de grises para E-14 (documento B/N).
   */
  const comprimirImagen = useCallback(async (canvas: HTMLCanvasElement): Promise<Blob> => {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('No canvas context');

    // Convertir a escala de grises para mejor compresión
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
      const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
      data[i] = gray;     // R
      data[i + 1] = gray; // G
      data[i + 2] = gray; // B
    }
    ctx.putImageData(imageData, 0, 0);

    // Compresión progresiva
    let quality = 0.7;
    let blob: Blob | null = null;

    while (quality >= 0.15) {
      blob = await new Promise<Blob | null>(resolve =>
        canvas.toBlob(resolve, 'image/jpeg', quality)
      );

      if (blob && blob.size <= MAX_SIZE_BYTES) break;
      quality -= 0.05;
    }

    // Si aún es muy grande, reducir resolución
    if (!blob || blob.size > MAX_SIZE_BYTES) {
      const smallCanvas = document.createElement('canvas');
      const scale = 0.6;
      smallCanvas.width = canvas.width * scale;
      smallCanvas.height = canvas.height * scale;
      const smallCtx = smallCanvas.getContext('2d')!;
      smallCtx.drawImage(canvas, 0, 0, smallCanvas.width, smallCanvas.height);

      blob = await new Promise<Blob | null>(resolve =>
        smallCanvas.toBlob(resolve, 'image/jpeg', 0.3)
      );
    }

    if (!blob) throw new Error('No se pudo comprimir la imagen');
    return blob;
  }, []);

  const capturar = async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    // Capturar frame del video
    const maxWidth = 1200;
    const scale = Math.min(1, maxWidth / video.videoWidth);
    canvas.width = video.videoWidth * scale;
    canvas.height = video.videoHeight * scale;

    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Preview
    setPreview(canvas.toDataURL('image/jpeg', 0.5));
    detenerCamara();
  };

  const guardar = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    setSaving(true);
    try {
      const blob = await comprimirImagen(canvas);
      setSavedSize(blob.size);

      await guardarFotoE14({
        id: `e14_${mesaId}_${Date.now()}`,
        mesaId,
        testigoId,
        blob,
        capturedAt: new Date().toISOString(),
        deviceId,
      });

      onCapturada();
    } catch (err) {
      alert('Error al guardar la foto');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-md mx-auto p-4">
      <div className="bg-white rounded-xl shadow-lg overflow-hidden">
        <div className="p-4">
          <h3 className="text-lg font-bold text-gray-800">Foto Formulario E-14</h3>
          <p className="text-xs text-gray-500">
            La foto se comprimirá a menos de 200KB para transmisión 2G
          </p>
        </div>

        {/* Video / Preview */}
        <div className="relative bg-black aspect-[4/3]">
          {cameraActive && (
            <video
              ref={videoRef}
              autoPlay
              playsInline
              className="w-full h-full object-cover"
            />
          )}

          {preview && !cameraActive && (
            <img src={preview} alt="E-14 capturado" className="w-full h-full object-contain" />
          )}

          {!cameraActive && !preview && (
            <div className="absolute inset-0 flex items-center justify-center text-white">
              <p className="text-sm">Presione "Abrir Cámara" para capturar el E-14</p>
            </div>
          )}
        </div>

        {/* Canvas oculto para procesamiento */}
        <canvas ref={canvasRef} className="hidden" />

        {/* Controles */}
        <div className="p-4 space-y-3">
          {!cameraActive && !preview && (
            <button
              onClick={iniciarCamara}
              className="w-full py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700"
            >
              Abrir Cámara
            </button>
          )}

          {cameraActive && (
            <button
              onClick={capturar}
              className="w-full py-3 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700"
            >
              Capturar Foto
            </button>
          )}

          {preview && (
            <div className="flex gap-3">
              <button
                onClick={() => { setPreview(null); iniciarCamara(); }}
                className="flex-1 py-3 border border-gray-300 rounded-lg font-semibold"
              >
                Repetir
              </button>
              <button
                onClick={guardar}
                disabled={saving}
                className="flex-1 py-3 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 disabled:opacity-50"
              >
                {saving ? 'Comprimiendo...' : 'Guardar'}
              </button>
            </div>
          )}

          {savedSize !== null && (
            <p className="text-center text-sm text-green-600">
              Foto guardada ({(savedSize / 1024).toFixed(0)} KB)
              {savedSize <= MAX_SIZE_BYTES ? ' — Apta para 2G' : ' — Supera límite 2G'}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
