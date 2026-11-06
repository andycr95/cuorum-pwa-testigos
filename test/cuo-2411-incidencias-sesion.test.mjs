import test, { beforeEach, afterEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import ts from 'typescript';
import { JSDOM } from 'jsdom';
import 'fake-indexeddb/auto';

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: 'http://localhost/cuo-2411',
});
for (const k of [
  'window',
  'document',
  'navigator',
  'HTMLElement',
  'HTMLInputElement',
  'HTMLTextAreaElement',
  'Event',
  'MouseEvent',
  'CustomEvent',
  'localStorage',
  'sessionStorage',
]) {
  Object.defineProperty(globalThis, k, {
    value: dom.window[k],
    configurable: true,
    writable: true,
  });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
Object.defineProperty(navigator, 'onLine', {
  configurable: true,
  get: () => globalThis.__cuo2411?.online ?? true,
});

const previousFiles = [
  'src/db/indexeddb.ts',
  'src/services/syncService.ts',
  'src/services/api.ts',
  'src/services/authService.ts',
  'src/components/incidencias/PanelIncidencias.tsx',
];

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (
      (context.parentURL?.includes('/src/') || context.parentURL?.includes('/test/')) &&
      (specifier.startsWith('./') || specifier.startsWith('../'))
    ) {
      const base = new URL(specifier, context.parentURL);
      for (const url of [base.href, base.href + '.ts', base.href + '.tsx', base.href + '/index.ts']) {
        if (existsSync(fileURLToPath(url))) {
          return { url, shortCircuit: true };
        }
      }
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.startsWith('file:') && /\.tsx?$/.test(url)) {
      const matchPrev =
        process.env.CUO2411_REV &&
        previousFiles.find((p) => new URL(url).pathname.endsWith('/' + p));
      const source = matchPrev
        ? execFileSync('git', ['show', `${process.env.CUO2411_REV}:${matchPrev}`], {
            encoding: 'utf8',
          })
        : readFileSync(fileURLToPath(url), 'utf8');
      return {
        format: 'module',
        shortCircuit: true,
        source: ts.transpileModule(source, {
          compilerOptions: {
            module: ts.ModuleKind.ESNext,
            target: ts.ScriptTarget.ES2022,
            jsx: ts.JsxEmit.ReactJSX,
          },
        }).outputText,
      };
    }
    return nextLoad(url, context);
  },
});

const React = await import('react');
const { act } = React;
const { createRoot } = await import('react-dom/client');
const db = await import('../src/db/indexeddb.ts');
const { api } = await import('../src/services/api.ts');
const { authService } = await import('../src/services/authService.ts');
const sync = await import('../src/services/syncService.ts');
const { PanelIncidencias } = await import('../src/components/incidencias/PanelIncidencias.tsx');

const MESA_COMPARTIDA = 'cm000000000000000000000001';
const ELECCION_SINTETICA = 'cm000000000000000000000002';
const TESTIGO_X = 'cm000000000000000000000010';
const CAMPANA_X = 'campana-sintetica-x';
const TESTIGO_Y = 'cm000000000000000000000020';
const CAMPANA_Y = 'campana-sintetica-y';

function activarSesion(testigoId, campanaId) {
  localStorage.setItem('cuorum_testigo_token', `jwt-sintetico-${campanaId}-${testigoId}`);
  localStorage.setItem('cuorum_testigo_campana', campanaId);
  localStorage.setItem(
    'cuorum_testigo_data',
    JSON.stringify({
      testigo: {
        id: testigoId,
        cedula: testigoId === TESTIGO_X ? 'TEST-TES-001' : 'TEST-TES-002',
        nombres: 'Testigo',
        apellidos: testigoId === TESTIGO_X ? 'X' : 'Y',
        telefono: '3000000000',
        email: null,
      },
      tipoTestigo: 'ELECTORAL',
      mesa: { id: MESA_COMPARTIDA, numero: 1, totalSufragantes: 300, puesto: null },
      elecciones: [],
      deviceId: 'dispositivo-sintetico-2411',
      campana: { id: campanaId, nombre: `Campaña ${campanaId}`, candidatoId: null, listaId: null },
    }),
  );
}

