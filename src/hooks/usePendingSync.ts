import { useState, useEffect } from 'react';
import { getDB } from '../db/indexeddb';

interface PendingSyncResult {
  pendingCount: number;
  breakdown: { resultados: number; ocrJobs: number };
}

export function usePendingSync(intervalMs = 5000): PendingSyncResult {
  const [state, setState] = useState<PendingSyncResult>({
    pendingCount: 0,
    breakdown: { resultados: 0, ocrJobs: 0 },
  });

  useEffect(() => {
    let cancelled = false;

    const count = async () => {
      try {
        const db = await getDB();
        const resultados = await db.countFromIndex('resultados', 'by-synced', 0);
        const ocrJobs = await db.countFromIndex('e14OcrJobs', 'by-synced', 0);
        if (!cancelled) {
          setState({
            pendingCount: resultados + ocrJobs,
            breakdown: { resultados, ocrJobs },
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
