import { useState, useRef, useEffect, useCallback } from 'react';
import { api } from '../../services/api';
import { guardarIncidencia, getIncidenciasByMesa, TipoIncidencia } from '../../db/indexeddb';
import { sincronizar, verificarConectividadReal } from '../../services/syncService';

/** Incidencia ya sincronizada que llega desde el backend */
interface IncidenciaRemota {
  id: string;
  tipo: TipoIncidencia;
  descripcion: string;
  fotoUrl: string | null;
  capturedAt: string;
  synced: 1;
  origen: 'remota';
}

/** Incidencia local pendiente de sincronización */
interface IncidenciaLocal {
  id: string;
  tipo: TipoIncidencia;
  descripcion: string;
  fotoBlob?: Blob;
  capturedAt: string;
  synced: 0;
  origen: 'local';
}

type IncidenciaDisplay = IncidenciaRemota | IncidenciaLocal;

interface PanelIncidenciasProps {
  mesaId: string;
  testigoId: string;
  deviceId: string;
  mesaNumero: number;
}

interface TipoConfig {
  tipo: TipoIncidencia;
  label: string;
  emoji: string;
  color: string;
}

const TIPOS: TipoConfig[] = [
  { tipo: 'MATERIALES_FALTANTES', label: 'Materiales faltantes', emoji: '📦', color: 'bg-yellow-100 border-yellow-400 text-yellow-800' },
  { tipo: 'INTIMIDACION',         label: 'Intimidación',          emoji: '⚠️',  color: 'bg-orange-100 border-orange-400 text-orange-800' },
  { tipo: 'VIOLENCIA',            label: 'Violencia',             emoji: '🚨', color: 'bg-red-100 border-red-500 text-red-800' },
  { tipo: 'JURADO_AUSENTE',       label: 'Jurado ausente',        emoji: '👤', color: 'bg-blue-100 border-blue-400 text-blue-800' },
  { tipo: 'IRREGULARIDAD_ACTA',   label: 'Irregularidad en acta', emoji: '📋', color: 'bg-purple-100 border-purple-400 text-purple-800' },
  { tipo: 'OTRO',                 label: 'Otro',                  emoji: '📝', color: 'bg-gray-100 border-gray-400 text-gray-800' },
];

