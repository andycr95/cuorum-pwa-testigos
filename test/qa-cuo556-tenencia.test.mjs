import test, { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

// ─── Dobles sintéticos de almacenamiento para IndexedDB ──────────────────────
// Almacenamiento sintético en memoria que replica las funciones de src/db/indexeddb.ts
// con filtrado estricto por campaña y testigo de la sesión activa en localStorage.
const mockSources = {
  './jornadaService': `export const jornadaService = { checkin: async () => {}, apertura: async () => {} };`,
  '../db/indexeddb': `
    const state = () => globalThis.__qaTenenciaDb;

    function obtenerSesionActivaLocal() {
      if (typeof localStorage === 'undefined') return null;
      try {
        const campanaId = localStorage.getItem('cuorum_testigo_campana') || undefined;
        const rawData = localStorage.getItem('cuorum_testigo_data');
        let testigoId = undefined;
        if (rawData) {
          const parsed = JSON.parse(rawData);
          testigoId = parsed?.testigo?.id || undefined;
        }
        if (!campanaId && !testigoId) return null;
        return { campanaId, testigoId };
      } catch {
        return null;
      }
    }

    export const getFotosPendientes = async (filtro) => {
      const all = state().fotos.filter(x => x.synced === 0);
      const f = filtro !== undefined ? filtro : (obtenerSesionActivaLocal() || undefined);
      if (!f) return all;
      return all.filter(foto => {
        if (f.testigoId && foto.testigoId && foto.testigoId !== f.testigoId) return false;
        if (f.campanaId && foto.campanaId && foto.campanaId !== f.campanaId) return false;
        return true;
      });
    };

    export const getFotosByMesa = async (mesaId, filtro) => {
      const all = state().fotos;
      const f = filtro !== undefined ? filtro : (obtenerSesionActivaLocal() || undefined);
      return all.filter(foto => {
        if (foto.mesaId !== mesaId) return false;
        if (f?.testigoId && foto.testigoId && foto.testigoId !== f.testigoId) return false;
        if (f?.campanaId && foto.campanaId && foto.campanaId !== f.campanaId) return false;
        return true;
      });
    };

    export const tieneFotoE14Mesa = async (mesaId, filtro) => {
      const fotos = await getFotosByMesa(mesaId, filtro);
      return fotos.length > 0;
    };

    export const getPendientes = async (filtro) => {
      const resultadosAll = state().resultados.filter(x => x.synced === 0);
      const fotosAll = state().fotos.filter(x => x.synced === 0);
      const f = filtro !== undefined ? filtro : (obtenerSesionActivaLocal() || undefined);
      if (!f) return { resultados: resultadosAll, fotos: fotosAll };

      const resultados = resultadosAll.filter(r => {
        if (f.testigoId && r.testigoId && r.testigoId !== f.testigoId) return false;
        return true;
      });
      const fotos = fotosAll.filter(foto => {
        if (f.testigoId && foto.testigoId && foto.testigoId !== f.testigoId) return false;
        if (f.campanaId && foto.campanaId && foto.campanaId !== f.campanaId) return false;
        return true;
      });
      return { resultados, fotos };
    };

    export const getIncidenciasPendientes = async () => state().incidencias.filter(x => x.synced === 0);
    export const getJornadasPendientes = async () => [];

    export const marcarSincronizados = async (resIds, fotoIds) => {
      for (const id of resIds) {
        const item = state().resultados.find(x => x.id === id);
        if (item) item.synced = 1;
      }
      for (const id of fotoIds) {
        const item = state().fotos.find(x => x.id === id);
        if (item) item.synced = 1;
      }
    };

    export const marcarRechazados = async (rechazadosRes, rechazadosFotos = []) => {
      for (const { id, error } of rechazadosRes) {
        const item = state().resultados.find(x => x.id === id);
        if (item) { item.synced = 0; item.lastSyncError = error; item.syncAttempts = (item.syncAttempts || 0) + 1; }
      }
      for (const { id, error } of rechazadosFotos) {
        const item = state().fotos.find(x => x.id === id);
        if (item) { item.synced = 0; item.lastSyncError = error; item.syncAttempts = (item.syncAttempts || 0) + 1; }
      }
    };

    export const guardarFotoE14 = async (data) => {
      const sesion = obtenerSesionActivaLocal();
      const campanaId = data.campanaId || sesion?.campanaId || undefined;
      state().fotos.push({ ...data, campanaId, synced: 0, syncAttempts: 0 });
    };

    export const marcarIncidenciasSincronizadas = async () => {};
    export const marcarIncidenciasError = async () => {};
    export const saveJornada = async () => {};
    export const logSync = async () => {};
  `,
};

// Registrar hook de módulos para compilar TS al vuelo
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === '../db/indexeddb' || specifier.endsWith('/indexeddb.ts') || specifier === './indexeddb') {
      return {
        url: 'data:text/javascript,' + encodeURIComponent(mockSources['../db/indexeddb']),
        shortCircuit: true,
      };
    }
    if (mockSources[specifier]) {
      return {
        url: 'data:text/javascript,' + encodeURIComponent(mockSources[specifier]),
        shortCircuit: true,
      };
    }
    if (context.parentURL?.includes('/src/') || context.parentURL?.includes('/test/')) {
      if (specifier.startsWith('./') || specifier.startsWith('../')) {
        if (!specifier.endsWith('.ts') && !specifier.endsWith('.js') && !specifier.endsWith('.mjs')) {
          return { url: new URL(specifier + '.ts', context.parentURL).href, shortCircuit: true };
        }
      }
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.startsWith('file:') && url.endsWith('.ts')) {
      const source = readFileSync(fileURLToPath(url), 'utf8');
      return {
        format: 'module',
        source: ts.transpileModule(source, {
          compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
        }).outputText,
        shortCircuit: true,
      };
    }
    return nextLoad(url, context);
  },
});

