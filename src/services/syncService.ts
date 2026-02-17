import axios from 'axios';
import { getPendientes, marcarSincronizados, logSync } from '../db/indexeddb';
import { authService } from './authService';

/**
 * Servicio de Sincronización Offline-First
 *
 * Cola de sincronización automática:
 * 1. Detecta conexión a internet
 * 2. Obtiene items pendientes de IndexedDB
 * 3. Envía batch al backend
 * 4. Marca como sincronizados los exitosos
 *
 * Diseñado para redes EDGE/2G en zonas rurales
 */

let syncInProgress = false;

export function iniciarMonitoreoConexion() {
  // Intentar sync cuando se recupera la conexión
  window.addEventListener('online', () => {
    console.log('[Sync] Conexión detectada. Iniciando sincronización...');
    sincronizar();
  });

  // Sync periódico cada 30 segundos si hay conexión
  setInterval(() => {
    if (navigator.onLine && !syncInProgress) {
      sincronizar();
    }
  }, 30_000);

  // Sync inicial si hay conexión
  if (navigator.onLine) {
    sincronizar();
  }
}

export async function sincronizar(): Promise<{
  success: boolean;
  resultadosSincronizados: number;
  fotosSincronizadas: number;
  error?: string;
}> {
  if (syncInProgress) {
    return { success: false, resultadosSincronizados: 0, fotosSincronizadas: 0, error: 'Sync en progreso' };
  }

  syncInProgress = true;

  try {
    const { resultados, fotos } = await getPendientes();

    if (resultados.length === 0 && fotos.length === 0) {
      syncInProgress = false;
      return { success: true, resultadosSincronizados: 0, fotosSincronizadas: 0 };
    }

    console.log(`[Sync] Pendientes: ${resultados.length} resultados, ${fotos.length} fotos`);

    // Construir FormData para envío batch (incluyendo fotos binarias)
    const formData = new FormData();

    // Resultados como JSON
    formData.append('resultados', JSON.stringify(
      resultados.map(({ synced, syncAttempts, lastSyncError, ...data }) => data)
    ));

    // Fotos como archivos binarios
    const fotosMetadata: any[] = [];
    for (const foto of fotos) {
      formData.append('fotos', foto.blob, `e14_${foto.mesaId}.jpg`);
      fotosMetadata.push({
        mesaId: foto.mesaId,
        testigoId: foto.testigoId,
        capturedAt: foto.capturedAt,
        deviceId: foto.deviceId,
      });
    }
    formData.append('fotosMetadata', JSON.stringify(fotosMetadata));

    // Enviar al backend
    const token = authService.getToken();
    if (!token) {
      throw new Error('No hay sesión activa. Inicia sesión nuevamente.');
    }

    await axios.post(`/api-v1/testigos/sync`, formData, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    // Marcar como sincronizados
    await marcarSincronizados(
      resultados.map(r => r.id),
      fotos.map(f => f.id)
    );

    await logSync('batch_sync', resultados.length + fotos.length, true);

    console.log(`[Sync] Completado: ${resultados.length} resultados, ${fotos.length} fotos`);

    syncInProgress = false;
    return {
      success: true,
      resultadosSincronizados: resultados.length,
      fotosSincronizadas: fotos.length,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[Sync] Error:', msg);
    await logSync('batch_sync', 0, false, msg);

    syncInProgress = false;
    return { success: false, resultadosSincronizados: 0, fotosSincronizadas: 0, error: msg };
  }
}

/**
 * Obtiene el estado actual de la cola de sincronización
 */
export async function getEstadoSync() {
  const { resultados, fotos } = await getPendientes();
  return {
    online: navigator.onLine,
    syncEnProgreso: syncInProgress,
    pendientes: {
      resultados: resultados.length,
      fotos: fotos.length,
      total: resultados.length + fotos.length,
    },
  };
}
