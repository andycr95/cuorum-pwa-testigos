import test, { beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import 'fake-indexeddb/auto';

// Transacciones del producto, almacenamiento sintético y sin transporte HTTP.
// QA1033_REV permite contrastar solo el módulo de persistencia en memoria.
const storage = new Map();
globalThis.localStorage = {
  getItem: key => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, String(value)),
};
registerHooks({
  load(url, context, nextLoad) {
    if (url.startsWith('file:') && url.endsWith('/src/db/indexeddb.ts')) {
      const source = process.env.QA1033_REV
        ? execFileSync('git', ['show', `${process.env.QA1033_REV}:src/db/indexeddb.ts`], { encoding: 'utf8' })
        : readFileSync(fileURLToPath(url), 'utf8');
      return { format: 'module', shortCircuit: true, source: ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
      }).outputText };
    }
    return nextLoad(url, context);
  },
});
const db = await import('../src/db/indexeddb.ts');
const ownerA = 'testigo-sintetico-cuo1033-a';
const ownerB = 'testigo-sintetico-cuo1033-b';
const session = owner => {
  storage.clear();
  localStorage.setItem('cuorum_testigo_campana', owner === ownerA ? 'campana-sintetica-a' : 'campana-sintetica-b');
  localStorage.setItem('cuorum_testigo_data', JSON.stringify({ testigo: { id: owner } }));
};
const row = (id, testigoId, extra = {}) => ({
  id, mesaId: 'mesa-sintetica-compartida', eleccionId: 'eleccion-sintetica-compartida', testigoId,
  candidato: 'CANDIDATO SINTÉTICO', partido: 'AGRUPACIÓN FICTICIA', candidatoId: 'candidato-sintetico',
  tipoVoto: 'CANDIDATO', votos: 18, votosBlanco: 1, votosNulos: 0, votosNoMarcados: 0, totalVotosMesa: 19,
  capturedAt: '2026-10-28T00:00:00.000Z', deviceId: 'dispositivo-sintetico',
  origen: 'manual', synced: 0, syncAttempts: 0, ...extra,
});
const all = async () => (await (await db.getDB()).getAll('resultados')).sort((a, b) => a.id.localeCompare(b.id));
const ids = async () => (await all()).map(r => r.id);
beforeEach(async () => {
  const idb = await db.getDB();
  for (const store of idb.objectStoreNames) await idb.clear(store);
  session(ownerB);
});
after(() => db.closeDB());

test('QA1033: B sustituye varios votos propios y conserva la captura completa de A', async () => {
  const idb = await db.getDB();
  const foreign = row('a-pendiente', ownerA, { votos: 27 });
  await idb.put('resultados', foreign);
  await idb.put('resultados', row('b-viejo-1', ownerB));
  await idb.put('resultados', row('b-viejo-2', ownerB, { candidatoId: 'candidato-sintetico-2' }));
  await db.guardarResultadosYFoto([
    row('b-nuevo-1', ownerB, { synced: 1, origen: 'corregido', votos: 22 }),
    row('b-nuevo-2', ownerB, { synced: 1, candidatoId: 'candidato-sintetico-2', votos: 9 }),
  ]);
  assert.deepEqual(await ids(), ['a-pendiente', 'b-nuevo-1', 'b-nuevo-2']);
  assert.deepEqual(await idb.get('resultados', 'a-pendiente'), foreign);
  assert.deepEqual(await db.getResultadosPendientes(), []);
  assert.deepEqual((await db.getResultadosPendientes({ testigoId: ownerA })).map(r => r.id), ['a-pendiente']);
});

test('QA1033: cambiar de B a A conserva la captura confirmada de B', async () => {
  await db.guardarResultadosYFoto([row('b-confirmado', ownerB, { synced: 1 })]);
  session(ownerA);
  await db.guardarResultadosYFoto([row('a-pendiente', ownerA)]);
  assert.deepEqual(await ids(), ['a-pendiente', 'b-confirmado']);
  assert.deepEqual((await db.getResultadosPendientes()).map(r => r.id), ['a-pendiente']);
});

test('QA1033: conserva otra mesa y elección al sustituir la propia', async () => {
  const idb = await db.getDB();
  await idb.put('resultados', row('viejo', ownerB));
  await idb.put('resultados', row('otra-eleccion', ownerB, { eleccionId: 'eleccion-sintetica-2' }));
  await idb.put('resultados', row('otra-mesa', ownerB, { mesaId: 'mesa-sintetica-2' }));
  await db.guardarResultadosYFoto([row('nuevo', ownerB)]);
  assert.deepEqual(await ids(), ['nuevo', 'otra-eleccion', 'otra-mesa']);
});

test('QA1033: dos guardados concurrentes de propietarios distintos conservan ambas capturas', async () => {
  await Promise.all([
    db.guardarResultadosYFoto([row('a-concurrente', ownerA)]),
    db.guardarResultadosYFoto([row('b-concurrente', ownerB)]),
  ]);
  assert.deepEqual(await ids(), ['a-concurrente', 'b-concurrente']);
});

test('QA1033: sin sesión, el propietario explícito conserva la captura ajena', async () => {
  storage.clear();
  await (await db.getDB()).put('resultados', row('a-sin-sesion', ownerA));
  await db.guardarResultadosYFoto([row('b-sin-sesion', ownerB)]);
  assert.deepEqual(await ids(), ['a-sin-sesion', 'b-sin-sesion']);
});

test('QA1033: guardar solo una foto conserva resultados y adjunta la campaña sintética', async () => {
  const idb = await db.getDB();
  await idb.put('resultados', row('a-foto', ownerA));
  await idb.put('resultados', row('b-foto', ownerB));
  await db.guardarResultadosYFoto([], [{
    id: 'foto-sintetica-b', mesaId: 'mesa-sintetica-compartida', testigoId: ownerB,
    blob: new Blob(['ACTA FICTICIA']), capturedAt: '2026-10-28T00:00:00.000Z', deviceId: 'dispositivo-sintetico',
  }]);
  assert.deepEqual(await ids(), ['a-foto', 'b-foto']);
  const photo = await idb.get('fotosE14', 'foto-sintetica-b');
  assert.equal(photo.campanaId, 'campana-sintetica-b');
  assert.equal(photo.synced, 0);
});

test('QA1033: eliminar con sesión B conserva A y otras mesas y elecciones', async () => {
  const idb = await db.getDB();
  for (const r of [row('a-pendiente', ownerA), row('b-pendiente', ownerB),
    row('otra-eleccion', ownerB, { eleccionId: 'eleccion-sintetica-2' }),
    row('otra-mesa', ownerB, { mesaId: 'mesa-sintetica-2' })]) await idb.put('resultados', r);
  await db.eliminarResultadosPorMesaEleccion('mesa-sintetica-compartida', 'eleccion-sintetica-compartida');
  assert.deepEqual(await ids(), ['a-pendiente', 'otra-eleccion', 'otra-mesa']);
});

test('QA1033: un filtro explícito A elimina solo A aunque esté activa B', async () => {
  const idb = await db.getDB();
  await idb.put('resultados', row('a-pendiente', ownerA));
  await idb.put('resultados', row('b-pendiente', ownerB));
  await db.eliminarResultadosPorMesaEleccion('mesa-sintetica-compartida', 'eleccion-sintetica-compartida', { testigoId: ownerA });
  assert.deepEqual(await ids(), ['b-pendiente']);
});
