import { openDB, DBSchema, IDBPDatabase } from 'idb';

/**
 * Base de datos local IndexedDB para modo offline.
 * Cola de sincronización: los datos se guardan localmente y se suben
 * automáticamente cuando se detecta conexión.
 *
 * IMPORTANTE: synced usa 0 | 1 (número), NO boolean.
 * Los booleans NO son llaves IDB válidas — getAllFromIndex(..., false) lanza
 * "The parameter is not a valid key." en todos los browsers modernos.
 *
 * v3: Agrega store de incidencias/novedades de mesa
 * v4: Migra synced: boolean → synced: 0 | 1 (fix error de llave IDB inválida)
 */

export type TipoIncidencia =
  | 'MATERIALES_FALTANTES'
  | 'INTIMIDACION'
  | 'VIOLENCIA'
  | 'JURADO_AUSENTE'
  | 'IRREGULARIDAD_ACTA'
  | 'OTRO';

interface EscrutinioCacheEntry {
  cacheKey: string;
  data: unknown;
  timestamp: string;
}

interface CuorumDB extends DBSchema {
  // Escrutinio cache stores
  'escrutinio-resultados': { key: string; value: EscrutinioCacheEntry };
  'escrutinio-fotos': { key: string; value: EscrutinioCacheEntry };
  'escrutinio-incidencias': { key: string; value: EscrutinioCacheEntry };
  'escrutinio-consolidado': { key: string; value: EscrutinioCacheEntry };
  'escrutinio-geo': { key: string; value: EscrutinioCacheEntry };
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
      synced: 0 | 1;
      syncAttempts: number;
      lastSyncError?: string;
    };
    indexes: { 'by-synced': 0 | 1; 'by-mesa': string; 'by-eleccion': string };
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
      synced: 0 | 1;
      syncAttempts: number;
      lastSyncError?: string;
    };
    indexes: { 'by-synced': 0 | 1 };
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
      synced: 0 | 1;
      syncAttempts: number;
      lastSyncError?: string;
    };
    indexes: { 'by-synced': 0 | 1; 'by-mesa': string };
  };
}

let dbInstance: IDBPDatabase<CuorumDB> | null = null;

export async function getDB(): Promise<IDBPDatabase<CuorumDB>> {
  if (dbInstance) return dbInstance;

  dbInstance = await openDB<CuorumDB>('cuorum-testigos', 5, {
    upgrade(db, oldVersion) {
      if (oldVersion < 1) {
        const resultadosStore = db.createObjectStore('resultados', { keyPath: 'id' });
        resultadosStore.createIndex('by-synced', 'synced');
        resultadosStore.createIndex('by-mesa', 'mesaId');
        resultadosStore.createIndex('by-eleccion', 'eleccionId');

        const fotosStore = db.createObjectStore('fotosE14', { keyPath: 'id' });
        fotosStore.createIndex('by-synced', 'synced');

        db.createObjectStore('syncLog', { keyPath: 'id' });
      }

      if (oldVersion >= 1 && oldVersion < 2) {
        // @ts-ignore
        const resultadosStore = db.transaction.objectStore('resultados');
        if (!resultadosStore.indexNames.contains('by-eleccion')) {
          resultadosStore.createIndex('by-eleccion', 'eleccionId');
        }
      }

      if (oldVersion < 3) {
        if (!db.objectStoreNames.contains('incidencias')) {
          const incStore = db.createObjectStore('incidencias', { keyPath: 'id' });
          incStore.createIndex('by-synced', 'synced');
          incStore.createIndex('by-mesa', 'mesaId');
        }
      }

      // v4: No se crean nuevos stores — solo se migran los datos existentes.
      // La migración real (boolean → number) se hace en la función migrateV4()
      // llamada post-open para evitar problemas con transacciones versionchange.

      // v5: Stores de cache para escrutinio (testigos de solo lectura)
      if (oldVersion < 5) {
        const escrutinioStores = [
          'escrutinio-resultados',
          'escrutinio-fotos',
          'escrutinio-incidencias',
          'escrutinio-consolidado',
          'escrutinio-geo',
        ] as const;
        for (const storeName of escrutinioStores) {
          if (!db.objectStoreNames.contains(storeName)) {
            db.createObjectStore(storeName, { keyPath: 'cacheKey' });
          }
        }
      }
    },
  });

  // Ejecutar migración de datos v4 fuera del upgrade callback
  await migrateV4(dbInstance);

  return dbInstance;
}

/**
 * Migra registros existentes con synced:boolean a synced:0|1.
 * Se ejecuta una sola vez (los registros ya migrados no tienen typeof boolean).
 * Separarla del upgrade callback evita el cierre prematuro de la transacción.
 */
async function migrateV4(db: IDBPDatabase<CuorumDB>) {
  const storeNames = ['resultados', 'fotosE14', 'incidencias'] as const;

  for (const storeName of storeNames) {
    if (!db.objectStoreNames.contains(storeName)) continue;

    // @ts-ignore — necesitamos leer sin tipado estricto para detectar booleans heredados
    const allRecords: { synced: boolean | 0 | 1; [key: string]: unknown }[] =
      await (db as IDBPDatabase).getAll(storeName);

    const toMigrate = allRecords.filter((r) => typeof r.synced === 'boolean');
    if (toMigrate.length === 0) continue;

    const tx = (db as IDBPDatabase).transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    for (const record of toMigrate) {
      await store.put({ ...record, synced: record.synced ? 1 : 0 });
    }
    await tx.done;
  }
}