let root;

beforeEach(async () => {
  const idb = await db.getDB();
  for (const store of idb.objectStoreNames) {
    await idb.clear(store);
  }
  localStorage.clear();
  sessionStorage.clear();
  sync.clearLastSyncTime();
  sync.clearLastSyncError();
  sync.resetBackoffState();

  globalThis.__cuo2411 = {
    online: true,
    httpCalls: [],
    handler: null,
  };

  api.defaults.adapter = async (config) => {
    const url = config.url || '';
    const method = (config.method || 'get').toUpperCase();
    const headers = config.headers || {};
    globalThis.__cuo2411.httpCalls.push({ url, method, headers: { ...headers }, data: config.data });

    if (globalThis.__cuo2411.handler) {
      return globalThis.__cuo2411.handler(config);
    }

    return {
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
      data: { data: [] },
    };
  };

  document.body.innerHTML = '<div id="root"></div>';
  root = createRoot(document.getElementById('root'));
});

afterEach(async () => {
  if (root) {
    await act(async () => root.unmount());
  }
});

after(() => {
  db.closeDB();
  dom.window.close();
});

test('CUO-2411 (1): incidencias guardadas con sesión X no se exponen ni quedan pendientes para sesión Y (otra campaña)', async () => {
  // Sesión X guarda incidencia en la mesa compartida
  activarSesion(TESTIGO_X, CAMPANA_X);
  await db.guardarIncidencia({
    id: 'inc-sintetica-x',
    mesaId: MESA_COMPARTIDA,
    testigoId: TESTIGO_X,
    tipo: 'MATERIALES_FALTANTES',
    descripcion: 'Faltan sobres de claveros reportado por testigo X',
    fotoBlob: new Blob(['foto-sintetica-x'], { type: 'image/jpeg' }),
    capturedAt: '2026-11-06T10:00:00.000Z',
    deviceId: 'dispositivo-sintetico-2411',
  });

  assert.equal((await db.getIncidenciasPendientes()).length, 1);
  assert.equal((await db.getIncidenciasByMesa(MESA_COMPARTIDA)).length, 1);

  // Cambiar localStorage a sesión Y (otra campaña en la misma mesa)
  activarSesion(TESTIGO_Y, CAMPANA_Y);
  assert.deepEqual(
    await db.getIncidenciasPendientes(),
    [],
    'Y no debe recibir incidencias pendientes de X',
  );
  assert.deepEqual(
    await db.getIncidenciasByMesa(MESA_COMPARTIDA),
    [],
    'Y no debe ver en la mesa las incidencias locales de X',
  );

  // Guardar incidencia de Y y verificar que solo devuelve la de Y
  await db.guardarIncidencia({
    id: 'inc-sintetica-y',
    mesaId: MESA_COMPARTIDA,
    testigoId: TESTIGO_Y,
    tipo: 'JURADO_AUSENTE',
    descripcion: 'Jurado ausente en mesa reportado por testigo Y',
    capturedAt: '2026-11-06T10:05:00.000Z',
    deviceId: 'dispositivo-sintetico-2411',
  });

  const pendientesY = await db.getIncidenciasPendientes();
  const porMesaY = await db.getIncidenciasByMesa(MESA_COMPARTIDA);
  assert.deepEqual(pendientesY.map((i) => i.id), ['inc-sintetica-y']);
  assert.deepEqual(porMesaY.map((i) => i.id), ['inc-sintetica-y']);
  assert.equal(porMesaY[0].campanaId, CAMPANA_Y);

  // Verificar que PanelIncidencias montado para Y solo muestra la novedad de Y y no la de X
  await act(async () => {
    root.render(
      React.createElement(PanelIncidencias, {
        mesaId: MESA_COMPARTIDA,
        testigoId: TESTIGO_Y,
        deviceId: 'dispositivo-sintetico-2411',
        mesaNumero: 1,
      }),
    );
    await new Promise((r) => setTimeout(r, 25));
  });

  const toggleBtn = document.querySelector('button');
  await act(async () => {
    toggleBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 25));
  });

  const textoPanel = document.body.textContent || '';
  assert.ok(textoPanel.includes('Jurado ausente en mesa reportado por testigo Y'));
  assert.ok(
    !textoPanel.includes('Faltan sobres de claveros reportado por testigo X'),
    'El panel de Y no debe mostrar la descripción ni la foto de X',
  );
});

