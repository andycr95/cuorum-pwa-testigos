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
import { IconoAlerta, IconoCandado, IconoDocumento, IconoCheck } from '../ui/Iconos';
import { EstadoVacio } from '../ui/EstadoVacio';
import { formatearErrorAmigable } from '../../utils/formatoError';

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
  onVolverSelector?: () => void;
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
  onVolverSelector,
}: FormularioMesaMultipleProps) {
  const [pasoActivo, setPasoActivo] = useState<'contar' | 'foto' | 'cierre'>('contar');
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

  // Si hay un job OCR COMPLETADO para la elección actual, forzar tab foto y bloquear manual
  const ocrCompletado = ocrJobs.jobs.some(
    j => (j.estado === 'COMPLETADO' || j.estado === 'CONFIRMADO') && j.eleccionId === eleccionActual,
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
        const deEstaEleccion = locales.filter(r => r.eleccionId === eleccionActual);

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

        // No hay resultados previos
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

  // Si cambia la lista de elecciones y no hay elección actual válida, sincronizar
  useEffect(() => {
    if (elecciones.length > 0 && !elecciones.some((e) => e.id === eleccionActual)) {
      setEleccionActual(elecciones[0].id);
    }
  }, [elecciones, eleccionActual]);

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

  const eleccion = elecciones.find((e) => e.id === eleccionActual) || elecciones[0];

  const calcularTotal = () => {
    if (!eleccion) return 0;
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
          ? eleccion.candidatos?.find(c => c.id === miCandidatoId)?.nombre
            || eleccion.listas?.flatMap(l => l.candidatos).find(c => c.id === miCandidatoId)?.nombre
          : eleccion.listas?.find(l => l.id === miListaId)?.nombre;
        const confirmar = window.confirm(
          `Tu candidato/lista "${nombrePropio || 'propio'}" tiene 0 votos en esta mesa. ¿Estás seguro de que es correcto?`
        );
        if (!confirmar) return;
      }
    }

    setError(null);
    setGuardando(true);

    // Pausar auto-sync de fondo para evitar que envíe resultados parciales
    // (sin la foto E-14) si el poller dispara durante el guardado.
    pauseAutoSync();

    try {
      // ─── Paso 1: Recopilar todos los datos en memoria ──────────
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

      // Fotos E-14 de evidencia (modo manual, pueden ser varias)
      const fotosData = fotosManual.map((f, i) => ({
        id: `foto_${mesaId}_${i + 1}_${Date.now()}`,
        mesaId,
        testigoId,
        blob: f.blob,
        capturedAt: now,
        deviceId,
      }));

      // ─── Paso 2: Guardar TODO en una sola transacción IDB ──────
      // Atómico: el auto-sync de fondo ve todo o nada.
      await guardarResultadosYFoto(resultadosBatch, fotosData.length > 0 ? fotosData : undefined);

      setGuardado(true);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('cuorum:sync-status'));
      }

      // ─── Paso 3: Sincronizar ───────────────────────────────────
      const online = await verificarConectividadReal();
      if (online) {
        const resultado = await sincronizar();
        setSyncStatus(resultado);

        // ─── Paso 4: Validar resultados ───────────────────────────
        try {
          const validacion = await jornadaService.validar(mesaId, eleccionActual);
          setAlertasValidacion(validacion?.alertas || []);
        } catch {
          // Validation is optional — don't block the flow
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

      // Refrescar progreso de elecciones
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

  // ─── Estados vacíos al final (después de todos los hooks y callbacks) ─────
  if (elecciones.length === 0) {
    return (
      <div className="max-w-md mx-auto px-4 py-8">
        <EstadoVacio
          tipo="vacio"
          titulo="Sin elecciones asignadas"
          mensaje="Tu mesa aún no tiene elecciones asignadas. Avisa a tu coordinador."
          accionPrincipal={{
            texto: 'Volver al selector de mesa',
            onClick: onVolverSelector || (() => {
              if (typeof window !== 'undefined' && window.history.length > 1) {
                window.history.back();
              }
            }),
          }}
        />
      </div>
    );
  }

  if (!eleccion) {
    return (
      <div className="max-w-md mx-auto px-4 py-8">
        <EstadoVacio
          tipo="advertencia"
          titulo="Elección no encontrada"
          mensaje="No se encontró la elección seleccionada para esta mesa. Avisa a tu coordinador."
          accionPrincipal={{
            texto: 'Volver al selector de mesa',
            onClick: onVolverSelector || (() => {
              if (typeof window !== 'undefined' && window.history.length > 1) {
                window.history.back();
              }
            }),
          }}
        />
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto px-4 pt-4 pb-32">
      <div className="bg-white rounded-3xl shadow-2xl shadow-gray-300/50 overflow-hidden border-2 border-gray-200">

        {/* Header Card Info */}
        <div className="bg-gray-50 px-6 py-6 border-b-2 border-gray-200 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-editorial-red/5 rounded-full -mr-16 -mt-16" />
          <div className="absolute bottom-0 left-0 w-24 h-24 bg-gray-200/50 rounded-full -ml-12 -mb-12" />
          <div className="relative flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-bold text-gray-600 uppercase tracking-wider mb-1.5">
                Mesa Electoral
              </p>
              <h2 className="text-4xl font-black text-editorial-black leading-none tabular-nums">
                #{mesaNumero}
              </h2>
            </div>
            <div className="text-right">
              <p className="text-xs font-bold text-gray-600 uppercase tracking-wider mb-1.5">
                Sufragantes
              </p>
              <p className="text-3xl font-black text-editorial-red leading-none tabular-nums">
                {totalSufragantes}
              </p>
            </div>
          </div>

          {/* Badge acta cerrada */}
          {actaCerrada && codigoActa && (
            <div className="mt-4 px-4 py-3 bg-green-50 border-2 border-green-400 rounded-2xl">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-green-600 font-black text-sm"><IconoCandado className="w-4 h-4 inline mr-1" />Acta cerrada y firmada</span>
              </div>
              <p className="text-xs text-green-700 font-semibold">
                Código de verificación:{' '}
                <span className="font-black text-green-900 tracking-widest">{codigoActa}</span>
              </p>
              <p className="text-xs text-green-600 mt-1">
                Guarda este código como comprobante de tu reporte
              </p>
            </div>
          )}
        </div>

        <div className="p-6">

          {/* Progreso de elecciones */}
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
          <div className="flex rounded-2xl bg-gray-100 p-1 mb-5 border border-gray-200" role="tablist" aria-label="Pasos de la jornada de conteo">
            <button type="button" role="tab" id="tab-contar" aria-controls="panel-contar" aria-selected={pasoActivo === 'contar'} onClick={() => setPasoActivo('contar')} className={`flex-1 py-2.5 px-2 rounded-xl font-bold text-xs sm:text-sm transition-all min-h-[44px] flex items-center justify-center gap-1.5 ${pasoActivo === 'contar' ? 'bg-editorial-red text-white shadow-sm' : 'text-gray-700 hover:text-gray-900 hover:bg-gray-200'}`}>
              <span>1. Contar</span>
            </button>
            <button type="button" role="tab" id="tab-foto" aria-controls="panel-foto" aria-selected={pasoActivo === 'foto'} onClick={() => setPasoActivo('foto')} className={`flex-1 py-2.5 px-2 rounded-xl font-bold text-xs sm:text-sm transition-all min-h-[44px] flex items-center justify-center gap-1.5 ${pasoActivo === 'foto' ? 'bg-editorial-red text-white shadow-sm' : 'text-gray-700 hover:text-gray-900 hover:bg-gray-200'}`}>
              <span>2. Foto E-14</span>
              {fotosManual.length > 0 && <span className="w-5 h-5 rounded-full bg-white/20 text-xs font-black flex items-center justify-center">{fotosManual.length}</span>}
            </button>
            <button type="button" role="tab" id="tab-cierre" aria-controls="panel-cierre" aria-selected={pasoActivo === 'cierre'} onClick={() => setPasoActivo('cierre')} className={`flex-1 py-2.5 px-2 rounded-xl font-bold text-xs sm:text-sm transition-all min-h-[44px] flex items-center justify-center gap-1.5 ${pasoActivo === 'cierre' ? 'bg-editorial-red text-white shadow-sm' : 'text-gray-700 hover:text-gray-900 hover:bg-gray-200'}`}>
              <span>3. Cerrar</span>
            </button>
          </div>

          {/* ── Paso 2: Foto E-14 (Evidencia y OCR) ─────────────────── */}
          {pasoActivo === 'foto' && (
            <div id="panel-foto" role="tabpanel" aria-labelledby="tab-foto" className="space-y-4 mb-6">
              {ocrCompletado && (
                <div className="bg-green-50 border-2 border-green-400 rounded-2xl p-4 flex items-center gap-3">
                  <IconoCheck className="w-6 h-6 text-green-600 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-black text-green-800">Fotos del E-14 recibidas</p>
                    <p className="text-xs text-green-700 mt-0.5">
                      Revisa y confirma los resultados extraidos abajo.
                    </p>
                  </div>
                </div>
              )}
              <CapturaMultipleE14
                onFotosListas={(fotos) => {
                  setFotosManual(fotos);
                  setGuardado(false);
                  setSyncStatus(null);
                  ocrJobs.guardar(fotos);
                }}
                disabled={guardado || ocrJobs.saving}
                title="Fotos del E-14 (evidencia)"
                submitLabel={`Confirmar ${fotosManual.length > 0 ? fotosManual.length + ' foto' + (fotosManual.length !== 1 ? 's' : '') : 'fotos'} como evidencia`}
              />
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
            </div>
          )}

          {/* ── Paso 1: Contar votos ───────────────────────────────── */}
          {pasoActivo === 'contar' && (
            <div id="panel-contar" role="tabpanel" aria-labelledby="tab-contar">

          {/* Verificando resultados previos */}
          {cargandoResultados && (
            <div className="py-8 text-center">
              <span className="inline-block w-6 h-6 border-2 border-editorial-red/40 border-t-transparent rounded-full animate-spin mb-2" />
              <p className="text-xs text-gray-500 font-semibold">Verificando resultados previos...</p>
            </div>
          )}

          {/* Resultados ya registrados — vista de solo lectura */}
          {!cargandoResultados && yaRegistrado && (
            <div className="space-y-4 mb-6">
              {/* Banner */}
              <div className="bg-green-50 border-2 border-green-400 rounded-2xl p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-green-500 rounded-full flex items-center justify-center shadow-md flex-shrink-0">
                    <span className="text-white text-xl">✓</span>
                  </div>
                  <div>
                    <p className="text-sm font-black text-green-800">Resultados ya registrados</p>
                    <p className="text-xs text-green-600 mt-0.5">
                      Los resultados para esta elección ya fueron capturados. Solo puedes registrar incidentes.
                    </p>
                  </div>
                </div>
              </div>

              {/* Resumen de resultados */}
              <div className="bg-white border-2 border-gray-200 rounded-2xl overflow-hidden">
                <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
                  <p className="text-xs font-black text-gray-500 uppercase tracking-wider">Resumen de votos registrados</p>
                </div>
                <div className="divide-y divide-gray-100">
                  {resultadosExistentes
                    .filter(r => r.tipoVoto === 'CANDIDATO' || r.tipoVoto === 'LISTA')
                    .map((r, i) => (
                      <div key={i} className="flex items-center justify-between px-4 py-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-gray-800 truncate">{r.candidato}</p>
                          {r.partido && <p className="text-xs text-gray-500">{r.partido}</p>}
                        </div>
                        <span className="text-lg font-black text-editorial-red ml-3">{r.votos}</span>
                      </div>
                    ))}
                </div>
                {/* Votos especiales */}
                {((resultadosExistentes[0]?.votosBlanco ?? 0) > 0 ||
                  (resultadosExistentes[0]?.votosNulos ?? 0) > 0 ||
                  (resultadosExistentes[0]?.votosNoMarcados ?? 0) > 0) && (
                  <div className="border-t-2 border-dashed border-gray-200 divide-y divide-gray-100">
                    {(resultadosExistentes[0]?.votosBlanco ?? 0) > 0 && (
                      <div className="flex items-center justify-between px-4 py-2">
                        <p className="text-xs text-gray-500">Votos en blanco</p>
                        <span className="text-sm font-bold text-gray-700">{resultadosExistentes[0].votosBlanco}</span>
                      </div>
                    )}
                    {(resultadosExistentes[0]?.votosNulos ?? 0) > 0 && (
                      <div className="flex items-center justify-between px-4 py-2">
                        <p className="text-xs text-gray-500">Votos nulos</p>
                        <span className="text-sm font-bold text-gray-700">{resultadosExistentes[0].votosNulos}</span>
                      </div>
                    )}
                    {(resultadosExistentes[0]?.votosNoMarcados ?? 0) > 0 && (
                      <div className="flex items-center justify-between px-4 py-2">
                        <p className="text-xs text-gray-500">No marcados</p>
                        <span className="text-sm font-bold text-gray-700">{resultadosExistentes[0].votosNoMarcados}</span>
                      </div>
                    )}
                  </div>
                )}
                {/* Total */}
                <div className="px-4 py-3 bg-gray-50 border-t border-gray-200 flex items-center justify-between">
                  <p className="text-xs font-black text-gray-500 uppercase tracking-wider">Total votos</p>
                  <span className="text-xl font-black text-editorial-black">
                    {resultadosExistentes[0]?.totalVotosMesa ?? 0}
                  </span>
                </div>
              </div>

              {/* Timestamp */}
              {resultadosExistentes[0]?.capturedAt && (
                <p className="text-center text-xs text-gray-500 font-semibold">
                  Registrado el {new Date(resultadosExistentes[0].capturedAt).toLocaleString('es-CO')}
                </p>
              )}
            </div>
          )}

          {/* ── Formulario editable (solo si NO hay resultados previos) ── */}
          {!cargandoResultados && !yaRegistrado && (<>

          {/* Alerta de fraude */}
          {hayAlertaFraude && (
            <div className="mb-6 relative overflow-hidden rounded-2xl bg-red-600">
              <div className="relative px-5 py-4 flex items-start gap-3">
                <div className="flex-shrink-0 w-12 h-12 bg-white rounded-full flex items-center justify-center shadow-lg">
                  <IconoAlerta className="w-6 h-6 text-red-600" />
                </div>
                <div className="flex-1 pt-1">
                  <p className="font-black text-white text-base uppercase tracking-wide mb-1">
                    ALERTA DE FRAUDE
                  </p>
                  <p className="text-sm text-red-50 font-semibold leading-snug">
                    Total de votos (<span className="font-black">{totalVotos}</span>) SUPERA
                    sufragantes habilitados (<span className="font-black">{totalSufragantes}</span>)
                  </p>
                  <p className="text-xs text-red-100 mt-2 font-medium">
                    Verifique los datos antes de guardar
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
                  numero={candidato.numero}
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
                        disabled={guardado}
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
                            disabled={guardado}
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
              <span className="bg-white px-4 text-xs font-bold text-gray-500 uppercase tracking-wider">
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

          {/* ── Botón guardar (CUO-207: 56 px de alto, estado Guardado, sin degradados) ── */}
          {!actaCerrada && (
            <button
              type="button"
              onClick={handleGuardar}
              disabled={guardado || guardando}
              data-testid="btn-guardar-resultados"
              className={`w-full h-14 min-h-[56px] rounded-xl font-bold text-white uppercase text-sm tracking-wide transition-all my-4 shadow-md flex items-center justify-center gap-2 select-none ${
                guardado
                  ? 'bg-[#15803D] hover:bg-[#166534] cursor-default'
                  : hayAlertaFraude
                  ? 'bg-editorial-red hover:bg-red-700 active:scale-[0.98]'
                  : 'bg-editorial-red hover:bg-red-700 active:scale-[0.98]'
              } disabled:opacity-90 disabled:cursor-not-allowed`}
            >
              <span className="flex items-center justify-center gap-2">
                {guardando ? (
                  <>
                    <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Guardando...</span>
                  </>
                ) : guardado ? (
                  <>
                    <IconoCheck className="w-6 h-6 text-white" />
                    <span>Guardado</span>
                  </>
                ) : hayAlertaFraude ? (
                  <>
                    <IconoAlerta className="w-6 h-6 text-white animate-pulse" />
                    <span>Guardar con Alerta</span>
                  </>
                ) : (
                  <>
                    <IconoDocumento className="w-6 h-6 text-white" />
                    <span>Guardar Resultados</span>
                  </>
                )}
              </span>
            </button>
          )}

          {/* Fin paso 1: Contar votos */}
          </>)}
          </div>
          )}

          {/* ── Paso 3: Cierre y Observaciones ─────────────────────────── */}
          {pasoActivo === 'cierre' && (
            <div id="panel-cierre" role="tabpanel" aria-labelledby="tab-cierre">
            {/* Observaciones */}
            <div className="mb-6">
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
                    <IconoCheck className="w-5 h-5 text-green-600" />
                    <p className="text-sm font-black text-green-800">Reporte enviado al servidor</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs text-green-700">
                    <span>{syncStatus.resultadosSincronizados} resultado(s)</span>
                    <span>{syncStatus.fotosSincronizadas} foto(s)</span>
                  </div>
                  {syncStatus.validacionServidor?.alertas && syncStatus.validacionServidor.alertas.length > 0 && (
                    <div className="mt-2 space-y-1">
                      <p className="text-xs font-bold text-orange-700">Alertas del servidor:</p>
                      {syncStatus.validacionServidor.alertas.map((alerta, i) => (
                        <p key={i} className="text-xs text-orange-600 pl-2">• {alerta}</p>
                      ))}
                    </div>
                  )}
                </div>
              ) : syncStatus.error?.includes('Sin conexión') ? (
                <div className="flex items-start gap-2">
                  <IconoDocumento className="w-5 h-5 text-blue-500 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-black text-blue-800">Guardado localmente</p>
                    <p className="text-xs text-blue-600 mt-0.5">Se enviará automáticamente cuando recupere conexión</p>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-2">
                  <IconoAlerta className="w-5 h-5 text-orange-600 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-black text-orange-800">Error al sincronizar</p>
                    <p className="text-xs text-orange-700 mt-0.5">{formatearErrorAmigable(syncStatus.error)}</p>
                    <p className="text-xs text-orange-700 mt-1">Los datos están guardados en tu teléfono. Se reintentará automáticamente.</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Alertas de validación ───────────────────────────────── */}
          {alertasValidacion && alertasValidacion.length > 0 && (
            <div className="mb-4 space-y-2">
              {alertasValidacion.map((alerta, i) => (
                <div
                  key={i}
                  className={`px-4 py-3 rounded-2xl border-2 flex items-start gap-2 ${
                    alerta.severidad === 'error'
                      ? 'bg-red-50 border-red-300'
                      : 'bg-amber-50 border-amber-300'
                  }`}
                >
                  <svg
                    className={`w-5 h-5 flex-shrink-0 mt-0.5 ${
                      alerta.severidad === 'error' ? 'text-red-500' : 'text-amber-500'
                    }`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    {alerta.severidad === 'error' ? (
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    ) : (
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                    )}
                  </svg>
                  <p className={`text-xs font-medium ${
                    alerta.severidad === 'error' ? 'text-red-700' : 'text-amber-700'
                  }`}>
                    {alerta.mensaje}
                  </p>
                </div>
              ))}
            </div>
          )}

          {/* ── Lock del acta ───────────────────────────────────────── */}
          {guardado && !actaCerrada && (
            <button
              onClick={handleCerrarActa}
              disabled={cerrando}
              className="w-full py-4 mb-4 rounded-2xl border-2 border-gray-700 bg-gray-900 text-white font-black text-sm uppercase tracking-wide transition-all active:scale-[0.97] shadow-lg shadow-gray-900/30 hover:shadow-gray-900/50"
            >
              <span className="flex items-center justify-center gap-2">
                {cerrando ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Firmando...
                  </>
                ) : (
                  <>
                    <IconoCandado className="w-4 h-4 inline-block mr-1 text-white" />
                    Cerrar y firmar acta
                  </>
                )}
              </span>
              <p className="text-xs text-gray-400 font-normal mt-1 tracking-normal">
                Genera código de verificación — bloquea ediciones futuras
              </p>
            </button>
          )}

          {/* ── Panel de incidencias ─────────────────────────────────── */}
          <div className="mb-6">
            <PanelIncidencias
              mesaId={mesaId}
              testigoId={testigoId}
              deviceId={deviceId}
              mesaNumero={mesaNumero}
            />
          </div>

          {/* ── Botón Cerrar Acta de Mesa ───────────────────────────── */}
          {!actaCerrada && (
            <button
              type="button"
              onClick={() => setShowWizardCierre(true)}
              className="w-full py-4 mb-6 rounded-2xl border-2 border-editorial-red text-editorial-red font-black text-sm uppercase tracking-wide transition-all active:scale-[0.97] hover:bg-editorial-red/5"
            >
              <span className="flex items-center justify-center gap-2">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                <span>Cerrar Acta de Mesa</span>
              </span>
              <p className="text-xs text-editorial-red/80 font-normal mt-1 tracking-normal">
                Validación final, firma digital y comprobante para el testigo
              </p>
            </button>
          )}
          </div>
          )}

          {/* ── WizardCierre modal ─────────────────────────────────── */}
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

          {error && (
            <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-xs text-red-600 text-center font-semibold">{error}</p>
            </div>
          )}
        </div>
      </div>

      {/* ── BARRA INFERIOR FIJA: TOTAL CONTADO VS SUFRAGANTES Y GUARDAR ── */}
      <div data-testid="barra-fija-conteo" className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t-2 border-gray-300 shadow-[0_-4px_20px_rgba(0,0,0,0.12)]">
        <div className="max-w-md mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs font-bold uppercase tracking-wider text-gray-600">Total votos:</span>
              <span data-testid="total-votos-barra" className={`text-2xl font-black tabular-nums ${hayAlertaFraude ? 'text-red-600' : 'text-gray-900'}`}>{totalVotos}</span>
              <span className="text-xs font-bold text-gray-500">/ {totalSufragantes}</span>
            </div>
            <p data-testid="estado-conteo-barra" className={`text-xs font-bold truncate mt-0.5 ${hayAlertaFraude ? 'text-red-600' : totalVotos === totalSufragantes ? 'text-green-700' : totalVotos > 0 ? 'text-amber-700' : 'text-gray-500'}`}>
              {hayAlertaFraude ? 'Excede sufragantes' : totalVotos === totalSufragantes ? '✓ Mesa completa' : totalVotos > 0 ? 'En conteo' : 'Sin votos registrados'}
            </p>
          </div>
          <button
            type="button"
            onClick={handleGuardar}
            disabled={guardado || guardando || yaRegistrado || actaCerrada}
            data-testid="btn-guardar-barra"
            aria-label={guardado ? 'Resultados guardados' : hayAlertaFraude ? 'Guardar resultados con alerta de fraude' : 'Guardar resultados de la mesa'}
            className={`min-h-[48px] px-5 py-2.5 rounded-xl font-black text-sm uppercase tracking-wide transition-all shadow-md active:scale-95 flex items-center justify-center gap-2 flex-shrink-0 select-none ${
              guardado ? 'bg-green-600 text-white cursor-default' : 'bg-editorial-red hover:bg-red-700 text-white'
            } disabled:opacity-70 disabled:cursor-not-allowed`}
          >
            {guardando ? (
              <>
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Guardando...</span>
              </>
            ) : guardado ? (
              <>
                <IconoCheck className="w-5 h-5 text-white" />
                <span>Guardado</span>
              </>
            ) : hayAlertaFraude ? (
              <>
                <IconoAlerta className="w-5 h-5 text-white animate-pulse" />
                <span>Guardar</span>
              </>
            ) : (
              <>
                <IconoDocumento className="w-5 h-5 text-white" />
                <span>Guardar</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
