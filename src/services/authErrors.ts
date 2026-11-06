/**
 * Utilidades de mapeo y sanitización de errores de autenticación
 *
 * Transforma respuestas técnicas de Axios y códigos de error en mensajes
 * en español claros y accionables para el usuario.
 * Garantiza que nunca se muestren textos en inglés ni 'status code' o 'Request failed'.
 */

export const AUTH_NOTICE_KEY = 'cuorum_testigo_auth_notice';
export const MENSAJE_SESION_VENCIDA = 'Sesión de testigo vencida. Inicia sesión de nuevo.';

export function extraerMensajeSesion401(error: unknown): string {
  const data = (error as { response?: { data?: unknown } })?.response?.data;
  let raw = '';
  if (typeof data === 'string') {
    raw = data.trim();
  } else if (typeof data === 'object' && data !== null) {
    const d = data as Record<string, unknown>;
    const cand = d.error ?? d.mensaje ?? d.message;
    if (typeof cand === 'string') raw = cand.trim();
  }
  if (!raw || /^(unauthorized|token expirado|token inv[aá]lido|credenciales inv[aá]lidas)$/i.test(raw)) {
    return MENSAJE_SESION_VENCIDA;
  }
  if (/sesi[oó]n de testigo vencida/i.test(raw) && !/inicia sesi[oó]n/i.test(raw)) {
    return `${raw.replace(/\.$/, '')}. Inicia sesión de nuevo.`;
  }
  return raw;
}

export function mapearErrorAuth(error: unknown): string {
  if (typeof error === 'string') {
    if (/status code|request failed/i.test(error)) {
      if (/400\b/.test(error)) return 'Revisa tu cédula y tu PIN de 6 dígitos';
      if (/401\b/.test(error)) return 'Cédula o PIN incorrectos';
      if (/429\b/.test(error)) return 'Demasiados intentos, espera unos minutos';
      return 'Error al iniciar sesión. Intenta nuevamente.';
    }
    return error;
  }

  // AxiosError con respuesta HTTP
  const axiosError = error as {
    isAxiosError?: boolean;
    response?: { status?: number; data?: { error?: string; detalles?: unknown } };
    code?: string;
    message?: string;
  };

  const status = axiosError?.response?.status;
  if (status === 400) {
    return 'Revisa tu cédula y tu PIN de 6 dígitos';
  }
  if (status === 401) {
    const serverError = axiosError?.response?.data?.error;
    if (typeof serverError === 'string' && /sesi[oó]n|vencid|revocad/i.test(serverError)) {
      return /sesi[oó]n de testigo vencida/i.test(serverError) && !/inicia sesi[oó]n/i.test(serverError)
        ? `${serverError.trim().replace(/\.$/, '')}. Inicia sesión de nuevo.`
        : serverError.trim();
    }
    return 'Cédula o PIN incorrectos';
  }
  if (status === 429) {
    return 'Demasiados intentos, espera unos minutos';
  }
  if (status && status >= 500) {
    return 'Error en el servidor. Intenta nuevamente en unos minutos';
  }

  // Analizar mensajes de error o fallback en texto
  const msg = axiosError?.message || (error instanceof Error ? error.message : '');
  if (/400\b|status code 400/i.test(msg)) {
    return 'Revisa tu cédula y tu PIN de 6 dígitos';
  }
  if (/401\b|status code 401/i.test(msg)) {
    return 'Cédula o PIN incorrectos';
  }
  if (/429\b|status code 429/i.test(msg)) {
    return 'Demasiados intentos, espera unos minutos';
  }

  // Errores de red o sin conexión
  const isBrowserOffline = typeof window !== 'undefined' && typeof window.navigator !== 'undefined' && window.navigator.onLine === false;
  const isNetwork =
    axiosError?.code === 'ERR_NETWORK' ||
    axiosError?.code === 'ECONNABORTED' ||
    isBrowserOffline ||
    (!axiosError?.response && (msg.includes('Network Error') || msg.includes('NetworkError') || /network|offline|failed to fetch/i.test(msg)));

  if (isNetwork) {
    return 'No hay internet; reintenta cuando tengas señal';
  }
  if (/network|offline|internet|failed to fetch/i.test(msg)) {
    return 'No hay internet; reintenta cuando tengas señal';
  }
  if (/status code|request failed/i.test(msg)) {
    return 'Error al iniciar sesión. Intenta nuevamente.';
  }
  if (msg && msg !== 'Error de conexión. Verifica tu internet.') {
    return msg;
  }

  return 'Error al iniciar sesión. Intenta nuevamente.';
}