test('CUO-2411 (2): con incidencias pendientes de X en IndexedDB, Y entra y sincroniza: el lote solo trae las de Y y llegan (201)', async () => {
  // Sesión X deja una incidencia pendiente sin conexión
  activarSesion(TESTIGO_X, CAMPANA_X);
  await db.guardarIncidencia({
    id: 'inc-pendiente-x',
    mesaId: MESA_COMPARTIDA,
    testigoId: TESTIGO_X,
    tipo: 'INTIMIDACION',
    descripcion: 'Novedad registrada sin conexión por testigo X',
    capturedAt: '2026-11-06T11:00:00.000Z',
    deviceId: 'dispositivo-sintetico-2411',
  });

  // Entra Y en el mismo teléfono y registra su propia incidencia
  activarSesion(TESTIGO_Y, CAMPANA_Y);
  await db.guardarIncidencia({
    id: 'inc-pendiente-y',
    mesaId: MESA_COMPARTIDA,
    testigoId: TESTIGO_Y,
    tipo: 'OTRO',
    descripcion: 'Novedad registrada por testigo Y para sincronizar',
    capturedAt: '2026-11-06T11:05:00.000Z',
    deviceId: 'dispositivo-sintetico-2411',
  });

  let lotesRecibidos = [];
  globalThis.__cuo2411.handler = async (config) => {
    if (config.url?.includes('/testigos/incidencias') && config.method === 'post') {
      const formData = config.data;
      const lote = JSON.parse(formData.get('incidencias') || '[]');
      lotesRecibidos.push(lote);

      // El backend exige que todas las incidencias del lote pertenezcan al testigo autenticado (Y)
      const tieneAjena = lote.some((item) => item.testigoId !== TESTIGO_Y);
      if (tieneAjena) {
        const err = new Error('Forbidden');
        err.response = {
          status: 403,
          config,
          data: { error: 'Incidencia pertenece a otro testigo' },
        };
        throw err;
      }

      return {
        status: 201,
        statusText: 'Created',
        headers: {},
        config,
        data: {
          aceptados: lote.map((i) => i.id),
          rechazados: [],
        },
      };
    }
    return { status: 200, statusText: 'OK', headers: {}, config, data: {} };
  };

  const resultadoSync = await sync.sincronizar();

  assert.equal(resultadoSync.success, true, 'La sincronización de Y debe completarse sin 403');
  assert.equal(resultadoSync.incidenciasSincronizadas, 1);
  assert.equal(lotesRecibidos.length, 1);
  assert.deepEqual(
    lotesRecibidos[0].map((i) => i.id),
    ['inc-pendiente-y'],
    'El lote enviado por Y solo debe incluir las incidencias de Y',
  );

  // La de Y quedó sincronizada (synced=1) y la de X se conserva pendiente (synced=0) para cuando X vuelva
  const idb = await db.getDB();
  const incY = await idb.get('incidencias', 'inc-pendiente-y');
  const incX = await idb.get('incidencias', 'inc-pendiente-x');
  assert.equal(incY?.synced, 1);
  assert.equal(incX?.synced, 0, 'La evidencia de X no debe borrarse ni marcarse con error de Y');
  assert.equal(incX?.syncAttempts, 0);
});

