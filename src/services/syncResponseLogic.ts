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
 * Soporta contratos con acuses anidados (CUO-428: { resultados, fotos }),
 * planos (string[] / { id, error }[]), objetos con motivo y conteos numéricos.
 */
export function procesarRespuestaSync(
  sentItems: ItemConId[],
  responseObj: any,
  itemTipo: 'resultado' | 'foto' | 'incidencia' = 'resultado',
): ResultadoProcesamientoSync {
  if (!sentItems || sentItems.length === 0) {
    return {
      acceptedIds: [],
      rejectedItems: [],
      tieneRechazos: false,
    };
  }

  // Respuesta ausente o inválida: no confirma ningún ítem enviado
  if (!responseObj || typeof responseObj !== 'object') {
    return {
      acceptedIds: [],
      rejectedItems: sentItems.map((i) => ({
        id: i.id,
        error: 'Sin confirmación del servidor',
      })),
      tieneRechazos: true,
    };
  }

  // 1. Extraer rechazados específicos según contrato anidado o plano
  let rechazadosRaw: any = null;
  if (
    responseObj.rechazados &&
    typeof responseObj.rechazados === 'object' &&
    !Array.isArray(responseObj.rechazados)
  ) {
    if (itemTipo === 'resultado') {
      rechazadosRaw = responseObj.rechazados.resultados;
    } else if (itemTipo === 'foto') {
      rechazadosRaw = responseObj.rechazados.fotos;
    } else if (itemTipo === 'incidencia') {
      rechazadosRaw = responseObj.rechazados.incidencias;
    }
  }

  if (!rechazadosRaw) {
    if (itemTipo === 'resultado') {
      rechazadosRaw = responseObj.resultadosRechazados ?? responseObj.rechazadosResultados;
    } else if (itemTipo === 'foto') {
      rechazadosRaw = responseObj.fotosRechazadas ?? responseObj.rechazadosFotos;
    } else if (itemTipo === 'incidencia') {
      rechazadosRaw = responseObj.incidenciasRechazadas ?? responseObj.rechazadosIncidencias;
    }
  }

  if (!rechazadosRaw && Array.isArray(responseObj.rechazados)) {
    rechazadosRaw = responseObj.rechazados;
  }

  const rejectedMap = new Map<string, string>();
  if (Array.isArray(rechazadosRaw)) {
    for (const item of rechazadosRaw) {
      const id = typeof item === 'string' ? item : item?.id;
      const errorMsg =
        typeof item === 'object' && item !== null
          ? item.error || item.motivo || item.mensaje || item.reason || 'Rechazado por el servidor'
          : 'Rechazado por el servidor';
      if (id) rejectedMap.set(String(id), String(errorMsg));
    }
  }

  // 2. Extraer aceptados específicos según contrato anidado o plano
  let aceptadosRaw: any = null;
  if (
    responseObj.aceptados &&
    typeof responseObj.aceptados === 'object' &&
    !Array.isArray(responseObj.aceptados)
  ) {
    if (itemTipo === 'resultado') {
      aceptadosRaw = responseObj.aceptados.resultados;
    } else if (itemTipo === 'foto') {
      aceptadosRaw = responseObj.aceptados.fotos;
    } else if (itemTipo === 'incidencia') {
      aceptadosRaw = responseObj.aceptados.incidencias;
    }
  }

  if (!aceptadosRaw) {
    if (itemTipo === 'resultado') {
      aceptadosRaw = responseObj.resultadosAceptados ?? responseObj.aceptadosResultados;
    } else if (itemTipo === 'foto') {
      aceptadosRaw = responseObj.fotosAceptadas ?? responseObj.aceptadosFotos;
    } else if (itemTipo === 'incidencia') {
      aceptadosRaw = responseObj.incidenciasAceptadas ?? responseObj.aceptadosIncidencias;
    }
  }

  if (!aceptadosRaw && Array.isArray(responseObj.aceptados)) {
    aceptadosRaw = responseObj.aceptados;
  }

  // Mensaje general de error si existe
  const errorGeneral =
    (Array.isArray(responseObj.errores) &&
      responseObj.errores.length > 0 &&
      String(responseObj.errores[0])) ||
    (typeof responseObj.error === 'string' && responseObj.error) ||
    (typeof responseObj.mensaje === 'string' && responseObj.mensaje) ||
    null;

  const acceptedIds: string[] = [];
  const rejectedItems: Array<{ id: string; error: string }> = [];

  const acceptedSet = new Set<string>();
  if (Array.isArray(aceptadosRaw)) {
    for (const item of aceptadosRaw) {
      const id = typeof item === 'string' ? item : item?.id;
      if (id) acceptedSet.add(String(id));
    }
  }

  for (const item of sentItems) {
    if (acceptedSet.has(item.id)) {
      acceptedIds.push(item.id);
    } else {
      const err = rejectedMap.get(item.id) || errorGeneral || 'Respuesta sin confirmación del servidor';
      rejectedItems.push({ id: item.id, error: err });
    }
  }

  return {
    acceptedIds,
    rejectedItems,
    tieneRechazos: rejectedItems.length > 0,
  };
}