// ─── Resultados ───────────────────────────────────────────────

export async function guardarResultado(
  data: Omit<CuorumDB['resultados']['value'], 'synced' | 'syncAttempts'>,
) {
  const db = await getDB();
  await db.put('resultados', { ...data, synced: 0, syncAttempts: 0 });
}

// ─── Fotos E-14 ───────────────────────────────────────────────

export async function guardarFotoE14(
  data: Omit<CuorumDB['fotosE14']['value'], 'synced' | 'syncAttempts'>,
) {
  const db = await getDB();
  await db.put('fotosE14', { ...data, synced: 0, syncAttempts: 0 });
}

// ─── Incidencias ──────────────────────────────────────────────

export async function guardarIncidencia(
  data: Omit<CuorumDB['incidencias']['value'], 'synced' | 'syncAttempts'>,
) {
  const db = await getDB();
  await db.put('incidencias', { ...data, synced: 0, syncAttempts: 0 });
}

export async function getIncidenciasPendientes() {
  const db = await getDB();
  return db.getAllFromIndex('incidencias', 'by-synced', 0);
}

export async function getIncidenciasByMesa(mesaId: string) {
  const db = await getDB();
  const all = await db.getAllFromIndex('incidencias', 'by-mesa', mesaId);
  // Ordenar por capturedAt desc (más reciente primero)
  return all.sort((a, b) => (a.capturedAt > b.capturedAt ? -1 : 1));
}

export async function marcarIncidenciasSincronizadas(ids: string[]) {
  const db = await getDB();
  const tx = db.transaction('incidencias', 'readwrite');
  for (const id of ids) {
    const item = await tx.objectStore('incidencias').get(id);
    if (item) {
      item.synced = 1;
      await tx.objectStore('incidencias').put(item);
    }
  }
  await tx.done;
}

// ─── Pendientes generales ─────────────────────────────────────

export async function getPendientes() {
  const db = await getDB();
  const resultados = await db.getAllFromIndex('resultados', 'by-synced', 0);
  const fotos = await db.getAllFromIndex('fotosE14', 'by-synced', 0);
  return { resultados, fotos };
}

// ─── Marcar sincronizados ─────────────────────────────────────

export async function marcarSincronizados(resultadoIds: string[], fotoIds: string[]) {
  const db = await getDB();
  const tx = db.transaction(['resultados', 'fotosE14'], 'readwrite');

  for (const id of resultadoIds) {
    const item = await tx.objectStore('resultados').get(id);
    if (item) {
      item.synced = 1;
      await tx.objectStore('resultados').put(item);
    }
  }

  for (const id of fotoIds) {
    const item = await tx.objectStore('fotosE14').get(id);
    if (item) {
      item.synced = 1;
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

export async function getResultadosByMesa(mesaId: string) {
  const db = await getDB();
  const all = await db.getAllFromIndex('resultados', 'by-mesa', mesaId);
  return all.sort((a, b) => (a.capturedAt > b.capturedAt ? -1 : 1));
}

// ─── Escrutinio cache helpers ─────────────────────────────────

type EscrutinioStoreName = 'escrutinio-resultados' | 'escrutinio-fotos' | 'escrutinio-incidencias' | 'escrutinio-consolidado' | 'escrutinio-geo';

function buildCacheKey(filtros: Record<string, unknown>): string {
  return JSON.stringify(filtros, Object.keys(filtros).sort());
}

export async function cacheEscrutinioData(storeName: EscrutinioStoreName, filtros: Record<string, unknown>, data: unknown) {
  const db = await getDB();
  await db.put(storeName, {
    cacheKey: buildCacheKey(filtros),
    data,
    timestamp: new Date().toISOString(),
  });
}

export async function getCachedEscrutinioData<T = unknown>(storeName: EscrutinioStoreName, filtros: Record<string, unknown>): Promise<{ data: T; timestamp: string } | null> {
  const db = await getDB();
  const entry = await db.get(storeName, buildCacheKey(filtros));
  if (!entry) return null;
  return { data: entry.data as T, timestamp: entry.timestamp };
}

export async function cacheGeoData(key: string, data: unknown) {
  const db = await getDB();
  await db.put('escrutinio-geo', {
    cacheKey: key,
    data,
    timestamp: new Date().toISOString(),
  });
}

export async function getCachedGeoData<T = unknown>(key: string): Promise<T | null> {
  const db = await getDB();
  const entry = await db.get('escrutinio-geo', key);
  if (!entry) return null;
  return entry.data as T;
}

export async function clearEscrutinioCache() {
  const db = await getDB();
  const stores: EscrutinioStoreName[] = [
    'escrutinio-resultados',
    'escrutinio-fotos',
    'escrutinio-incidencias',
    'escrutinio-consolidado',
    'escrutinio-geo',
  ];
  for (const storeName of stores) {
    if (db.objectStoreNames.contains(storeName)) {
      await db.clear(storeName);
    }
  }
}