test('CUO-2411 (3): getJornadaByMesa y getJornadasPendientes aíslan por testigo y campaña', async () => {
  activarSesion(TESTIGO_X, CAMPANA_X);
  await db.guardarJornada({
    id: 'jornada-x',
    mesaId: MESA_COMPARTIDA,
    testigoId: TESTIGO_X,
    campanaId: CAMPANA_X,
    estado: 'FIRMADA',
    codigoVerificacion: 'COD-X-999',
    checkinAt: '2026-11-06T07:30:00.000Z',
    synced: 0,
    updatedAt: '2026-11-06T16:00:00.000Z',
  });

  assert.equal((await db.getJornadaByMesa(MESA_COMPARTIDA))?.id, 'jornada-x');
  assert.equal((await db.getJornadasPendientes()).length, 1);

  // Cambiar a sesión Y en la misma mesa
  activarSesion(TESTIGO_Y, CAMPANA_Y);
  assert.equal(
    await db.getJornadaByMesa(MESA_COMPARTIDA),
    undefined,
    'Y no debe ver el estado ni el código de verificación de la jornada de X',
  );
  assert.deepEqual(
    await db.getJornadasPendientes(),
    [],
    'Y no debe recibir jornadas pendientes de X',
  );

  // Cuando Y registra su propia jornada en la misma mesa, solo ve la suya
  await db.guardarJornada({
    id: 'jornada-y',
    mesaId: MESA_COMPARTIDA,
    estado: 'CHECKIN',
    checkinAt: '2026-11-06T08:00:00.000Z',
    synced: 0,
    updatedAt: '2026-11-06T08:00:00.000Z',
  });

  const jornadaY = await db.getJornadaByMesa(MESA_COMPARTIDA);
  assert.equal(jornadaY?.id, 'jornada-y');
  assert.equal(jornadaY?.testigoId, TESTIGO_Y);
  assert.equal(jornadaY?.campanaId, CAMPANA_Y);
  assert.deepEqual((await db.getJornadasPendientes()).map((j) => j.id), ['jornada-y']);
});

test('CUO-2411 (4): getOcrJobsByMesa y getOcrJobsPendientes aíslan por testigo y campaña', async () => {
  activarSesion(TESTIGO_X, CAMPANA_X);
  await db.guardarOcrJob({
    id: 'ocr-job-x',
    mesaId: MESA_COMPARTIDA,
    eleccionId: ELECCION_SINTETICA,
    deviceId: 'dispositivo-sintetico-2411',
    fotos: [],
    estado: 'COMPLETADO',
    resultadoOcr: { 'cand-1': 45 },
    capturedAt: '2026-11-06T16:10:00.000Z',
  });

  assert.equal((await db.getOcrJobsByMesa(MESA_COMPARTIDA)).length, 1);
  assert.equal((await db.getOcrJobsPendientes()).length, 1);

  // Cambiar a sesión Y (otra campaña en la misma mesa)
  activarSesion(TESTIGO_Y, CAMPANA_Y);
  assert.deepEqual(
    await db.getOcrJobsByMesa(MESA_COMPARTIDA),
    [],
    'Y no debe ver los trabajos OCR de X en la misma mesa',
  );
  assert.deepEqual(
    await db.getOcrJobsPendientes(),
    [],
    'Y no debe subir ni listar como pendientes los trabajos OCR de X',
  );

  await db.guardarOcrJob({
    id: 'ocr-job-y',
    mesaId: MESA_COMPARTIDA,
    eleccionId: ELECCION_SINTETICA,
    deviceId: 'dispositivo-sintetico-2411',
    fotos: [],
    estado: 'PENDIENTE',
    capturedAt: '2026-11-06T16:15:00.000Z',
  });

  const jobsY = await db.getOcrJobsByMesa(MESA_COMPARTIDA);
  assert.deepEqual(jobsY.map((j) => j.id), ['ocr-job-y']);
  assert.equal(jobsY[0].testigoId, TESTIGO_Y);
  assert.equal(jobsY[0].campanaId, CAMPANA_Y);
  assert.deepEqual((await db.getOcrJobsPendientes()).map((j) => j.id), ['ocr-job-y']);
});

