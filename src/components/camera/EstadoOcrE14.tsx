import { useState } from 'react';
import type { CuorumDB } from '../../db/indexeddb';

type OcrJobEntry = CuorumDB['e14OcrJobs']['value'];

interface EstadoOcrE14Props {
  jobs: OcrJobEntry[];
  onRetry?: () => void;
  onSync?: () => void;
  syncing?: boolean;
  onConfirmar?: (jobId: string, datos: {
    resultados: Record<string, number>;
    votosBlanco: number;
    votosNulos: number;
    votosNoMarcados: number;
    totalVotosMesa: number;
    forzar?: boolean;
  }) => Promise<{ advertencia?: boolean; mensaje?: string; confirmado?: boolean }>;
  eleccionReportada?: boolean;
}

const ESTADO_CONFIG: Record<string, { label: string; color: string; spinning: boolean; pulse: boolean }> = {
  PENDIENTE: {
    label: 'En cola (sin conexión)',
    color: 'bg-orange-50 text-orange-700 border-orange-200',
    spinning: false,
    pulse: false,
  },
  SUBIENDO: {
    label: 'Subiendo fotos al servidor...',
    color: 'bg-blue-50 text-blue-700 border-blue-200',
    spinning: true,
    pulse: true,
  },
  PROCESANDO: {
    label: 'Analizando con IA...',
    color: 'bg-violet-50 text-violet-700 border-violet-200',
    spinning: true,
    pulse: true,
  },
  COMPLETADO: {
    label: 'Acta procesada correctamente',
    color: 'bg-green-50 text-green-700 border-green-200',
    spinning: false,
    pulse: false,
  },
  CONFIRMADO: {
    label: 'Resultados confirmados',
    color: 'bg-emerald-50 text-emerald-700 border-emerald-300',
    spinning: false,
    pulse: false,
  },
  ERROR: {
    label: 'Error al procesar',
    color: 'bg-red-50 text-red-700 border-red-200',
    spinning: false,
    pulse: false,
  },
};

