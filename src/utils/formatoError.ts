interface ErrorConDetalles {
  response?: { status?: number; data?: unknown };
  code?: string;
  message?: string;
}

const MSG_SERVIDOR = 'El servidor presentó una dificultad temporal. Tu información está guardada en el teléfono y se reintentará automáticamente.';
const MSG_RED = 'Sin conexión a internet. Los datos están a salvo en tu teléfono y se enviarán cuando haya señal.';
const MSG_TIMEOUT = 'El servidor tardó en responder. Tu información está guardada y reintentaremos en breve.';
const MSG_PERMISOS = 'Tu sesión requiere confirmación o no tienes permisos para esta mesa. Avisa a tu coordinador.';
const MSG_NO_DISPONIBLE = 'La información solicitada no está disponible en este momento. Consulta con tu coordinador.';
const MSG_DATOS = 'Los datos ingresados requieren revisión. Verifica la información e intenta de nuevo.';

export function formatearErrorAmigable(error: unknown, fallback?: string): string {
  if (!error) return fallback || 'Ocurrió un inconveniente temporal. Intenta nuevamente.';

  if (typeof error === 'object' && error !== null) {
    const errObj = error as ErrorConDetalles;
    if (errObj.response?.data) {
      const data = errObj.response.data;
      let sMsg = typeof data === 'string' ? data.trim() : '';
      if (!sMsg && typeof data === 'object' && data !== null) {
        const d = data as Record<string, unknown>;
        const cand = d.error || d.mensaje || d.message || d.errorMsg;
        if (typeof cand === 'string') sMsg = cand.trim();
      }
      if (sMsg) {
        const low = sMsg.toLowerCase();
        const esTecnico = low.startsWith('<!doctype') || low.startsWith('<html') ||
          ['internal server error', 'bad gateway', 'service unavailable', 'gateway timeout', 'not found', 'unauthorized', 'forbidden'].includes(low);
        if (!esTecnico) return sMsg;
      }
    }

    const status = errObj.response?.status;
    if (typeof status === 'number') {
      if (status >= 500) return MSG_SERVIDOR;
      if (status === 404) return MSG_NO_DISPONIBLE;
      if (status === 401 || status === 403) return MSG_PERMISOS;
      if (status === 400 || status === 422) return MSG_DATOS;
    }

    const code = errObj.code ? String(errObj.code).toUpperCase() : '';
    if (['ERR_NETWORK', 'ENOTFOUND', 'ECONNREFUSED', 'ERR_INTERNET_DISCONNECTED'].includes(code)) return MSG_RED;
    if (code === 'ECONNABORTED' || code === 'ETIMEDOUT') return MSG_TIMEOUT;
  }

  const raw = typeof error === 'string' ? error : error instanceof Error ? error.message : typeof error === 'object' && error !== null && 'message' in error ? String((error as { message: unknown }).message) : String(error);
  const low = raw.toLowerCase().trim();

  if (['network error', 'failed to fetch', 'enotfound', 'econnrefused', 'err_network', 'offline', 'sin conexión', 'sin conexion'].some(k => low.includes(k))) return MSG_RED;
  if (['timeout of', 'timed out', 'econnaborted', 'etimedout'].some(k => low.includes(k)) || low.startsWith('timeout')) return MSG_TIMEOUT;

  const axMatch = raw.match(/request failed with status code (\d{3})/i);
  if (axMatch) {
    const c = parseInt(axMatch[1], 10);
    if (c >= 500) return MSG_SERVIDOR;
    if (c === 404) return MSG_NO_DISPONIBLE;
    if (c === 401 || c === 403) return MSG_PERMISOS;
    if (c === 400 || c === 422) return MSG_DATOS;
    return 'No fue posible completar la comunicación con el servidor. Tu información está guardada en el teléfono.';
  }

  if (['internal server error', 'bad gateway', 'service unavailable', 'gateway timeout'].some(k => low.includes(k))) return MSG_SERVIDOR;
  if (['403 forbidden', '401 unauthorized', 'http 403', 'http 401'].some(k => low.includes(k))) return MSG_PERMISOS;
  if (low.includes('404 not found') || low.includes('http 404')) return MSG_NO_DISPONIBLE;
  if (low.includes('400 bad request') || low.includes('http 400')) return MSG_DATOS;

  return raw;
}

export const MENSAJES_OCR = {
  FOTO_GUARDADA: 'Tu foto está guardada en el teléfono. Reintentaremos cuando haya señal.',
  ERROR_ENVIO_TITULO: 'Pendiente de sincronización',
  ERROR_ENVIO_DETALLE: 'La foto está segura en tu dispositivo. Puedes reintentar el envío ahora o esperar señal.',
  REINTENTO_BOTON: 'Reintentar envío',
} as const;
