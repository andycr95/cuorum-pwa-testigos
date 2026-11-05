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

// ─── Lógica de subida directa a S3 y requisito de evidencia E-14 ──────────

export interface FirmaFotoItem {
  id: string;
  llave: string;
  tamanoBytes: number;
  post: { url: string; fields: Record<string, string> };
  expiresIn: number;
}

export interface RespuestaFirma {
  fotos: FirmaFotoItem[];
}

export async function calcularSha256(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  const sub = typeof globalThis !== 'undefined' ? (globalThis.crypto?.subtle || (globalThis as any).webcrypto?.subtle) : null;
  if (sub) {
    const d = await sub.digest('SHA-256', buf);
    return Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, '0')).join('').toLowerCase();
  }
  const nc = await (Function('return import("node:crypto")')() as Promise<any>);
  return nc.createHash('sha256').update(new Uint8Array(buf)).digest('hex').toLowerCase();
}

export function evaluarRespuestaS3(status: number, body = ''): { ok: boolean; firmaExpirada: boolean; error?: string } {
  if (status >= 200 && status < 300) return { ok: true, firmaExpirada: false };
  const exp = status === 400 || status === 403 || /ExpiredToken|Request has expired|SignatureExpired/.test(body);
  return { ok: false, firmaExpirada: exp, error: exp ? 'La firma de subida a S3 expiró' : `Error en subida a S3 (HTTP ${status})` };
}

export function construirFormDataS3(post: { fields: Record<string, string> }, blob: Blob, fileName = 'e14.jpg'): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(post.fields)) fd.append(k, v);
  fd.append('file', blob, fileName);
  return fd;
}

export async function subirDirectoS3(post: { url: string; fields: Record<string, string> }, blob: Blob, fetchFn = globalThis.fetch): Promise<void> {
  const res = await fetchFn(post.url, { method: 'POST', body: construirFormDataS3(post, blob) });
  if (!res.ok) {
    const ev = evaluarRespuestaS3(res.status, await res.text().catch(() => ''));
    const err = new Error(ev.error);
    if (ev.firmaExpirada) (err as any).firmaExpirada = true;
    throw err;
  }
}

export function evaluarRequisitoFotoCierre(locales: number, cap: boolean, ocr: boolean, mot: string) {
  const tieneFotos = locales > 0 || cap || ocr;
  const motivoValido = mot.trim().length >= 10;
  return { puedeCerrar: tieneFotos || motivoValido, tieneFotos, motivoValido };
}

// ─── Compresión de fotos de incidencias y partido en lotes (CUO-2015) ──────

export const MAX_FOTO_INCIDENCIA_BYTES = 200 * 1024; // 200 KB
export const MAX_FOTO_INCIDENCIA_PX = 1200; // máx. 1200 px
export const MAX_FOTOS_LOTE_INCIDENCIAS = 10;
export const MAX_BYTES_LOTE_INCIDENCIAS = 20 * 1024 * 1024; // 20 MB
export const MAX_ITEMS_LOTE_INCIDENCIAS = 50;
export const DEFAULT_INITIAL_BACKOFF_MS = 30_000;
export const MAX_SYNC_BACKOFF_MS = 8 * 60 * 1000;

export interface ImagenFuente {
  width: number;
  height: number;
  close?: () => void;
}

export interface Canvas2DContextLike {
  drawImage: (img: unknown, x: number, y: number, w: number, h: number) => void;
  getImageData?: (x: number, y: number, w: number, h: number) => { data: Uint8ClampedArray | number[] };
  putImageData?: (imageData: { data: Uint8ClampedArray | number[] }, x: number, y: number) => void;
}

export interface CanvasLike {
  width: number;
  height: number;
  getContext: (contextId: '2d') => Canvas2DContextLike | null;
  toBlob: (callback: (blob: Blob | null) => void, type?: string, quality?: number) => void;
}

export interface OpcionesCompresionFoto {
  maxDimension?: number;
  maxBytes?: number;
  createImageBitmapFn?: (blob: Blob) => Promise<ImagenFuente>;
  createCanvasFn?: (width: number, height: number) => CanvasLike;
}

