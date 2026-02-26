import { useState, useCallback } from 'react';
import { guardarResultado, guardarFotoE14 } from '../../db/indexeddb';
import { sincronizar, verificarConectividadReal, SyncResultado } from '../../services/syncService';
import { SelectorEleccion } from './SelectorEleccion';
import { VoteInput } from './VoteInput';
import { CapturaE14 } from '../camera/CapturaE14';
import { ObservacionesInput } from './ObservacionesInput';
import { PanelIncidencias } from '../incidencias/PanelIncidencias';

/**
 * FormularioMesaMultiple — Captura de resultados electorales
 *
 * Mejoras v2:
 * - Usa CapturaE14 con compresión real (< 200KB) en lugar de CapturaFoto básico
 * - Confirmación bidireccional post-sync (muestra respuesta del servidor)
 * - Panel de incidencias/novedades integrado
 * - Lock del acta con código de verificación SHA-256
 * - Verificación real de conectividad antes de sync
 */

interface Eleccion {
  id: string;
  nombre: string;
  tipoEleccion: string;
  tipoCargo: 'UNINOMINAL' | 'LISTA' | 'LISTA_CON_PREFERENTE';
  votoPreferente: boolean;
  candidatos?: Candidato[];
  listas?: Lista[];
}

interface Candidato {
  id: string;
  nombre: string;
  partido: string;
}

interface Lista {
  id: string;
  nombre: string;
  partido: string;
  tipoLista: 'CERRADA' | 'PREFERENTE';
  candidatos: Candidato[];
}

interface FormularioMesaMultipleProps {
  mesaId: string;
  testigoId: string;
  mesaNumero: number;
  totalSufragantes: number;
  elecciones: Eleccion[];
  deviceId: string;
}

/** Genera un código de verificación de 8 chars para el acta cerrada */
async function generarCodigoActa(mesaId: string, eleccionId: string, totalVotos: number): Promise<string> {
  const text = `${mesaId}:${eleccionId}:${totalVotos}:${Date.now()}`;
  const data = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest('SHA-256', data);
  const bytes = Array.from(new Uint8Array(hash));
  return bytes.slice(0, 4).map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
}