export function PanelIncidencias({
  mesaId,
  testigoId,
  deviceId,
  mesaNumero,
}: PanelIncidenciasProps) {
  const [abierto, setAbierto] = useState(false);
  const [vistaActiva, setVistaActiva] = useState<'lista' | 'nueva'>('lista');
  const [tipoSeleccionado, setTipoSeleccionado] = useState<TipoIncidencia | null>(null);
  const [descripcion, setDescripcion] = useState('');
  const [fotoBlob, setFotoBlob] = useState<Blob | null>(null);
  const [fotoPreview, setFotoPreview] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Lista unificada: remotas (backend) + locales pendientes (IndexedDB synced=0)
  const [incidencias, setIncidencias] = useState<IncidenciaDisplay[]>([]);
  const [cargandoHistorial, setCargandoHistorial] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const tipoConfig = TIPOS.find((t) => t.tipo === tipoSeleccionado);
  const puedeGuardar = tipoSeleccionado !== null && descripcion.trim().length >= 10;

  /**
   * Carga incidencias desde dos fuentes y las fusiona:
   *  1. Backend (ya sincronizadas) — fuente de verdad persistente
   *  2. IndexedDB synced=0 — pendientes locales aún no enviadas
   */
  const recargarIncidencias = useCallback(async () => {
    setCargandoHistorial(true);
    try {
      // Fuente 1: registros pendientes locales
      const locales = await getIncidenciasByMesa(mesaId);
      const pendientes: IncidenciaLocal[] = locales
        .filter((r) => r.synced === 0)
        .map((r) => ({
          id: r.id,
          tipo: r.tipo,
          descripcion: r.descripcion,
          fotoBlob: r.fotoBlob,
          capturedAt: r.capturedAt,
          synced: 0,
          origen: 'local',
        }));

      // Fuente 2: ya sincronizadas en el backend
      let remotas: IncidenciaRemota[] = [];
      try {
        const { data } = await api.get<{ data: Array<{ id: string; tipo: TipoIncidencia; descripcion: string; fotoUrl: string | null; capturedAt: string }> }>(`/testigos/incidencias`,
          {
            params: { mesaId, limit: 100 },
          },
        );
        remotas = (data.data ?? []).map((r) => ({
          ...r,
          synced: 1,
          origen: 'remota',
        }));
      } catch {
        // Sin conexión o error de red — mostrar solo locales
      }

      // Evitar duplicados: si un id ya está en remotas, no incluir la versión local
      const remotasIds = new Set(remotas.map((r) => r.id));
      const pendientesFiltrados = pendientes.filter((p) => !remotasIds.has(p.id));

      // Unir y ordenar por capturedAt desc
      const merged: IncidenciaDisplay[] = [...remotas, ...pendientesFiltrados].sort(
        (a, b) => (a.capturedAt > b.capturedAt ? -1 : 1),
      );

      setIncidencias(merged);
    } finally {
      setCargandoHistorial(false);
    }
  }, [mesaId]);

  useEffect(() => {
    recargarIncidencias();
  }, [recargarIncidencias]);

  const mostrarToast = (mensaje: string) => {
    setToast(mensaje);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 4000);
  };

  const handleFoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const blob = new Blob([await file.arrayBuffer()], { type: file.type });
    setFotoBlob(blob);
    setFotoPreview(URL.createObjectURL(blob));
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleGuardar = async () => {
    if (!tipoSeleccionado || descripcion.trim().length < 10) return;

    setGuardando(true);
    setError(null);

    try {
      await guardarIncidencia({
        id: `inc_${mesaId}_${Date.now()}`,
        mesaId,
        testigoId,
        tipo: tipoSeleccionado,
        descripcion: descripcion.trim(),
        fotoBlob: fotoBlob ?? undefined,
        capturedAt: new Date().toISOString(),
        deviceId,
      });

      // Refrescar lista desde IndexedDB
      await recargarIncidencias();

      // Toast de confirmación
      const cfg = TIPOS.find((t) => t.tipo === tipoSeleccionado)!;
      mostrarToast(`${cfg.emoji} Novedad registrada: ${cfg.label}`);

      // Intentar sync inmediato si hay conexión
      const online = await verificarConectividadReal();
      if (online) sincronizar();

      // Limpiar formulario y volver a la lista
      setTipoSeleccionado(null);
      setDescripcion('');
      if (fotoPreview) URL.revokeObjectURL(fotoPreview);
      setFotoBlob(null);
      setFotoPreview(null);
      setVistaActiva('lista');
    } catch {
      setError('Error al guardar la incidencia. Intenta nuevamente.');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="rounded-2xl border-2 border-orange-300 overflow-hidden bg-orange-50/50 my-4">
      {/* Toast de confirmación — flota encima del panel */}
      {toast && (
        <div className="mx-4 mt-3 px-4 py-3 bg-green-500 text-white rounded-2xl shadow-lg flex items-center gap-3 animate-pulse">
          <span className="text-lg">✅</span>
          <p className="text-sm font-bold flex-1">{toast}</p>
          <button
            type="button"
            onClick={() => setToast(null)}
            className="text-white/70 hover:text-white font-black text-base"
          >
            ✕
          </button>
        </div>
      )}

      {/* Toggle header */}
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-4 bg-orange-500 active:opacity-90 transition-opacity"
      >
        <div className="flex items-center gap-3">
          <span className="text-2xl">🚨</span>
          <div className="text-left">
            <p className="text-sm font-black text-white uppercase tracking-wide">
              Novedades / Incidencias
            </p>
            <p className="text-[11px] text-orange-100 font-semibold">
              Mesa #{mesaNumero}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {incidencias.length > 0 && (
            <div className="px-2.5 py-1 bg-white rounded-full">
              <span className="text-xs font-black text-orange-600">
                {incidencias.length} reportada{incidencias.length > 1 ? 's' : ''}
              </span>
            </div>
          )}
          <svg
            className={`w-5 h-5 text-white transition-transform duration-200 ${abierto ? 'rotate-180' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {/* Panel expandible */}
      {abierto && (
        <div className="p-5 space-y-4">
          {/* Sub-tabs: Lista / Nueva */}
          <div className="flex gap-1 bg-orange-100 rounded-xl p-1">
            <button
              type="button"
              onClick={() => setVistaActiva('lista')}
              className={`flex-1 py-2 rounded-lg text-xs font-black uppercase tracking-wide transition-all ${
                vistaActiva === 'lista'
                  ? 'bg-white text-orange-600 shadow-sm'
                  : 'text-orange-400 hover:text-orange-600'
              }`}
            >
              📋 Historial ({incidencias.length})
            </button>
            <button
              type="button"
              onClick={() => setVistaActiva('nueva')}
              className={`flex-1 py-2 rounded-lg text-xs font-black uppercase tracking-wide transition-all ${
                vistaActiva === 'nueva'
                  ? 'bg-white text-orange-600 shadow-sm'
                  : 'text-orange-400 hover:text-orange-600'
              }`}
            >
              ＋ Nueva novedad
            </button>
          </div>

          {/* ── Vista: Lista / Historial ──────────────────────── */}
          {vistaActiva === 'lista' && (
            <div className="space-y-3">
              {cargandoHistorial ? (
                <div className="py-8 text-center">
                  <span className="inline-block w-6 h-6 border-2 border-orange-400 border-t-transparent rounded-full animate-spin mb-2" />
                  <p className="text-xs text-gray-500 font-semibold">Cargando historial...</p>
                </div>
              ) : incidencias.length === 0 ? (
                <div className="py-8 text-center">
                  <p className="text-3xl mb-2">📋</p>
                  <p className="text-sm font-semibold text-gray-500">Sin novedades registradas</p>
                  <button
                    type="button"
                    onClick={() => setVistaActiva('nueva')}
                    className="mt-3 px-4 py-2 bg-orange-500 text-white rounded-xl text-xs font-black uppercase tracking-wide active:scale-95 transition-all"
                  >
                    + Reportar primera novedad
                  </button>
                </div>
              ) : (
                <>
                  {incidencias.map((inc) => {
                    const cfg = TIPOS.find((t) => t.tipo === inc.tipo)!;
                    const fecha = new Date(inc.capturedAt).toLocaleTimeString('es-CO', {
                      hour: '2-digit',
                      minute: '2-digit',
                    });
                    const tienefoto =
                      inc.origen === 'remota' ? !!inc.fotoUrl : !!inc.fotoBlob;
                    return (
                      <div
                        key={inc.id}
                        className={`flex items-start gap-3 px-3 py-3 rounded-xl border-2 ${cfg.color}`}
                      >
                        <span className="text-xl flex-shrink-0 mt-0.5">{cfg.emoji}</span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-xs font-black uppercase tracking-wide">{cfg.label}</p>
                            <div className="flex items-center gap-1.5 flex-shrink-0">
                              <span className="text-[10px] font-semibold opacity-70">{fecha}</span>
                              {inc.synced === 1 ? (
                                <span className="text-green-600 font-black text-xs" title="Sincronizado con servidor">✓</span>
                              ) : (
                                <span className="text-orange-500 font-black text-xs" title="Pendiente de sincronización">⏳</span>
                              )}
                            </div>
                          </div>
                          <p className="text-xs mt-0.5 leading-relaxed">{inc.descripcion}</p>
                          {tienefoto && (
                            <p className="text-[10px] mt-1 font-semibold opacity-70">📷 Con foto de evidencia</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => setVistaActiva('nueva')}
                    className="w-full py-3 border-2 border-dashed border-orange-300 rounded-xl text-orange-600 text-xs font-black uppercase tracking-wide active:scale-95 transition-all hover:bg-orange-50"
                  >
                    + Reportar nueva novedad
                  </button>
                </>
              )}
            </div>
          )}

          {/* ── Vista: Nueva novedad ──────────────────────────── */}
          {vistaActiva === 'nueva' && (
            <div className="space-y-5">
              {/* Selector de tipo */}
              <div>
                <p className="text-xs font-bold text-gray-600 uppercase tracking-wider mb-3">
                  Tipo de novedad
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {TIPOS.map((t) => (
                    <button
                      key={t.tipo}
                      type="button"
                      onClick={() => setTipoSeleccionado(t.tipo)}
                      className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border-2 text-left transition-all active:scale-95 ${
                        tipoSeleccionado === t.tipo
                          ? `${t.color} shadow-md scale-[1.02]`
                          : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                      }`}
                    >
                      <span className="text-xl flex-shrink-0">{t.emoji}</span>
                      <span className="text-xs font-bold leading-tight">{t.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Descripción */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-bold text-gray-600 uppercase tracking-wider">
                    Descripción detallada <span className="text-red-500">*</span>
                  </p>
                  <span
                    className={`text-xs font-bold ${
                      descripcion.trim().length < 10 ? 'text-gray-400' : 'text-green-600'
                    }`}
                  >
                    {descripcion.trim().length}/500
                  </span>
                </div>
                <textarea
                  value={descripcion}
                  onChange={(e) => setDescripcion(e.target.value.slice(0, 500))}
                  placeholder={
                    tipoConfig
                      ? `Describe la ${tipoConfig.label.toLowerCase()} con el mayor detalle posible...`
                      : 'Selecciona un tipo de novedad primero...'
                  }
                  disabled={!tipoSeleccionado}
                  rows={4}
                  className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl text-sm resize-none focus:border-orange-400 focus:outline-none disabled:bg-gray-50 disabled:text-gray-400 bg-white"
                />
                {descripcion.trim().length > 0 && descripcion.trim().length < 10 && (
                  <p className="text-xs text-orange-600 mt-1 font-semibold">
                    Mínimo 10 caracteres para guardar
                  </p>
                )}
              </div>

              {/* Foto opcional */}
              <div>
                <p className="text-xs font-bold text-gray-600 uppercase tracking-wider mb-2">
                  Foto de evidencia (opcional)
                </p>

                {fotoPreview ? (
                  <div className="relative">
                    <img
                      src={fotoPreview}
                      alt="Evidencia"
                      className="w-full rounded-xl object-cover border-2 border-orange-300"
                      style={{ maxHeight: 200 }}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (fotoPreview) URL.revokeObjectURL(fotoPreview);
                        setFotoBlob(null);
                        setFotoPreview(null);
                      }}
                      className="absolute top-2 right-2 w-8 h-8 bg-red-500 rounded-full text-white text-sm font-black flex items-center justify-center shadow-lg"
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full py-3 border-2 border-dashed border-orange-300 rounded-xl text-orange-600 text-sm font-bold flex items-center justify-center gap-2 hover:bg-orange-50 active:scale-95 transition-all"
                  >
                    <span>📷</span>
                    Agregar foto de evidencia
                  </button>
                )}

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handleFoto}
                  className="hidden"
                />
              </div>

              {/* Error */}
              {error && (
                <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-xl">
                  <p className="text-xs text-red-600 font-semibold">{error}</p>
                </div>
              )}

              {/* Botón guardar */}
              <button
                type="button"
                onClick={handleGuardar}
                disabled={!puedeGuardar || guardando}
                className={`w-full py-4 rounded-2xl font-black text-sm uppercase tracking-wide transition-all active:scale-[0.97] shadow-lg ${
                  puedeGuardar
                    ? 'bg-orange-500 text-white shadow-orange-200 hover:shadow-orange-300'
                    : 'bg-gray-200 text-gray-400 cursor-not-allowed shadow-none'
                }`}
              >
                {guardando ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Guardando...
                  </span>
                ) : (
                  <span className="flex items-center justify-center gap-2">
                    <span>🚨</span>
                    Registrar novedad
                  </span>
                )}
              </button>

              <p className="text-center text-[10px] text-gray-400 leading-relaxed">
                Las novedades se guardan localmente y se sincronizan automáticamente con el servidor cuando hay conexión.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
