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

type OcrJobEntry = CuorumDB['e14OcrJobs']['value'];

interface UseOcrJobsE14Options {
  mesaId: string;
  testigoId: string;
  eleccionId: string;
  campanaId: string;
  deviceId: string;
}

const POLL_INTERVAL_MS = 10_000;

export function useOcrJobsE14({ mesaId, testigoId, eleccionId, campanaId, deviceId }: UseOcrJobsE14Options) {
  const [jobs, setJobs] = useState<OcrJobEntry[]>([]);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const syncingRef = useRef(false);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const cargarJobs = useCallback(async () => {
    const all = await getOcrJobsByMesa(mesaId);
    setJobs(all);
    return all;
  }, [mesaId]);

  useEffect(() => {
    cargarJobs();
  }, [cargarJobs]);

  // ── Polling: checks server status for jobs in PROCESANDO state ──────────
  const pollProcessingJobs = useCallback(async () => {
    const all = await getOcrJobsByMesa(mesaId);
    const procesando = all.filter(j => j.estado === 'PROCESANDO' && j.serverJobId);

    if (procesando.length === 0) return false; // nothing to poll

    let changed = false;
    for (const job of procesando) {
      try {
        const resp = await api.get<{
          estado: OcrJobEntry['estado'];
          resultadoOcr?: Record<string, number>;
          serialE14?: string;
          errorMsg?: string;
        }>(`/testigos/actas/ocr-job/${job.serverJobId}`);

        const serverEstado = resp.data.estado;
        if (serverEstado === 'COMPLETADO' || serverEstado === 'ERROR') {
          await updateOcrJobEstado(job.id, serverEstado, {
            resultadoOcr: resp.data.resultadoOcr,
            serialE14: resp.data.serialE14,
            lastSyncError: resp.data.errorMsg,
          });
          changed = true;
        }
      } catch {
        // network error — keep polling on next tick
      }
    }

    if (changed) await cargarJobs();
    return procesando.length > 0;
  }, [mesaId, cargarJobs]);

  // Start/stop polling based on whether there are PROCESANDO jobs
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

  // Stop polling on unmount
  useEffect(() => {
    return () => {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, []);

  // ── Sync: upload pending jobs to backend ────────────────────────────────
  const syncJobs = useCallback(async () => {
    if (syncingRef.current) return;
    syncingRef.current = true;
    setSyncing(true);
    try {
      const allPending = await getOcrJobsPendientes();
      console.log(allPending);

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

          // Store server job ID so we can poll for COMPLETADO/ERROR
          await marcarOcrJobSyncado(job.id, 'PROCESANDO', resp.data.id);

          // Kick off polling immediately
          startPolling();
        } catch (err) {
          await updateOcrJobEstado(job.id, 'ERROR', {
            lastSyncError: err instanceof Error ? err.message : 'Error de conexión',
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

  // On mount: if there are already PROCESANDO jobs from a previous session, start polling
  useEffect(() => {
    getOcrJobsByMesa(mesaId).then(all => {
      const hasProcessing = all.some(j => j.estado === 'PROCESANDO' && j.serverJobId);
      if (hasProcessing) startPolling();
    });
  }, [mesaId, startPolling]);

  // Listen for online event
  useEffect(() => {
    const handleOnline = () => syncJobs();
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [syncJobs]);

  return { jobs, saving, syncing, guardar, syncJobs, recargar: cargarJobs };
}
