import { useState, useEffect, useCallback, useRef } from 'react';
import {
  guardarOcrJob,
  getOcrJobsByMesa,
  getOcrJobsPendientes,
  marcarOcrJobSyncado,
  updateOcrJobEstado,
  type CuorumDB,
} from '../db/indexeddb';
import { api } from '../services/api';
import { formatearErrorAmigable } from '../utils/formatoError';

type OcrJobEntry = CuorumDB['e14OcrJobs']['value'];

interface UseOcrJobsE14Options {
  mesaId: string;
  testigoId: string;
  eleccionId: string;
  campanaId: string;
  deviceId: string;
}

const POLL_INTERVAL_MS = 3_000;

export function useOcrJobsE14({ mesaId, testigoId, eleccionId, campanaId, deviceId }: UseOcrJobsE14Options) {
  const [jobs, setJobs] = useState<OcrJobEntry[]>([]);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const syncingRef = useRef(false);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Sincroniza desde el servidor la lista de jobs de la mesa ──────────
  const sincronizarConServidor = useCallback(async () => {
    if (typeof navigator === 'undefined' || !navigator.onLine) return;
    try {
      const resp = await api.get<Array<{
        id: string;
        eleccionId: string;
        testigoId: string;
        campanaId: string;
        estado: OcrJobEntry['estado'];
        resultadoOcr?: Record<string, number | null>;
        serialE14?: string;
        errorMsg?: string;
        candidatosMap?: Record<string, { nombre: string; partido: string; posicion: number | null; listaNombre?: string }>;
        fotos?: Array<{ orden: number; url: string; capturedAt: string }>;
        createdAt: string;
      }>>(`/testigos/actas/by-mesa/${mesaId}`);

      if (resp.data && Array.isArray(resp.data)) {
        const local = await getOcrJobsByMesa(mesaId);
        for (const serverJob of resp.data) {
          const existente = local.find(j => j.id === serverJob.id || j.serverJobId === serverJob.id);
          if (!existente) {
            await guardarOcrJob({
              id: serverJob.id,
              mesaId,
              testigoId: serverJob.testigoId || testigoId,
              eleccionId: serverJob.eleccionId || eleccionId,
              campanaId: serverJob.campanaId || campanaId,
              deviceId,
              fotos: (serverJob.fotos || []).map((f) => ({
                orden: f.orden,
                blob: new Blob(),
                capturedAt: f.capturedAt || new Date().toISOString(),
              })),
              estado: serverJob.estado,
              serverJobId: serverJob.id,
              resultadoOcr: serverJob.resultadoOcr,
              serialE14: serverJob.serialE14 ?? undefined,
              candidatosMap: serverJob.candidatosMap,
              capturedAt: serverJob.createdAt || new Date().toISOString(),
              lastSyncError: serverJob.errorMsg ?? undefined,
            }, { synced: 1 });
          } else if (existente.estado !== serverJob.estado || serverJob.resultadoOcr) {
            await updateOcrJobEstado(existente.id, serverJob.estado, {
              resultadoOcr: serverJob.resultadoOcr,
              serialE14: serverJob.serialE14 ?? undefined,
              lastSyncError: serverJob.errorMsg ?? undefined,
              candidatosMap: serverJob.candidatosMap,
            });
          }
        }
      }
    } catch {
      // Sin conexión o fallo temporal
    }
  }, [mesaId, testigoId, eleccionId, campanaId, deviceId]);

  // ── Polling: verifica estado de jobs en PROCESANDO o SUBIENDO ─────────
  const pollProcessingJobs = useCallback(async () => {
    const all = await getOcrJobsByMesa(mesaId);
    const procesando = all.filter(j => (j.estado === 'PROCESANDO' || j.estado === 'SUBIENDO') && j.serverJobId);

    if (procesando.length === 0) {
      // También chequear si hay nuevos jobs en el servidor
      await sincronizarConServidor();
      const updated = await getOcrJobsByMesa(mesaId);
      setJobs(updated);
      return updated.some(j => (j.estado === 'PROCESANDO' || j.estado === 'SUBIENDO') && j.serverJobId);
    }

    let changed = false;
    for (const job of procesando) {
      try {
        const resp = await api.get<{
          estado: OcrJobEntry['estado'];
          resultadoOcr?: Record<string, number | null>;
          serialE14?: string;
          errorMsg?: string;
          candidatosMap?: Record<string, { nombre: string; partido: string; posicion: number | null }>;
        }>(`/testigos/actas/ocr-job/${job.serverJobId}`);

        const serverEstado = resp.data.estado;
        if (serverEstado === 'COMPLETADO' || serverEstado === 'ERROR' || serverEstado === 'CONFIRMADO') {
          await updateOcrJobEstado(job.id, serverEstado, {
            resultadoOcr: resp.data.resultadoOcr,
            serialE14: resp.data.serialE14,
            lastSyncError: resp.data.errorMsg,
            candidatosMap: resp.data.candidatosMap,
          });
          changed = true;
        }
      } catch {
        // Red inestable — reintentará en el siguiente tick
      }
    }

    if (changed) {
      const refreshed = await getOcrJobsByMesa(mesaId);
      setJobs(refreshed);
    }
    const remaining = await getOcrJobsByMesa(mesaId);
    return remaining.some(j => (j.estado === 'PROCESANDO' || j.estado === 'SUBIENDO') && j.serverJobId);
  }, [mesaId, sincronizarConServidor]);

  // Iniciar / detener polling
  const startPolling = useCallback(() => {
    if (pollTimerRef.current) return;
    pollTimerRef.current = setInterval(async () => {
      const stillPending = await pollProcessingJobs();
      if (!stillPending && pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    }, POLL_INTERVAL_MS);
  }, [pollProcessingJobs]);

  useEffect(() => {
    return () => {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, []);

  const cargarJobs = useCallback(async () => {
    await sincronizarConServidor();
    const all = await getOcrJobsByMesa(mesaId);
    setJobs(all);
    const hasProcessing = all.some(
      j => (j.estado === 'PROCESANDO' || j.estado === 'SUBIENDO') && j.serverJobId,
    );
    if (hasProcessing) {
      startPolling();
    }
    return all;
  }, [mesaId, sincronizarConServidor, startPolling]);

  useEffect(() => {
    cargarJobs();
  }, [cargarJobs]);

  // ── Sync: subir jobs pendientes al backend ─────────────────────────────
  const syncJobs = useCallback(async () => {
    if (syncingRef.current) return;
    syncingRef.current = true;
    setSyncing(true);
    try {
      const allPending = await getOcrJobsPendientes();

      for (const job of allPending) {
        try {
          await updateOcrJobEstado(job.id, 'SUBIENDO');
          await cargarJobs();

          const formData = new FormData();
          formData.append('campanaId', job.campanaId);
          formData.append('eleccionId', job.eleccionId);
          formData.append('mesaId', job.mesaId);
          formData.append('testigoId', job.testigoId);

          for (const foto of [...job.fotos].sort((a, b) => a.orden - b.orden)) {
            formData.append('fotos', foto.blob, `foto-${foto.orden}.jpg`);
          }

          const resp = await api.post<{ id: string; estado: string }>(
            '/testigos/actas/ocr-job',
            formData,
            { headers: { 'Content-Type': undefined } },
          );

          if (resp.status >= 400) throw new Error(`HTTP ${resp.status}`);

          await marcarOcrJobSyncado(job.id, 'PROCESANDO', resp.data.id);
          startPolling();
        } catch (err) {
          await updateOcrJobEstado(job.id, 'ERROR', {
            lastSyncError: formatearErrorAmigable(err, 'No fue posible conectar con el servidor'),
          });
        }
      }
    } finally {
      syncingRef.current = false;
      setSyncing(false);
      await cargarJobs();
    }
  }, [cargarJobs, startPolling]);

  const guardar = useCallback(
    async (fotos: { orden: number; blob: Blob }[]) => {
      setSaving(true);
      try {
        const job: Omit<OcrJobEntry, 'synced' | 'syncAttempts'> = {
          id: crypto.randomUUID(),
          mesaId,
          testigoId,
          eleccionId,
          campanaId,
          deviceId,
          fotos: fotos.map(f => ({ ...f, capturedAt: new Date().toISOString() })),
          estado: 'PENDIENTE',
          capturedAt: new Date().toISOString(),
        };
        await guardarOcrJob(job);
        await cargarJobs();

        if (navigator.onLine) {
          setTimeout(() => syncJobs(), 100);
        }
      } finally {
        setSaving(false);
      }
    },
    [mesaId, testigoId, eleccionId, campanaId, deviceId, cargarJobs, syncJobs],
  );

  const consultarJob = useCallback(
    async (jobId: string) => {
      try {
        const resp = await api.get<{
          id: string;
          estado: OcrJobEntry['estado'];
          resultadoOcr?: Record<string, number | null>;
          serialE14?: string;
          errorMsg?: string;
          candidatosMap?: Record<string, { nombre: string; partido: string; posicion: number | null }>;
        }>(`/testigos/actas/ocr-job/${jobId}`);

        if (resp.data) {
          await updateOcrJobEstado(jobId, resp.data.estado, {
            resultadoOcr: resp.data.resultadoOcr,
            serialE14: resp.data.serialE14,
            lastSyncError: resp.data.errorMsg,
            candidatosMap: resp.data.candidatosMap,
          });
          await cargarJobs();
          return resp.data;
        }
      } catch {
        // Ignorar error de red
      }
      return null;
    },
    [cargarJobs],
  );

  const confirmarJob = useCallback(
    async (jobId: string, datos: {
      resultados: Record<string, number>;
      votosBlanco: number;
      votosNulos: number;
      votosNoMarcados: number;
      totalVotosMesa: number;
      mesaId: string;
      testigoId: string;
      deviceId: string;
      forzar?: boolean;
      origen?: 'sin_cambios' | 'corregido';
    }) => {
      const allJobs = await getOcrJobsByMesa(mesaId);
      const job = allJobs.find(j => j.id === jobId || j.serverJobId === jobId);
      const serverJobId = job?.serverJobId || job?.id || jobId;

      const resp = await api.post(`/testigos/actas/ocr-job/${serverJobId}/confirmar`, datos);

      if (resp.data.advertencia) {
        return resp.data; // { advertencia: true, mensaje: "..." }
      }

      // Actualizar IDB local a CONFIRMADO con origen
      const localId = job?.id || jobId;
      await updateOcrJobEstado(localId, 'CONFIRMADO', { origen: datos.origen });
      await cargarJobs();
      return resp.data;
    },
    [mesaId, cargarJobs],
  );

  // Al montar: revisar si hay jobs en proceso y lanzar polling si aplica
  useEffect(() => {
    const init = async () => {
      const allJobs = await getOcrJobsByMesa(mesaId);
      const hasProcessing = allJobs.some(j => (j.estado === 'PROCESANDO' || j.estado === 'SUBIENDO') && j.serverJobId);
      if (hasProcessing) startPolling();
    };
    init();
  }, [mesaId, startPolling]);

  // Reconexión en línea
  useEffect(() => {
    const handleOnline = () => {
      cargarJobs();
      syncJobs();
    };
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [syncJobs, cargarJobs]);

  return {
    jobs,
    saving,
    syncing,
    guardar,
    syncJobs,
    recargar: cargarJobs,
    consultarJob,
    confirmarJob,
  };
}
