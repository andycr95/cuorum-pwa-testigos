/**
 * Utilidades para formateo de errores en la PWA de testigos
 * 
 * Regla: Ningún mensaje de error con códigos HTTP ni texto en inglés al usuario.
 * Todo lenguaje debe ser no técnico, en español y orientador para el testigo electoral.
 * Preserva los mensajes útiles de validación y de dominio del servidor.
 */

interface ErrorConDetalles {
  response?: {
    status?: number;
    data?: unknown;
  };
  code?: string;
  message?: string;
}

export function formatearErrorAmigable(error: unknown, fallback?: string): string {
  if (!error) {
    return fallback || 'Ocurrió un inconveniente temporal. Intenta nuevamente.';
  }

  // 1. Si el error viene de Axios / HTTP y contiene información estructurada
  if (typeof error === 'object' && error !== null) {
    const errObj = error as ErrorConDetalles;

    // A. Mensaje de validación o dominio provisto por el servidor en err.response.data
    if (errObj.response?.data) {
      const data = errObj.response.data;
      let serverMsg = '';
      if (typeof data === 'string') {
        serverMsg = data.trim();
      } else if (typeof data === 'object' && data !== null) {
        const d = data as Record<string, unknown>;
        const cand = d.error || d.mensaje || d.message || d.errorMsg;
        if (typeof cand === 'string') {
          serverMsg = cand.trim();
        }
      }

      if (serverMsg) {
        const lower = serverMsg.toLowerCase();
        // Si el servidor devolvió HTML (ej. página de error Nginx/Cloudflare) o error técnico estándar en inglés
        const esTecnico =
          lower.startsWith('<!doctype') ||
          lower.startsWith('<html') ||
          lower === 'internal server error' ||
          lower === 'bad gateway' ||
          lower === 'service unavailable' ||
          lower === 'gateway timeout' ||
          lower === 'not found' ||
          lower === 'unauthorized' ||
          lower === 'forbidden';

        if (!esTecnico) {
          // Devuelve el mensaje útil de validación/dominio tal cual
          return serverMsg;
        }
      }
    }

    // B. Decisión por err.response.status cuando no hay mensaje de dominio
    const status = errObj.response?.status;
    if (typeof status === 'number') {
      if (status >= 500) {
        return 'El servidor presentó una dificultad temporal. Tu información está guardada en el teléfono y se reintentará automáticamente.';
      }
      if (status === 404) {
        return 'La información solicitada no está disponible en este momento. Consulta con tu coordinador.';
      }
      if (status === 401 || status === 403) {
        return 'Tu sesión requiere confirmación o no tienes permisos para esta mesa. Avisa a tu coordinador.';
      }
      if (status === 400 || status === 422) {
        return 'Los datos ingresados requieren revisión. Verifica la información e intenta de nuevo.';
      }
    }

    // C. Decisión por err.code (códigos de red de Axios o Node)
    const code = errObj.code ? String(errObj.code).toUpperCase() : '';
    if (
      code === 'ERR_NETWORK' ||
      code === 'ENOTFOUND' ||
      code === 'ECONNREFUSED' ||
      code === 'ERR_INTERNET_DISCONNECTED'
    ) {
      return 'Sin conexión a internet. Los datos están a salvo en tu teléfono y se enviarán cuando haya señal.';
    }
    if (code === 'ECONNABORTED' || code === 'ETIMEDOUT') {
      return 'El servidor tardó en responder. Tu información está guardada y reintentaremos en breve.';
    }
  }

  // 2. Extraer texto base del error
  let mensaje = '';
  if (typeof error === 'string') {
    mensaje = error;
  } else if (error instanceof Error) {
    mensaje = error.message;
  } else if (typeof error === 'object' && error !== null && 'message' in error) {
    mensaje = String((error as { message: unknown }).message);
  } else {
    mensaje = String(error);
  }

  const msgLower = mensaje.toLowerCase().trim();

  // 3. Reglas de texto aplicadas exclusivamente a mensajes técnicos de Axios, fetch o red
  // Mensajes de red / offline técnicos
  if (
    msgLower === 'network error' ||
    msgLower.includes('network error') ||
    msgLower.includes('failed to fetch') ||
    msgLower.includes('enotfound') ||
    msgLower.includes('econnrefused') ||
    msgLower.includes('err_network') ||
    msgLower === 'offline' ||
    msgLower === 'sin conexión' ||
    msgLower === 'sin conexion'
  ) {
    return 'Sin conexión a internet. Los datos están a salvo en tu teléfono y se enviarán cuando haya señal.';
  }

  // Mensajes de timeout técnicos
  if (
    msgLower.includes('timeout of') ||
    msgLower.includes('timed out') ||
    msgLower.startsWith('timeout') ||
    msgLower.includes('econnaborted') ||
    msgLower.includes('etimedout')
  ) {
    return 'El servidor tardó en responder. Tu información está guardada y reintentaremos en breve.';
  }

  // Mensaje estándar de Axios: "Request failed with status code XXX"
  const axiosStatusMatch = mensaje.match(/request failed with status code (\d{3})/i);
  if (axiosStatusMatch) {
    const code = parseInt(axiosStatusMatch[1], 10);
    if (code >= 500) {
      return 'El servidor presentó una dificultad temporal. Tu información está guardada en el teléfono y se reintentará automáticamente.';
    }
    if (code === 404) {
      return 'La información solicitada no está disponible en este momento. Consulta con tu coordinador.';
    }
    if (code === 401 || code === 403) {
      return 'Tu sesión requiere confirmación o no tienes permisos para esta mesa. Avisa a tu coordinador.';
    }
    if (code === 400 || code === 422) {
      return 'Los datos ingresados requieren revisión. Verifica la información e intenta de nuevo.';
    }
    return 'No fue posible completar la comunicación con el servidor. Tu información está guardada en el teléfono.';
  }

  // Respuestas técnicas HTTP en inglés
  if (
    msgLower.includes('internal server error') ||
    msgLower.includes('bad gateway') ||
    msgLower.includes('service unavailable') ||
    msgLower.includes('gateway timeout')
  ) {
    return 'El servidor presentó una dificultad temporal. Tu información está guardada en el teléfono y se reintentará automáticamente.';
  }

  if (
    msgLower.includes('403 forbidden') ||
    msgLower.includes('401 unauthorized') ||
    msgLower.includes('http 403') ||
    msgLower.includes('http 401')
  ) {
    return 'Tu sesión requiere confirmación o no tienes permisos para esta mesa. Avisa a tu coordinador.';
  }

  if (msgLower.includes('404 not found') || msgLower.includes('http 404')) {
    return 'La información solicitada no está disponible en este momento. Consulta con tu coordinador.';
  }

  if (msgLower.includes('400 bad request') || msgLower.includes('http 400')) {
    return 'Los datos ingresados requieren revisión. Verifica la información e intenta de nuevo.';
  }

  // 4. Si el mensaje es de dominio o validación (en español, con cifras, etc.), devolver tal cual
  return mensaje;
}

/**
 * Mensajes específicos para el estado de fotos y OCR
 */
export const MENSAJES_OCR = {
  FOTO_GUARDADA: 'Tu foto está guardada en el teléfono. Reintentaremos cuando haya señal.',
  ERROR_ENVIO_TITULO: 'Pendiente de sincronización',
  ERROR_ENVIO_DETALLE: 'La foto está segura en tu dispositivo. Puedes reintentar el envío ahora o esperar señal.',
  REINTENTO_BOTON: 'Reintentar envío',
} as const;
