import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import ts from 'typescript';
import { JSDOM } from 'jsdom';
import 'fake-indexeddb/auto';
import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: 'http://localhost/',
});
for (const k of [
  'window',
  'document',
  'navigator',
  'HTMLElement',
  'HTMLInputElement',
  'HTMLTextAreaElement',
  'HTMLButtonElement',
  'Event',
  'MouseEvent',
  'CustomEvent',
  'localStorage',
  'sessionStorage',
]) {
  Object.defineProperty(globalThis, k, {
    value: dom.window[k],
    writable: true,
    configurable: true,
  });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (
      (context.parentURL?.includes('/src/') || context.parentURL?.includes('/test/')) &&
      (specifier.startsWith('./') || specifier.startsWith('../'))
    ) {
      const base = new URL(specifier, context.parentURL);
      for (const ext of ['', '.ts', '.tsx']) {
        const candidate = new URL(base.href + ext);
        if (existsSync(fileURLToPath(candidate))) {
          return { url: candidate.href, shortCircuit: true };
        }
      }
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.startsWith('file:') && (url.endsWith('.ts') || url.endsWith('.tsx'))) {
      const source = readFileSync(fileURLToPath(url), 'utf8');
      return {
        format: 'module',
        source: ts.transpileModule(source, {
          compilerOptions: {
            module: ts.ModuleKind.ESNext,
            target: ts.ScriptTarget.ES2022,
            jsx: ts.JsxEmit.ReactJSX,
          },
        }).outputText,
        shortCircuit: true,
      };
    }
    return nextLoad(url, context);
  },
});

const React = await import('react');
const { act } = React;
const { createRoot } = await import('react-dom/client');
const idb = await import('../src/db/indexeddb.ts');
const { api } = await import('../src/services/api.ts');
const { authService } = await import('../src/services/authService.ts');
const { sincronizar, resetBackoffState } = await import('../src/services/syncService.ts');
const { MSG_CUOTA_ALMACENAMIENTO, esErrorCuotaAlmacenamiento, formatearErrorAmigable } =
  await import('../src/utils/formatoError.ts');
const { PanelIncidencias } = await import('../src/components/incidencias/PanelIncidencias.tsx');

const originalFetch = globalThis.fetch;
const originalAdapter = api.defaults.adapter;
const originalPut = IDBObjectStore.prototype.put;

function sembrarSesionLocal({
  token = 'token-sintetico-3564',
  testigoId = 'testigo-sintetico-01',
  campanaId = 'campana-sintetica-01',
} = {}) {
  localStorage.setItem('cuorum_testigo_token', token);
  localStorage.setItem('cuorum_testigo_campana', campanaId);
  localStorage.setItem(
    'cuorum_testigo_data',
    JSON.stringify({
      testigo: {
        id: testigoId,
        cedula: '0000003564',
        nombres: 'Testigo',
        apellidos: 'Sintético',
        telefono: '3000000000',
        email: null,
      },
      tipoTestigo: 'ELECTORAL',
      mesa: { id: 'mesa-sintetica-01', numero: 1, totalSufragantes: 200, puesto: null },
      elecciones: [],
      deviceId: 'device-sintetico-01',
      campana: { id: campanaId, nombre: 'Campaña Sintética', candidatoId: null, listaId: null },
    }),
  );
}

