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

function extraerLote(
  responseObj: any,
  tipo: 'resultado' | 'foto' | 'incidencia',
  clave: 'aceptados' | 'rechazados',
): any {
  if (!responseObj || typeof responseObj !== 'object') return null;
  const mapa = {
    resultado: { flat: clave === 'aceptados' ? 'resultadosAceptados' : 'resultadosRechazados', key: 'resultados' },
    foto: { flat: clave === 'aceptados' ? 'fotosAceptadas' : 'fotosRechazadas', key: 'fotos' },
    incidencia: { flat: clave === 'aceptados' ? 'incidenciasAceptadas' : 'incidenciasRechazadas', key: 'incidencias' },
  } as const;
  const info = mapa[tipo];
  const seccion = responseObj[clave];
  if (seccion && typeof seccion === 'object' && !Array.isArray(seccion)) {
    return seccion[info.key] ?? null;
  }
  return (
    responseObj[info.flat] ??
    responseObj[`${clave}${info.key.charAt(0).toUpperCase() + info.key.slice(1)}`] ??
    (Array.isArray(seccion) ? seccion : null)
  );
}

/**
 * Procesa la respuesta del backend evaluando aceptados y rechazados.
 * Solo confirma identificadores que vengan explícitamente en aceptados (contrato CUO-428).
 * Cualquier otro ítem permanece rechazado/pendiente.
 */
export function procesarRespuestaSync(
  sentItems: ItemConId[],
  responseObj: any,
  itemTipo: 'resultado' | 'foto' | 'incidencia' = 'resultado',
): ResultadoProcesamientoSync {
  if (!sentItems || sentItems.length === 0) {
    return { acceptedIds: [], rejectedItems: [], tieneRechazos: false };
  }

  if (!responseObj || typeof responseObj !== 'object') {
    return {
      acceptedIds: [],
      rejectedItems: sentItems.map((i) => ({ id: i.id, error: 'Sin confirmación del servidor' })),
      tieneRechazos: true,
    };
  }

  const rejectedMap = new Map<string, string>();
  const rechazadosRaw = extraerLote(responseObj, itemTipo, 'rechazados');
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

  const acceptedSet = new Set<string>();
  const aceptadosRaw = extraerLote(responseObj, itemTipo, 'aceptados');
  if (Array.isArray(aceptadosRaw)) {
    for (const item of aceptadosRaw) {
      const id = typeof item === 'string' ? item : item?.id;
      if (id) acceptedSet.add(String(id));
    }
  }

  const errorGeneral =
    (Array.isArray(responseObj.errores) && responseObj.errores.length > 0 && String(responseObj.errores[0])) ||
    (typeof responseObj.error === 'string' && responseObj.error) ||
    (typeof responseObj.mensaje === 'string' && responseObj.mensaje) ||
    null;

  const acceptedIds: string[] = [];
  const rejectedItems: Array<{ id: string; error: string }> = [];

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
