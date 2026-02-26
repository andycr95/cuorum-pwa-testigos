import { useState, useEffect, useCallback } from 'react';
import { api } from '../../services/api';
import { getResultadosByMesa } from '../../db/indexeddb';

interface ResultadoRemoto {
  id: string;
  eleccionId: string;
  candidato: string;
  partido: string;
  tipoVoto: string;
  votos: number;
  votosBlanco: number;
  votosNulos: number;
  votosNoMarcados: number;
  totalVotosMesa: number;
  capturedAt: string;
  synced: 1;
  origen: 'remota';
}

interface ResultadoLocal {
  id: string;
  eleccionId: string;
  candidato: string;
  partido: string;
  tipoVoto: string;
  votos: number;
  votosBlanco: number;
  votosNulos: number;
  votosNoMarcados: number;
  totalVotosMesa: number;
  capturedAt: string;
  synced: 0;
  origen: 'local';
}

type ResultadoDisplay = ResultadoRemoto | ResultadoLocal;

interface Eleccion {
  id: string;
  nombre: string;
}

interface Props {
  mesaId: string;
  testigoId: string;
  elecciones: Eleccion[];
  mesaNumero: number;
}

/** Redondea un ISO string al minuto para agrupar capturas de la misma sesion */
function agruparPorSesion(capturedAt: string): string {
  const d = new Date(capturedAt);
  d.setSeconds(0, 0);
  return d.toISOString();
}