// Polyfills globales para Node.js
const storageMap = new Map();
globalThis.localStorage = {
  getItem: (k) => (storageMap.has(k) ? storageMap.get(k) : null),
  setItem: (k, v) => storageMap.set(k, String(v)),
  removeItem: (k) => storageMap.delete(k),
  clear: () => storageMap.clear(),
};
globalThis.sessionStorage = {
  getItem: (k) => (storageMap.has(k) ? storageMap.get(k) : null),
  setItem: (k, v) => storageMap.set(k, String(v)),
  removeItem: (k) => storageMap.delete(k),
  clear: () => storageMap.clear(),
};
globalThis.window = new EventTarget();

// Importar servicios reales
const { api } = await import('../src/services/api.ts');
const { authService } = await import('../src/services/authService.ts');
const {
  sincronizar,
  subirFotoE14Directo,
  pedirFirmaFotoE14,
  confirmarSubidaFotoE14,
  clearLastSyncTime,
  clearLastSyncError,
} = await import('../src/services/syncService.ts');

// Registrar llamadas HTTP sintéticas recibidas por axios
let httpCalls = [];
let s3Uploads = [];

// Adaptador Axios sintético: captura peticiones y headers reales generados por los interceptores
api.defaults.adapter = async (config) => {
  const url = config.url || '';
  const method = (config.method || 'get').toUpperCase();
  const headers = config.headers || {};
  let data = config.data;
  if (typeof data === 'string' && (data.startsWith('{') || data.startsWith('['))) {
    try { data = JSON.parse(data); } catch {}
  }

  const callRecord = {
    url,
    method,
    headers: { ...headers },
    data,
  };
  httpCalls.push(callRecord);

  // Endpoint de login
  if (url.includes('/auth/testigos/login')) {
    const { cedula } = data || {};
    const isCampanaA = cedula === '1000000001';
    const campanaId = isCampanaA ? 'campana-sintetica-A' : 'campana-sintetica-B';
    const testigoId = isCampanaA ? 'testigo-sintetico-A' : 'testigo-sintetico-B';
    return {
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
      data: {
        token: `jwt-sintetico-${campanaId}`,
        tipoTestigo: 'ELECTORAL',
        testigo: { id: testigoId, cedula, nombres: 'Testigo', apellidos: isCampanaA ? 'A' : 'B', telefono: '3000000000', email: null },
        mesa: { id: 'mesa-compartida-01', numero: 1, totalSufragantes: 350, puesto: null },
        elecciones: [{ id: 'elec-1', nombre: 'Elección Sintética', tipoEleccion: 'SENADO', tipoCargo: 'LISTA', votoPreferente: false, candidatos: [] }],
        deviceId: 'device-sintetico-01',
        campana: { id: campanaId, nombre: isCampanaA ? 'Campaña Sintética A' : 'Campaña Sintética B', candidatoId: null, listaId: null },
      },
    };
  }

  // Endpoint de firma S3
  if (url.includes('/testigos/e14/fotos/firmar')) {
    return {
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
      data: {
        fotos: [
          {
            id: `foto-firmada-${Date.now()}`,
            post: {
              url: 'https://s3.sintetico.cuorum.test/bucket-fotos',
              fields: {
                key: `evidencias/${callRecord.headers['X-Campana-Id'] || 'global'}/foto.jpg`,
                policy: 'policy-sintetica',
                'x-amz-signature': 'sig-sintetica',
              },
            },
          },
        ],
      },
    };
  }

  // Endpoint de confirmación de subida a S3
  if (url.includes('/subida')) {
    return {
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
      data: { ok: true },
    };
  }

  // Endpoint /testigos/sync
  if (url.includes('/testigos/sync')) {
    return {
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
      data: { aceptados: { resultados: [], fotos: [] }, rechazados: { resultados: [], fotos: [] } },
    };
  }

  return { status: 200, statusText: 'OK', headers: {}, config, data: { ok: true } };
};

