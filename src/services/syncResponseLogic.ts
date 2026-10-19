export interface ItemConId {
  id: string;
}

export interface ResultadoProcesamientoSync {
  acceptedIds: string[];
  rejectedItems: Array<{ id: string; error: string }>;
  tieneRechazos: boolean;
}

let lastSyncTime: string | null = null;
let lastSyncError: string | null = null;

export function getLastSyncTime(): string | null {
  if (!lastSyncTime && typeof localStorage !== 'undefined') {
    lastSyncTime = localStorage.getItem('cuorum_last_sync_time');
  }
  return lastSyncTime;
}

export function setLastSyncTime(timeStr: string | null) {
  lastSyncTime = timeStr;
  if (typeof localStorage !== 'undefined') {
    if (timeStr === null) {
      localStorage.removeItem('cuorum_last_sync_time');
    } else {
      localStorage.setItem('cuorum_last_sync_time', timeStr);
    }
  }
}

export function clearLastSyncTime() {
  setLastSyncTime(null);
}

export function getLastSyncError(): string | null {
  if (!lastSyncError && typeof sessionStorage !== 'undefined') {
    lastSyncError = sessionStorage.getItem('cuorum_last_sync_error');
  }
  return lastSyncError;
}

export function setLastSyncError(err: string | null) {
  lastSyncError = err;
  if (typeof sessionStorage !== 'undefined') {
    if (err === null) {
      sessionStorage.removeItem('cuorum_last_sync_error');
    } else {
      sessionStorage.setItem('cuorum_last_sync_error', err);
    }
  }
}

export function clearLastSyncError() {
  setLastSyncError(null);
}

/**
 * Procesa la respuesta del backend evaluando aceptados y rechazados.
 * Soporta contratos con arreglos de IDs (string[]), objetos ({ id, error/motivo/mensaje }),
 * y conteos numéricos de rechazo.
 */
export function procesarRespuestaSync(
  sentItems: ItemConId[],
  responseObj: any,
  itemTipo: 'resultado' | 'foto' | 'incidencia' = 'resultado',
): ResultadoProcesamientoSync {
  if (!responseObj || typeof responseObj !== 'object') {
    return {
      acceptedIds: sentItems.map((i) => i.id),
      rejectedItems: [],
      tieneRechazos: false,
    };
  }

  const rejectedMap = new Map<string, string>();

  // Revisar arreglos de rechazados
  const rechazadosRaw =
    itemTipo === 'foto'
      ? (responseObj.fotosRechazadas || responseObj.rechazadosFotos || responseObj.rechazados)
      : responseObj.rechazados;

  if (Array.isArray(rechazadosRaw)) {
    for (const item of rechazadosRaw) {
      const id = typeof item === 'string' ? item : item?.id;
      const errorMsg =
        typeof item === 'object' && item !== null
          ? (item.error || item.motivo || item.mensaje || item.reason || 'Rechazado por el servidor')
          : 'Rechazado por el servidor';
      if (id) rejectedMap.set(id, errorMsg);
    }
  }

  // Revisar arreglos de aceptados explícitos
  const aceptadosRaw =
    itemTipo === 'foto'
      ? (responseObj.fotosAceptadas || responseObj.aceptadosFotos || responseObj.aceptados)
      : responseObj.aceptados;

  const acceptedIds: string[] = [];
  const rejectedItems: Array<{ id: string; error: string }> = [];

  if (Array.isArray(aceptadosRaw)) {
    const acceptedSet = new Set(
      aceptadosRaw.map((item: any) => (typeof item === 'string' ? item : item?.id)).filter(Boolean)
    );
    for (const item of sentItems) {
      if (acceptedSet.has(item.id)) {
        acceptedIds.push(item.id);
      } else {
        const err = rejectedMap.get(item.id) || 'No aceptado por el servidor';
        rejectedItems.push({ id: item.id, error: err });
      }
    }
  } else if (rejectedMap.size > 0) {
    for (const item of sentItems) {
      if (rejectedMap.has(item.id)) {
        rejectedItems.push({ id: item.id, error: rejectedMap.get(item.id)! });
      } else {
        acceptedIds.push(item.id);
      }
    }
  } else if (typeof responseObj.rechazados === 'number' && responseObj.rechazados > 0) {
    for (const item of sentItems) {
      rejectedItems.push({
        id: item.id,
        error: 'Rechazado por el servidor (el lote contiene rechazos no identificados)',
      });
    }
  } else {
    for (const item of sentItems) {
      acceptedIds.push(item.id);
    }
  }

  return {
    acceptedIds,
    rejectedItems,
    tieneRechazos: rejectedItems.length > 0,
  };
}