export function PanelHistorialResultados({ mesaId, elecciones, mesaNumero }: Props) {
  const [abierto, setAbierto] = useState(false);
  const [resultados, setResultados] = useState<ResultadoDisplay[]>([]);
  const [cargando, setCargando] = useState(false);

  const recargar = useCallback(async () => {
    setCargando(true);
    try {
      // Fuente 1: pendientes locales (IndexedDB synced=0)
      const locales = await getResultadosByMesa(mesaId);
      const pendientes: ResultadoLocal[] = locales
        .filter((r) => r.synced === 0)
        .map((r) => ({
          id: r.id,
          eleccionId: r.eleccionId,
          candidato: r.candidato,
          partido: r.partido,
          tipoVoto: r.tipoVoto,
          votos: r.votos,
          votosBlanco: r.votosBlanco,
          votosNulos: r.votosNulos,
          votosNoMarcados: r.votosNoMarcados,
          totalVotosMesa: r.totalVotosMesa,
          capturedAt: r.capturedAt,
          synced: 0,
          origen: 'local',
        }));

      // Fuente 2: ya sincronizados en el backend
      let remotos: ResultadoRemoto[] = [];
      try {
        const { data } = await api.get<{
          data: Array<{
            id: string;
            eleccionId: string;
            candidato: string;
            partido: string;
            tipoVoto: string;
            votos: number;
            votosBlanco: number;
            votosNulos: number;
            votosNoMarcados: number;
            totalVotosMesa: number;
            capturedAt: string;
          }>;
        }>(`/testigos/resultados/historial`, {
          params: { mesaId, limit: 200 },
        });
        remotos = (data.data ?? []).map((r) => ({
          ...r,
          synced: 1,
          origen: 'remota',
        }));
      } catch {
        // Sin conexion — mostrar solo locales
      }

      // Deduplicar: si ya esta en remotos, no incluir la version local
      const remotosIds = new Set(remotos.map((r) => r.id));
      const pendientesFiltrados = pendientes.filter((p) => !remotosIds.has(p.id));

      const merged: ResultadoDisplay[] = [...remotos, ...pendientesFiltrados].sort(
        (a, b) => (a.capturedAt > b.capturedAt ? -1 : 1),
      );

      setResultados(merged);
    } finally {
      setCargando(false);
    }
  }, [mesaId]);

  useEffect(() => {
    if (abierto) recargar();
  }, [abierto, recargar]);

  // Agrupar por eleccionId + sesion de captura
  const gruposPorEleccion = resultados.reduce<
    Map<string, { sesiones: Map<string, ResultadoDisplay[]>; nombre: string }>
  >((acc, r) => {
    const nombre = elecciones.find((e) => e.id === r.eleccionId)?.nombre ?? r.eleccionId;
    if (!acc.has(r.eleccionId)) {
      acc.set(r.eleccionId, { sesiones: new Map(), nombre });
    }
    const grupo = acc.get(r.eleccionId)!;
    const sesion = agruparPorSesion(r.capturedAt);
    if (!grupo.sesiones.has(sesion)) {
      grupo.sesiones.set(sesion, []);
    }
    grupo.sesiones.get(sesion)!.push(r);
    return acc;
  }, new Map());

  const totalEntradas = resultados.length;

  return (
    <div className="rounded-2xl border-2 border-blue-300 overflow-hidden bg-blue-50/50 my-4">
      {/* Header toggle */}
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-4 bg-blue-600 active:opacity-90 transition-opacity"
      >
        <div className="flex items-center gap-3">
          <span className="text-2xl">📋</span>
          <div className="text-left">
            <p className="text-sm font-black text-white uppercase tracking-wide">
              Historial de Resultados
            </p>
            <p className="text-[11px] text-blue-100 font-semibold">
              Mesa #{mesaNumero}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {totalEntradas > 0 && (
            <div className="px-2.5 py-1 bg-white rounded-full">
              <span className="text-xs font-black text-blue-600">
                {totalEntradas} entrada{totalEntradas > 1 ? 's' : ''}
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

      {/* Contenido expandible */}
      {abierto && (
        <div className="p-5 space-y-4">
          {cargando ? (
            <div className="py-8 text-center">
              <span className="inline-block w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin mb-2" />
              <p className="text-xs text-gray-500 font-semibold">Cargando historial...</p>
            </div>
          ) : totalEntradas === 0 ? (
            <div className="py-8 text-center">
              <p className="text-3xl mb-2">📋</p>
              <p className="text-sm font-semibold text-gray-500">Sin resultados enviados aun</p>
              <p className="text-xs text-gray-400 mt-1">Los resultados que captures apareceran aqui</p>
            </div>
          ) : (
            Array.from(gruposPorEleccion.entries()).map(([eleccionId, { sesiones, nombre }]) => (
              <div key={eleccionId} className="space-y-3">
                <p className="text-xs font-black text-blue-700 uppercase tracking-wider">
                  {nombre}
                </p>
                {Array.from(sesiones.entries()).map(([sesion, filas]) => {
                  const totalVotosMesa = filas[0]?.totalVotosMesa ?? 0;
                  const totalVotos = filas
                    .filter((r) => r.tipoVoto === 'CANDIDATO' || r.tipoVoto === 'LISTA')
                    .reduce((s, r) => s + r.votos, 0);
                  const firstRow = filas[0];
                  const isSynced = firstRow?.synced === 1;
                  const hora = new Date(sesion).toLocaleTimeString('es-CO', {
                    hour: '2-digit',
                    minute: '2-digit',
                  });

                  return (
                    <div
                      key={sesion}
                      className={`rounded-xl border-2 overflow-hidden ${
                        isSynced ? 'border-blue-200 bg-white' : 'border-yellow-300 bg-yellow-50'
                      }`}
                    >
                      {/* Cabecera sesion */}
                      <div className={`flex items-center justify-between px-4 py-2 ${isSynced ? 'bg-blue-50' : 'bg-yellow-100'}`}>
                        <p className="text-xs font-bold text-gray-700">
                          Mesa #{mesaNumero} · Total votos: {totalVotos} / {totalVotosMesa} sufragantes
                        </p>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-semibold text-gray-500">{hora}</span>
                          {isSynced ? (
                            <span className="text-green-600 font-black text-sm" title="Sincronizado">✓</span>
                          ) : (
                            <span className="text-yellow-600 font-black text-sm" title="Pendiente de sincronizacion">⏳</span>
                          )}
                        </div>
                      </div>

                      {/* Filas de candidatos */}
                      {isSynced ? (
                        <div className="divide-y divide-gray-50">
                          {filas
                            .filter((r) => r.tipoVoto === 'CANDIDATO' || r.tipoVoto === 'LISTA')
                            .map((r) => {
                              const grandTotal = filas.reduce((s, f) => s + (f.tipoVoto === 'CANDIDATO' || f.tipoVoto === 'LISTA' ? f.votos : 0) + f.votosBlanco + f.votosNulos, 0);
                              const pct = grandTotal > 0 ? ((r.votos / grandTotal) * 100).toFixed(1) : '0.0';
                              const barWidth = grandTotal > 0 ? Math.round((r.votos / grandTotal) * 100) : 0;
                              return (
                                <div key={r.id} className="flex items-center px-4 py-2 gap-3">
                                  <div className="flex-1 min-w-0">
                                    <p className="text-xs font-semibold text-gray-800 truncate">{r.candidato}</p>
                                    <div className="flex items-center gap-2 mt-0.5">
                                      <div className="flex-1 max-w-[80px] bg-gray-200 rounded-full h-1.5">
                                        <div
                                          className="bg-blue-500 h-1.5 rounded-full"
                                          style={{ width: `${barWidth}%` }}
                                        />
                                      </div>
                                      <span className="text-[10px] text-gray-500">{pct}%</span>
                                    </div>
                                  </div>
                                  <span className="text-sm font-bold text-gray-900 flex-shrink-0">{r.votos.toLocaleString('es-CO')}</span>
                                </div>
                              );
                            })}
                          {filas[0]?.votosBlanco > 0 && (
                            <div className="flex items-center justify-between px-4 py-2">
                              <p className="text-xs text-gray-500">Blancos</p>
                              <span className="text-xs font-semibold text-gray-600">{filas[0].votosBlanco}</span>
                            </div>
                          )}
                          {filas[0]?.votosNulos > 0 && (
                            <div className="flex items-center justify-between px-4 py-2">
                              <p className="text-xs text-gray-500">Nulos</p>
                              <span className="text-xs font-semibold text-gray-600">{filas[0].votosNulos}</span>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="px-4 py-3">
                          <p className="text-xs text-yellow-700 font-semibold">Pendiente de sincronizacion...</p>
                          <p className="text-[10px] text-yellow-600 mt-0.5">{filas.length} registro(s) esperando envio</p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))
          )}

          {totalEntradas > 0 && (
            <button
              type="button"
              onClick={recargar}
              className="w-full py-2 border border-dashed border-blue-300 rounded-xl text-blue-600 text-xs font-semibold hover:bg-blue-50 active:scale-95 transition-all"
            >
              Actualizar historial
            </button>
          )}
        </div>
      )}
    </div>
  );
}
