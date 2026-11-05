import { useState, useMemo } from 'react';
import type { CuorumDB } from '../../db/indexeddb';
import { formatearErrorAmigable, MENSAJES_OCR } from '../../utils/formatoError';
import { evaluarOrigenBorrador, identificarBajaConfianza } from '../../services/borradorVotosLogic';

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
    origen?: 'sin_cambios' | 'corregido';
  }) => Promise<{ advertencia?: boolean; mensaje?: string; confirmado?: boolean }>;
  eleccionReportada?: boolean;
  onConteoManual?: () => void;
}

const ESTADO_CONFIG: Record<string, { label: string; color: string; spinning: boolean; pulse: boolean }> = {
  PENDIENTE: {
    label: 'En cola (sin conexión)',
    color: 'bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-500/40',
    spinning: false,
    pulse: false,
  },
  SUBIENDO: {
    label: 'Subiendo fotos al servidor...',
    color: 'bg-blue-500/15 text-blue-800 dark:text-blue-300 border-blue-500/40',
    spinning: true,
    pulse: true,
  },
  PROCESANDO: {
    label: 'Leyendo el acta…',
    color: 'bg-blue-500/15 text-blue-800 dark:text-blue-300 border-blue-500/40',
    spinning: true,
    pulse: true,
  },
  COMPLETADO: {
    label: 'Acta procesada correctamente',
    color: 'bg-green-500/15 text-green-800 dark:text-green-300 border-green-500/40',
    spinning: false,
    pulse: false,
  },
  CONFIRMADO: {
    label: 'Resultados confirmados',
    color: 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 border-emerald-500/40',
    spinning: false,
    pulse: false,
  },
  ERROR: {
    label: 'Error al procesar',
    color: 'bg-red-500/15 text-red-800 dark:text-red-300 border-red-500/40',
    spinning: false,
    pulse: false,
  },
};

