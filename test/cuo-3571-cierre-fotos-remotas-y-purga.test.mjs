import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import ts from 'typescript';
import { JSDOM } from 'jsdom';
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';

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
const { resetBackoffState } = await import('../src/services/syncService.ts');
const formatoError = await import('../src/utils/formatoError.ts');
const { App } = await import('../src/App.tsx');

const originalFetch = globalThis.fetch;
const originalAdapter = api.defaults.adapter;

describe('CUO-3571: Ajustes de la limpieza de IndexedDB (seguimiento de CUO-3564)', () => {
  beforeEach(async () => {
    idb.closeDB();
    globalThis.indexedDB = new IDBFactory();
    localStorage.clear();
    sessionStorage.clear();
    resetBackoffState();
    globalThis.fetch = originalFetch;
    api.defaults.adapter = originalAdapter;
  });

  afterEach(() => {
    idb.closeDB();
    globalThis.fetch = originalFetch;
    api.defaults.adapter = originalAdapter;
  });

  it('1. Purga de 24 h conserva la jornada sincronizada de más de 24 h si el mismo testigo tiene un resultado pendiente (synced: 0)', async () => {
    const ahora = Date.parse('2026-11-12T20:00:00.000Z');
    const hace30Horas = new Date(ahora - 30 * 60 * 60 * 1000).toISOString();

    // Jornada synced: 1 de hace 30 h del testigo con resultado pendiente
    await idb.guardarJornada({
      id: 'jornada-testigo-con-pendiente',
      mesaId: 'mesa-sintetica-1',
      testigoId: 'testigo-con-pendiente',
      campanaId: 'campana-sintetica-1',
      estado: 'ABIERTA',
      checkinAt: hace30Horas,
      checkinLat: 4.6097,
      checkinLng: -74.0817,
      synced: 1,
      updatedAt: hace30Horas,
    });

    // Resultado pendiente (synced: 0) del mismo testigo
    await idb.guardarResultado({
      id: 'resultado-pendiente-testigo',
      mesaId: 'mesa-sintetica-1',
      testigoId: 'testigo-con-pendiente',
      eleccionId: 'elec-sintetica-1',
      candidato: 'Candidato Sintético',
      partido: 'Partido Sintético',
      tipoVoto: 'CANDIDATO',
      votos: 42,
      votosBlanco: 1,
      votosNulos: 0,
      votosNoMarcados: 0,
      totalVotosMesa: 43,
      capturedAt: hace30Horas,
      deviceId: 'device-sintetico-1',
    });

    // Jornada synced: 1 de hace 30 h de otro testigo sin pendientes (esta sí debe purgarse)
    await idb.guardarJornada({
      id: 'jornada-testigo-sin-pendiente',
      mesaId: 'mesa-sintetica-2',
      testigoId: 'testigo-sin-pendiente',
      campanaId: 'campana-sintetica-1',
      estado: 'FIRMADA',
      synced: 1,
      updatedAt: hace30Horas,
    });

    const eliminados = await idb.purgarSincronizadosAntiguos(idb.TTL_SINCRONIZADOS_MS, ahora);
    assert.equal(eliminados, 1, 'Solo debe eliminar la jornada del testigo sin pendientes');

    const db = await idb.getDB();
    const jornadaConservada = await db.get('jornada', 'jornada-testigo-con-pendiente');
    assert.ok(
      jornadaConservada,
      'La jornada synced de más de 24 h con un resultado pendiente del mismo testigo sobrevive a la purga',
    );
    assert.equal(jornadaConservada.testigoId, 'testigo-con-pendiente');

    const jornadaEliminada = await db.get('jornada', 'jornada-testigo-sin-pendiente');
    assert.equal(jornadaEliminada, undefined, 'La jornada antigua sin pendientes sí se purga');
  });

  it('2. App.tsx al arrancar con getTestigoData() vacío o corrupto pasa { voluntario: false } a logout() y no borra lo sincronizado de la campaña', async () => {
    localStorage.setItem('cuorum_testigo_token', 'token-sintetico-3571');
    localStorage.setItem('cuorum_testigo_campana', 'campana-sintetica-3571');
    localStorage.setItem(
      'cuorum_testigo_data',
      JSON.stringify({
        testigo: {
          id: 'testigo-sintetico-3571',
          cedula: '0000003571',
          nombres: 'Testigo',
          apellidos: 'Sintético',
          telefono: '3000000000',
          email: null,
        },
        tipoTestigo: 'ELECTORAL',
        mesa: { id: 'mesa-sintetica-3571', numero: 7, totalSufragantes: 200, puesto: null },
        elecciones: [],
        deviceId: 'device-sintetico-3571',
        campana: { id: 'campana-sintetica-3571', nombre: 'Campaña Sintética', candidatoId: null, listaId: null },
      }),
    );

    await idb.guardarFotoE14({
      id: 'foto-sincronizada-3571',
      mesaId: 'mesa-sintetica-3571',
      testigoId: 'testigo-sintetico-3571',
      campanaId: 'campana-sintetica-3571',
      blob: new Blob(['foto-sintetica'], { type: 'image/jpeg' }),
      capturedAt: '2026-11-11T15:00:00.000Z',
      deviceId: 'device-sintetico-3571',
    });
    await idb.marcarSincronizados([], ['foto-sincronizada-3571']);

    api.defaults.adapter = async (config) => {
      if (config.url === '/auth/testigos/verify') {
        // Simular que cuorum_testigo_data queda vacío/corrupto al momento de leer getTestigoData() en App.tsx:54
        localStorage.setItem('cuorum_testigo_data', '{json-corrupto');
      }
      return {
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
        data: { valid: true },
      };
    };

    const container = document.getElementById('root');
    const root = createRoot(container);

    try {
      await act(async () => {
        root.render(React.createElement(App));
      });
      await act(async () => {
        await new Promise((r) => setTimeout(r, 30));
      });

      assert.equal(
        localStorage.getItem('cuorum_testigo_token'),
        null,
        'Debe limpiar la sesión local cuando getTestigoData() es nulo o corrupto',
      );

      const db = await idb.getDB();
      const fotoConservada = await db.get('fotosE14', 'foto-sincronizada-3571');
      assert.ok(
        fotoConservada,
        'No debe tratar el arranque con getTestigoData() vacío/corrupto como logout voluntario ni borrar registros synced: 1',
      );
    } finally {
      await act(async () => {
        root.unmount();
      });
    }
  });

  it('3. formatoError.ts es la única fuente de esErrorCuotaAlmacenamiento y MSG_CUOTA_ALMACENAMIENTO e indexeddb.ts las importa', () => {
    const idbCode = readFileSync(path.join(__dirname, '../src/db/indexeddb.ts'), 'utf8');
    assert.equal(
      /export function esErrorCuotaAlmacenamiento/.test(idbCode),
      false,
      'indexeddb.ts no debe duplicar la definición de esErrorCuotaAlmacenamiento',
    );
    assert.equal(
      /export const MSG_CUOTA_ALMACENAMIENTO\s*=/.test(idbCode),
      false,
      'indexeddb.ts no debe duplicar la definición de MSG_CUOTA_ALMACENAMIENTO',
    );
    assert.equal(idb.esErrorCuotaAlmacenamiento, formatoError.esErrorCuotaAlmacenamiento);
    assert.equal(idb.MSG_CUOTA_ALMACENAMIENTO, formatoError.MSG_CUOTA_ALMACENAMIENTO);
  });
});