describe('CUO-3564: Limpieza de blobs tras sincronizar, borrado en logout voluntario, purga 24h y QuotaExceededError', () => {
  beforeEach(async () => {
    idb.closeDB();
    globalThis.indexedDB = new IDBFactory();
    localStorage.clear();
    sessionStorage.clear();
    resetBackoffState();
    globalThis.fetch = originalFetch;
    api.defaults.adapter = originalAdapter;
    IDBObjectStore.prototype.put = originalPut;
  });

  afterEach(() => {
    idb.closeDB();
    globalThis.fetch = originalFetch;
    api.defaults.adapter = originalAdapter;
    IDBObjectStore.prototype.put = originalPut;
  });

  it('1. Al sincronizar correctamente, quita el Blob de fotosE14, incidencias y e14OcrJobs con synced: 1 conservando metadatos', async () => {
    sembrarSesionLocal({
      token: 'tok-sync-1',
      testigoId: 'testigo-sync-1',
      campanaId: 'campana-sync-1',
    });

    const blobE14 = new Blob([new Uint8Array([1, 2, 3, 4, 5])], { type: 'image/jpeg' });
    const blobInc = new Blob([new Uint8Array([6, 7, 8, 9])], { type: 'image/jpeg' });
    const blobOcr1 = new Blob([new Uint8Array([10, 11, 12])], { type: 'image/jpeg' });
    const blobOcr2 = new Blob([new Uint8Array([13, 14, 15])], { type: 'image/jpeg' });

    await idb.guardarFotoE14({
      id: 'foto-e14-1',
      mesaId: 'mesa-1',
      testigoId: 'testigo-sync-1',
      campanaId: 'campana-sync-1',
      blob: blobE14,
      capturedAt: '2026-11-11T15:00:00.000Z',
      deviceId: 'dev-1',
    });

    await idb.guardarIncidencia({
      id: 'inc-foto-1',
      mesaId: 'mesa-1',
      testigoId: 'testigo-sync-1',
      campanaId: 'campana-sync-1',
      tipo: 'IRREGULARIDAD_ACTA',
      descripcion: 'Incidencia sintética con evidencia fotográfica',
      fotoBlob: blobInc,
      capturedAt: '2026-11-11T15:01:00.000Z',
      deviceId: 'dev-1',
    });

    await idb.guardarOcrJob({
      id: 'ocr-job-1',
      mesaId: 'mesa-1',
      testigoId: 'testigo-sync-1',
      eleccionId: 'elec-1',
      campanaId: 'campana-sync-1',
      fotos: [
        { orden: 1, blob: blobOcr1, capturedAt: '2026-11-11T15:02:00.000Z' },
        { orden: 2, blob: blobOcr2, capturedAt: '2026-11-11T15:02:05.000Z' },
      ],
      estado: 'PENDIENTE',
      capturedAt: '2026-11-11T15:02:05.000Z',
      deviceId: 'dev-1',
    });

    const db = await idb.getDB();
    assert.ok((await db.get('fotosE14', 'foto-e14-1'))?.blob instanceof Blob);
    assert.ok((await db.get('incidencias', 'inc-foto-1'))?.fotoBlob instanceof Blob);
    assert.ok((await db.get('e14OcrJobs', 'ocr-job-1'))?.fotos[0]?.blob instanceof Blob);

    // Simular subida a S3 y endpoints del backend durante sincronizar()
    globalThis.fetch = async () => ({
      ok: true,
      status: 204,
      text: async () => '',
    });

    api.defaults.adapter = async (config) => {
      if (config.url === '/testigos/e14/fotos/firmar') {
        return {
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
          data: {
            fotos: [
              {
                id: 'srv-foto-1',
                s3Key: 'e14/foto-1.jpg',
                post: { url: 'https://s3.sintetico.local/upload', fields: { key: 'e14/foto-1.jpg' } },
              },
            ],
          },
        };
      }
      if (config.url?.includes('/subida')) {
        return { status: 200, statusText: 'OK', headers: {}, config, data: { ok: true } };
      }
      if (config.url === '/testigos/incidencias') {
        return {
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
          data: { aceptados: ['inc-foto-1'], rechazados: [] },
        };
      }
      return { status: 200, statusText: 'OK', headers: {}, config, data: {} };
    };

    const resSync = await sincronizar();
    assert.equal(resSync.success, true);
    assert.equal(resSync.fotosSincronizadas, 1);
    assert.equal(resSync.incidenciasSincronizadas, 1);

    await idb.marcarOcrJobSyncado('ocr-job-1', 'PROCESANDO', 'srv-ocr-1');

    // Verificar que ningún registro con synced: 1 conserva un Blob
    const fotoPost = await db.get('fotosE14', 'foto-e14-1');
    assert.ok(fotoPost, 'El metadato de la foto E-14 se conserva para el historial/cierre de mesa');
    assert.equal(fotoPost.synced, 1);
    assert.equal(fotoPost.blob, undefined, 'No debe quedar ningún Blob en fotosE14 con synced: 1');
    assert.equal(await idb.tieneFotoE14Mesa('mesa-1'), true);

    const incPost = await db.get('incidencias', 'inc-foto-1');
    assert.ok(incPost);
    assert.equal(incPost.synced, 1);
    assert.equal(incPost.fotoBlob, undefined, 'No debe quedar ningún Blob en incidencias con synced: 1');

    const ocrPost = await db.get('e14OcrJobs', 'ocr-job-1');
    assert.ok(ocrPost);
    assert.equal(ocrPost.synced, 1);
    assert.equal(ocrPost.fotos.length, 2, 'Conserva el conteo y orden de páginas del acta');
    for (const f of ocrPost.fotos) {
      assert.equal(f.blob, undefined, 'No debe quedar ningún Blob en e14OcrJobs.fotos con synced: 1');
    }
  });

  it('2. Logout voluntario con un pendiente y un sincronizado: el sincronizado desaparece, el pendiente queda y la jornada se borra cuando no queda nada pendiente', async () => {
    sembrarSesionLocal({
      token: 'tok-logout-1',
      testigoId: 'testigo-A',
      campanaId: 'campana-1',
    });

    api.defaults.adapter = async (config) => ({
      status: 204,
      statusText: 'No Content',
      headers: {},
      config,
      data: '',
    });

    // Sembrar un registro sincronizado y uno pendiente en cada store para testigo-A
    await idb.guardarResultado({
      id: 'res-sync-A',
      mesaId: 'mesa-1',
      testigoId: 'testigo-A',
      eleccionId: 'elec-1',
      candidato: 'Candidato Sintético',
      partido: 'Partido Sintético',
      tipoVoto: 'CANDIDATO',
      votos: 50,
      votosBlanco: 2,
      votosNulos: 1,
      votosNoMarcados: 0,
      totalVotosMesa: 53,
      capturedAt: '2026-11-11T16:00:00.000Z',
      deviceId: 'dev-1',
    });
    await idb.guardarResultado({
      id: 'res-pend-A',
      mesaId: 'mesa-1',
      testigoId: 'testigo-A',
      eleccionId: 'elec-2',
      candidato: 'Candidato Sintético 2',
      partido: 'Partido Sintético',
      tipoVoto: 'CANDIDATO',
      votos: 30,
      votosBlanco: 0,
      votosNulos: 0,
      votosNoMarcados: 0,
      totalVotosMesa: 30,
      capturedAt: '2026-11-11T16:05:00.000Z',
      deviceId: 'dev-1',
    });

    await idb.guardarFotoE14({
      id: 'foto-sync-A',
      mesaId: 'mesa-1',
      testigoId: 'testigo-A',
      campanaId: 'campana-1',
      blob: new Blob(['sincronizada'], { type: 'image/jpeg' }),
      capturedAt: '2026-11-11T16:00:00.000Z',
      deviceId: 'dev-1',
    });
    await idb.guardarFotoE14({
      id: 'foto-pend-A',
      mesaId: 'mesa-1',
      testigoId: 'testigo-A',
      campanaId: 'campana-1',
      blob: new Blob(['pendiente'], { type: 'image/jpeg' }),
      capturedAt: '2026-11-11T16:05:00.000Z',
      deviceId: 'dev-1',
    });

    await idb.guardarIncidencia({
      id: 'inc-sync-A',
      mesaId: 'mesa-1',
      testigoId: 'testigo-A',
      campanaId: 'campana-1',
      tipo: 'OTRO',
      descripcion: 'Incidencia ya sincronizada',
      fotoBlob: new Blob(['inc-sync'], { type: 'image/jpeg' }),
      capturedAt: '2026-11-11T16:00:00.000Z',
      deviceId: 'dev-1',
    });
    await idb.guardarIncidencia({
      id: 'inc-pend-A',
      mesaId: 'mesa-1',
      testigoId: 'testigo-A',
      campanaId: 'campana-1',
      tipo: 'OTRO',
      descripcion: 'Incidencia pendiente de sincronizar',
      fotoBlob: new Blob(['inc-pend'], { type: 'image/jpeg' }),
      capturedAt: '2026-11-11T16:05:00.000Z',
      deviceId: 'dev-1',
    });

    await idb.guardarOcrJob({
      id: 'ocr-sync-A',
      mesaId: 'mesa-1',
      testigoId: 'testigo-A',
      eleccionId: 'elec-1',
      campanaId: 'campana-1',
      fotos: [{ orden: 1, blob: new Blob(['ocr-sync']), capturedAt: '2026-11-11T16:00:00.000Z' }],
      estado: 'PENDIENTE',
      capturedAt: '2026-11-11T16:00:00.000Z',
      deviceId: 'dev-1',
    });
    await idb.guardarOcrJob({
      id: 'ocr-pend-A',
      mesaId: 'mesa-1',
      testigoId: 'testigo-A',
      eleccionId: 'elec-2',
      campanaId: 'campana-1',
      fotos: [{ orden: 1, blob: new Blob(['ocr-pend']), capturedAt: '2026-11-11T16:05:00.000Z' }],
      estado: 'PENDIENTE',
      capturedAt: '2026-11-11T16:05:00.000Z',
      deviceId: 'dev-1',
    });

    await idb.guardarJornada({
      id: 'jornada-A',
      mesaId: 'mesa-1',
      testigoId: 'testigo-A',
      campanaId: 'campana-1',
      estado: 'ABIERTA',
      checkinAt: '2026-11-11T07:30:00.000Z',
      checkinLat: 4.6097,
      checkinLng: -74.0817,
      synced: 1,
      updatedAt: '2026-11-11T08:00:00.000Z',
    });

    // Marcar los primeros como sincronizados
    await idb.marcarSincronizados(['res-sync-A'], ['foto-sync-A']);
    await idb.marcarIncidenciasSincronizadas(['inc-sync-A']);
    await idb.marcarOcrJobSyncado('ocr-sync-A', 'COMPLETADO', 'srv-ocr-A');

    // Ejecutar logout voluntario teniendo aún registros pendientes
    await authService.logout();

    const db = await idb.getDB();
    assert.equal(await db.get('resultados', 'res-sync-A'), undefined, 'Resultado sincronizado debe borrarse en logout');
    assert.equal(await db.get('fotosE14', 'foto-sync-A'), undefined, 'Foto sincronizada debe borrarse en logout');
    assert.equal(await db.get('incidencias', 'inc-sync-A'), undefined, 'Incidencia sincronizada debe borrarse en logout');
    assert.equal(await db.get('e14OcrJobs', 'ocr-sync-A'), undefined, 'Job OCR sincronizado debe borrarse en logout');

    // Lo pendiente se conserva intacto
    assert.equal((await db.get('resultados', 'res-pend-A'))?.synced, 0);
    const fotoPend = await db.get('fotosE14', 'foto-pend-A');
    assert.equal(fotoPend?.synced, 0);
    assert.ok(fotoPend?.blob instanceof Blob, 'El Blob pendiente debe conservarse');
    assert.equal((await db.get('incidencias', 'inc-pend-A'))?.synced, 0);
    assert.equal((await db.get('e14OcrJobs', 'ocr-pend-A'))?.synced, 0);
    assert.ok(await db.get('jornada', 'jornada-A'), 'La jornada se conserva mientras queden pendientes del testigo');

    // Ahora sincronizar los pendientes restantes y volver a hacer logout voluntario
    sembrarSesionLocal({
      token: 'tok-logout-2',
      testigoId: 'testigo-A',
      campanaId: 'campana-1',
    });
    await idb.marcarSincronizados(['res-pend-A'], ['foto-pend-A']);
    await idb.marcarIncidenciasSincronizadas(['inc-pend-A']);
    await idb.marcarOcrJobSyncado('ocr-pend-A', 'COMPLETADO', 'srv-ocr-A2');

    await authService.logout();

    assert.equal(await db.get('resultados', 'res-pend-A'), undefined);
    assert.equal(await db.get('fotosE14', 'foto-pend-A'), undefined);
    assert.equal(await db.get('incidencias', 'inc-pend-A'), undefined);
    assert.equal(await db.get('e14OcrJobs', 'ocr-pend-A'), undefined);
    assert.equal(
      await db.get('jornada', 'jornada-A'),
      undefined,
      'Sin pendientes del testigo, su jornada (con ubicación GPS) también debe borrarse al cerrar sesión',
    );
  });

  it('3. Ante un 401 involuntario, conserva la cola pendiente y no borra datos de IndexedDB (no regresión de CUO-2413)', async () => {
    sembrarSesionLocal({
      token: 'tok-401',
      testigoId: 'testigo-401',
      campanaId: 'campana-401',
    });

    await idb.guardarFotoE14({
      id: 'foto-pend-401',
      mesaId: 'mesa-401',
      testigoId: 'testigo-401',
      campanaId: 'campana-401',
      blob: new Blob(['pendiente-401'], { type: 'image/jpeg' }),
      capturedAt: '2026-11-11T16:10:00.000Z',
      deviceId: 'dev-1',
    });
    await idb.guardarJornada({
      id: 'jornada-401',
      mesaId: 'mesa-401',
      testigoId: 'testigo-401',
      campanaId: 'campana-401',
      estado: 'CHECKIN',
      checkinAt: '2026-11-11T07:00:00.000Z',
      checkinLat: 6.2442,
      checkinLng: -75.5812,
      synced: 1,
      updatedAt: '2026-11-11T07:00:00.000Z',
    });

    api.defaults.adapter = async (config) => {
      const err401 = new Error('Request failed with status code 401');
      err401.config = config;
      err401.response = {
        status: 401,
        data: { error: 'Sesión de testigo vencida. Inicia sesión de nuevo.' },
        headers: {},
        config,
      };
      throw err401;
    };

    const valido = await authService.verifyToken();
    assert.equal(valido, false);
    assert.equal(localStorage.getItem('cuorum_testigo_token'), null);

    const db = await idb.getDB();
    const fotoPend = await db.get('fotosE14', 'foto-pend-401');
    assert.ok(fotoPend, 'Un 401 nunca debe borrar la cola pendiente');
    assert.equal(fotoPend.synced, 0);
    assert.ok(fotoPend.blob instanceof Blob);
    assert.ok(await db.get('jornada', 'jornada-401'), 'Un 401 no debe tratarse como cierre voluntario');
  });

  it('4. Purga al arrancar: elimina registros synced: 1 con más de 24 horas y conserva recientes o pendientes', async () => {
    const ahora = Date.parse('2026-11-12T18:00:00.000Z');
    const hace25Horas = new Date(ahora - 25 * 60 * 60 * 1000).toISOString();
    const hace2Horas = new Date(ahora - 2 * 60 * 60 * 1000).toISOString();

    await idb.guardarFotoE14({
      id: 'foto-vieja-sync',
      mesaId: 'mesa-1',
      testigoId: 'testigo-1',
      campanaId: 'campana-1',
      blob: new Blob(['vieja']),
      capturedAt: hace25Horas,
      deviceId: 'dev-1',
    });
    await idb.guardarFotoE14({
      id: 'foto-reciente-sync',
      mesaId: 'mesa-1',
      testigoId: 'testigo-1',
      campanaId: 'campana-1',
      blob: new Blob(['reciente']),
      capturedAt: hace2Horas,
      deviceId: 'dev-1',
    });
    await idb.guardarFotoE14({
      id: 'foto-vieja-pendiente',
      mesaId: 'mesa-1',
      testigoId: 'testigo-1',
      campanaId: 'campana-1',
      blob: new Blob(['pendiente-vieja']),
      capturedAt: hace25Horas,
      deviceId: 'dev-1',
    });
    await idb.marcarSincronizados([], ['foto-vieja-sync', 'foto-reciente-sync']);

    await idb.guardarIncidencia({
      id: 'inc-vieja-sync',
      mesaId: 'mesa-1',
      testigoId: 'testigo-1',
      campanaId: 'campana-1',
      tipo: 'OTRO',
      descripcion: 'Incidencia antigua ya sincronizada',
      capturedAt: hace25Horas,
      deviceId: 'dev-1',
    });
    await idb.marcarIncidenciasSincronizadas(['inc-vieja-sync']);

    await idb.guardarOcrJob(
      {
        id: 'ocr-viejo-sync',
        mesaId: 'mesa-1',
        testigoId: 'testigo-1',
        eleccionId: 'elec-1',
        campanaId: 'campana-1',
        fotos: [{ orden: 1, capturedAt: hace25Horas }],
        estado: 'CONFIRMADO',
        capturedAt: hace25Horas,
        deviceId: 'dev-1',
      },
      { synced: 1 },
    );

    await idb.guardarJornada({
      id: 'jornada-vieja-sync',
      mesaId: 'mesa-1',
      testigoId: 'testigo-1',
      campanaId: 'campana-1',
      estado: 'FIRMADA',
      synced: 1,
      updatedAt: hace25Horas,
    });

    const purgados = await idb.purgarSincronizadosAntiguos(idb.TTL_SINCRONIZADOS_MS, ahora);
    assert.equal(purgados, 4, 'Debe purgar los 4 registros synced: 1 con más de 24 horas');

    const db = await idb.getDB();
    assert.equal(await db.get('fotosE14', 'foto-vieja-sync'), undefined);
    assert.equal(await db.get('incidencias', 'inc-vieja-sync'), undefined);
    assert.equal(await db.get('e14OcrJobs', 'ocr-viejo-sync'), undefined);
    assert.equal(await db.get('jornada', 'jornada-vieja-sync'), undefined);

    assert.ok(await db.get('fotosE14', 'foto-reciente-sync'), 'Conserva sincronizados de menos de 24h');
    assert.ok(await db.get('fotosE14', 'foto-vieja-pendiente'), 'Nunca purga registros pendientes synced: 0');
  });

  it('5. Captura QuotaExceededError al guardar y muestra un aviso claro en lugar de perder la foto en silencio', async () => {
    sembrarSesionLocal({
      token: 'tok-quota',
      testigoId: 'testigo-quota',
      campanaId: 'campana-quota',
    });

    // Asegurar que la base de datos esté abierta antes de simular cuota agotada en put
    await idb.getDB();

    IDBObjectStore.prototype.put = function () {
      const quotaErr = new Error('The quota has been exceeded.');
      quotaErr.name = 'QuotaExceededError';
      throw quotaErr;
    };

    await assert.rejects(
      async () => {
        await idb.guardarFotoE14({
          id: 'foto-quota-1',
          mesaId: 'mesa-1',
          testigoId: 'testigo-quota',
          campanaId: 'campana-quota',
          blob: new Blob(['datos'], { type: 'image/jpeg' }),
          capturedAt: '2026-11-11T17:00:00.000Z',
          deviceId: 'dev-1',
        });
      },
      (err) => {
        assert.equal(esErrorCuotaAlmacenamiento(err), true);
        assert.equal(formatearErrorAmigable(err), MSG_CUOTA_ALMACENAMIENTO);
        assert.match(err.message, /almacenamiento del teléfono está lleno/i);
        return true;
      },
    );

    // Verificar en interfaz (PanelIncidencias) que se muestra el mensaje claro de cuota agotada
    api.defaults.adapter = async (config) => ({
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
      data: { incidencias: [] },
    });

    const container = document.getElementById('root');
    const root = createRoot(container);

    try {
      await act(async () => {
        root.render(
          React.createElement(PanelIncidencias, {
            mesaId: 'mesa-1',
            testigoId: 'testigo-quota',
            deviceId: 'dev-1',
            mesaNumero: 1,
          }),
        );
      });

      const btnHeader = Array.from(container.querySelectorAll('button')).find((b) =>
        (b.textContent || '').includes('Novedades / Incidencias'),
      );
      assert.ok(btnHeader, 'Debe existir el encabezado desplegable de Novedades / Incidencias');

      await act(async () => {
        btnHeader.click();
      });

      const btnNueva = Array.from(container.querySelectorAll('button')).find((b) =>
        (b.textContent || '').includes('Nueva novedad'),
      );
      assert.ok(btnNueva, 'Debe existir el botón para abrir el formulario de novedad');

      await act(async () => {
        btnNueva.click();
      });

      const btnTipo = Array.from(container.querySelectorAll('button')).find((b) =>
        (b.textContent || '').includes('Irregularidad en acta'),
      );
      assert.ok(btnTipo);
      await act(async () => {
        btnTipo.click();
      });

      const textarea = container.querySelector('textarea');
      assert.ok(textarea);
      await act(async () => {
        const setter = Object.getOwnPropertyDescriptor(
          window.HTMLTextAreaElement.prototype,
          'value',
        ).set;
        setter.call(textarea, 'Descripción sintética suficientemente larga para guardar');
        textarea.dispatchEvent(new window.Event('input', { bubbles: true }));
        textarea.dispatchEvent(new window.Event('change', { bubbles: true }));
      });

      const btnRegistrar = Array.from(container.querySelectorAll('button')).find((b) =>
        (b.textContent || '').includes('Registrar novedad'),
      );
      assert.ok(btnRegistrar);
      await act(async () => {
        btnRegistrar.click();
      });

      assert.match(
        container.textContent || '',
        /El almacenamiento del teléfono está lleno/i,
        'Debe mostrar en pantalla el aviso claro de cuota de almacenamiento agotada',
      );
    } finally {
      await act(async () => {
        root.unmount();
      });
    }
  });
});