export function EstadoOcrE14({ jobs, onRetry, onSync, syncing = false, onConfirmar, eleccionReportada }: EstadoOcrE14Props) {
  if (jobs.length === 0) return null;

  const pendientes = jobs.filter(j => j.estado === 'PENDIENTE' || j.estado === 'ERROR').length;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-1 h-5 bg-editorial-red rounded-full" />
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">
            Envios OCR ({jobs.length})
          </p>
        </div>
        {pendientes > 0 && onSync && (
          <button
            type="button"
            onClick={onSync}
            disabled={syncing}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-editorial-red text-white text-xs font-bold rounded-lg disabled:opacity-50 active:scale-95 transition-all"
          >
            {syncing ? (
              <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <span>↑</span>
            )}
            {syncing ? 'Sincronizando...' : `Sincronizar (${pendientes})`}
          </button>
        )}
      </div>

      {jobs.map(job => {
        if (job.estado === 'COMPLETADO' && onConfirmar && job.resultadoOcr) {
          return (
            <RevisionOcrInline
              key={job.id}
              job={job}
              onConfirmar={onConfirmar}
              eleccionReportada={eleccionReportada}
            />
          );
        }

        const cfg = ESTADO_CONFIG[job.estado] || ESTADO_CONFIG.PENDIENTE;
        return (
          <div
            key={job.id}
            className={`border rounded-xl px-3 py-2.5 flex items-center justify-between transition-all ${cfg.color} ${cfg.pulse ? 'animate-pulse' : ''}`}
          >
            <div className="flex items-center gap-2.5">
              {cfg.spinning ? (
                <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin flex-shrink-0" />
              ) : job.estado === 'COMPLETADO' || job.estado === 'CONFIRMADO' ? (
                <span className="text-base flex-shrink-0">✓</span>
              ) : job.estado === 'ERROR' ? (
                <span className="text-base flex-shrink-0">!</span>
              ) : (
                <span className="text-base flex-shrink-0">·</span>
              )}
              <div>
                <p className="text-xs font-bold leading-tight">{cfg.label}</p>
                <p className="text-[10px] opacity-70 mt-0.5">
                  {job.fotos.length} foto{job.fotos.length !== 1 ? 's' : ''} · {new Date(job.capturedAt).toLocaleTimeString()}
                </p>
                {job.estado === 'ERROR' && job.lastSyncError && (
                  <p className="text-[10px] text-red-600 font-medium mt-0.5 leading-tight">
                    {job.lastSyncError}
                  </p>
                )}
              </div>
            </div>
            {job.estado === 'ERROR' && onRetry && (
              <button type="button" onClick={onRetry} className="text-xs font-bold underline flex-shrink-0 ml-2">
                Reintentar
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Inline review form for COMPLETADO OCR jobs ──────────────────────────────

function RevisionOcrInline({ job, onConfirmar, eleccionReportada }: {
  job: OcrJobEntry;
  onConfirmar: NonNullable<EstadoOcrE14Props['onConfirmar']>;
  eleccionReportada?: boolean;
}) {
  const resultadoOcr = job.resultadoOcr!;
  const candidatosMap = job.candidatosMap || {};

  // Separate candidate votes, lista votes, circunscripcion totals, and totals
  const listaEntries = Object.entries(resultadoOcr).filter(([k]) => k.startsWith('_lista:'));
  const candidatoEntries = Object.entries(resultadoOcr).filter(([k]) => !k.startsWith('_'));
  const circEntries = Object.entries(resultadoOcr).filter(([k]) => k.startsWith('_circ:'));
  const allVoteEntries = [...listaEntries, ...candidatoEntries];

  // Sort by partido then posicion (lista votes first within partido, then candidates)
  const sortedCandidatoEntries = [...allVoteEntries].sort(([idA], [idB]) => {
    const a = candidatosMap[idA];
    const b = candidatosMap[idB];
    if (!a || !b) return 0;
    const partidoCmp = (a.partido || '').localeCompare(b.partido || '');
    if (partidoCmp !== 0) return partidoCmp;
    // Lista votes (posicion null) go first
    return (a.posicion ?? -1) - (b.posicion ?? -1);
  });

  const [votos, setVotos] = useState<Record<string, number>>(
    Object.fromEntries(allVoteEntries),
  );

  // Sumatoria de votos por partido (se recalcula con cada edición)
  const totalesPorPartido: Record<string, number> = {};
  for (const [id] of sortedCandidatoEntries) {
    const partido = candidatosMap[id]?.partido || '';
    if (partido) {
      totalesPorPartido[partido] = (totalesPorPartido[partido] || 0) + (votos[id] ?? 0);
    }
  }
  const [totalVotosMesa, setTotalVotosMesa] = useState(resultadoOcr['_totalVotosMesa'] ?? 0);
  const [votosBlanco, setVotosBlanco] = useState(resultadoOcr['_votosBlanco'] ?? 0);
  const [votosNulos, setVotosNulos] = useState(resultadoOcr['_votosNulos'] ?? 0);
  const [votosNoMarcados, setVotosNoMarcados] = useState(resultadoOcr['_votosNoMarcados'] ?? 0);
  const [circValues, setCircValues] = useState<Record<string, number>>(
    Object.fromEntries(circEntries),
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showWarning, setShowWarning] = useState(false);
  const [warningMsg, setWarningMsg] = useState('');
  const [confirmado, setConfirmado] = useState(false);

  const handleConfirmar = async (forzar = false) => {
    setLoading(true);
    setError(null);
    try {
      const result = await onConfirmar(job.id, {
        resultados: { ...votos, ...circValues },
        votosBlanco,
        votosNulos,
        votosNoMarcados,
        totalVotosMesa,
        forzar,
      });

      if (result.advertencia) {
        setWarningMsg(result.mensaje || 'Ya existen resultados para esta eleccion.');
        setShowWarning(true);
        setLoading(false);
        return;
      }

      setConfirmado(true);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Error al confirmar');
    } finally {
      setLoading(false);
    }
  };

  if (confirmado) {
    return (
      <div className="border-2 border-emerald-300 bg-emerald-50 rounded-xl px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-lg">✓</span>
          <div>
            <p className="text-sm font-bold text-emerald-700">Resultados confirmados</p>
            <p className="text-[10px] text-emerald-600 mt-0.5">
              {Object.keys(votos).length} candidatos registrados
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="border-2 border-green-300 bg-white rounded-xl overflow-hidden">
      {/* Header */}
      <div className="bg-green-50 px-4 py-3 border-b border-green-200">
        <div className="flex items-center gap-2">
          <span className="text-base">✓</span>
          <div>
            <p className="text-xs font-bold text-green-700">OCR Completado — Revisa los resultados</p>
            <p className="text-[10px] text-green-600 mt-0.5">
              {job.fotos.length} foto{job.fotos.length !== 1 ? 's' : ''} · {new Date(job.capturedAt).toLocaleTimeString()}
            </p>
          </div>
        </div>
      </div>

      <div className="px-4 py-3 space-y-3">
        {/* Warning: existing results */}
        {eleccionReportada && !showWarning && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            <p className="text-[11px] text-amber-700 font-medium">
              Ya hay resultados registrados para esta eleccion. Al confirmar se reemplazaran.
            </p>
          </div>
        )}

        {/* Force-confirm warning from backend */}
        {showWarning && (
          <div className="bg-amber-50 border-2 border-amber-300 rounded-lg px-3 py-2">
            <p className="text-[11px] text-amber-700 font-bold mb-2">{warningMsg}</p>
            <div className="flex gap-2">
              <button
                onClick={() => { setShowWarning(false); }}
                className="flex-1 py-2 text-xs font-bold text-gray-600 border border-gray-300 rounded-lg"
              >
                Cancelar
              </button>
              <button
                onClick={() => { setShowWarning(false); handleConfirmar(true); }}
                className="flex-1 py-2 text-xs font-bold text-white bg-amber-500 rounded-lg"
              >
                Reemplazar
              </button>
            </div>
          </div>
        )}

        {/* Candidate votes grouped by partido */}
        <div>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Votos por candidato</p>
          <div className="space-y-1 max-h-72 overflow-y-auto">
            {(() => {
              let lastPartido = '';
              return sortedCandidatoEntries.map(([id]) => {
                const info = candidatosMap[id];
                const partido = info?.partido || '';
                const showPartidoHeader = partido !== lastPartido;
                lastPartido = partido;
                const v = votos[id] ?? 0;
                const isLista = id.startsWith('_lista:');

                return (
                  <div key={id}>
                    {showPartidoHeader && partido && (
                      <div className="bg-gray-100 px-2 py-1 rounded mt-1.5 mb-1 flex items-center justify-between">
                        <p className="text-[10px] font-black text-gray-500 uppercase tracking-wider">
                          {info?.listaNombre || partido} <span className="text-gray-400 font-normal">({partido})</span>
                        </p>
                        <span className="text-[10px] font-black text-gray-600 tabular-nums">
                          {totalesPorPartido[partido] ?? 0}
                        </span>
                      </div>
                    )}
                    <div className={`flex items-center justify-between gap-2 px-1 ${isLista ? 'bg-blue-50 rounded-lg py-1' : ''}`}>
                      <div className="flex items-center gap-1.5 flex-1 min-w-0">
                        {!isLista && info?.posicion != null && (
                          <span className="text-[10px] font-bold text-gray-400 w-6 text-right flex-shrink-0">
                            {info.posicion}
                          </span>
                        )}
                        <p className={`text-xs truncate ${isLista ? 'text-blue-700 font-bold' : 'text-gray-700'}`} title={info?.nombre || id}>
                          {isLista ? (info?.nombre || 'Votos agrupacion') : (info?.nombre || id.slice(0, 8) + '...')}
                        </p>
                      </div>
                      <input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        value={v}
                        onChange={(e) => setVotos(prev => ({ ...prev, [id]: Math.max(0, parseInt(e.target.value) || 0) }))}
                        className={`w-16 px-2 py-1.5 text-xs text-right font-bold border-2 rounded-lg focus:border-editorial-red focus:outline-none ${isLista ? 'border-blue-200' : 'border-gray-200'}`}
                      />
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        </div>

        {/* Nivelacion de la mesa */}
        <div className="border-t border-gray-200 pt-3">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Nivelacion de la mesa</p>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-gray-700">Total sufragantes (E-11)</p>
              <input type="number" inputMode="numeric" min={0} value={totalVotosMesa}
                onChange={(e) => setTotalVotosMesa(Math.max(0, parseInt(e.target.value) || 0))}
                className="w-16 px-2 py-1.5 text-xs text-right font-bold border-2 border-gray-200 rounded-lg focus:border-editorial-red focus:outline-none" />
            </div>
            {[
              { label: 'Total votos en la urna', value: resultadoOcr['_totalVotosUrna'] },
              { label: 'Total votos incinerados', value: resultadoOcr['_totalVotosIncinerados'] },
            ].filter(item => item.value != null).map(({ label, value }) => (
              <div key={label} className="flex items-center justify-between gap-2">
                <p className="text-xs text-gray-700">{label}</p>
                <span className="text-xs font-bold text-gray-600 tabular-nums px-2">{value}</span>
              </div>
            ))}
            {resultadoOcr['_huboRecuento'] === 1 && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5">
                <p className="text-[11px] text-amber-700 font-bold">Hubo recuento de votos</p>
              </div>
            )}
          </div>
        </div>

        {/* Circunscripciones + votos especiales */}
        <div className="border-t border-gray-200 pt-3">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Totales circunscripcion</p>
          <div className="space-y-1.5">
            {/* Circunscripcion breakdown (if multi-circunscripcion E-14) */}
            {Object.keys(circValues).length > 0 && (
              <div className="bg-gray-50 rounded-lg px-2 py-1.5 space-y-1">
                {Object.entries(circValues).map(([key, val]) => (
                  <div key={key} className="flex items-center justify-between gap-2">
                    <p className="text-[11px] text-gray-500">{key.replace('_circ:', '')}</p>
                    <input type="number" inputMode="numeric" min={0} value={val}
                      onChange={(e) => setCircValues(prev => ({ ...prev, [key]: Math.max(0, parseInt(e.target.value) || 0) }))}
                      className="w-16 px-2 py-1.5 text-[11px] text-right font-bold border-2 border-gray-200 rounded-lg focus:border-editorial-red focus:outline-none" />
                  </div>
                ))}
              </div>
            )}

            {/* Votos blanco, nulos, no marcados */}
            {[
              { label: 'Votos en blanco', value: votosBlanco, setter: setVotosBlanco },
              { label: 'Votos nulos', value: votosNulos, setter: setVotosNulos },
              { label: 'Tarjetas no marcadas', value: votosNoMarcados, setter: setVotosNoMarcados },
            ].map(({ label, value, setter }) => (
              <div key={label} className="flex items-center justify-between gap-2">
                <p className="text-xs text-gray-700">{label}</p>
                <input type="number" inputMode="numeric" min={0} value={value}
                  onChange={(e) => setter(Math.max(0, parseInt(e.target.value) || 0))}
                  className="w-16 px-2 py-1.5 text-xs text-right font-bold border-2 border-gray-200 rounded-lg focus:border-editorial-red focus:outline-none" />
              </div>
            ))}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            <p className="text-[11px] text-red-600 font-medium">{error}</p>
          </div>
        )}

        {/* Confirm button */}
        {!showWarning && (
          <button
            onClick={() => handleConfirmar(false)}
            disabled={loading}
            className="w-full py-3 rounded-xl font-black text-white text-sm uppercase tracking-wide bg-green-600 hover:bg-green-700 active:scale-[0.97] transition-all disabled:opacity-50"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Confirmando...
              </span>
            ) : (
              'Confirmar resultados'
            )}
          </button>
        )}
      </div>
    </div>
  );
}
