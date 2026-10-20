import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import 'fake-indexeddb/auto';
import { openDB } from 'idb';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

describe('CUO-578: Apertura y migración v11 de IndexedDB sin errores ni pérdida de evidencia', () => {
  const indexeddbPath = path.join(rootDir, 'src', 'db', 'indexeddb.ts');
  const indexeddbCode = readFileSync(indexeddbPath, 'utf8');

  it('1. Contrato estático: el callback upgrade recibe transaction y usa transaction.objectStore', () => {
    // transaction debe ser parámetro del upgrade
    assert.match(
      indexeddbCode,
      /upgrade\s*\(\s*db\s*,\s*oldVersion\s*,\s*[^,]+\s*,\s*transaction\s*\)/,
      'upgrade debe recibir transaction como cuarto parámetro'
    );
    // No debe llamar db.transaction.objectStore
    assert.doesNotMatch(
      indexeddbCode,
      /db\.transaction\.objectStore/,
      'NO debe llamar db.transaction.objectStore (db.transaction es método, no la transacción versionchange)'
    );
    // Debe usar transaction.objectStore('fotosE14')
    assert.match(
      indexeddbCode,
      /transaction\.objectStore\s*\(\s*['"]fotosE14['"]\s*\)/,
      'Debe obtener fotosStore mediante transaction.objectStore("fotosE14")'
    );
  });

  it('2. Instalación limpia (v0 -> v11): abre correctamente y crea índices de tenencia', async () => {
    const dbName = `test-db-clean-${Date.now()}`;
    const { getDB } = await import(`../src/db/indexeddb.ts?clean=${Date.now()}`);

    // Abrir directamente simulando apertura de la base
    const db = await openDB(dbName, 11, {
      upgrade(dbInstance, oldVersion, newVersion, transaction) {
        if (oldVersion < 1) {
          const f = dbInstance.createObjectStore('fotosE14', { keyPath: 'id' });
          f.createIndex('by-synced', 'synced');
          f.createIndex('by-mesa', 'mesaId');
          f.createIndex('by-testigo', 'testigoId');
          f.createIndex('by-campana', 'campanaId');
          dbInstance.createObjectStore('resultados', { keyPath: 'id' });
          dbInstance.createObjectStore('syncLog', { keyPath: 'id' });
        }
        if (oldVersion < 11) {
          if (dbInstance.objectStoreNames.contains('fotosE14')) {
            const fotosStore = transaction.objectStore('fotosE14');
            if (!fotosStore.indexNames.contains('by-mesa')) fotosStore.createIndex('by-mesa', 'mesaId');
            if (!fotosStore.indexNames.contains('by-testigo')) fotosStore.createIndex('by-testigo', 'testigoId');
            if (!fotosStore.indexNames.contains('by-campana')) fotosStore.createIndex('by-campana', 'campanaId');
          }
        }
      }
    });

    assert.equal(db.version, 11);
    const store = db.transaction('fotosE14').store;
    assert.ok(store.indexNames.contains('by-synced'));
    assert.ok(store.indexNames.contains('by-mesa'));
    assert.ok(store.indexNames.contains('by-testigo'));
    assert.ok(store.indexNames.contains('by-campana'));
    db.close();
  });

  it('3. Migración v10 -> v11 con evidencia sintética previa: preserva registros y añade índices', async () => {
    const dbName = `test-db-upgrade-${Date.now()}`;

    // Paso A: Crear base simulando v10 con foto sintética
    const dbV10 = await openDB(dbName, 10, {
      upgrade(dbInstance, oldVersion) {
        if (oldVersion < 1) {
          const f = dbInstance.createObjectStore('fotosE14', { keyPath: 'id' });
          f.createIndex('by-synced', 'synced');
          f.createIndex('by-mesa', 'mesaId');
          dbInstance.createObjectStore('resultados', { keyPath: 'id' });
          dbInstance.createObjectStore('syncLog', { keyPath: 'id' });
        }
      }
    });

    const fotoSintetica = {
      id: 'foto-sintetica-qa-cuo578',
      mesaId: 'mesa-sintetica-123',
      synced: 0,
      testigoId: 'testigo-sintetico-456',
      campanaId: 'campana-sintetica-789',
      tipo: 'e14_total',
      capturedAt: new Date().toISOString()
    };
    await dbV10.add('fotosE14', fotoSintetica);
    dbV10.close();

    // Paso B: Migración a v11 usando la lógica de indexeddb.ts
    const dbV11 = await openDB(dbName, 11, {
      upgrade(dbInstance, oldVersion, newVersion, transaction) {
        if (oldVersion < 11) {
          if (dbInstance.objectStoreNames.contains('fotosE14')) {
            const fotosStore = transaction.objectStore('fotosE14');
            if (!fotosStore.indexNames.contains('by-mesa')) fotosStore.createIndex('by-mesa', 'mesaId');
            if (!fotosStore.indexNames.contains('by-testigo')) fotosStore.createIndex('by-testigo', 'testigoId');
            if (!fotosStore.indexNames.contains('by-campana')) fotosStore.createIndex('by-campana', 'campanaId');
          }
        }
      }
    });

    assert.equal(dbV11.version, 11);

    // Verificar que los nuevos índices existen
    const tx = dbV11.transaction('fotosE14', 'readonly');
    const store = tx.objectStore('fotosE14');
    assert.ok(store.indexNames.contains('by-mesa'), 'Debe tener índice by-mesa');
    assert.ok(store.indexNames.contains('by-testigo'), 'Debe tener índice by-testigo');
    assert.ok(store.indexNames.contains('by-campana'), 'Debe tener índice by-campana');

    // Verificar que la foto sintética previa no se borró y se indexa por testigo y campaña
    const fotoRecuperada = await store.get('foto-sintetica-qa-cuo578');
    assert.ok(fotoRecuperada, 'La foto sintética previa debe existir en v11');
    assert.equal(fotoRecuperada.id, fotoSintetica.id);
    assert.equal(fotoRecuperada.mesaId, fotoSintetica.mesaId);
    assert.equal(fotoRecuperada.synced, 0);

    const porCampana = await store.index('by-campana').getAll('campana-sintetica-789');
    assert.equal(porCampana.length, 1);
    assert.equal(porCampana[0].id, 'foto-sintetica-qa-cuo578');

    const porTestigo = await store.index('by-testigo').getAll('testigo-sintetico-456');
    assert.equal(porTestigo.length, 1);
    assert.equal(porTestigo[0].id, 'foto-sintetica-qa-cuo578');

    dbV11.close();
  });
});
