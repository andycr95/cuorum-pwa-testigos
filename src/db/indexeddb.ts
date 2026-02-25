import { openDB, DBSchema, IDBPDatabase } from 'idb';

/**
 * Base de datos local IndexedDB para modo offline.
 * Cola de sincronización: los datos se guardan localmente y se suben
 * automáticamente cuando se detecta conexión.
 *
 * v3: Agrega store de incidencias/novedades de mesa
 */

export type TipoIncidencia =
  | 'MATERIALES_FALTANTES'
  | 'INTIMIDACION'
  | 'VIOLENCIA'
  | 'JURADO_AUSENTE'
  | 'IRREGULARIDAD_ACTA'
  | 'OTRO';

interface CuorumDB extends DBSchema {
  // @ts-ignore - idb type compatibility
  resultados: {
    key: string;
    value: {
      id: string;
      mesaId: string;
      testigoId: string;
      eleccionId: string;
      candidato: string;
      partido: string;
      candidatoId?: string;
      listaId?: string;
      tipoVoto: 'CANDIDATO' | 'LISTA' | 'BLANCO' | 'NULO' | 'NO_MARCADO';
      votos: number;
      votosBlanco: number;
      votosNulos: number;
      votosNoMarcados: number;
      totalVotosMesa: number;
      observaciones?: string;
      capturedAt: string;
      deviceId: string;
      synced: boolean;
      syncAttempts: number;
      lastSyncError?: string;
    };
    indexes: { 'by-synced': boolean; 'by-mesa': string; 'by-eleccion': string };
  };
  // @ts-ignore - idb type compatibility
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
  // @ts-ignore - idb type compatibility
  incidencias: {
    key: string;
    value: {
      id: string;
      mesaId: string;
      testigoId: string;
      tipo: TipoIncidencia;
      descripcion: string;
      fotoBlob?: Blob;
      capturedAt: string;
      deviceId: string;
      synced: boolean;
      syncAttempts: number;
      lastSyncError?: string;
    };
    indexes: { 'by-synced': boolean; 'by-mesa': string };
  };
}

let dbInstance: IDBPDatabase<CuorumDB> | null = null;

export async function getDB(): Promise<IDBPDatabase<CuorumDB>> {
  if (dbInstance) return dbInstance;

  dbInstance = await openDB<CuorumDB>('cuorum-testigos', 3, {
    upgrade(db, oldVersion) {
      if (oldVersion < 1) {
        const resultadosStore = db.createObjectStore('resultados', { keyPath: 'id' });
        resultadosStore.createIndex('by-synced', 'synced');
        resultadosStore.createIndex('by-mesa', 'mesaId');

        const fotosStore = db.createObjectStore('fotosE14', { keyPath: 'id' });
        fotosStore.createIndex('by-synced', 'synced');

        db.createObjectStore('syncLog', { keyPath: 'id' });
      }

      if (oldVersion < 2 && oldVersion >= 1) {
        const resultadosStore = db.objectStoreNames.contains('resultados')
          ? // @ts-ignore - access during upgrade
            db.transaction.objectStore('resultados')
          : null;
        if (resultadosStore && !resultadosStore.indexNames.contains('by-eleccion')) {
          resultadosStore.createIndex('by-eleccion', 'eleccionId');
        }
      }

      if (oldVersion < 3) {
        // Store de incidencias/novedades reportadas desde la mesa
        if (!db.objectStoreNames.contains('incidencias')) {
          const incStore = db.createObjectStore('incidencias', { keyPath: 'id' });
          incStore.createIndex('by-synced', 'synced');
          incStore.createIndex('by-mesa', 'mesaId');
        }
      }
    },
  });

  return dbInstance;
}

// ─── Resultados ───────────────────────────────────────────────

export async function guardarResultado(
  data: Omit<CuorumDB['resultados']['value'], 'synced' | 'syncAttempts'>,
) {
  const db = await getDB();
  await db.put('resultados', { ...data, synced: false, syncAttempts: 0 });
}

// ─── Fotos E-14 ───────────────────────────────────────────────

export async function guardarFotoE14(
  data: Omit<CuorumDB['fotosE14']['value'], 'synced' | 'syncAttempts'>,
) {
  const db = await getDB();
  await db.put('fotosE14', { ...data, synced: false, syncAttempts: 0 });
}

// ─── Incidencias ──────────────────────────────────────────────

export async function guardarIncidencia(
  data: Omit<CuorumDB['incidencias']['value'], 'synced' | 'syncAttempts'>,
) {
  const db = await getDB();
  await db.put('incidencias', { ...data, synced: false, syncAttempts: 0 });
}

export async function getIncidenciasPendientes() {
  const db = await getDB();
  return db.getAllFromIndex('incidencias', 'by-synced', false);
}

export async function marcarIncidenciasSincronizadas(ids: string[]) {
  const db = await getDB();
  const tx = db.transaction('incidencias', 'readwrite');
  for (const id of ids) {
    const item = await tx.objectStore('incidencias').get(id);
    if (item) {
      item.synced = true;
      await tx.objectStore('incidencias').put(item);
    }
  }
  await tx.done;
}

// ─── Pendientes generales ─────────────────────────────────────

export async function getPendientes() {
  const db = await getDB();
  const resultados = await db.getAllFromIndex('resultados', 'by-synced', false);
  const fotos = await db.getAllFromIndex('fotosE14', 'by-synced', false);
  return { resultados, fotos };
}

// ─── Marcar sincronizados ─────────────────────────────────────

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

// ─── Sync log ─────────────────────────────────────────────────

export async function logSync(
  action: string,
  itemsCount: number,
  success: boolean,
  error?: string,
) {
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
