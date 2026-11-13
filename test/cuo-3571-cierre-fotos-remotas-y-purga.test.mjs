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
const { FormularioMesaMultiple } = await import('../src/components/formulario/FormularioMesaMultiple.tsx');

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

  it('4. CUO-3583: FotoE14 manual ya sincronizada en servidor (fotosE14Subidas > 0, sin job OCR y con fotosE14 local vacío tras logout/purga) habilita tieneFotos, guarda offline en IndexedDB sin bloquear y permite cerrar la mesa sin motivo', async () => {
    localStorage.setItem('cuorum_testigo_token', 'token-sintetico-3583');
    localStorage.setItem('cuorum_testigo_campana', 'campana-sintetica-3583');
    localStorage.setItem(
      'cuorum_testigo_data',
      JSON.stringify({
        testigo: {
          id: 'testigo-sintetico-3583',
          cedula: '0000003583',
          nombres: 'Testigo',
          apellidos: 'Sintético',
          telefono: '3000000000',
          email: null,
        },
        tipoTestigo: 'ELECTORAL',
        mesa: { id: 'mesa-sintetica-3583', numero: 9, totalSufragantes: 200, puesto: null },
        elecciones: [],
        deviceId: 'device-sintetico-3583',
        campana: { id: 'campana-sintetica-3583', nombre: 'Campaña Sintética', candidatoId: null, listaId: null },
      }),
    );

    // Simular foto E-14 manual sincronizada y luego borrada en logout voluntario
    await idb.guardarFotoE14({
      id: 'foto-manual-3583',
      mesaId: 'mesa-sintetica-3583',
      testigoId: 'testigo-sintetico-3583',
      campanaId: 'campana-sintetica-3583',
      blob: new Blob(['foto-sintetica-3583'], { type: 'image/jpeg' }),
      capturedAt: '2026-11-13T10:00:00.000Z',
      deviceId: 'device-sintetico-3583',
    });
    await idb.marcarSincronizados([], ['foto-manual-3583']);
    await idb.limpiarDatosSincronizadosTestigo({
      campanaId: 'campana-sintetica-3583',
      testigoId: 'testigo-sintetico-3583',
    });

    const fotosLocales = await idb.getFotosByMesa('mesa-sintetica-3583', {
      campanaId: 'campana-sintetica-3583',
      testigoId: 'testigo-sintetico-3583',
    });
    assert.equal(fotosLocales.length, 0, 'fotosE14 local debe estar vacío tras logout/purga');
    const ocrLocales = await idb.getOcrJobsByMesa('mesa-sintetica-3583', {
      campanaId: 'campana-sintetica-3583',
      testigoId: 'testigo-sintetico-3583',
    });
    assert.equal(ocrLocales.length, 0, 'No debe haber jobs OCR locales');

    let cierrePayload = null;
    let consultoProgreso = false;

    api.defaults.adapter = async (config) => {
      if (config.url === '/testigos/actas/by-mesa/mesa-sintetica-3583') {
        // Sin job de OCR en el servidor (la foto fue subida manualmente como FotoE14)
        return {
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
          data: [],
        };
      }
      if (config.url === '/testigos/jornada/progreso') {
        consultoProgreso = true;
        return {
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
          data: {
            jornada: {
              id: 'jornada-remota-3583',
              mesaId: 'mesa-sintetica-3583',
              testigoId: 'testigo-sintetico-3583',
              campanaId: 'campana-sintetica-3583',
              estado: 'ABIERTA',
            },
            elecciones: [],
            fotosE14Subidas: 1,
            progreso: { reportadas: 0, total: 1, porcentaje: 0 },
          },
        };
      }
      if (config.url === '/testigos/resultados/historial') {
        return {
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
          data: { data: [] },
        };
      }
      if (config.url === '/testigos/jornada/cerrar') {
        cierrePayload = typeof config.data === 'string' ? JSON.parse(config.data) : config.data;
        return {
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
          data: {
            id: 'jornada-remota-3583',
            mesaId: 'mesa-sintetica-3583',
            estado: 'CERRADA',
            codigoVerificacion: 'CAFE3583',
          },
        };
      }
      return { status: 200, statusText: 'OK', headers: {}, config, data: {} };
    };

    // Simular desconexión durante el guardado para verificar que handleGuardar no bloquea IndexedDB
    globalThis.fetch = async () => {
      throw new Error('offline');
    };

    const container = document.getElementById('root');
    const root = createRoot(container);

    try {
      await act(async () => {
        root.render(
          React.createElement(FormularioMesaMultiple, {
            mesaId: 'mesa-sintetica-3583',
            testigoId: 'testigo-sintetico-3583',
            mesaNumero: 9,
            totalSufragantes: 200,
            elecciones: [
              {
                id: 'elec-sintetica-3583',
                nombre: 'Alcaldía Sintética',
                tipoEleccion: 'ALCALDIA',
                tipoCargo: 'UNINOMINAL',
                votoPreferente: false,
                candidatos: [
                  {
                    id: 'cand-sintetico-3583',
                    nombre: 'Candidato Sintético Uno',
                    partido: 'Partido Sintético',
                    numero: 1,
                  },
                ],
              },
            ],
            deviceId: 'device-sintetico-3583',
          }),
        );
      });

      await act(async () => {
        await new Promise((r) => setTimeout(r, 30));
      });

      assert.equal(consultoProgreso, true, 'Debe consultar el progreso de la jornada con fotosE14Subidas');

      // En Paso 1, como tieneFotos es true gracias a fotosE14Subidas: 1, no pide justificación
      assert.equal(
        (container.textContent || '').includes('Si no es posible tomar la foto, podrás justificarlo'),
        false,
        'No debe mostrar aviso de falta de foto cuando fotosE14Subidas > 0 en el servidor',
      );

      // Ir a Paso 2 (Revisar votos) y guardar resultados offline en IndexedDB
      const tabContar = container.querySelector('#tab-contar');
      assert.ok(tabContar, 'Debe existir la pestaña 2. Revisar votos');
      await act(async () => {
        tabContar.click();
        await new Promise((r) => setTimeout(r, 20));
      });

      const btnGuardar = container.querySelector('[data-testid="btn-guardar-resultados"]');
      assert.ok(btnGuardar, 'Debe existir el botón Guardar Resultados');
      await act(async () => {
        btnGuardar.click();
        await new Promise((r) => setTimeout(r, 30));
      });

      const resultadosGuardados = await idb.getResultadosByMesa('mesa-sintetica-3583', {
        testigoId: 'testigo-sintetico-3583',
      });
      assert.equal(resultadosGuardados.length, 1, 'Debe guardar el resultado en IndexedDB sin bloquear por red');

      // Ir a Paso 3 (Cerrar)
      const tabCierre = container.querySelector('#tab-cierre');
      assert.ok(tabCierre, 'Debe existir la pestaña 3. Cerrar');
      await act(async () => {
        tabCierre.click();
        await new Promise((r) => setTimeout(r, 20));
      });

      assert.equal(
        (container.textContent || '').includes('Evidencia de foto obligatoria'),
        false,
        'No debe pedir justificación de falta de foto en el paso de cierre',
      );

      const btnFirmarActa = Array.from(container.querySelectorAll('button')).find((b) =>
        (b.textContent || '').includes('Cerrar y firmar acta'),
      );
      assert.ok(btnFirmarActa, 'Debe existir el botón Cerrar y firmar acta');
      assert.equal(btnFirmarActa.disabled, false, 'Cerrar y firmar acta debe estar habilitado sin motivo');

      await act(async () => {
        btnFirmarActa.click();
        await new Promise((r) => setTimeout(r, 30));
      });

      assert.ok(cierrePayload, 'Debe invocar el cierre de jornada en el servidor');
      assert.equal(cierrePayload.sinFotoMotivo, undefined, 'Cierra la mesa sin requerir sinFotoMotivo');
      assert.match(container.textContent || '', /Acta cerrada y firmada/i);
      assert.match(container.textContent || '', /CAFE3583/);
    } finally {
      await act(async () => {
        root.unmount();
      });
    }
  });
});
