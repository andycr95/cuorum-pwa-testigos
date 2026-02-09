import { openDB, DBSchema, IDBPDatabase } from 'idb';

/**
 * Base de datos local IndexedDB para modo offline.
 * Cola de sincronización: los datos se guardan localmente y se suben
 * automáticamente cuando se detecta conexión.
 */

interface PolTechDB extends DBSchema {
  resultados: {
    key: string;
    value: {
      id: string;
      mesaId: string;
      testigoId: string;
      eleccionId: string; // Nueva: múltiples elecciones por mesa
      candidato: string; // Legacy: mantener por compatibilidad
      partido: string; // Legacy: mantener por compatibilidad
      candidatoId?: string; // Nueva: referencia a candidato real
      listaId?: string; // Nueva: para elecciones colegiadas
      tipoVoto: 'CANDIDATO' | 'LISTA' | 'BLANCO' | 'NULO' | 'NO_MARCADO'; // Nueva
      votos: number;
      votosBlanco: number;
      votosNulos: number;
      votosNoMarcados: number;
      totalVotosMesa: number;
      capturedAt: string;
      deviceId: string;
      synced: boolean;
      syncAttempts: number;
      lastSyncError?: string;
    };
    indexes: { 'by-synced': boolean; 'by-mesa': string; 'by-eleccion': string };
  };
  fotosE14: {
    key: string;
    value: {
      id: string;
      mesaId: string;
      testigoId: string;
      blob: Blob;
      capturedAt: string;
      deviceId: string;
      synced: boolean;
      syncAttempts: number;
      lastSyncError?: string;
    };
    indexes: { 'by-synced': boolean };
  };
  syncLog: {
    key: string;
    value: {
      id: string;
      timestamp: string;
      action: string;
      itemsCount: number;
      success: boolean;
      error?: string;
    };
  };
}

let dbInstance: IDBPDatabase<PolTechDB> | null = null;

export async function getDB(): Promise<IDBPDatabase<PolTechDB>> {
  if (dbInstance) return dbInstance;

  dbInstance = await openDB<PolTechDB>('poltech-testigos', 2, {
    upgrade(db, oldVersion) {
      // V1 → V2: Agregar soporte para múltiples elecciones y listas
      if (oldVersion < 1) {
        // Store de resultados de mesa
        const resultadosStore = db.createObjectStore('resultados', { keyPath: 'id' });
        resultadosStore.createIndex('by-synced', 'synced');
        resultadosStore.createIndex('by-mesa', 'mesaId');

        // Store de fotos E-14
        const fotosStore = db.createObjectStore('fotosE14', { keyPath: 'id' });
        fotosStore.createIndex('by-synced', 'synced');

        // Log de sincronización
        db.createObjectStore('syncLog', { keyPath: 'id' });
      }

      if (oldVersion < 2) {
        // Agregar índice por elección
        const tx = db.transaction('resultados', 'readwrite');
        const store = tx.objectStore('resultados');
        if (!store.indexNames.contains('by-eleccion')) {
          store.createIndex('by-eleccion', 'eleccionId');
        }
      }
    },
  });

  return dbInstance;
}

/**
 * Guarda un resultado de mesa localmente (para sync posterior)
 */
export async function guardarResultado(data: Omit<PolTechDB['resultados']['value'], 'synced' | 'syncAttempts'>) {
  const db = await getDB();
  await db.put('resultados', {
    ...data,
    synced: false,
    syncAttempts: 0,
  });
}

/**
 * Guarda foto E-14 localmente
 */
export async function guardarFotoE14(data: Omit<PolTechDB['fotosE14']['value'], 'synced' | 'syncAttempts'>) {
  const db = await getDB();
  await db.put('fotosE14', {
    ...data,
    synced: false,
    syncAttempts: 0,
  });
}

/**
 * Obtiene todos los items pendientes de sincronización
 */
export async function getPendientes() {
  const db = await getDB();
  const resultados = await db.getAllFromIndex('resultados', 'by-synced', false);
  const fotos = await db.getAllFromIndex('fotosE14', 'by-synced', false);
  return { resultados, fotos };
}

/**
 * Marca items como sincronizados
 */
export async function marcarSincronizados(resultadoIds: string[], fotoIds: string[]) {
  const db = await getDB();
  const tx = db.transaction(['resultados', 'fotosE14'], 'readwrite');

  for (const id of resultadoIds) {
    const item = await tx.objectStore('resultados').get(id);
    if (item) {
      item.synced = true;
      await tx.objectStore('resultados').put(item);
    }
  }

  for (const id of fotoIds) {
    const item = await tx.objectStore('fotosE14').get(id);
    if (item) {
      item.synced = true;
      await tx.objectStore('fotosE14').put(item);
    }
  }

  await tx.done;
}

/**
 * Registra evento de sincronización
 */
export async function logSync(action: string, itemsCount: number, success: boolean, error?: string) {
  const db = await getDB();
  await db.put('syncLog', {
    id: `sync_${Date.now()}`,
    timestamp: new Date().toISOString(),
    action,
    itemsCount,
    success,
    error,
  });
}