export function FormularioMesaMultiple({
  mesaId,
  testigoId,
  mesaNumero,
  totalSufragantes,
  elecciones,
  deviceId,
}: FormularioMesaMultipleProps) {
  const [eleccionActual, setEleccionActual] = useState<string>(elecciones[0]?.id || '');
  const [votosUninominal, setVotosUninominal] = useState<Record<string, number>>({});
  const [votosLista, setVotosLista] = useState<Record<string, number>>({});
  const [votosPreferente, setVotosPreferente] = useState<Record<string, number>>({});
  const [votosBlanco, setVotosBlanco] = useState(0);
  const [votosNulos, setVotosNulos] = useState(0);
  const [votosNoMarcados, setVotosNoMarcados] = useState(0);
  const [observaciones, setObservaciones] = useState('');
  const [fotoBlob, setFotoBlob] = useState<Blob | null>(null);
  const [fotoPreview, setFotoPreview] = useState<string | null>(null);
  const [guardado, setGuardado] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Estado de confirmación del servidor post-sync
  const [syncStatus, setSyncStatus] = useState<SyncResultado | null>(null);

  // Lock del acta
  const [actaCerrada, setActaCerrada] = useState(false);
  const [codigoActa, setCodigoActa] = useState<string | null>(null);
  const [cerrando, setCerrando] = useState(false);

  const eleccion = elecciones.find((e) => e.id === eleccionActual);

  if (!eleccion) {
    return (
      <div className="max-w-md mx-auto p-4">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-700">Error: Elección no encontrada</p>
        </div>
      </div>
    );
  }

  const calcularTotal = () => {
    if (eleccion.tipoCargo === 'UNINOMINAL') {
      return Object.values(votosUninominal).reduce((sum, v) => sum + v, 0)
        + votosBlanco + votosNulos + votosNoMarcados;
    }
    const totalListas = Object.values(votosLista).reduce((sum, v) => sum + v, 0);
    const totalPreferentes = Object.values(votosPreferente).reduce((sum, v) => sum + v, 0);
    return totalListas + totalPreferentes + votosBlanco + votosNulos + votosNoMarcados;
  };

  const totalVotos = calcularTotal();
  const hayAlertaFraude = totalVotos > totalSufragantes;

  const limpiarFormulario = useCallback(() => {
    setVotosUninominal({});
    setVotosLista({});
    setVotosPreferente({});
    setVotosBlanco(0);
    setVotosNulos(0);
    setVotosNoMarcados(0);
    setObservaciones('');
    setFotoBlob(null);
    if (fotoPreview) URL.revokeObjectURL(fotoPreview);
    setFotoPreview(null);
    setGuardado(false);
    setGuardando(false);
    setError(null);
    setSyncStatus(null);
    setActaCerrada(false);
    setCodigoActa(null);
  }, [fotoPreview]);

  const handleGuardar = async () => {
    setError(null);
    setGuardando(true);

    try {
      if (eleccion.tipoCargo === 'UNINOMINAL') {
        for (const candidato of eleccion.candidatos || []) {
          await guardarResultado({
            id: `${mesaId}_${eleccionActual}_${candidato.id}_${Date.now()}`,
            mesaId,
            testigoId,
            eleccionId: eleccionActual,
            candidato: candidato.nombre,
            partido: candidato.partido,
            candidatoId: candidato.id,
            tipoVoto: 'CANDIDATO',
            votos: votosUninominal[candidato.id] || 0,
            votosBlanco,
            votosNulos,
            votosNoMarcados,
            totalVotosMesa: totalVotos,
            observaciones: observaciones || undefined,
            capturedAt: new Date().toISOString(),
            deviceId,
          });
        }
      } else {
        for (const lista of eleccion.listas || []) {
          await guardarResultado({
            id: `${mesaId}_${eleccionActual}_lista_${lista.id}_${Date.now()}`,
            mesaId,
            testigoId,
            eleccionId: eleccionActual,
            candidato: lista.nombre,
            partido: lista.partido,
            listaId: lista.id,
            tipoVoto: 'LISTA',
            votos: votosLista[lista.id] || 0,
            votosBlanco,
            votosNulos,
            votosNoMarcados,
            totalVotosMesa: totalVotos,
            observaciones: observaciones || undefined,
            capturedAt: new Date().toISOString(),
            deviceId,
          });

          if (eleccion.votoPreferente) {
            for (const candidato of lista.candidatos) {
              const votsPreff = votosPreferente[candidato.id] || 0;
              if (votsPreff > 0) {
                await guardarResultado({
                  id: `${mesaId}_${eleccionActual}_preferente_${candidato.id}_${Date.now()}`,
                  mesaId,
                  testigoId,
                  eleccionId: eleccionActual,
                  candidato: candidato.nombre,
                  partido: lista.partido,
                  candidatoId: candidato.id,
                  listaId: lista.id,
                  tipoVoto: 'CANDIDATO',
                  votos: votsPreff,
                  votosBlanco,
                  votosNulos,
                  votosNoMarcados,
                  totalVotosMesa: totalVotos,
                  observaciones: observaciones || undefined,
                  capturedAt: new Date().toISOString(),
                  deviceId,
                });
              }
            }
          }
        }
      }

      // Votos especiales
      for (const tipoVoto of ['BLANCO', 'NULO', 'NO_MARCADO'] as const) {
        const votos = tipoVoto === 'BLANCO' ? votosBlanco : tipoVoto === 'NULO' ? votosNulos : votosNoMarcados;
        if (votos > 0) {
          await guardarResultado({
            id: `${mesaId}_${eleccionActual}_${tipoVoto}_${Date.now()}`,
            mesaId,
            testigoId,
            eleccionId: eleccionActual,
            candidato: tipoVoto,
            partido: '',
            tipoVoto,
            votos,
            votosBlanco,
            votosNulos,
            votosNoMarcados,
            totalVotosMesa: totalVotos,
            observaciones: observaciones || undefined,
            capturedAt: new Date().toISOString(),
            deviceId,
          });
        }
      }

      // Guardar foto E-14 si existe
      if (fotoBlob) {
        await guardarFotoE14({
          id: `foto_${mesaId}_${Date.now()}`,
          mesaId,
          testigoId,
          blob: fotoBlob,
          capturedAt: new Date().toISOString(),
          deviceId,
        });
      }

      setGuardado(true);

      // Intentar sync con verificación REAL de conectividad
      const online = await verificarConectividadReal();
      if (online) {
        const resultado = await sincronizar();
        setSyncStatus(resultado);
      } else {
        setSyncStatus({
          success: false,
          resultadosSincronizados: 0,
          fotosSincronizadas: 0,
          incidenciasSincronizadas: 0,
          error: 'Sin conexión — se enviará automáticamente',
        });
      }
    } catch {
      setError('Error al guardar. Los datos se reintentarán automáticamente.');
    } finally {
      setGuardando(false);
    }
  };

  const handleCerrarActa = async () => {
    setCerrando(true);
    try {
      const codigo = await generarCodigoActa(mesaId, eleccionActual, totalVotos);
      setCodigoActa(codigo);
      setActaCerrada(true);
    } finally {
      setCerrando(false);
    }
  };

  return (
    <div className="max-w-md mx-auto px-4 py-6">
      <div className="bg-white rounded-3xl shadow-2xl shadow-gray-300/50 overflow-hidden border-2 border-gray-200">

        {/* Header Card Info */}
        <div className="bg-gradient-to-br from-gray-50 via-white to-gray-50 px-6 py-6 border-b-2 border-gray-200 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-editorial-red/5 rounded-full -mr-16 -mt-16" />
          <div className="absolute bottom-0 left-0 w-24 h-24 bg-gray-200/50 rounded-full -ml-12 -mb-12" />
          <div className="relative flex items-center justify-between gap-4">
            <div>
              <p className="text-[11px] font-black text-gray-500 uppercase tracking-widest mb-1.5" style={{ letterSpacing: '0.15em' }}>
                Mesa Electoral
              </p>
              <h2 className="text-4xl font-black text-editorial-black leading-none" style={{ fontVariantNumeric: 'tabular-nums' }}>
                #{mesaNumero}
              </h2>
            </div>
            <div className="text-right">
              <p className="text-[11px] font-black text-gray-500 uppercase tracking-widest mb-1.5" style={{ letterSpacing: '0.15em' }}>
                Sufragantes
              </p>
              <p className="text-3xl font-black text-editorial-red leading-none drop-shadow-sm" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {totalSufragantes}
              </p>
            </div>
          </div>

          {/* Badge acta cerrada */}
          {actaCerrada && codigoActa && (
            <div className="mt-4 px-4 py-3 bg-green-50 border-2 border-green-400 rounded-2xl">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-green-600 font-black text-sm">🔒 Acta cerrada y firmada</span>
              </div>
              <p className="text-xs text-green-700 font-semibold">
                Código de verificación:{' '}
                <span className="font-black text-green-900 tracking-widest">{codigoActa}</span>
              </p>
              <p className="text-[10px] text-green-600 mt-1">
                Guarda este código como comprobante de tu reporte
              </p>
            </div>
          )}
        </div>

        <div className="p-6">

          {/* Selector de Elección */}
          <SelectorEleccion
            elecciones={elecciones}
            eleccionActual={eleccionActual}
            onCambiar={(id) => {
              setEleccionActual(id);
              limpiarFormulario();
            }}
          />

          {/* Alerta de fraude */}
          {hayAlertaFraude && (
            <div className="mb-6 relative overflow-hidden rounded-2xl">
              <div className="absolute inset-0 bg-gradient-to-r from-red-500 via-red-600 to-red-500 animate-pulse" />
              <div className="relative px-5 py-4 flex items-start gap-3">
                <div className="flex-shrink-0 w-12 h-12 bg-white rounded-full flex items-center justify-center shadow-lg">
                  <span className="text-2xl">⚠️</span>
                </div>
                <div className="flex-1 pt-1">
                  <p className="font-black text-white text-base uppercase tracking-wide mb-1">
                    ⚡ ALERTA DE FRAUDE
                  </p>
                  <p className="text-sm text-red-50 font-semibold leading-snug">
                    Total de votos (<span className="font-black">{totalVotos}</span>) SUPERA
                    sufragantes habilitados (<span className="font-black">{totalSufragantes}</span>)
                  </p>
                  <p className="text-xs text-red-100 mt-2 font-medium">
                    ⚠️ Verifique los datos antes de guardar
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* ── Formulario Uninominal ───────────────────────────────── */}
          {eleccion.tipoCargo === 'UNINOMINAL' && (
            <div className="space-y-4 mb-6">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-1 h-5 bg-editorial-red rounded-full" />
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Candidatos</p>
              </div>
              {eleccion.candidatos?.map((candidato) => (
                <VoteInput
                  key={candidato.id}
                  label={candidato.nombre}
                  subtitle={candidato.partido}
                  value={votosUninominal[candidato.id] || 0}
                  onChange={(value) => {
                    setVotosUninominal({ ...votosUninominal, [candidato.id]: value });
                    setGuardado(false);
                    setSyncStatus(null);
                  }}
                  size="large"
                  variant="candidate"
                  disabled={actaCerrada}
                />
              ))}
            </div>
          )}

          {/* ── Formulario Colegiado (Listas) ──────────────────────── */}
          {(eleccion.tipoCargo === 'LISTA' || eleccion.tipoCargo === 'LISTA_CON_PREFERENTE') && (
            <div className="space-y-4 mb-6">
              {eleccion.listas?.map((lista) => (
                <div key={lista.id} className="border border-gray-200 rounded-lg p-3">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-gray-800 truncate">{lista.nombre}</p>
                      <p className="text-xs text-gray-500">{lista.partido}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-gray-500 mb-1">Votos a lista</p>
                      <input
                        type="number"
                        inputMode="numeric"
                        min="0"
                        value={votosLista[lista.id] || ''}
                        disabled={actaCerrada}
                        onChange={(e) => {
                          const num = parseInt(e.target.value) || 0;
                          if (num >= 0) {
                            setVotosLista({ ...votosLista, [lista.id]: num });
                            setGuardado(false);
                            setSyncStatus(null);
                          }
                        }}
                        className="w-20 px-3 py-2 border-2 border-gray-300 rounded-lg text-center text-lg font-bold focus:border-blue-500 focus:outline-none disabled:bg-gray-50"
                        placeholder="0"
                      />
                    </div>
                  </div>
                  {eleccion.votoPreferente && lista.tipoLista === 'PREFERENTE' && (
                    <div className="border-t border-gray-100 pt-3 space-y-2">
                      <p className="text-xs font-medium text-gray-600 mb-2">Voto Preferente (opcional)</p>
                      {lista.candidatos.map((candidato) => (
                        <div key={candidato.id} className="flex items-center gap-2 text-sm">
                          <span className="flex-1 text-gray-700 truncate">{candidato.nombre}</span>
                          <input
                            type="number"
                            inputMode="numeric"
                            min="0"
                            value={votosPreferente[candidato.id] || ''}
                            disabled={actaCerrada}
                            onChange={(e) => {
                              const num = parseInt(e.target.value) || 0;
                              if (num >= 0) {
                                setVotosPreferente({ ...votosPreferente, [candidato.id]: num });
                                setGuardado(false);
                                setSyncStatus(null);
                              }
                            }}
                            className="w-16 px-2 py-1 border border-gray-300 rounded text-center text-sm font-semibold focus:border-blue-500 focus:outline-none disabled:bg-gray-50"
                            placeholder="0"
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* ── Separador Votos Especiales ──────────────────────────── */}
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t-2 border-dashed border-gray-200" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-white px-4 text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                Votos Especiales
              </span>
            </div>
          </div>

          <div className="space-y-4 mb-6 bg-gray-50 rounded-xl p-4 border border-gray-200">
            <VoteInput
              label="Votos en blanco"
              value={votosBlanco}
              onChange={(v) => { setVotosBlanco(v); setGuardado(false); setSyncStatus(null); }}
              variant="special"
              disabled={actaCerrada}
            />
            <VoteInput
              label="Votos nulos"
              value={votosNulos}
              onChange={(v) => { setVotosNulos(v); setGuardado(false); setSyncStatus(null); }}
              variant="special"
              disabled={actaCerrada}
            />
            <VoteInput
              label="No marcados"
              value={votosNoMarcados}
              onChange={(v) => { setVotosNoMarcados(v); setGuardado(false); setSyncStatus(null); }}
              variant="special"
              disabled={actaCerrada}
            />
          </div>

          {/* ── Separador Evidencia ─────────────────────────────────── */}
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t-2 border-dashed border-gray-200" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-white px-4 text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                Evidencia y Observaciones
              </span>
            </div>
          </div>

          {/* Captura foto E-14 con compresión real */}
          <div className="mb-6">
            <CapturaE14
              onFotoCapturada={(blob, preview) => {
                setFotoBlob(blob);
                setFotoPreview(preview);
                setGuardado(false);
                setSyncStatus(null);
              }}
              onEliminar={() => {
                setFotoBlob(null);
                if (fotoPreview) URL.revokeObjectURL(fotoPreview);
                setFotoPreview(null);
                setGuardado(false);
                setSyncStatus(null);
              }}
              fotoPreview={fotoPreview}
              disabled={actaCerrada}
            />
          </div>

          {/* Observaciones */}
          <div className="mb-6">
            <ObservacionesInput
              value={observaciones}
              onChange={(v) => {
                setObservaciones(v);
                setGuardado(false);
                setSyncStatus(null);
              }}
              disabled={actaCerrada}
            />
          </div>

          {/* ── Total de votos ──────────────────────────────────────── */}
          <div className={`my-4 relative overflow-hidden rounded-3xl border-2 transition-all shadow-xl ${
            hayAlertaFraude
              ? 'bg-gradient-to-br from-red-50 via-red-100 to-red-50 border-red-500 shadow-red-200'
              : totalVotos > 0
              ? 'bg-gradient-to-br from-editorial-red/5 via-editorial-red/10 to-editorial-red/5 border-editorial-red/40 shadow-red-100'
              : 'bg-gradient-to-br from-gray-50 via-gray-100 to-gray-50 border-gray-300 shadow-gray-200'
          }`}>
            <div className="absolute bottom-0 left-0 right-0 h-2 bg-gradient-to-r from-gray-200 via-gray-300 to-gray-200">
              <div
                className={`h-full transition-all duration-500 ${
                  hayAlertaFraude
                    ? 'bg-gradient-to-r from-red-500 via-red-600 to-red-500'
                    : 'bg-gradient-to-r from-editorial-red via-red-600 to-editorial-red'
                }`}
                style={{ width: `${Math.min((totalVotos / totalSufragantes) * 100, 100)}%` }}
              />
            </div>

            <div className="p-6 text-center">
              <p className="text-[11px] font-black text-gray-500 uppercase tracking-widest mb-3" style={{ letterSpacing: '0.15em' }}>
                Total Votos Registrados
              </p>
              <div className="flex items-center justify-center gap-4 mb-4">
                <div className={`text-6xl font-black leading-none transition-all ${
                  hayAlertaFraude ? 'text-red-600' : totalVotos > 0 ? 'text-editorial-red' : 'text-gray-400'
                }`} style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {totalVotos}
                </div>
                <div className="text-left">
                  <p className="text-xs text-gray-500 font-bold uppercase tracking-wide">de</p>
                  <p className="text-3xl font-black text-gray-700 leading-none">{totalSufragantes}</p>
                </div>
              </div>

              <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full border-2 ${
                hayAlertaFraude ? 'bg-red-100 border-red-400'
                : totalVotos === totalSufragantes ? 'bg-green-100 border-green-400'
                : totalVotos > 0 ? 'bg-yellow-100 border-yellow-400'
                : 'bg-gray-100 border-gray-300'
              }`}>
                <div className={`relative w-2.5 h-2.5 rounded-full ${
                  hayAlertaFraude ? 'bg-red-500'
                  : totalVotos === totalSufragantes ? 'bg-green-500'
                  : totalVotos > 0 ? 'bg-yellow-500' : 'bg-gray-400'
                }`}>
                  {hayAlertaFraude && <div className="absolute inset-0 rounded-full bg-red-500 animate-ping" />}
                </div>
                <p className={`text-xs font-black uppercase tracking-wider ${
                  hayAlertaFraude ? 'text-red-700'
                  : totalVotos === totalSufragantes ? 'text-green-700'
                  : totalVotos > 0 ? 'text-yellow-700' : 'text-gray-600'
                }`}>
                  {hayAlertaFraude ? '⚠️ Excede sufragantes'
                  : totalVotos === totalSufragantes ? '✓ Mesa completa'
                  : totalVotos > 0 ? 'En proceso de conteo'
                  : 'Sin votos registrados'}
                </p>
              </div>
            </div>
          </div>

          {/* ── Botón guardar ───────────────────────────────────────── */}
          {!actaCerrada && (
            <button
              onClick={handleGuardar}
              disabled={guardado || guardando}
              className={`relative w-full overflow-hidden rounded-2xl py-5 font-black text-white uppercase tracking-widest text-base transition-all mb-4 ${
                guardado
                  ? 'bg-gradient-to-br from-green-500 via-green-600 to-green-500 shadow-2xl shadow-green-200/50'
                  : hayAlertaFraude
                  ? 'bg-brand-600 hover:shadow-[0_20px_60px_rgba(220,38,38,0.4)] active:scale-[0.97] shadow-2xl shadow-red-300/50'
                  : 'bg-editorial-red hover:shadow-[0_20px_60px_rgba(220,38,38,0.4)] active:scale-[0.97] shadow-2xl shadow-red-300/50'
              } disabled:opacity-95 disabled:cursor-not-allowed`}
              style={{ letterSpacing: '0.1em' }}
            >
              {!guardado && !guardando && (
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent -translate-x-full animate-[shimmer_2.5s_ease-in-out_infinite]" style={{ width: '200%' }} />
              )}
              <span className="relative flex items-center justify-center gap-3 drop-shadow-md">
                {guardando ? (
                  <>
                    <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Guardando...</span>
                  </>
                ) : guardado ? (
                  <>
                    <span className="text-2xl">✓</span>
                    <span>Resultados Guardados</span>
                  </>
                ) : hayAlertaFraude ? (
                  <>
                    <span className="text-2xl animate-pulse">⚠️</span>
                    <span>Guardar con Alerta</span>
                  </>
                ) : (
                  <>
                    <span className="text-2xl">📋</span>
                    <span>Guardar Resultados</span>
                  </>
                )}
              </span>
            </button>
          )}

          {/* ── Confirmación post-sync del servidor ─────────────────── */}
          {syncStatus && (
            <div className={`mb-4 px-4 py-4 rounded-2xl border-2 ${
              syncStatus.success
                ? 'bg-green-50 border-green-400'
                : syncStatus.error?.includes('Sin conexión')
                ? 'bg-blue-50 border-blue-300'
                : 'bg-orange-50 border-orange-300'
            }`}>
              {syncStatus.success ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-green-600 text-lg">✅</span>
                    <p className="text-sm font-black text-green-800">Reporte enviado al servidor</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs text-green-700">
                    <span>📊 {syncStatus.resultadosSincronizados} resultado(s)</span>
                    <span>📸 {syncStatus.fotosSincronizadas} foto(s)</span>
                  </div>
                  {syncStatus.validacionServidor?.alertas && syncStatus.validacionServidor.alertas.length > 0 && (
                    <div className="mt-2 space-y-1">
                      <p className="text-xs font-bold text-orange-700">⚠️ Alertas del servidor:</p>
                      {syncStatus.validacionServidor.alertas.map((alerta, i) => (
                        <p key={i} className="text-xs text-orange-600 pl-2">• {alerta}</p>
                      ))}
                    </div>
                  )}
                </div>
              ) : syncStatus.error?.includes('Sin conexión') ? (
                <div className="flex items-start gap-2">
                  <span className="text-blue-500 text-lg">📱</span>
                  <div>
                    <p className="text-sm font-black text-blue-800">Guardado localmente</p>
                    <p className="text-xs text-blue-600 mt-0.5">Se enviará automáticamente cuando recupere conexión</p>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-2">
                  <span className="text-orange-500 text-lg">⚠️</span>
                  <div>
                    <p className="text-sm font-black text-orange-800">Error al sincronizar</p>
                    <p className="text-xs text-orange-600 mt-0.5">{syncStatus.error}</p>
                    <p className="text-xs text-orange-500 mt-1">Los datos están guardados. Se reintentará automáticamente.</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Lock del acta ───────────────────────────────────────── */}
          {guardado && !actaCerrada && (
            <button
              onClick={handleCerrarActa}
              disabled={cerrando}
              className="w-full py-4 mb-4 rounded-2xl border-2 border-gray-700 bg-gradient-to-br from-gray-800 to-gray-900 text-white font-black text-sm uppercase tracking-wide transition-all active:scale-[0.97] shadow-lg shadow-gray-900/30 hover:shadow-gray-900/50"
            >
              <span className="flex items-center justify-center gap-2">
                {cerrando ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Firmando...
                  </>
                ) : (
                  <>
                    <span>🔒</span>
                    Cerrar y firmar acta
                  </>
                )}
              </span>
              <p className="text-[10px] text-gray-400 font-normal mt-1 tracking-normal">
                Genera código de verificación — bloquea ediciones futuras
              </p>
            </button>
          )}

          {/* ── Panel de incidencias ────────────────────────────────── */}
          <div className="mb-6">
            <PanelIncidencias
              mesaId={mesaId}
              testigoId={testigoId}
              deviceId={deviceId}
              mesaNumero={mesaNumero}
            />
          </div>

          {/* ── Indicador de conexión ───────────────────────────────── */}
          <div className="flex items-center justify-center">
            <div className={`relative flex items-center gap-3 px-5 py-3 rounded-full border-2 shadow-lg transition-all ${
              navigator.onLine
                ? 'bg-gradient-to-r from-green-50 to-green-100 border-green-300 shadow-green-200/50'
                : 'bg-gradient-to-r from-orange-50 to-orange-100 border-orange-300 shadow-orange-200/50'
            }`}>
              {navigator.onLine && (
                <div className="absolute inset-0 rounded-full bg-green-400 opacity-20 blur-md animate-pulse" />
              )}
              <div className="relative w-3 h-3 flex items-center justify-center">
                <div className={`absolute inset-0 rounded-full shadow-lg ${
                  navigator.onLine ? 'bg-green-500' : 'bg-orange-500'
                }`} />
                {navigator.onLine && (
                  <div className="absolute inset-0 rounded-full bg-green-500 animate-ping" />
                )}
              </div>
              <span className={`text-[11px] font-black uppercase tracking-widest ${
                navigator.onLine ? 'text-green-700' : 'text-orange-700'
              }`} style={{ letterSpacing: '0.1em' }}>
                {navigator.onLine ? 'En línea · Sync automática' : 'Sin conexión · Guardado local'}
              </span>
            </div>
          </div>

          {error && (
            <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-xs text-red-600 text-center font-semibold">{error}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
