/**
 * Utilidades para formateo de errores en la PWA de testigos
 * 
 * Regla: Ningún mensaje de error con códigos HTTP ni texto en inglés.
 * Todo lenguaje debe ser no técnico, en español y orientador para el testigo electoral.
 */

export function formatearErrorAmigable(error: unknown, fallback?: string): string {
  if (!error) {
    return fallback || 'Ocurrió un inconveniente temporal. Intenta nuevamente.';
  }

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

  const msgLower = mensaje.toLowerCase();

  // Errores de conexión / sin señal
  if (
    msgLower.includes('network error') ||
    msgLower.includes('failed to fetch') ||
    msgLower.includes('enotfound') ||
    msgLower.includes('econnrefused') ||
    msgLower.includes('offline') ||
    msgLower.includes('sin conexión') ||
    msgLower.includes('sin conexion')
  ) {
    return 'Sin conexión a internet. Los datos están a salvo en tu teléfono y se enviarán cuando haya señal.';
  }

  // Tiempos de espera
  if (msgLower.includes('timeout') || msgLower.includes('exceeded') || msgLower.includes('tiempo de espera')) {
    return 'El servidor tardó en responder. Tu información está guardada y reintentaremos en breve.';
  }

  // Errores HTTP 500 o fallos internos del servidor
  if (
    msgLower.includes('500') ||
    msgLower.includes('502') ||
    msgLower.includes('503') ||
    msgLower.includes('504') ||
    msgLower.includes('internal server error') ||
    msgLower.includes('bad gateway') ||
    msgLower.includes('service unavailable')
  ) {
    return 'El servidor presentó una dificultad temporal. Tu información está guardada en el teléfono y se reintentará automáticamente.';
  }

  // Errores HTTP 404
  if (msgLower.includes('404') || msgLower.includes('not found') || msgLower.includes('no encontrado')) {
    return 'La información solicitada no está disponible en este momento. Consulta con tu coordinador.';
  }

  // Errores HTTP 401 / 403 (permisos / sesión)
  if (
    msgLower.includes('401') ||
    msgLower.includes('403') ||
    msgLower.includes('unauthorized') ||
    msgLower.includes('forbidden') ||
    msgLower.includes('sesión') ||
    msgLower.includes('token')
  ) {
    return 'Tu sesión requiere confirmación o no tienes permisos para esta mesa. Avisa a tu coordinador.';
  }

  // Errores HTTP 400 (validación)
  if (msgLower.includes('400') || msgLower.includes('bad request')) {
    return 'Los datos ingresados requieren revisión. Verifica la información e intenta de nuevo.';
  }

  // Patrón general: si contiene "Request failed with status code" u otros rastros técnicos en inglés
  if (
    msgLower.includes('request failed') ||
    msgLower.includes('status code') ||
    msgLower.includes('http') ||
    /\b\d{3}\b/.test(mensaje)
  ) {
    return 'No fue posible completar la comunicación con el servidor. Tu información está guardada en el teléfono.';
  }

  // Si el mensaje ya estaba en español y no contiene jerga técnica ni códigos HTTP
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
