import { useState, useEffect, useCallback } from 'react';
import {
  guardarOcrJob,
  getOcrJobsByMesa,
  marcarOcrJobSyncado,
  updateOcrJobEstado,
  type CuorumDB,
} from '../db/indexeddb';

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

  const cargarJobs = useCallback(async () => {
    const all = await getOcrJobsByMesa(mesaId);
    setJobs(all);
  }, [mesaId]);

  useEffect(() => {
    cargarJobs();
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
          syncJobs();
        }
      } finally {
        setSaving(false);
      }
    },
    [mesaId, testigoId, eleccionId, campanaId, deviceId, cargarJobs],
  );

  const syncJobs = useCallback(async () => {
    if (syncing) return;
    setSyncing(true);
    try {
      const pendingJobs = jobs.filter(j => j.synced === 0 && j.estado === 'PENDIENTE');
      for (const job of pendingJobs) {
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

          const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
          const resp = await fetch(`${API_URL}/testigos/actas/ocr-job`, {
            method: 'POST',
            body: formData,
          });

          if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
          await marcarOcrJobSyncado(job.id, 'PROCESANDO');
        } catch (err) {
          await updateOcrJobEstado(job.id, 'ERROR', {
            lastSyncError: err instanceof Error ? err.message : 'Error',
          });
        }
      }
    } finally {
      setSyncing(false);
      await cargarJobs();
    }
  }, [jobs, syncing, cargarJobs]);

  // Listen for online event
  useEffect(() => {
    const handleOnline = () => syncJobs();
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [syncJobs]);

  return { jobs, saving, syncing, guardar, syncJobs, recargar: cargarJobs };
}