// Mock de fetch para interceptar subidas directas a S3
globalThis.fetch = async (url, options = {}) => {
  s3Uploads.push({ url, options });
  return {
    ok: true,
    status: 204,
    text: async () => '',
  };
};

describe('CUO-559 / QA-CUO556: Aislamiento estricto de evidencia E-14 entre campañas tras cambio de sesión en PWA', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    clearLastSyncTime();
    clearLastSyncError();
    httpCalls = [];
    s3Uploads = [];
    globalThis.__qaTenenciaDb = {
      resultados: [],
      fotos: [],
      incidencias: [],
    };
  });

  it('1. Reproducción de tenencia A/B: la sesión de B no sube, no firma ni marca evidencia de A; pendientes de A se conservan intactos', async () => {
    // Paso 1: Iniciar sesión con Testigo de Campaña A en la mesa física compartida
    await authService.login('1000000001', '123456');
    assert.equal(authService.getCampanaId(), 'campana-sintetica-A');
    assert.equal(authService.getTestigoData()?.testigo?.id, 'testigo-sintetico-A');

    // Dejar en fotosE14 una foto pendiente tomada por Testigo A
    const blobA = new Blob(['evidencia-sintetica-campana-A'], { type: 'image/jpeg' });
    const fotoA = {
      id: 'foto-e14-campana-A-001',
      mesaId: 'mesa-compartida-01',
      testigoId: 'testigo-sintetico-A',
      campanaId: 'campana-sintetica-A',
      blob: blobA,
      capturedAt: '2026-10-20T00:00:00.000Z',
      deviceId: 'device-sintetico-01',
      synced: 0,
      syncAttempts: 0,
    };
    globalThis.__qaTenenciaDb.fotos.push(fotoA);

    // Paso 2: Testigo A cierra sesión con authService.logout()
    authService.logout();
    assert.equal(authService.getToken(), null);
    assert.equal(authService.getCampanaId(), null);
    // Verificar que logout conserva IndexedDB (foto de A sigue con synced: 0)
    assert.equal(globalThis.__qaTenenciaDb.fotos[0].synced, 0);

    // Paso 3: Testigo de Campaña B inicia sesión en el mismo dispositivo y misma mesa
    await authService.login('1000000002', '654321');
    assert.equal(authService.getCampanaId(), 'campana-sintetica-B');
    assert.equal(authService.getTestigoData()?.testigo?.id, 'testigo-sintetico-B');

    // Limpiar historial de llamadas del login
    httpCalls = [];
    s3Uploads = [];

    // Paso 4: Ejecutar sincronizar() bajo la sesión activa de B
    const syncRes = await sincronizar();

    // Verificación 1: NINGUNA foto de A fue sincronizada en la sesión de B
    assert.equal(syncRes.fotosSincronizadas, 0, 'No debe sincronizar fotos ajenas a la campaña B');

    // Verificación 2: NINGUNA petición HTTP a /firmar ni /subida fue enviada con las cabeceras de B para la foto de A
    const llamadasFirmar = httpCalls.filter((c) => c.url.includes('/testigos/e14/fotos/firmar'));
    assert.equal(llamadasFirmar.length, 0, 'No debe solicitarse firma S3 para la foto de Campaña A');

    const llamadasSubida = httpCalls.filter((c) => c.url.includes('/subida'));
    assert.equal(llamadasSubida.length, 0, 'No debe confirmarse subida para la foto de Campaña A');

    // Verificación 3: Cero subidas a S3
    assert.equal(s3Uploads.length, 0, 'No debe haber subidas a S3 en la sesión de B');

    // Verificación 4: La foto de A se conserva intacta en IndexedDB con synced = 0 (pendiente para A)
    const fotoLocal = globalThis.__qaTenenciaDb.fotos.find((f) => f.id === 'foto-e14-campana-A-001');
    assert.ok(fotoLocal, 'La foto de A debe conservarse en IndexedDB');
    assert.equal(fotoLocal.synced, 0, 'La foto de A debe permanecer con synced = 0');

    // Paso 5: Cerrar sesión de B y volver a iniciar sesión de A
    authService.logout();
    await authService.login('1000000001', '123456');
    assert.equal(authService.getCampanaId(), 'campana-sintetica-A');

    httpCalls = [];
    s3Uploads = [];

    // Paso 6: Ejecutar sincronizar() bajo la sesión legítima de A
    const syncResA = await sincronizar();
    assert.equal(syncResA.fotosSincronizadas, 1, 'Debe sincronizar la foto legítima de Campaña A');

    // Verificar que la petición de firma llevó el header X-Campana-Id de Campaña A
    const firmaCallA = httpCalls.find((c) => c.url.includes('/testigos/e14/fotos/firmar'));
    assert.ok(firmaCallA, 'Debe solicitarse firma para la sesión legítima de A');
    assert.equal(firmaCallA.headers['X-Campana-Id'], 'campana-sintetica-A');

    // Verificar que se subió a S3 y la fila local quedó synced = 1
    assert.equal(s3Uploads.length, 1, 'Debe subirse la foto a S3 para la campaña A');
    assert.equal(fotoLocal.synced, 1, 'La foto de A debe quedar marcada como synced = 1 tras sincronizar en su sesión');
  });

  it('2. subirFotoE14Directo rechaza explícitamente fotos de otra campaña o testigo antes de pedir firma', async () => {
    // Sesión activa en Campaña B
    await authService.login('1000000002', '654321');
    httpCalls = [];

    const fotoAjena = {
      id: 'foto-ajena',
      mesaId: 'mesa-compartida-01',
      testigoId: 'testigo-sintetico-A',
      campanaId: 'campana-sintetica-A',
      blob: new Blob(['bytes sinteticos'], { type: 'image/jpeg' }),
      capturedAt: '2026-10-20T00:00:00.000Z',
      deviceId: 'device-sintetico-01',
      synced: 0,
      syncAttempts: 0,
    };

    // Intentar subir directamente una foto de otra campaña/testigo debe lanzar error de tenencia
    await assert.rejects(
      async () => {
        await subirFotoE14Directo(fotoAjena);
      },
      (err) => {
        return err instanceof Error && err.message.includes('Tenencia inválida');
      },
      'Debe fallar con error de tenencia inválida',
    );

    // Ninguna llamada HTTP a firmar se produjo
    assert.equal(httpCalls.length, 0, 'No debe haber llamadas HTTP a firmar para fotos ajenas');
  });

  it('3. Compatibilidad con fotos legacy (sin campanaId explícito): se aíslan por testigoId', async () => {
    // Foto antigua creada antes de la migración v11 (no tiene campanaId)
    const fotoLegacyA = {
      id: 'foto-legacy-A',
      mesaId: 'mesa-compartida-01',
      testigoId: 'testigo-sintetico-A',
      // campanaId ausente / undefined
      blob: new Blob(['foto legacy A'], { type: 'image/jpeg' }),
      capturedAt: '2026-10-20T00:00:00.000Z',
      deviceId: 'device-sintetico-01',
      synced: 0,
      syncAttempts: 0,
    };
    globalThis.__qaTenenciaDb.fotos.push(fotoLegacyA);

    // Iniciar sesión con Testigo B
    await authService.login('1000000002', '654321');
    httpCalls = [];

    // Sincronizar en sesión B
    const resB = await sincronizar();
    assert.equal(resB.fotosSincronizadas, 0, 'La sesión de B no debe procesar fotos legacy de A');
    assert.equal(fotoLegacyA.synced, 0, 'La foto legacy de A debe permanecer con synced = 0');
    assert.equal(httpCalls.length, 0, 'Cero peticiones enviadas para la foto legacy ajena');
  });

  it('4. Detección de cambio de sesión en vuelo: cancela la confirmación si la sesión cambió durante la subida', async () => {
    await authService.login('1000000001', '123456');

    const fotoA = {
      id: 'foto-vuelo-A',
      mesaId: 'mesa-compartida-01',
      testigoId: 'testigo-sintetico-A',
      campanaId: 'campana-sintetica-A',
      blob: new Blob(['foto vuelo'], { type: 'image/jpeg' }),
      capturedAt: '2026-10-20T00:00:00.000Z',
      deviceId: 'device-sintetico-01',
      synced: 0,
      syncAttempts: 0,
    };

    // Sobreescribir fetch para que durante la subida a S3 ocurra un cambio de sesión (logout o login de B)
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url, options) => {
      // Simular cambio concurrente de sesión mientras el blob se sube a S3
      authService.logout();
      await authService.login('1000000002', '654321');
      return { ok: true, status: 204, text: async () => '' };
    };

    try {
      await assert.rejects(
        async () => {
          await subirFotoE14Directo(fotoA);
        },
        (err) => {
          return err instanceof Error && err.message.includes('La sesión cambió');
        },
        'Debe abortar si la sesión cambió durante la subida a S3',
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('5. Comprobación de evidencia por mesa (tieneFotoE14Mesa y getFotosByMesa): no reconoce fotos de otra campaña', async () => {
    // Inicialmente con sesión de A: foto de A en mesa 1
    await authService.login('1000000001', '123456');
    globalThis.__qaTenenciaDb.fotos.push({
      id: 'foto-mesa-1-A',
      mesaId: 'mesa-compartida-01',
      testigoId: 'testigo-sintetico-A',
      campanaId: 'campana-sintetica-A',
      blob: new Blob(['foto A'], { type: 'image/jpeg' }),
      capturedAt: '2026-10-20T00:00:00.000Z',
      deviceId: 'device-sintetico-01',
      synced: 0,
      syncAttempts: 0,
    });

    // Testigo A sí ve su evidencia
    const { tieneFotoE14Mesa, getFotosByMesa } = await import('../src/db/indexeddb.ts');
    assert.equal(await tieneFotoE14Mesa('mesa-compartida-01'), true);
    const fotosA = await getFotosByMesa('mesa-compartida-01');
    assert.equal(fotosA.length, 1);

    // Cambiar a Testigo B en la misma mesa física
    authService.logout();
    await authService.login('1000000002', '654321');

    // Testigo B NO debe ver la evidencia de A ni considerarse que tiene foto en la mesa
    assert.equal(await tieneFotoE14Mesa('mesa-compartida-01'), false, 'B no debe ver la evidencia tomada por A');
    const fotosB = await getFotosByMesa('mesa-compartida-01');
    assert.equal(fotosB.length, 0, 'B no debe listar fotos de A');
  });

  it('6. Contrato estricto de payloads S3: pedirFirmaFotoE14 solo envía mesaId, deviceId y fotos; confirmarSubidaFotoE14 solo envía hash y capturedAt', async () => {
    await authService.login('1000000001', '123456');
    httpCalls = [];

    // Llamar pedirFirmaFotoE14 pasando testigoId para verificar que NO se incluya en el payload JSON
    await pedirFirmaFotoE14('cm000000000000000000000001', 'dispositivo-sintetico-01', 12345, 'testigo-sintetico-A');

    const callFirma = httpCalls.find(c => c.url.includes('/testigos/e14/fotos/firmar'));
    assert.ok(callFirma, 'Debe haber llamado a /testigos/e14/fotos/firmar');
    assert.deepEqual(
      Object.keys(callFirma.data).sort(),
      ['deviceId', 'fotos', 'mesaId'].sort(),
      'El payload de firmar debe contener exactamente las claves mesaId, deviceId y fotos (sin testigoId)',
    );
    assert.ok(Array.isArray(callFirma.data.fotos) && callFirma.data.fotos.length === 1);
    assert.deepEqual(
      Object.keys(callFirma.data.fotos[0]),
      ['tamanoBytes'],
      'El item de fotos debe contener exactamente tamanoBytes',
    );

    // Llamar confirmarSubidaFotoE14
    await confirmarSubidaFotoE14('foto-sintetica-123', 'a'.repeat(64), '2026-10-20T00:00:00.000Z');

    const callSubida = httpCalls.find(c => c.url.includes('/subida'));
    assert.ok(callSubida, 'Debe haber llamado a /subida');
    assert.deepEqual(
      Object.keys(callSubida.data).sort(),
      ['capturedAt', 'hash'].sort(),
      'El payload de subida debe contener exactamente las claves hash y capturedAt',
    );
  });
});
