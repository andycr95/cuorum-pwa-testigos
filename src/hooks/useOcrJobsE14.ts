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

export function useOcrJobsE14({ mesaId, testigoId, eleccionId, campanaId, deviceId }: UseOcrJobsE14Options) {
  const [jobs, setJobs] = useState<OcrJobEntry[]>([]);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const syncingRef = useRef(false);

  const cargarJobs = useCallback(async () => {
    const all = await getOcrJobsByMesa(mesaId);
    setJobs(all);
  }, [mesaId]);

  useEffect(() => {
    cargarJobs();
  }, [cargarJobs]);

  // Sync reads from IndexedDB directly (not from stale state)
  const syncJobs = useCallback(async () => {
    if (syncingRef.current) return;
    syncingRef.current = true;
    setSyncing(true);
    try {
      // Read pending jobs fresh from IndexedDB to avoid stale closures
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

          // Use axios api instance — auto-injects Bearer token + X-Campana-Id + /api prefix
          const resp = await api.post('/testigos/actas/ocr-job', formData, {
            headers: { 'Content-Type': undefined },
          });

          if (resp.status >= 400) throw new Error(`HTTP ${resp.status}`);
          await marcarOcrJobSyncado(job.id, 'PROCESANDO');
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
  }, [cargarJobs]);

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

        // Try to sync immediately if online
        if (navigator.onLine) {
          // Small delay to let state settle, then sync from IDB
          setTimeout(() => syncJobs(), 100);
        }
      } finally {
        setSaving(false);
      }
    },
    [mesaId, testigoId, eleccionId, campanaId, deviceId, cargarJobs, syncJobs],
  );

  // Listen for online event
  useEffect(() => {
    const handleOnline = () => syncJobs();
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [syncJobs]);

  return { jobs, saving, syncing, guardar, syncJobs, recargar: cargarJobs };
}