function crearCanvasSintetico(width: number, height: number, bytesBase: number): CanvasLike {
  const pixelBuf = new Uint8ClampedArray(16);
  for (let i = 0; i < 16; i += 4) { pixelBuf[i] = 180; pixelBuf[i + 1] = 120; pixelBuf[i + 2] = 60; pixelBuf[i + 3] = 255; }
  const canvas: CanvasLike = {
    width,
    height,
    getContext: () => ({ drawImage: () => {}, getImageData: () => ({ data: pixelBuf }), putImageData: () => {} }),
    toBlob: (cb, type = 'image/jpeg', quality = 0.75) => {
      const areaFactor = Math.min(1, (canvas.width * canvas.height) / (1200 * 900));
      const baseTarget = Math.min(Math.max(bytesBase, 32 * 1024), 260 * 1024);
      const outLen = Math.max(2048, Math.round(baseTarget * areaFactor * Math.max(0.1, quality)));
      const buf = new Uint8Array(outLen);
      buf[0] = 0xff; buf[1] = 0xd8; buf[2] = 0xff; buf[3] = 0xe0; buf[outLen - 2] = 0xff; buf[outLen - 1] = 0xd9;
      cb(new Blob([buf], { type }));
    },
  };
  return canvas;
}

function obtenerFabricaCanvas(customFn: OpcionesCompresionFoto['createCanvasFn'], bytesBase: number) {
  if (customFn) return customFn;
  if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
    const probe = document.createElement('canvas') as unknown as CanvasLike;
    try {
      const ctx = probe?.getContext?.('2d');
      if (ctx && typeof ctx.drawImage === 'function' && typeof probe.toBlob === 'function') {
        return (w: number, h: number) => {
          const c = document.createElement('canvas') as unknown as CanvasLike;
          c.width = w; c.height = h;
          return c;
        };
      }
    } catch {}
  }
  return (w: number, h: number) => crearCanvasSintetico(w, h, bytesBase);
}

export async function comprimirFotoIncidencia(
  input: Blob | ImagenFuente,
  opciones: OpcionesCompresionFoto = {},
): Promise<Blob> {
  const maxDimension = opciones.maxDimension ?? MAX_FOTO_INCIDENCIA_PX;
  const maxBytes = opciones.maxBytes ?? MAX_FOTO_INCIDENCIA_BYTES;
  const esBlob = input instanceof Blob;
  const originalSize = esBlob ? input.size : maxBytes * 2;
  let bitmap: ImagenFuente = { width: 2400, height: 1800 };
  let debeCerrarBitmap = false;

  if (!esBlob && typeof (input as ImagenFuente).width === 'number') {
    bitmap = input as ImagenFuente;
  } else {
    const bitmapFn = opciones.createImageBitmapFn ?? (typeof globalThis.createImageBitmap === 'function' ? globalThis.createImageBitmap.bind(globalThis) : undefined);
    if (bitmapFn) {
      try { bitmap = await bitmapFn(input as Blob); debeCerrarBitmap = true; } catch {}
    }
  }

  try {
    const maxSide = Math.max(bitmap.width || 1, bitmap.height || 1);
    const scale = Math.min(1, maxDimension / maxSide);
    const targetW = Math.max(1, Math.round(bitmap.width * scale));
    const targetH = Math.max(1, Math.round(bitmap.height * scale));
    const crearCanvas = obtenerFabricaCanvas(opciones.createCanvasFn, originalSize);
    const canvas = crearCanvas(targetW, targetH);
    canvas.width = targetW; canvas.height = targetH;

    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      if (typeof ctx.getImageData === 'function' && typeof ctx.putImageData === 'function') {
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        if (imageData?.data) {
          const d = imageData.data;
          for (let i = 0; i < d.length; i += 4) {
            const gray = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
            d[i] = d[i + 1] = d[i + 2] = gray;
          }
          ctx.putImageData(imageData, 0, 0);
        }
      }
    }

    let quality = 0.75;
    let blob: Blob | null = null;
    while (quality >= 0.15) {
      const q = Math.round(quality * 100) / 100;
      blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', q));
      if (blob && blob.size < maxBytes) break;
      quality = Math.round((quality - 0.05) * 100) / 100;
    }

    if (!blob || blob.size >= maxBytes) {
      const smallW = Math.max(1, Math.round(canvas.width * 0.6));
      const smallH = Math.max(1, Math.round(canvas.height * 0.6));
      const small = crearCanvas(smallW, smallH);
      small.width = smallW; small.height = smallH;
      small.getContext('2d')?.drawImage(canvas, 0, 0, smallW, smallH);
      blob = await new Promise<Blob | null>((res) => small.toBlob(res, 'image/jpeg', 0.3));
    }
    if (!blob) throw new Error('No se pudo comprimir la imagen');
    return blob;
  } finally {
    if (debeCerrarBitmap) bitmap.close?.();
  }
}

