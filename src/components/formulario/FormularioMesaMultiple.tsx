import { useState, useCallback, useEffect } from 'react';
import { guardarResultadosYFoto, getResultadosByMesa } from '../../db/indexeddb';
import { api } from '../../services/api';
import { sincronizar, verificarConectividadReal, pauseAutoSync, resumeAutoSync, SyncResultado } from '../../services/syncService';
import { SelectorEleccion } from './SelectorEleccion';
import { VoteInput } from './VoteInput';
import { CapturaMultipleE14 } from '../camera/CapturaMultipleE14';
import { EstadoOcrE14 } from '../camera/EstadoOcrE14';
import { ObservacionesInput } from './ObservacionesInput';
import { PanelIncidencias } from '../incidencias/PanelIncidencias';
import { useOcrJobsE14 } from '../../hooks/useOcrJobsE14';
import { authService } from '../../services/authService';
import { jornadaService, AlertaValidacion } from '../../services/jornadaService';
import { ProgresoElecciones } from '../jornada/ProgresoElecciones';
import { WizardCierre } from '../jornada/WizardCierre';

/**
 * FormularioMesaMultiple — Pantalla de conteo táctil, legible y estructurada
 *
 * Mejoras CUO-208:
 * - Filas de candidato con nombre completo en 2 líneas sin truncamiento, número y partido
 * - Botones − / + de 56×56 px con valor central grande (≥ 28 px)
 * - Barra inferior fija con total contado vs sufragantes y botón Guardar siempre visible
 * - Flujo organizado en pasos («Contar» → «Foto E-14» → «Cerrar») para reducir la altura y enfocar la tarea
 * - Texto mínimo de 14 px (16 px para ayudas) y contraste AA en todos los estados
 * - Sin degradados de color según las reglas de diseño institucional de Cuorum
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
  numero?: number | string | null;
}

interface Lista {
  id: string;
  nombre: string;
  partido: string;
  numero?: number | string | null;
  tipoLista: 'CERRADA' | 'PREFERENTE';
  candidatos: Candidato[];
}

interface ResultadoGuardado {
  candidato: string;
  partido: string;
  tipoVoto: string;
  votos: number;
  votosBlanco: number;
  votosNulos: number;
  votosNoMarcados: number;
  totalVotosMesa: number;
  capturedAt: string;
}

interface FormularioMesaMultipleProps {
  mesaId: string;
  testigoId: string;
  mesaNumero: number;
  totalSufragantes: number;
  elecciones: Eleccion[];
  deviceId: string;
  onMesaCerrada?: (codigo: string) => void;
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
  onMesaCerrada,
}: FormularioMesaMultipleProps) {
  // Pasos de la jornada de conteo: 'contar' -> 'foto' -> 'cierre'
  const [pasoActivo, setPasoActivo] = useState<'contar' | 'foto' | 'cierre'>('contar');
  const [observacionesPlegadas, setObservacionesPlegadas] = useState(false);

  const [eleccionActual, setEleccionActual] = useState<string>(elecciones[0]?.id || '');
  const [votosUninominal, setVotosUninominal] = useState<Record<string, number>>({});
  const [votosLista, setVotosLista] = useState<Record<string, number>>({});
  const [votosPreferente, setVotosPreferente] = useState<Record<string, number>>({});
  const [votosBlanco, setVotosBlanco] = useState(0);
  const [votosNulos, setVotosNulos] = useState(0);
  const [votosNoMarcados, setVotosNoMarcados] = useState(0);
  const [observaciones, setObservaciones] = useState('');
  const [fotosManual, setFotosManual] = useState<{ orden: number; blob: Blob }[]>([]);
  const [guardado, setGuardado] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Estado de confirmación del servidor post-sync
  const [syncStatus, setSyncStatus] = useState<SyncResultado | null>(null);

  // Lock del acta
  const [actaCerrada, setActaCerrada] = useState(false);
  const [codigoActa, setCodigoActa] = useState<string | null>(null);
  const [cerrando, setCerrando] = useState(false);

  // Estado para alertas de validación post-guardado
  const [alertasValidacion, setAlertasValidacion] = useState<AlertaValidacion[]>([]);
  // Trigger para refrescar ProgresoElecciones después de guardar
  const [refreshProgreso, setRefreshProgreso] = useState(0);
  // Estado para WizardCierre
  const [showWizardCierre, setShowWizardCierre] = useState(false);

  // Estado para verificación de resultados ya registrados
  const [yaRegistrado, setYaRegistrado] = useState(false);
  const [resultadosExistentes, setResultadosExistentes] = useState<ResultadoGuardado[]>([]);
  const [cargandoResultados, setCargandoResultados] = useState(true);

  // Candidato propio de la campaña
  const miCandidatoId = authService.getCandidatoId();
  const miListaId = authService.getListaId();

  // ─── OCR multi-foto hook ────────────────────────────────────
  const campanaId = authService.getCampanaId() || '';
  const ocrJobs = useOcrJobsE14({
    mesaId,
    testigoId,
    eleccionId: eleccionActual,
    campanaId,
    deviceId,
  });

  // Si hay un job OCR COMPLETADO para la elección actual, enfocar paso foto
  const ocrCompletado = ocrJobs.jobs.some(
    (j) => (j.estado === 'COMPLETADO' || j.estado === 'CONFIRMADO') && j.eleccionId === eleccionActual,
  );

  useEffect(() => {
    if (ocrCompletado) setPasoActivo('foto');
  }, [ocrCompletado]);

  // Verificar si ya existen resultados para esta mesa + elección
  useEffect(() => {
    let cancelled = false;
    const verificar = async () => {
      setCargandoResultados(true);
      try {
        // 1. Verificar en IndexedDB local
        const locales = await getResultadosByMesa(mesaId);
        const deEstaEleccion = locales.filter((r) => r.eleccionId === eleccionActual);

        if (deEstaEleccion.length > 0 && !cancelled) {
          setResultadosExistentes(deEstaEleccion);
          setYaRegistrado(true);
          setCargandoResultados(false);
          return;
        }

        // 2. Verificar en el servidor (si hay conexión)
        try {
          const { data } = await api.get<{
            data: Array<ResultadoGuardado & { eleccionId: string }>;
          }>('/testigos/resultados/historial', {
            params: { mesaId, limit: 200 },
          });
          const remotos = (data.data ?? []).filter(
            (r) => r.eleccionId === eleccionActual,
          );
          if (remotos.length > 0 && !cancelled) {
            setResultadosExistentes(remotos);
            setYaRegistrado(true);
            setCargandoResultados(false);
            return;
          }
        } catch {
          // Sin conexión — solo verificamos localmente
        }

        if (!cancelled) {
          setYaRegistrado(false);
          setResultadosExistentes([]);
        }
      } finally {
        if (!cancelled) setCargandoResultados(false);
      }
    };

    verificar();
    return () => { cancelled = true; };
  }, [mesaId, eleccionActual]);

  const eleccion = elecciones.find((e) => e.id === eleccionActual);

  const calcularTotal = useCallback(() => {
    if (!eleccion) return 0;
    if (eleccion.tipoCargo === 'UNINOMINAL') {
      return Object.values(votosUninominal).reduce((sum, v) => sum + v, 0)
        + votosBlanco + votosNulos + votosNoMarcados;
    }
    const totalListas = Object.values(votosLista).reduce((sum, v) => sum + v, 0);
    const totalPreferentes = Object.values(votosPreferente).reduce((sum, v) => sum + v, 0);
    return totalListas + totalPreferentes + votosBlanco + votosNulos + votosNoMarcados;
  }, [eleccion, votosUninominal, votosLista, votosPreferente, votosBlanco, votosNulos, votosNoMarcados]);

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
    setFotosManual([]);
    setGuardado(false);
    setGuardando(false);
    setError(null);
    setSyncStatus(null);
    setActaCerrada(false);
    setCodigoActa(null);
    setYaRegistrado(false);
    setResultadosExistentes([]);
    setCargandoResultados(true);
    setPasoActivo('contar');
  }, []);

  const handleGuardar = async () => {
    if (!eleccion) return;

    // Alerta si el candidato propio tiene 0 votos
    if (miCandidatoId || miListaId) {
      let propioTieneZero = false;
      if (eleccion.tipoCargo === 'UNINOMINAL' && miCandidatoId) {
        propioTieneZero = (votosUninominal[miCandidatoId] || 0) === 0;
      } else if (miListaId) {
        propioTieneZero = (votosLista[miListaId] || 0) === 0;
      }
      if (propioTieneZero) {
        const nombrePropio = miCandidatoId
          ? eleccion.candidatos?.find((c) => c.id === miCandidatoId)?.nombre
            || eleccion.listas?.flatMap((l) => l.candidatos).find((c) => c.id === miCandidatoId)?.nombre
          : eleccion.listas?.find((l) => l.id === miListaId)?.nombre;
        const confirmar = window.confirm(
          `Tu candidato/lista "${nombrePropio || 'propio'}" tiene 0 votos en esta mesa. ¿Estás seguro de que es correcto?`,
        );
        if (!confirmar) return;
      }
    }

    setError(null);
    setGuardando(true);
    pauseAutoSync();

    try {
      const now = new Date().toISOString();
      const resultadosBatch: Parameters<typeof guardarResultadosYFoto>[0] = [];

      if (eleccion.tipoCargo === 'UNINOMINAL') {
        for (const candidato of eleccion.candidatos || []) {
          resultadosBatch.push({
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
            capturedAt: now,
            deviceId,
          });
        }
      } else {
        for (const lista of eleccion.listas || []) {
          resultadosBatch.push({
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
            capturedAt: now,
            deviceId,
          });

          if (eleccion.votoPreferente) {
            for (const candidato of lista.candidatos) {
              const votsPreff = votosPreferente[candidato.id] || 0;
              if (votsPreff > 0) {
                resultadosBatch.push({
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
                  capturedAt: now,
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
          resultadosBatch.push({
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
            capturedAt: now,
            deviceId,
          });
        }
      }

      // Fotos de evidencia
      const fotosData = fotosManual.map((f, i) => ({
        id: `foto_${mesaId}_${i + 1}_${Date.now()}`,
        mesaId,
        testigoId,
        blob: f.blob,
        capturedAt: now,
        deviceId,
      }));

      await guardarResultadosYFoto(resultadosBatch, fotosData.length > 0 ? fotosData : undefined);
      setGuardado(true);

      const online = await verificarConectividadReal();
      if (online) {
        const resultado = await sincronizar();
        setSyncStatus(resultado);
        try {
          const validacion = await jornadaService.validar(mesaId, eleccionActual);
          setAlertasValidacion(validacion.alertas);
        } catch {
          // Opcional
        }
      } else {
        setSyncStatus({
          success: false,
          resultadosSincronizados: 0,
          fotosSincronizadas: 0,
          incidenciasSincronizadas: 0,
          error: 'Sin conexión — se enviará automáticamente',
        });
      }

      setRefreshProgreso((prev) => prev + 1);
    } catch {
      setError('Error al guardar. Los datos se reintentarán automáticamente.');
    } finally {
      setGuardando(false);
      resumeAutoSync();
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

  if (!eleccion) {
    return (
      <div className="max-w-md mx-auto p-4">
        <div className="bg-red-50 border-2 border-red-300 rounded-2xl p-4">
          <p className="text-red-700 font-semibold">Error: Elección no encontrada</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto px-4 pt-4 pb-32">
      <div className="bg-white rounded-3xl shadow-xl border-2 border-gray-200 overflow-hidden">
        {/* Cabecera de Mesa */}
        <div className="bg-gray-50 px-5 py-4 border-b-2 border-gray-200">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-bold text-gray-600 uppercase tracking-wider mb-0.5">
                Mesa Electoral
              </p>
              <h2 className="text-3xl font-black text-gray-900 leading-none tabular-nums">
                #{mesaNumero}
              </h2>
            </div>
            <div className="text-right">
              <p className="text-xs font-bold text-gray-600 uppercase tracking-wider mb-0.5">
                Sufragantes
              </p>
              <p className="text-3xl font-black text-editorial-red leading-none tabular-nums">
                {totalSufragantes}
              </p>
            </div>
          </div>

          {/* Badge acta cerrada */}
          {actaCerrada && codigoActa && (
            <div className="mt-3 px-4 py-3 bg-green-50 border-2 border-green-500 rounded-2xl">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-green-800 font-black text-sm">🔒 Acta cerrada y firmada</span>
              </div>
              <p className="text-sm text-green-900 font-semibold">
                Código de verificación:{' '}
                <span className="font-mono font-black tracking-widest">{codigoActa}</span>
              </p>
              <p className="text-xs text-green-700 mt-1">
                Guarda este código como comprobante de tu reporte
              </p>
            </div>
          )}
        </div>

        <div className="p-4 sm:p-5">
          {/* Progreso de elecciones en la mesa */}
          <ProgresoElecciones
            mesaId={mesaId}
            elecciones={elecciones.map((e) => ({ id: e.id, nombre: e.nombre }))}
            eleccionActual={eleccionActual}
            onSelectEleccion={(id) => {
              setEleccionActual(id);
              limpiarFormulario();
            }}
            refreshTrigger={refreshProgreso}
          />

          {/* Selector de Elección */}
          <SelectorEleccion
            elecciones={elecciones}
            eleccionActual={eleccionActual}
            onCambiar={(id) => {
              setEleccionActual(id);
              limpiarFormulario();
            }}
          />

          {/* Stepper de Pasos de la Jornada de Conteo */}
          <div
            className="flex rounded-2xl bg-gray-100 p-1 mb-5 border border-gray-200"
            role="tablist"
            aria-label="Pasos de la jornada de conteo"
          >
            <button
              type="button"
              role="tab"
              id="tab-contar"
              aria-selected={pasoActivo === 'contar'}
              onClick={() => setPasoActivo('contar')}
              className={`flex-1 py-2.5 px-2 rounded-xl font-bold text-xs sm:text-sm transition-all min-h-[44px] flex items-center justify-center gap-1.5 ${
                pasoActivo === 'contar'
                  ? 'bg-editorial-red text-white shadow-sm'
                  : 'text-gray-700 hover:text-gray-900 hover:bg-gray-200'
              }`}
            >
              <span>1. Contar</span>
            </button>
            <button
              type="button"
              role="tab"
              id="tab-foto"
              aria-selected={pasoActivo === 'foto'}
              onClick={() => setPasoActivo('foto')}
              className={`flex-1 py-2.5 px-2 rounded-xl font-bold text-xs sm:text-sm transition-all min-h-[44px] flex items-center justify-center gap-1.5 ${
                pasoActivo === 'foto'
                  ? 'bg-editorial-red text-white shadow-sm'
                  : 'text-gray-700 hover:text-gray-900 hover:bg-gray-200'
              }`}
            >
              <span>2. Foto E-14</span>
              {fotosManual.length > 0 && (
                <span className="w-5 h-5 rounded-full bg-white/20 text-xs font-black flex items-center justify-center">
                  {fotosManual.length}
                </span>
              )}
            </button>
            <button
              type="button"
              role="tab"
              id="tab-cierre"
              aria-selected={pasoActivo === 'cierre'}
              onClick={() => setPasoActivo('cierre')}
              className={`flex-1 py-2.5 px-2 rounded-xl font-bold text-xs sm:text-sm transition-all min-h-[44px] flex items-center justify-center gap-1.5 ${
                pasoActivo === 'cierre'
                  ? 'bg-editorial-red text-white shadow-sm'
                  : 'text-gray-700 hover:text-gray-900 hover:bg-gray-200'
              }`}
            >
              <span>3. Cerrar</span>
            </button>
          </div>

          {/* ═══════════════════════════════════════════════════════════ */}
          {/* PASO 1: CONTAR VOTOS                                       */}
          {/* ═══════════════════════════════════════════════════════════ */}
          {pasoActivo === 'contar' && (
            <div>
              {/* Verificando resultados previos */}
              {cargandoResultados && (
                <div className="py-8 text-center">
                  <span className="inline-block w-6 h-6 border-2 border-editorial-red border-t-transparent rounded-full animate-spin mb-2" />
                  <p className="text-sm text-gray-600 font-semibold">Verificando resultados previos...</p>
                </div>
              )}

              {/* Vista de solo lectura si ya fueron registrados */}
              {!cargandoResultados && yaRegistrado && (
                <div className="space-y-4 mb-6">
                  <div className="bg-green-50 border-2 border-green-500 rounded-2xl p-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 bg-green-600 text-white rounded-full flex items-center justify-center font-black flex-shrink-0">
                        ✓
                      </div>
                      <div>
                        <p className="text-sm font-black text-green-900">Resultados ya registrados</p>
                        <p className="text-xs text-green-700 mt-0.5">
                          Los resultados para esta elección ya fueron capturados.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Resumen */}
                  <div className="bg-white border-2 border-gray-200 rounded-2xl overflow-hidden shadow-sm">
                    <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
                      <p className="text-xs font-bold text-gray-700 uppercase tracking-wider">
                        Votos registrados
                      </p>
                    </div>
                    <div className="divide-y divide-gray-100">
                      {resultadosExistentes
                        .filter((r) => r.tipoVoto === 'CANDIDATO' || r.tipoVoto === 'LISTA')
                        .map((r, i) => (
                          <div key={i} className="flex items-center justify-between px-4 py-3">
                            <div className="flex-1 min-w-0 pr-2">
                              <p className="text-sm font-bold text-gray-900 break-words">{r.candidato}</p>
                              {r.partido && <p className="text-xs text-gray-600">{r.partido}</p>}
                            </div>
                            <span className="text-lg font-black text-editorial-red ml-3 tabular-nums">{r.votos}</span>
                          </div>
                        ))}
                    </div>
                    {/* Votos especiales registrados */}
                    <div className="border-t-2 border-dashed border-gray-200 divide-y divide-gray-100 bg-gray-50/50">
                      <div className="flex items-center justify-between px-4 py-2 text-xs text-gray-700">
                        <span>Votos en blanco</span>
                        <span className="font-bold tabular-nums">{resultadosExistentes[0]?.votosBlanco ?? 0}</span>
                      </div>
                      <div className="flex items-center justify-between px-4 py-2 text-xs text-gray-700">
                        <span>Votos nulos</span>
                        <span className="font-bold tabular-nums">{resultadosExistentes[0]?.votosNulos ?? 0}</span>
                      </div>
                      <div className="flex items-center justify-between px-4 py-2 text-xs text-gray-700">
                        <span>No marcados</span>
                        <span className="font-bold tabular-nums">{resultadosExistentes[0]?.votosNoMarcados ?? 0}</span>
                      </div>
                    </div>
                    {/* Total registrado */}
                    <div className="px-4 py-3 bg-gray-100 border-t border-gray-200 flex items-center justify-between">
                      <p className="text-xs font-black text-gray-800 uppercase tracking-wider">Total votos</p>
                      <span className="text-xl font-black text-gray-900 tabular-nums">
                        {resultadosExistentes[0]?.totalVotosMesa ?? 0}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Formulario editable */}
              {!cargandoResultados && !yaRegistrado && (
                <>
                  {/* Alerta de exceso de sufragantes */}
                  {hayAlertaFraude && (
                    <div className="mb-4 bg-red-50 border-2 border-red-500 rounded-2xl p-4">
                      <div className="flex items-start gap-3">
                        <span className="text-2xl flex-shrink-0" aria-hidden="true">⚠️</span>
                        <div>
                          <p className="font-black text-red-900 text-sm uppercase tracking-wide">
                            Alerta de escrutinio
                          </p>
                          <p className="text-xs sm:text-sm text-red-800 font-semibold leading-snug mt-0.5">
                            Total de votos ({totalVotos}) supera los sufragantes habilitados ({totalSufragantes}).
                          </p>
                          <p className="text-xs text-red-700 mt-1">
                            Verifique los valores antes de guardar el reporte.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Lista de candidatos uninominales */}
                  {eleccion.tipoCargo === 'UNINOMINAL' && (
                    <div className="space-y-3 mb-6" data-testid="seccion-candidatos">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-1.5 h-4 bg-editorial-red rounded-full" />
                        <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wider">
                          Candidatos
                        </h3>
                      </div>
                      {eleccion.candidatos?.map((candidato, index) => (
                        <VoteInput
                          key={candidato.id}
                          label={candidato.nombre}
                          subtitle={candidato.partido}
                          numero={candidato.numero || index + 1}
                          value={votosUninominal[candidato.id] || 0}
                          onChange={(value) => {
                            setVotosUninominal({ ...votosUninominal, [candidato.id]: value });
                            setGuardado(false);
                            setSyncStatus(null);
                          }}
                          size="large"
                          variant="candidate"
                          disabled={guardado}
                        />
                      ))}
                    </div>
                  )}

                  {/* Listas colegiadas */}
                  {(eleccion.tipoCargo === 'LISTA' || eleccion.tipoCargo === 'LISTA_CON_PREFERENTE') && (
                    <div className="space-y-4 mb-6">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-1.5 h-4 bg-editorial-red rounded-full" />
                        <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wider">
                          Listas Colegiadas
                        </h3>
                      </div>
                      {eleccion.listas?.map((lista, index) => (
                        <div key={lista.id} className="border-2 border-gray-200 rounded-2xl p-4 bg-white shadow-sm">
                          <VoteInput
                            label={lista.nombre}
                            subtitle={lista.partido}
                            numero={lista.numero || index + 1}
                            value={votosLista[lista.id] || 0}
                            onChange={(value) => {
                              setVotosLista({ ...votosLista, [lista.id]: value });
                              setGuardado(false);
                              setSyncStatus(null);
                            }}
                            size="large"
                            variant="candidate"
                            disabled={guardado}
                          />

                          {/* Voto preferente */}
                          {eleccion.votoPreferente && lista.tipoLista === 'PREFERENTE' && (
                            <div className="border-t-2 border-gray-100 pt-3 mt-3 space-y-2">
                              <p className="text-xs font-bold text-gray-700 mb-2">
                                Voto preferente por candidato (opcional)
                              </p>
                              {lista.candidatos.map((candidato, cIdx) => (
                                <VoteInput
                                  key={candidato.id}
                                  label={candidato.nombre}
                                  subtitle={`Posición ${cIdx + 1}`}
                                  numero={cIdx + 1}
                                  value={votosPreferente[candidato.id] || 0}
                                  onChange={(value) => {
                                    setVotosPreferente({ ...votosPreferente, [candidato.id]: value });
                                    setGuardado(false);
                                    setSyncStatus(null);
                                  }}
                                  disabled={guardado}
                                />
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Votos especiales */}
                  <div className="space-y-3 mb-6" data-testid="seccion-votos-especiales">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-1.5 h-4 bg-gray-500 rounded-full" />
                      <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wider">
                        Votos Especiales
                      </h3>
                    </div>
                    <VoteInput
                      label="Votos en blanco"
                      value={votosBlanco}
                      onChange={(v) => { setVotosBlanco(v); setGuardado(false); setSyncStatus(null); }}
                      variant="special"
                      disabled={guardado}
                    />
                    <VoteInput
                      label="Votos nulos"
                      value={votosNulos}
                      onChange={(v) => { setVotosNulos(v); setGuardado(false); setSyncStatus(null); }}
                      variant="special"
                      disabled={guardado}
                    />
                    <VoteInput
                      label="No marcados"
                      value={votosNoMarcados}
                      onChange={(v) => { setVotosNoMarcados(v); setGuardado(false); setSyncStatus(null); }}
                      variant="special"
                      disabled={guardado}
                    />
                  </div>

                  {/* Sección Plegable: Observaciones Rápidas */}
                  <div className="mb-6 border-2 border-gray-200 rounded-2xl overflow-hidden bg-white shadow-sm">
                    <button
                      type="button"
                      onClick={() => setObservacionesPlegadas(!observacionesPlegadas)}
                      className="w-full px-4 py-3.5 flex items-center justify-between text-left hover:bg-gray-50 transition-colors min-h-[48px]"
                      aria-expanded={observacionesPlegadas}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-base" aria-hidden="true">📝</span>
                        <span className="text-sm font-bold text-gray-800">
                          Observaciones del conteo (opcional)
                        </span>
                        {observaciones && (
                          <span className="w-2 h-2 rounded-full bg-editorial-red" />
                        )}
                      </div>
                      <span className="text-gray-500 font-bold text-sm">
                        {observacionesPlegadas ? 'Ocultar' : 'Agregar'}
                      </span>
                    </button>
                    {observacionesPlegadas && (
                      <div className="p-4 border-t-2 border-gray-100 bg-gray-50/50">
                        <ObservacionesInput
                          value={observaciones}
                          onChange={(v) => {
                            setObservaciones(v);
                            setGuardado(false);
                            setSyncStatus(null);
                          }}
                          disabled={guardado}
                        />
                      </div>
                    )}
                  </div>

                  {/* Acceso directo al paso 2 */}
                  <div className="pt-1 pb-2">
                    <button
                      type="button"
                      onClick={() => setPasoActivo('foto')}
                      className="w-full py-3.5 px-4 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-colors min-h-[48px]"
                    >
                      <span>Siguiente: Foto del E-14</span>
                      <span aria-hidden="true">→</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════════ */}
          {/* PASO 2: FOTO DEL E-14 (EVIDENCIA U OCR)                     */}
          {/* ═══════════════════════════════════════════════════════════ */}
          {pasoActivo === 'foto' && (
            <div className="space-y-4 mb-6">
              <div className="bg-red-50/60 border-2 border-editorial-red/30 rounded-2xl p-4">
                <h3 className="text-sm font-black text-gray-900 mb-1">
                  Fotografía del acta E-14
                </h3>
                <p className="text-xs sm:text-sm text-gray-700 leading-snug">
                  Toma fotos claras y legibles de cada página del formulario E-14 como evidencia de respaldo.
                </p>
              </div>

              {ocrCompletado ? (
                <div className="bg-green-50 border-2 border-green-500 rounded-2xl p-4 flex items-center gap-3">
                  <span className="text-2xl flex-shrink-0 text-green-700">✓</span>
                  <div>
                    <p className="text-sm font-black text-green-900">Fotos del E-14 procesadas</p>
                    <p className="text-xs text-green-700 mt-0.5">
                      Revisa y confirma los resultados extraídos a continuación.
                    </p>
                  </div>
                </div>
              ) : (
                <CapturaMultipleE14
                  onFotosListas={(fotos) => {
                    setFotosManual(fotos);
                    ocrJobs.guardar(fotos);
                    setGuardado(false);
                    setSyncStatus(null);
                  }}
                  disabled={ocrJobs.saving || guardado}
                />
              )}

              <EstadoOcrE14
                jobs={ocrJobs.jobs}
                onRetry={ocrJobs.syncJobs}
                onSync={ocrJobs.syncJobs}
                syncing={ocrJobs.syncing}
                onConfirmar={async (jobId, datos) => {
                  return ocrJobs.confirmarJob(jobId, {
                    ...datos,
                    mesaId,
                    testigoId,
                    deviceId,
                  });
                }}
                eleccionReportada={yaRegistrado}
              />

              {/* Botones de navegación entre pasos */}
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setPasoActivo('contar')}
                  className="flex-1 py-3 px-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-bold text-sm min-h-[48px]"
                >
                  ← Volver a Contar
                </button>
                <button
                  type="button"
                  onClick={() => setPasoActivo('cierre')}
                  className="flex-1 py-3 px-3 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-xl font-bold text-sm min-h-[48px]"
                >
                  Paso 3: Cerrar acta →
                </button>
              </div>
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════════ */}
          {/* PASO 3: NOVEDADES, OBSERVACIONES Y CIERRE DEL ACTA         */}
          {/* ═══════════════════════════════════════════════════════════ */}
          {pasoActivo === 'cierre' && (
            <div className="space-y-5 mb-6">
              {/* Observaciones completas */}
              <div className="bg-white border-2 border-gray-200 rounded-2xl p-4 shadow-sm">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-1.5 h-4 bg-editorial-red rounded-full" />
                  <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wider">
                    Observaciones Generales
                  </h3>
                </div>
                <ObservacionesInput
                  value={observaciones}
                  onChange={(v) => {
                    setObservaciones(v);
                    setGuardado(false);
                    setSyncStatus(null);
                  }}
                  disabled={guardado}
                />
              </div>

              {/* Panel de incidencias */}
              <PanelIncidencias
                mesaId={mesaId}
                testigoId={testigoId}
                deviceId={deviceId}
                mesaNumero={mesaNumero}
              />

              {/* Botón Cerrar y Firmar Acta de Mesa */}
              {!actaCerrada && (
                <div className="bg-white border-2 border-gray-200 rounded-2xl p-4 shadow-sm">
                  <h3 className="text-sm font-black text-gray-900 mb-1">
                    Cierre de Acta Electoral
                  </h3>
                  <p className="text-sm text-gray-600 mb-3">
                    Al cerrar el acta se genera un código criptográfico de verificación y se bloquean modificaciones.
                  </p>

                  <button
                    type="button"
                    onClick={() => setShowWizardCierre(true)}
                    className="w-full py-4 rounded-xl border-2 border-editorial-red text-editorial-red hover:bg-red-50 font-black text-sm uppercase tracking-wide transition-all active:scale-[0.98] min-h-[48px]"
                  >
                    <span className="flex items-center justify-center gap-2">
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                      </svg>
                      <span>Cerrar Acta de Mesa</span>
                    </span>
                  </button>
                  <p className="text-sm text-gray-500 font-medium text-center mt-2">
                    Validación final, firma digital y comprobante para el testigo
                  </p>
                </div>
              )}

              {/* Lock local si guardó antes de firmar formalmente */}
              {guardado && !actaCerrada && (
                <button
                  type="button"
                  onClick={handleCerrarActa}
                  disabled={cerrando}
                  className="w-full py-3.5 rounded-xl border-2 border-gray-700 bg-gray-800 text-white font-black text-sm uppercase tracking-wide transition-all active:scale-[0.98] min-h-[48px]"
                >
                  {cerrando ? 'Firmando acta...' : '🔒 Firma rápida local'}
                </button>
              )}

              {/* Volver a pasos anteriores */}
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setPasoActivo('contar')}
                  className="flex-1 py-3 px-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-bold text-sm min-h-[48px]"
                >
                  ← Ir a Contar
                </button>
                <button
                  type="button"
                  onClick={() => setPasoActivo('foto')}
                  className="flex-1 py-3 px-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-bold text-sm min-h-[48px]"
                >
                  ← Ir a Foto E-14
                </button>
              </div>
            </div>
          )}

          {/* Confirmación de sincronización con el servidor */}
          {syncStatus && (
            <div
              className={`mt-4 px-4 py-3 rounded-2xl border-2 ${
                syncStatus.success
                  ? 'bg-green-50 border-green-500'
                  : syncStatus.error?.includes('Sin conexión')
                  ? 'bg-blue-50 border-blue-400'
                  : 'bg-amber-50 border-amber-400'
              }`}
            >
              {syncStatus.success ? (
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-green-700 font-black text-sm">✓ Reporte sincronizado</span>
                  </div>
                  <p className="text-xs text-green-800">
                    {syncStatus.resultadosSincronizados} resultados y {syncStatus.fotosSincronizadas} fotos transmitidas.
                  </p>
                </div>
              ) : syncStatus.error?.includes('Sin conexión') ? (
                <div className="flex items-start gap-2">
                  <span className="text-blue-700 font-black text-sm">📱 Guardado en el teléfono</span>
                  <p className="text-xs text-blue-800">
                    Se enviará automáticamente tan pronto regrese la señal.
                  </p>
                </div>
              ) : (
                <div>
                  <p className="text-xs font-black text-amber-900">Guardado localmente</p>
                  <p className="text-xs text-amber-800 mt-0.5">{syncStatus.error}</p>
                </div>
              )}
            </div>
          )}

          {/* Alertas de validación de negocio */}
          {alertasValidacion.length > 0 && (
            <div className="mt-4 space-y-2">
              {alertasValidacion.map((alerta, i) => (
                <div
                  key={i}
                  className={`px-4 py-3 rounded-2xl border-2 flex items-start gap-2 ${
                    alerta.severidad === 'error'
                      ? 'bg-red-50 border-red-400'
                      : 'bg-amber-50 border-amber-400'
                  }`}
                >
                  <p className={`text-xs font-medium ${
                    alerta.severidad === 'error' ? 'text-red-800' : 'text-amber-800'
                  }`}>
                    {alerta.mensaje}
                  </p>
                </div>
              ))}
            </div>
          )}

          {/* Mensaje de error general */}
          {error && (
            <div className="mt-3 p-3 bg-red-50 border-2 border-red-300 rounded-xl">
              <p className="text-xs text-red-700 text-center font-semibold">{error}</p>
            </div>
          )}

          {/* Modal WizardCierre */}
          {showWizardCierre && (
            <WizardCierre
              mesaId={mesaId}
              mesaNumero={mesaNumero}
              elecciones={elecciones.map((e) => ({ id: e.id, nombre: e.nombre }))}
              onCerrado={(codigo) => {
                setShowWizardCierre(false);
                setActaCerrada(true);
                setCodigoActa(codigo);
                if (onMesaCerrada) onMesaCerrada(codigo);
              }}
              onCancel={() => setShowWizardCierre(false)}
            />
          )}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* BARRA INFERIOR FIJA: TOTAL CONTADO VS SUFRAGANTES Y GUARDAR    */}
      {/* Siempre visible durante el conteo sin necesidad de scroll      */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      <div
        data-testid="barra-fija-conteo"
        className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t-2 border-gray-300 shadow-[0_-4px_20px_rgba(0,0,0,0.12)]"
      >
        <div className="max-w-md mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs font-bold uppercase tracking-wider text-gray-600">
                Total votos:
              </span>
              <span
                data-testid="total-votos-barra"
                className={`text-2xl font-black tabular-nums ${
                  hayAlertaFraude ? 'text-red-600' : 'text-gray-900'
                }`}
              >
                {totalVotos}
              </span>
              <span className="text-xs font-bold text-gray-500">
                / {totalSufragantes}
              </span>
            </div>
            <p
              data-testid="estado-conteo-barra"
              className={`text-xs font-bold truncate mt-0.5 ${
                hayAlertaFraude
                  ? 'text-red-600'
                  : totalVotos === totalSufragantes
                  ? 'text-green-700'
                  : totalVotos > 0
                  ? 'text-amber-700'
                  : 'text-gray-500'
              }`}
            >
              {hayAlertaFraude
                ? '⚠️ Excede sufragantes'
                : totalVotos === totalSufragantes
                ? '✓ Mesa completa'
                : totalVotos > 0
                ? 'En conteo'
                : 'Sin votos registrados'}
            </p>
          </div>

          <button
            type="button"
            onClick={handleGuardar}
            disabled={guardado || guardando || yaRegistrado || actaCerrada}
            data-testid="btn-guardar-barra"
            className={`min-h-[48px] px-5 py-2.5 rounded-xl font-black text-sm uppercase tracking-wide transition-all shadow-md active:scale-95 flex items-center justify-center gap-2 flex-shrink-0 select-none ${
              guardado
                ? 'bg-green-600 text-white cursor-default'
                : hayAlertaFraude
                ? 'bg-editorial-red hover:bg-red-700 text-white'
                : 'bg-editorial-red hover:bg-red-700 text-white'
            } disabled:opacity-70 disabled:cursor-not-allowed`}
          >
            {guardando ? (
              <>
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Guardando...</span>
              </>
            ) : guardado ? (
              <>
                <span className="text-base">✓</span>
                <span>Guardado</span>
              </>
            ) : hayAlertaFraude ? (
              <>
                <span className="text-base" aria-hidden="true">⚠️</span>
                <span>Guardar</span>
              </>
            ) : (
              <span>Guardar</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
