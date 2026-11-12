import { describe, it, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import ts from 'typescript';
import { JSDOM } from 'jsdom';
import 'fake-indexeddb/auto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: 'http://localhost/',
});
for (const k of [
  'window',
  'document',
  'navigator',
  'HTMLElement',
  'Event',
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

const db = await import('../src/db/indexeddb.ts');
const { api } = await import('../src/services/api.ts');
const { authService } = await import('../src/services/authService.ts');

function parseCustomHeadersFromAmplify(yamlContent) {
  const lines = yamlContent.split(/\r?\n/);
  const rules = [];
  let inCustomHeaders = false;
  let currentRule = null;
  let currentHeader = null;

  for (const rawLine of lines) {
    if (/^\s*customHeaders:\s*$/.test(rawLine)) {
      inCustomHeaders = true;
      continue;
    }
    if (!inCustomHeaders) continue;

    const patternMatch = rawLine.match(/^\s*-\s*pattern:\s*['"]?([^'"]+)['"]?\s*$/);
    if (patternMatch) {
      currentRule = { pattern: patternMatch[1], headers: {} };
      rules.push(currentRule);
      currentHeader = null;
      continue;
    }

    const keyMatch = rawLine.match(/^\s*-\s*key:\s*['"]?([^'"]+)['"]?\s*$/);
    if (keyMatch && currentRule) {
      currentHeader = { key: keyMatch[1] };
      continue;
    }

    const valueMatch = rawLine.match(/^\s*value:\s*['"]?([^'"]+)['"]?\s*$/);
    if (valueMatch && currentRule && currentHeader) {
      currentRule.headers[currentHeader.key] = valueMatch[1];
      currentHeader = null;
    }
  }
  return rules;
}

function sembrarSesionActiva(token = 'token-sintetico-3478') {
  localStorage.setItem('cuorum_testigo_token', token);
  localStorage.setItem(
    'cuorum_testigo_data',
    JSON.stringify({
      testigo: {
        id: 'testigo-sintetico-3478',
        cedula: 'TEST-3478',
        nombres: 'Testigo',
        apellidos: 'Sintético',
        telefono: '3000000000',
        email: null,
      },
      tipoTestigo: 'ELECTORAL',
      mesa: { id: 'mesa-sintetica-3478', numero: 1, totalSufragantes: 300, puesto: null },
      elecciones: [],
      deviceId: 'device-sintetico-3478',
      campana: {
        id: 'campana-sintetica-3478',
        nombre: 'Campaña Sintética 3478',
        candidatoId: null,
        listaId: null,
      },
    }),
  );
  localStorage.setItem('cuorum_testigo_campana', 'campana-sintetica-3478');
  localStorage.setItem('cuorum_testigo_eleccion', 'eleccion-sintetica-3478');
  localStorage.setItem('cuorum_testigo_eleccion_data', '[]');
}

describe('CUO-3478: sw.js sin caché en amplify.yml, retiro de api-cache y preservación de modo sin conexión (IndexedDB)', () => {
  beforeEach(async () => {
    localStorage.clear();
    sessionStorage.clear();
    const idb = await db.getDB();
    for (const store of idb.objectStoreNames) {
      await idb.clear(store);
    }
    api.defaults.adapter = async (config) => ({
      status: 204,
      statusText: 'No Content',
      headers: {},
      config,
      data: '',
    });
  });

  after(() => {
    db.closeDB();
  });

  it('1. amplify.yml declara Cache-Control: no-cache para sw.js, registerSW.js y manifest.webmanifest', () => {
    const amplifyContent = readFileSync(path.join(rootDir, 'amplify.yml'), 'utf8');
    const rules = parseCustomHeadersFromAmplify(amplifyContent);
    const byPattern = new Map(rules.map((r) => [r.pattern, r.headers]));

    for (const archivo of ['index.html', 'sw.js', 'registerSW.js', 'manifest.webmanifest']) {
      assert.ok(
        byPattern.has(archivo),
        `amplify.yml debe definir encabezados para '${archivo}'`,
      );
      assert.equal(
        byPattern.get(archivo)['Cache-Control'],
        'no-cache',
        `amplify.yml debe fijar Cache-Control: no-cache para '${archivo}'`,
      );
    }

    assert.equal(
      byPattern.get('manifest.webmanifest')['Content-Type'],
      'application/manifest+json',
      'manifest.webmanifest debe conservar Content-Type: application/manifest+json',
    );
    assert.equal(
      byPattern.has('service-worker.js'),
      false,
      'No debe quedar el patrón obsoleto service-worker.js',
    );
  });

  it('2. vite.config.ts no declara la regla api-cache ni runtimeCaching de respuestas de API, pero conserva precarga de activos offline', () => {
    const viteConfigContent = readFileSync(path.join(rootDir, 'vite.config.ts'), 'utf8');
    assert.equal(
      viteConfigContent.includes('api-cache'),
      false,
      'vite.config.ts no debe declarar api-cache',
    );
    assert.equal(
      viteConfigContent.includes('runtimeCaching'),
      false,
      'vite.config.ts no debe declarar runtimeCaching para respuestas de API',
    );
    assert.match(
      viteConfigContent,
      /globPatterns:\s*\[\s*'\*\*\/\*\.\{js,css,html,ico,png,svg,jpg,woff,woff2\}'\s*\]/,
      'workbox.globPatterns debe seguir precacheando los activos estáticos para modo sin conexión',
    );
  });

  it('3. authService.logout() y el interceptor 401 borran la caché heredada api-cache con caches.delete("api-cache") sin fallar si no existe', async () => {
    const cachesBorradas = [];
    globalThis.caches = {
      delete: async (cacheName) => {
        cachesBorradas.push(cacheName);
        return true;
      },
    };
    dom.window.caches = globalThis.caches;

    sembrarSesionActiva('token-logout-1');
    await authService.logout();

    assert.deepEqual(
      cachesBorradas,
      ['api-cache'],
      'authService.logout() debe invocar caches.delete("api-cache")',
    );

    // También en limpieza por 401 de sesión vencida
    cachesBorradas.length = 0;
    sembrarSesionActiva('token-401-1');
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

    await assert.rejects(async () => {
      await api.get('/testigos/mesa');
    });
    assert.deepEqual(
      cachesBorradas,
      ['api-cache'],
      'El interceptor 401 también debe borrar api-cache si existe en teléfonos viejos',
    );

    // Si caches.delete rechaza o caches no está disponible, logout() no debe fallar
    globalThis.caches = {
      delete: async () => {
        throw new Error('SecurityError: CacheStorage disabled');
      },
    };
    sembrarSesionActiva('token-logout-2');
    await assert.doesNotReject(async () => {
      await authService.logout();
    });

    delete globalThis.caches;
    delete dom.window.caches;
    sembrarSesionActiva('token-logout-3');
    await assert.doesNotReject(async () => {
      await authService.logout();
    });
  });

  it('4. El modo sin conexión (IndexedDB) sigue intacto tras guardar y tras cerrar sesión', async () => {
    sembrarSesionActiva('token-offline-1');
    const cachesBorradas = [];
    globalThis.caches = {
      delete: async (cacheName) => {
        cachesBorradas.push(cacheName);
        return true;
      },
    };

    // Guardar resultados, foto E-14, incidencia, OCR job y caché de escrutinio en IndexedDB
    await db.guardarResultadosYFoto(
      [
        {
          id: 'res-offline-3478',
          mesaId: 'mesa-sintetica-3478',
          testigoId: 'testigo-sintetico-3478',
          eleccionId: 'eleccion-sintetica-3478',
          candidato: 'CANDIDATO SINTÉTICO',
          partido: 'PARTIDO FICTICIO',
          candidatoId: 'cand-sintetico-1',
          tipoVoto: 'CANDIDATO',
          votos: 42,
          votosBlanco: 2,
          votosNulos: 1,
          votosNoMarcados: 0,
          totalVotosMesa: 45,
          capturedAt: '2026-11-11T14:00:00.000Z',
          deviceId: 'device-sintetico-3478',
          origen: 'manual',
        },
      ],
      [
        {
          id: 'foto-offline-3478',
          mesaId: 'mesa-sintetica-3478',
          testigoId: 'testigo-sintetico-3478',
          campanaId: 'campana-sintetica-3478',
          blob: new Blob(['ACTA E-14 SINTÉTICA']),
          capturedAt: '2026-11-11T14:00:00.000Z',
          deviceId: 'device-sintetico-3478',
        },
      ],
    );

    await db.guardarIncidencia({
      id: 'inc-offline-3478',
      mesaId: 'mesa-sintetica-3478',
      testigoId: 'testigo-sintetico-3478',
      campanaId: 'campana-sintetica-3478',
      tipo: 'MATERIALES_FALTANTES',
      descripcion: 'Incidencia sintética offline',
      capturedAt: '2026-11-11T14:01:00.000Z',
      deviceId: 'device-sintetico-3478',
    });

    await db.cacheEscrutinioData('escrutinio-consolidado', { eleccionId: 'eleccion-sintetica-3478' }, { totalMesas: 10 });

    // Cerrar sesión
    await authService.logout();

    // Se borró api-cache y la caché de escrutinio
    assert.deepEqual(cachesBorradas, ['api-cache']);
    const escrutinioTrasLogout = await db.getCachedEscrutinioData('escrutinio-consolidado', {
      eleccionId: 'eleccion-sintetica-3478',
    });
    assert.equal(escrutinioTrasLogout, null, 'La caché de escrutinio debe limpiarse al cerrar sesión');

    // La cola offline de IndexedDB sigue intacta (synced: 0)
    const filtroTestigo = {
      testigoId: 'testigo-sintetico-3478',
      campanaId: 'campana-sintetica-3478',
    };
    const pendientes = await db.getPendientes(filtroTestigo);
    assert.equal(pendientes.resultados.length, 1);
    assert.equal(pendientes.resultados[0].id, 'res-offline-3478');
    assert.equal(pendientes.resultados[0].synced, 0);
    assert.equal(pendientes.fotos.length, 1);
    assert.equal(pendientes.fotos[0].id, 'foto-offline-3478');
    assert.equal(pendientes.fotos[0].synced, 0);

    const incidencias = await db.getIncidenciasPendientes(filtroTestigo);
    assert.equal(incidencias.length, 1);
    assert.equal(incidencias[0].id, 'inc-offline-3478');
    assert.equal(incidencias[0].synced, 0);

    delete globalThis.caches;
  });
});