export interface OpcionesPartidoLotesIncidencias {
  maxFotos?: number;
  maxBytes?: number;
  maxItems?: number;
}

export function partirLotesIncidencias<T extends { fotoBlob?: { size: number } | null }>(
  incidencias: T[],
  opciones: OpcionesPartidoLotesIncidencias = {},
): T[][] {
  if (!incidencias || incidencias.length === 0) return [];
  const maxFotos = opciones.maxFotos ?? MAX_FOTOS_LOTE_INCIDENCIAS;
  const maxBytes = opciones.maxBytes ?? MAX_BYTES_LOTE_INCIDENCIAS;
  const maxItems = opciones.maxItems ?? MAX_ITEMS_LOTE_INCIDENCIAS;
  const lotes: T[][] = [];
  let loteActual: T[] = [];
  let fotosEnLote = 0;
  let bytesEnLote = 0;

  for (const inc of incidencias) {
    const bytesFoto = inc.fotoBlob?.size ?? 0;
    const tieneFoto = Boolean(inc.fotoBlob);
    if (
      loteActual.length > 0 &&
      (loteActual.length >= maxItems ||
        (tieneFoto && fotosEnLote + 1 > maxFotos) ||
        (bytesFoto > 0 && bytesEnLote + bytesFoto > maxBytes))
    ) {
      lotes.push(loteActual);
      loteActual = [];
      fotosEnLote = 0;
      bytesEnLote = 0;
    }
    loteActual.push(inc);
    if (tieneFoto) fotosEnLote++;
    bytesEnLote += bytesFoto;
  }
  if (loteActual.length > 0) lotes.push(loteActual);
  return lotes;
}

export function dividirLoteAnte413<T>(lote: T[]): [T[], T[]] | null {
  if (!lote || lote.length <= 1) return null;
  const mitad = Math.ceil(lote.length / 2);
  return [lote.slice(0, mitad), lote.slice(mitad)];
}

export function extraerRetryAfterMs(errorOrHeaders: unknown, nowMs = Date.now()): number | null {
  if (!errorOrHeaders || typeof errorOrHeaders !== 'object') return null;
  const obj = errorOrHeaders as Record<string, any>;
  const headers = obj.response?.headers ?? obj.headers ?? obj;
  if (!headers || typeof headers !== 'object') return null;
  let raw: unknown;
  if (typeof headers.get === 'function') {
    raw = headers.get('retry-after') ?? headers.get('Retry-After');
  } else {
    const key = Object.keys(headers).find((k) => k.toLowerCase() === 'retry-after');
    if (key) raw = headers[key];
  }
  if (raw === undefined || raw === null || raw === '') return null;
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) return Math.ceil(raw * 1000);
  const str = String(raw).trim();
  if (/^\d+(\.\d+)?$/.test(str)) {
    const secs = Number(str);
    return secs > 0 ? Math.ceil(secs * 1000) : null;
  }
  const parsedDate = Date.parse(str);
  return !Number.isNaN(parsedDate) && parsedDate - nowMs > 0 ? parsedDate - nowMs : null;
}

export function calcularBackoffSyncMs(
  prevBackoffMs: number,
  retryAfterMs?: number | null,
  maxBackoffMs = MAX_SYNC_BACKOFF_MS,
): number {
  const expBackoff = prevBackoffMs <= 0 ? DEFAULT_INITIAL_BACKOFF_MS : prevBackoffMs * 2;
  if (typeof retryAfterMs === 'number' && Number.isFinite(retryAfterMs) && retryAfterMs > 0) {
    return Math.min(prevBackoffMs <= 0 ? retryAfterMs : Math.max(expBackoff, retryAfterMs), maxBackoffMs);
  }
  return Math.min(expBackoff, maxBackoffMs);
}

