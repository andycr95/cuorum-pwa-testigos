/**
 * Componente para capturar fotos del E-14
 * Optimizado para móviles con acceso directo a la cámara
 */

import { useState, useRef } from 'react';

interface CapturaFotoProps {
  onFotoCapturada: (blob: Blob, preview: string) => void;
  onEliminar?: () => void;
  fotoPreview?: string | null;
  disabled?: boolean;
}

export function CapturaFoto({
  onFotoCapturada,
  onEliminar,
  fotoPreview,
  disabled = false,
}: CapturaFotoProps) {
  const [capturando, setCapturando] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setCapturando(true);

    try {
      // Convertir a Blob
      const blob = new Blob([await file.arrayBuffer()], { type: file.type });

      // Crear preview
      const preview = URL.createObjectURL(blob);

      onFotoCapturada(blob, preview);
    } catch (error) {
      console.error('[CapturaFoto] Error al procesar imagen:', error);
      alert('Error al procesar la imagen. Intenta nuevamente.');
    } finally {
      setCapturando(false);
      // Reset input para permitir capturar la misma foto otra vez
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleCapturar = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="space-y-3">
      {/* Título de la sección */}
      <div className="flex items-center gap-2">
        <div className="w-1 h-5 bg-editorial-red rounded-full"></div>
        <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">
          Foto del E-14 (Opcional)
        </p>
      </div>

      {/* Preview o botón de captura */}
      {fotoPreview ? (
        <div className="relative">
          {/* Preview de la foto */}
          <div className="relative rounded-2xl overflow-hidden border-3 border-editorial-red/30 shadow-xl">
            <img
              src={fotoPreview}
              alt="Formulario E-14"
              className="w-full h-auto object-cover"
            />

            {/* Badge superior */}
            <div className="absolute top-3 left-3 px-3 py-1.5 bg-green-500 rounded-full shadow-lg">
              <p className="text-xs font-black text-white uppercase tracking-wide flex items-center gap-1.5">
                <span>✓</span>
                <span>Foto capturada</span>
              </p>
            </div>
          </div>

          {/* Botón eliminar */}
          {!disabled && onEliminar && (
            <button
              type="button"
              onClick={onEliminar}
              className="mt-3 w-full py-3 px-4 bg-gradient-to-br from-red-50 to-red-100 border-2 border-red-300 text-red-700 rounded-xl font-bold text-sm uppercase tracking-wide hover:shadow-lg active:scale-95 transition-all flex items-center justify-center gap-2"
            >
              <span className="text-lg">🗑️</span>
              <span>Eliminar foto</span>
            </button>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={handleCapturar}
          disabled={disabled || capturando}
          className="relative w-full overflow-hidden rounded-2xl py-6 border-3 border-dashed border-gray-300 hover:border-editorial-red/50 bg-gradient-to-br from-gray-50 to-white hover:from-editorial-red/5 hover:to-red-50 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed group"
        >
          {/* Patrón de fondo */}
          <div className="absolute inset-0 opacity-5 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImRvdHMiIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PGNpcmNsZSBjeD0iMiIgY3k9IjIiIHI9IjEiIGZpbGw9ImN1cnJlbnRDb2xvciIvPjwvcGF0dGVybj48L2RlZnM+PHJlY3Qgd2lkdGg9IjEwMCUiIGhlaWdodD0iMTAwJSIgZmlsbD0idXJsKCNkb3RzKSIvPjwvc3ZnPg==')]"></div>

          <div className="relative flex flex-col items-center gap-3">
            {/* Ícono cámara */}
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-editorial-red to-red-700 shadow-xl flex items-center justify-center group-hover:scale-110 transition-transform">
              <span className="text-3xl">📷</span>
            </div>

            {/* Texto */}
            <div>
              <p className="text-base font-black text-gray-800 group-hover:text-editorial-red transition-colors">
                {capturando ? 'Procesando...' : 'Tomar foto del E-14'}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Toca para abrir la cámara
              </p>
            </div>
          </div>

          {/* Input file oculto */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleFileChange}
            className="hidden"
            disabled={disabled || capturando}
          />
        </button>
      )}

      {/* Nota informativa */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
        <p className="text-xs text-blue-700 leading-relaxed">
          <span className="font-bold">💡 Consejo:</span> Asegúrate de que la foto sea clara y legible.
          La foto se guardará localmente y se sincronizará automáticamente cuando haya conexión.
        </p>
      </div>
    </div>
  );
}
