import { useState, useEffect } from 'react';
import {
  getResultadosPendientes,
  getOcrJobsPendientes,
  getFotosPendientes,
  getIncidenciasPendientes,
  getJornadasPendientes,
} from '../db/indexeddb';

interface PendingSyncResult {
  pendingCount: number;
  breakdown: {
    resultados: number;
    ocrJobs: number;
    fotos: number;
    incidencias: number;
    jornadas: number;
  };
}

export function usePendingSync(intervalMs = 5000): PendingSyncResult {
  const [state, setState] = useState<PendingSyncResult>({
    pendingCount: 0,
    breakdown: {
      resultados: 0,
      ocrJobs: 0,
      fotos: 0,
      incidencias: 0,
      jornadas: 0,
    },
  });

  useEffect(() => {
    let cancelled = false;

    const count = async () => {
      try {
        const [resultadosArr, ocrJobsArr, fotosArr, incidenciasArr, jornadasArr] =
          await Promise.all([
            getResultadosPendientes(),
            getOcrJobsPendientes(),
            getFotosPendientes(),
            getIncidenciasPendientes(),
            getJornadasPendientes(),
          ]);

        const resultados = resultadosArr.length;
        const ocrJobs = ocrJobsArr.length;
        const fotos = fotosArr.length;
        const incidencias = incidenciasArr.length;
        const jornadas = jornadasArr.length;

        if (!cancelled) {
          setState({
            pendingCount: resultados + ocrJobs + fotos + incidencias + jornadas,
            breakdown: { resultados, ocrJobs, fotos, incidencias, jornadas },
          });
        }
      } catch {
        // DB not ready yet — ignore
      }
    };

    count();
    const id = setInterval(count, intervalMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [intervalMs]);

  return state;
}