test('CUO-2411 (5): ante respuesta 401 de la API, getCachedEscrutinioData queda vacío y la sincronización se cancela', async () => {
  activarSesion(TESTIGO_X, CAMPANA_X);
  const filtrosCache = { departamentoId: 'dep-sintetico-01', eleccionId: ELECCION_SINTETICA };
  await db.cacheEscrutinioData('escrutinio-resultados', filtrosCache, {
    mesas: [{ id: MESA_COMPARTIDA, votos: 120 }],
  });
  await db.cacheGeoData('geo-departamentos', [{ id: 'dep-sintetico-01', nombre: 'Depto Sintético' }]);

  assert.notEqual(await db.getCachedEscrutinioData('escrutinio-resultados', filtrosCache), null);
  assert.notEqual(await db.getCachedGeoData('geo-departamentos'), null);

  let eventosSync = [];
  const off = sync.onSyncStateChange((syncing) => eventosSync.push(syncing));

  globalThis.__cuo2411.handler = async (config) => {
    const err = new Error('Request failed with status code 401');
    err.config = config;
    err.response = {
      status: 401,
      statusText: 'Unauthorized',
      headers: {},
      config,
      data: { error: 'Token expirado' },
    };
    throw err;
  };

  try {
    await assert.rejects(() => api.get('/testigos/escrutinio/resultados'));

    assert.equal(
      await db.getCachedEscrutinioData('escrutinio-resultados', filtrosCache),
      null,
      'La caché de escrutinio debe quedar vacía tras un 401',
    );
    assert.equal(
      await db.getCachedGeoData('geo-departamentos'),
      null,
      'La caché geográfica de escrutinio debe quedar vacía tras un 401',
    );
    assert.equal(authService.getToken(), null, 'El token debe eliminarse tras un 401');
    assert.equal(authService.getCampanaId(), null, 'La campaña activa debe limpiarse tras un 401');
    assert.ok(eventosSync.includes(false), 'Debe haberse invocado cancelarSincronizacion() tras el 401');
  } finally {
    off();
  }
});

test('CUO-2411 (6): un 403 en /auth/testigos/verify cierra la sesión y limpia caché; un error de red conserva modo offline', async () => {
  activarSesion(TESTIGO_X, CAMPANA_X);
  const filtrosCache = { municipioId: 'mun-sintetico-01' };
  await db.cacheEscrutinioData('escrutinio-consolidado', filtrosCache, { total: 500 });

  // Caso A: Error de red (sin response HTTP) -> conserva sesión para modo offline
  globalThis.__cuo2411.handler = async () => {
    const netErr = new Error('Network Error');
    netErr.code = 'ERR_NETWORK';
    throw netErr;
  };

  const validoOffline = await authService.verifyToken();
  assert.equal(validoOffline, true, 'Ante error de red sin respuesta HTTP debe asumir modo sin conexión');
  assert.equal(authService.isAuthenticated(), true);

  // Caso B: 403 Forbidden (campaña suspendida o token de otra campaña) -> cierra sesión
  globalThis.__cuo2411.handler = async (config) => {
    const err = new Error('Request failed with status code 403');
    err.config = config;
    err.response = {
      status: 403,
      statusText: 'Forbidden',
      headers: {},
      config,
      data: { error: 'Campaña suspendida' },
    };
    throw err;
  };

  const valido403 = await authService.verifyToken();
  assert.equal(valido403, false, 'Un 403 en /verify debe dar por terminada la sesión');
  assert.equal(authService.isAuthenticated(), false, 'La sesión debe quedar cerrada tras 403');
  assert.equal(authService.getToken(), null);
  assert.equal(authService.getCampanaId(), null);

  // Esperar microtarea de limpieza de caché disparada por logout()
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(
    await db.getCachedEscrutinioData('escrutinio-consolidado', filtrosCache),
    null,
    'El cierre de sesión por 403 debe vaciar la caché de escrutinio',
  );
});