export function EstadoOcrE14({
  jobs,
  onRetry,
  onSync,
  syncing = false,
  onConfirmar,
  eleccionReportada,
  onConteoManual,
}: EstadoOcrE14Props) {
  if (jobs.length === 0) return null;

  const pendientes = jobs.filter(j => j.estado === 'PENDIENTE' || j.estado === 'ERROR').length;

  return (
    <div className="space-y-3">
      {jobs.length > 1 && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-1 h-5 bg-editorial-red rounded-full" />
            <p className="text-xs font-bold text-app-muted uppercase tracking-wider">
              Envíos de actas ({jobs.length})
            </p>
          </div>
          {pendientes > 0 && onSync && (
            <button
              type="button"
              onClick={onSync}
              disabled={syncing}
              className="flex items-center gap-1.5 px-3 py-1.5 min-h-[44px] bg-editorial-red text-white text-xs font-bold rounded-btn disabled:opacity-50 active:scale-95 transition-all"
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
      )}

      {jobs.map(job => {
        if ((job.estado === 'COMPLETADO' || job.estado === 'CONFIRMADO') && onConfirmar && job.resultadoOcr) {
          return (
            <RevisionOcrInline
              key={job.id}
              job={job}
              onConfirmar={onConfirmar}
              eleccionReportada={eleccionReportada}
              onConteoManual={onConteoManual}
            />
          );
        }

        if (job.estado === 'PROCESANDO' || job.estado === 'SUBIENDO' || job.estado === 'PENDIENTE') {
          return (
            <div
              key={job.id}
              className="bg-app-surface text-app-fg border border-app-line rounded-card p-6 text-center space-y-4"
            >
              <div className="w-12 h-12 mx-auto rounded-full bg-editorial-red/10 flex items-center justify-center text-app-accent-fg">
                <div className="w-6 h-6 border-2 border-editorial-red border-t-transparent rounded-full animate-spin" />
              </div>
              <div>
                <h3 className="text-base font-black text-app-fg">Leyendo el acta…</h3>
                <p className="text-xs text-app-muted mt-1 max-w-sm mx-auto">
                  Estamos preparando el borrador de votos a partir de las fotos del E-14.
                </p>
              </div>
              {onConteoManual && (
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={onConteoManual}
                    className="px-4 py-2.5 bg-app-elevated hover:bg-app-canvas border border-app-line text-app-fg font-bold text-xs rounded-btn transition-all min-h-[44px]"
                  >
                    Contar a mano
                  </button>
                </div>
              )}
            </div>
          );
        }

        if (job.estado === 'ERROR') {
          return (
            <div
              key={job.id}
              role="alert"
              className="bg-app-surface text-app-fg border border-red-500/40 rounded-card p-4 space-y-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-btn bg-red-500/15 border border-red-500/30 flex items-center justify-center text-red-800 dark:text-red-300 flex-shrink-0 mt-0.5">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                    </svg>
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-black text-app-fg leading-tight">
                        No fue posible leer el acta automáticamente
                      </p>
                      <span className="px-2 py-0.5 bg-red-500/20 border border-red-500/30 text-red-800 dark:text-red-300 text-xs font-bold rounded-full">
                        Sin borrador
                      </span>
                    </div>
                    <p className="text-xs text-app-muted mt-0.5">
                      {job.fotos.length} foto{job.fotos.length !== 1 ? 's' : ''} · {new Date(job.capturedAt).toLocaleTimeString()}
                    </p>
                  </div>
                </div>

                {onRetry && (
                  <button
                    type="button"
                    onClick={onRetry}
                    className="min-h-[44px] px-3.5 py-2 bg-editorial-red text-white text-xs font-bold rounded-btn hover:bg-red-700 active:scale-95 transition-all flex items-center gap-1.5 flex-shrink-0"
                  >
                    <span>Reintentar</span>
                  </button>
                )}
              </div>

              {/* Estado de la foto */}
              <div className="bg-green-500/10 border border-green-500/30 rounded-card px-3 py-2 text-xs font-semibold text-green-800 dark:text-green-300 flex items-center gap-2">
                <svg className="w-4 h-4 text-green-800 dark:text-green-300 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
                <span>{MENSAJES_OCR.FOTO_GUARDADA}</span>
              </div>

              {job.lastSyncError && (
                <p className="text-xs text-red-800 dark:text-red-300 pl-1 leading-relaxed">
                  {formatearErrorAmigable(job.lastSyncError)}
                </p>
              )}

              {onConteoManual && (
                <div className="pt-1">
                  <button
                    type="button"
                    onClick={onConteoManual}
                    className="w-full py-3 bg-app-elevated hover:bg-app-canvas border border-app-line text-app-fg text-xs font-bold rounded-btn transition-all min-h-[44px]"
                  >
                    Continuar con conteo manual
                  </button>
                </div>
              )}
            </div>
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
              ) : (
                <span className="text-base flex-shrink-0">·</span>
              )}
              <div>
                <p className="text-xs font-bold leading-tight">{cfg.label}</p>
                <p className="text-xs opacity-70 mt-0.5">
                  {job.fotos.length} foto{job.fotos.length !== 1 ? 's' : ''} · {new Date(job.capturedAt).toLocaleTimeString()}
                </p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Formulario de revisión para borrador de votos ──────────────────────────

export function RevisionOcrInline({
  job,
  onConfirmar,
  eleccionReportada,
  onConteoManual,
}: {
  job: OcrJobEntry;
  onConfirmar: NonNullable<EstadoOcrE14Props['onConfirmar']>;
  eleccionReportada?: boolean;
  onConteoManual?: () => void;
}) {
  const resultadoOcr = (job.resultadoOcr ?? {}) as Record<string, number | null>;
  const candidatosMap = job.candidatosMap || {};

  // Detectar casillas con baja confianza en el borrador
  const bajaConfianzaIds = useMemo(
    () => identificarBajaConfianza(resultadoOcr, (job as any).alertas),
    [resultadoOcr, job],
  );

  // Separar votos de candidatos, listas, circunscripciones y totales
  const listaEntries = Object.entries(resultadoOcr).filter(([k]) => k.startsWith('_lista:'));
  const candidatoEntries = Object.entries(resultadoOcr).filter(([k]) => !k.startsWith('_'));
  const circEntries = Object.entries(resultadoOcr).filter(([k]) => k.startsWith('_circ:'));
  const allVoteEntries = [...listaEntries, ...candidatoEntries];

  // Ordenar por partido y posición
  const sortedCandidatoEntries = [...allVoteEntries].sort(([idA], [idB]) => {
    const a = candidatosMap[idA];
    const b = candidatosMap[idB];
    if (!a || !b) return 0;
    const partidoCmp = (a.partido || '').localeCompare(b.partido || '');
    if (partidoCmp !== 0) return partidoCmp;
    return (a.posicion ?? -1) - (b.posicion ?? -1);
  });

  // Votos precargados (si era null en borrador, precarga 0 para edición)
  const [votos, setVotos] = useState<Record<string, number>>(
    Object.fromEntries(allVoteEntries.map(([k, v]) => [k, v ?? 0])),
  );

  // Totales por partido recalculados dinámicamente
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
    Object.fromEntries(circEntries.map(([k, v]) => [k, v ?? 0])),
  );

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showWarning, setShowWarning] = useState(false);
  const [warningMsg, setWarningMsg] = useState('');
  const [confirmado, setConfirmado] = useState(job.estado === 'CONFIRMADO');

  const handleConfirmar = async (forzar = false) => {
    setLoading(true);
    setError(null);
    try {
      const origen = evaluarOrigenBorrador({
        votos,
        circValues,
        votosBlanco,
        votosNulos,
        votosNoMarcados,
        totalVotosMesa,
        resultadoOcrOriginal: resultadoOcr,
      });

      const result = await onConfirmar(job.id, {
        resultados: { ...votos, ...circValues },
        votosBlanco,
        votosNulos,
        votosNoMarcados,
        totalVotosMesa,
        forzar,
        origen,
      });

      if (result.advertencia) {
        setWarningMsg(result.mensaje || 'Ya existen resultados para esta elección.');
        setShowWarning(true);
        setLoading(false);
        return;
      }

      setConfirmado(true);
    } catch (err: any) {
      setError(formatearErrorAmigable(err, 'Error al confirmar los resultados'));
    } finally {
      setLoading(false);
    }
  };

  if (confirmado) {
    return (
      <div className="border border-green-500/40 bg-green-500/10 rounded-card p-4">
        <div className="flex items-center gap-3">
          <span className="text-xl text-green-800 dark:text-green-300">✓</span>
          <div>
            <p className="text-sm font-black text-green-800 dark:text-green-300">Resultados del borrador confirmados</p>
            <p className="text-xs text-green-800 dark:text-green-300 mt-0.5">
              {Object.keys(votos).length} candidatos registrados para esta mesa.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="border border-green-500/40 bg-app-surface text-app-fg rounded-card overflow-hidden">
      {/* Cabecera */}
      <div className="bg-green-500/10 px-4 py-3 border-b border-green-500/30">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-base text-green-800 dark:text-green-300">✓</span>
            <div>
              <p className="text-xs font-black text-green-800 dark:text-green-300">Borrador de votos del E-14</p>
              <p className="text-xs text-green-800 dark:text-green-300 mt-0.5">
                Votos precargados. Revisa, corrige si es necesario y confirma.
              </p>
            </div>
          </div>
          {bajaConfianzaIds.size > 0 && (
            <span className="px-2 py-0.5 bg-amber-500/20 border border-amber-500/40 text-amber-800 dark:text-amber-300 text-xs font-bold rounded-full">
              {bajaConfianzaIds.size} por revisar
            </span>
          )}
        </div>
      </div>

      <div className="px-4 py-3 space-y-4">
        {/* Advertencia de resultados previos */}
        {eleccionReportada && !showWarning && (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-card px-3 py-2">
            <p className="text-xs text-amber-800 dark:text-amber-300 font-medium">
              Ya hay resultados registrados para esta elección. Al confirmar se reemplazarán.
            </p>
          </div>
        )}

        {/* Advertencia del backend para forzar reemplazo */}
        {showWarning && (
          <div className="bg-amber-500/10 border border-amber-500/40 rounded-card p-3">
            <p className="text-xs text-amber-800 dark:text-amber-300 font-bold mb-2">{warningMsg}</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowWarning(false)}
                className="flex-1 py-2 min-h-[44px] text-xs font-bold text-app-fg border border-app-line bg-app-elevated rounded-btn"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowWarning(false);
                  handleConfirmar(true);
                }}
                className="flex-1 py-2 min-h-[44px] text-xs font-bold text-white bg-amber-700 hover:bg-amber-800 rounded-btn"
              >
                Reemplazar
              </button>
            </div>
          </div>
        )}

        {/* Votos por candidato agrupados por partido */}
        <div>
          <p className="text-xs font-bold text-app-muted uppercase tracking-wider mb-2">
            Votos por candidato (precargados)
          </p>
          <div className="space-y-1.5 max-h-80 overflow-y-auto">
            {(() => {
              let lastPartido = '';
              return sortedCandidatoEntries.map(([id]) => {
                const info = candidatosMap[id];
                const partido = info?.partido || '';
                const showPartidoHeader = partido !== lastPartido;
                lastPartido = partido;
                const v = votos[id] ?? 0;
                const isLista = id.startsWith('_lista:');
                const isBajaConfianza = bajaConfianzaIds.has(id);

                return (
                  <div key={id}>
                    {showPartidoHeader && partido && (
                      <div className="bg-app-elevated px-2.5 py-1 rounded-btn mt-2 mb-1 flex items-center justify-between">
                        <p className="text-xs font-black text-app-muted uppercase tracking-wider">
                          {info?.listaNombre || partido} <span className="text-app-muted font-normal">({partido})</span>
                        </p>
                        <span className="text-xs font-black text-app-fg tabular-nums">
                          {totalesPorPartido[partido] ?? 0}
                        </span>
                      </div>
                    )}
                    <div
                      className={`flex items-center justify-between gap-2 p-2 rounded-card border transition-all ${
                        isBajaConfianza
                          ? 'border-amber-400 bg-amber-500/10'
                          : isLista
                            ? 'border-blue-500/30 bg-blue-500/10'
                            : 'border-app-line bg-app-elevated'
                      }`}
                    >
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        {!isLista && info?.posicion != null && (
                          <span className="text-xs font-bold text-app-muted w-6 text-right flex-shrink-0">
                            {info.posicion}
                          </span>
                        )}
                        <div className="min-w-0">
                          <p
                            className={`text-xs truncate ${isLista ? 'text-blue-800 dark:text-blue-300 font-bold' : 'text-app-fg font-medium'}`}
                            title={info?.nombre || id}
                          >
                            {isLista ? (info?.nombre || 'Votos agrupación') : (info?.nombre || id.slice(0, 8) + '...')}
                          </p>
                          {isBajaConfianza && (
                            <span className="inline-flex items-center gap-1 mt-0.5 px-1.5 py-0.5 rounded text-xs font-bold bg-amber-500/20 border border-amber-500/40 text-amber-800 dark:text-amber-300">
                              <span>!</span>
                              <span>Baja confianza · Verificar en acta</span>
                            </span>
                          )}
                        </div>
                      </div>
                      <input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        value={v}
                        onChange={(e) =>
                          setVotos(prev => ({
                            ...prev,
                            [id]: Math.max(0, parseInt(e.target.value) || 0),
                          }))
                        }
                        className={`w-16 px-2 py-1.5 text-xs text-right font-bold border-2 rounded-btn focus:outline-none ${
                          isBajaConfianza
                            ? 'border-amber-400 focus:border-amber-600 bg-amber-500/15 text-amber-800 dark:text-amber-300'
                            : isLista
                              ? 'border-blue-500/40 bg-app-surface text-app-fg focus:border-editorial-red'
                              : 'border-app-line bg-app-surface text-app-fg focus:border-editorial-red'
                        }`}
                      />
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        </div>

        {/* Nivelación de la mesa */}
        <div className="border-t border-app-line pt-3">
          <p className="text-xs font-bold text-app-muted uppercase tracking-wider mb-2">Nivelación de la mesa</p>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-app-fg">Total sufragantes (E-11)</p>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                value={totalVotosMesa}
                onChange={(e) => setTotalVotosMesa(Math.max(0, parseInt(e.target.value) || 0))}
                className="w-16 px-2 py-1.5 text-xs text-right font-bold border border-app-line bg-app-elevated text-app-fg rounded-btn focus:border-editorial-red focus:outline-none"
              />
            </div>
            {[
              { label: 'Total votos en la urna', value: resultadoOcr['_totalVotosUrna'] },
              { label: 'Total votos incinerados', value: resultadoOcr['_totalVotosIncinerados'] },
            ]
              .filter(item => item.value != null)
              .map(({ label, value }) => (
                <div key={label} className="flex items-center justify-between gap-2">
                  <p className="text-xs text-app-fg">{label}</p>
                  <span className="text-xs font-bold text-app-muted tabular-nums px-2">{value}</span>
                </div>
              ))}
          </div>
        </div>

        {/* Votos especiales */}
        <div className="border-t border-app-line pt-3">
          <p className="text-xs font-bold text-app-muted uppercase tracking-wider mb-2">Votos especiales</p>
          <div className="space-y-1.5">
            {Object.keys(circValues).length > 0 && (
              <div className="bg-app-elevated rounded-card px-2.5 py-1.5 space-y-1">
                {Object.entries(circValues).map(([key, val]) => (
                  <div key={key} className="flex items-center justify-between gap-2">
                    <p className="text-xs text-app-muted">{key.replace('_circ:', '')}</p>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      value={val}
                      onChange={(e) =>
                        setCircValues(prev => ({
                          ...prev,
                          [key]: Math.max(0, parseInt(e.target.value) || 0),
                        }))
                      }
                      className="w-16 px-2 py-1 text-xs text-right font-bold border border-app-line bg-app-surface text-app-fg rounded-btn focus:border-editorial-red focus:outline-none"
                    />
                  </div>
                ))}
              </div>
            )}

            {[
              { key: '_votosBlanco', label: 'Votos en blanco', value: votosBlanco, setter: setVotosBlanco },
              { key: '_votosNulos', label: 'Votos nulos', value: votosNulos, setter: setVotosNulos },
              { key: '_votosNoMarcados', label: 'Tarjetas no marcadas', value: votosNoMarcados, setter: setVotosNoMarcados },
            ].map(({ key, label, value, setter }) => {
              const isBajaConfianza = bajaConfianzaIds.has(key);
              return (
                <div
                  key={label}
                  className={`flex items-center justify-between gap-2 p-1.5 rounded-btn ${
                    isBajaConfianza ? 'bg-amber-500/10 border border-amber-400' : ''
                  }`}
                >
                  <p className={`text-xs ${isBajaConfianza ? 'text-amber-800 dark:text-amber-300 font-semibold' : 'text-app-fg'}`}>{label}</p>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    value={value}
                    onChange={(e) => setter(Math.max(0, parseInt(e.target.value) || 0))}
                    className={`w-16 px-2 py-1.5 text-xs text-right font-bold border-2 rounded-btn focus:outline-none ${
                      isBajaConfianza
                        ? 'border-amber-400 focus:border-amber-600 bg-amber-500/15 text-amber-800 dark:text-amber-300'
                        : 'border-app-line bg-app-elevated text-app-fg focus:border-editorial-red'
                    }`}
                  />
                </div>
              );
            })}
          </div>
        </div>

        {error && (
          <div role="alert" className="bg-red-500/10 border border-red-500/30 rounded-card px-3 py-2">
            <p className="text-xs text-red-800 dark:text-red-300 font-medium">{error}</p>
          </div>
        )}

        {/* Botones de acción */}
        {!showWarning && (
          <div className="space-y-2 pt-1">
            <button
              type="button"
              onClick={() => handleConfirmar(false)}
              disabled={loading}
              className="w-full py-3.5 rounded-btn font-black text-white text-xs uppercase tracking-wider bg-green-700 hover:bg-green-800 active:scale-[0.98] transition-all disabled:opacity-50 min-h-[44px]"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Confirmando resultados...
                </span>
              ) : (
                'Aceptar y confirmar votos'
              )}
            </button>

            {onConteoManual && (
              <button
                type="button"
                onClick={onConteoManual}
                className="w-full py-2.5 text-xs font-bold text-app-fg border border-app-line bg-app-elevated hover:bg-app-canvas rounded-btn transition-all min-h-[44px]"
              >
                Descartar borrador y contar a mano
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
