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
const { FormularioMesaMultiple, contarFotosRemotasDeRespuesta } =
  await import('../src/components/formulario/FormularioMesaMultiple.tsx');

const originalFetch = globalThis.fetch;
const originalAdapter = api.defaults.adapter;

function sembrarSesionLocal({
  token = 'token-sintetico-3571',
  testigoId = 'testigo-sintetico-3571',
  campanaId = 'campana-sintetica-3571',
} = {}) {
  localStorage.setItem('cuorum_testigo_token', token);
  localStorage.setItem('cuorum_testigo_campana', campanaId);
  localStorage.setItem(
    'cuorum_testigo_data',
    JSON.stringify({
      testigo: {
        id: testigoId,
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
      campana: { id: campanaId, nombre: 'Campaña Sintética', candidatoId: null, listaId: null },
    }),
  );
}

describe('CUO-3571: Cierre de mesa con fotos E-14 en servidor y ajustes de limpieza IndexedDB', () => {
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

  it('1. Sin fotos locales en IndexedDB y con fotos remotas en el servidor, tieneFotos es verdadero y permite cerrar la mesa sin motivo', async () => {
    sembrarSesionLocal();

    // Asegurar que IndexedDB tiene 0 fotos locales para la mesa
    const fotosLocales = await idb.getFotosByMesa('mesa-sintetica-3571', {
      campanaId: 'campana-sintetica-3571',
      testigoId: 'testigo-sintetico-3571',
    });
    assert.equal(fotosLocales.length, 0, 'No debe haber fotos locales en IndexedDB');

    let cierrePayload = null;
    let consultoFotosRemotas = false;

    api.defaults.adapter = async (config) => {
      if (config.url === '/testigos/actas/by-mesa/mesa-sintetica-3571') {
        consultoFotosRemotas = true;
        return {
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
          data: [
            {
              id: 'acta-remota-3571',
              eleccionId: 'elec-sintetica-1',
              testigoId: 'testigo-sintetico-3571',
              campanaId: 'campana-sintetica-3571',
              estado: 'CONFIRMADO',
              createdAt: '2026-11-11T14:00:00.000Z',
              fotos: [
                {
                  id: 'foto-remota-e14-1',
                  orden: 1,
                  url: 'https://s3.sintetico.local/e14/foto-remota-1.jpg',
                  capturedAt: '2026-11-11T14:00:00.000Z',
                },
              ],
            },
          ],
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
      if (config.url === '/testigos/resultados') {
        return {
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
          data: { aceptados: 1, rechazados: [] },
        };
      }
      if (config.url === '/testigos/jornada/progreso') {
        return {
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
          data: {
            elecciones: [],
            progreso: { reportadas: 0, total: 1, porcentaje: 0 },
          },
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
            id: 'jornada-remota-3571',
            mesaId: 'mesa-sintetica-3571',
            estado: 'CERRADA',
            codigoVerificacion: 'CAFE3571',
          },
        };
      }
      return { status: 200, statusText: 'OK', headers: {}, config, data: {} };
    };

    const container = document.getElementById('root');
    const root = createRoot(container);

    try {
      await act(async () => {
        root.render(
          React.createElement(FormularioMesaMultiple, {
            mesaId: 'mesa-sintetica-3571',
            testigoId: 'testigo-sintetico-3571',
            mesaNumero: 7,
            totalSufragantes: 200,
            elecciones: [
              {
                id: 'elec-sintetica-1',
                nombre: 'Alcaldía Sintética',
                tipoEleccion: 'ALCALDIA',
                tipoCargo: 'UNINOMINAL',
                votoPreferente: false,
                candidatos: [
                  {
                    id: 'cand-sintetico-1',
                    nombre: 'Candidato Sintético Uno',
                    partido: 'Partido Sintético',
                    numero: 1,
                  },
                ],
              },
            ],
            deviceId: 'device-sintetico-3571',
          }),
        );
      });

      // Esperar promesas de efectos iniciales (getFotosByMesa + obtenerFotosRemotasMesaCount)
      await act(async () => {
        await new Promise((r) => setTimeout(r, 30));
      });

      assert.equal(consultoFotosRemotas, true, 'Debe consultar las fotos remotas de la mesa en el servidor');

      // En Paso 1 (Foto E-14), al ser tieneFotos verdadero, no muestra el texto de "Si no es posible tomar la foto..."
      assert.equal(
        (container.textContent || '').includes('Si no es posible tomar la foto, podrás justificarlo'),
        false,
        'Con foto remota existente, tieneFotos es verdadero en el paso 1',
      );
      const tabFoto = container.querySelector('#tab-foto');
      assert.ok(tabFoto?.textContent?.includes('1'), 'La pestaña 1. Foto E-14 muestra el conteo remoto');

      // Ir al paso 2 (Revisar votos) y guardar resultados
      const tabContar = container.querySelector('#tab-contar');
      await act(async () => {
        tabContar.click();
      });

      const btnGuardar = container.querySelector('[data-testid="btn-guardar-resultados"]');
      assert.ok(btnGuardar, 'Debe existir el botón Guardar Resultados');
      await act(async () => {
        btnGuardar.click();
        await new Promise((r) => setTimeout(r, 30));
      });

      // Ir al paso 3 (Cerrar)
      const tabCierre = container.querySelector('#tab-cierre');
      await act(async () => {
        tabCierre.click();
      });

      // Verificar que NO pide otra foto ni motivo obligatorio (!tieneFotos es false)
      assert.equal(
        (container.textContent || '').includes('Evidencia de foto obligatoria'),
        false,
        'No debe pedir justificación de falta de foto cuando la foto ya está en el servidor',
      );

      const btnCerrarMesa = Array.from(container.querySelectorAll('button')).find((b) =>
        (b.textContent || '').includes('Cerrar Acta de Mesa'),
      );
      assert.ok(btnCerrarMesa, 'Debe existir el botón Cerrar Acta de Mesa');
      assert.equal(btnCerrarMesa.disabled, false, 'Cerrar Acta de Mesa debe estar habilitado sin motivo');

      const btnFirmarActa = Array.from(container.querySelectorAll('button')).find((b) =>
        (b.textContent || '').includes('Cerrar y firmar acta'),
      );
      assert.ok(btnFirmarActa, 'Debe existir el botón Cerrar y firmar acta');
      assert.equal(btnFirmarActa.disabled, false, 'Cerrar y firmar acta debe estar habilitado sin motivo');

      await act(async () => {
        btnFirmarActa.click();
        await new Promise((r) => setTimeout(r, 30));
      });

      assert.ok(cierrePayload, 'Debe haber invocado el cierre de jornada en el servidor');
      assert.equal(cierrePayload.sinFotoMotivo, undefined, 'Cierra la mesa sin requerir sinFotoMotivo');
      assert.match(container.textContent || '', /Acta cerrada y firmada/i);
      assert.match(container.textContent || '', /CAFE3571/);
    } finally {
      await act(async () => {
        root.unmount();
      });
    }
  });

  it('2. Purga de 24 h conserva la jornada sincronizada de más de 24 h si el mismo testigo tiene un resultado pendiente (synced: 0)', async () => {
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

  it('3. App.tsx pasa { voluntario: false } en el logout por datos vacíos/corruptos y formatoError.ts es la única fuente de cuota', () => {
    const appCode = readFileSync(path.join(__dirname, '../src/App.tsx'), 'utf8');
    const llamadasAwaitLogoutSinArgs = appCode.match(/await\s+authService\.logout\(\s*\)/g);
    assert.equal(
      llamadasAwaitLogoutSinArgs,
      null,
      'App.tsx no debe llamar a await authService.logout() sin argumentos en el arranque',
    );
    assert.equal(
      (appCode.match(/authService\.logout\(\{\s*voluntario:\s*false\s*\}\)/g) || []).length,
      2,
      'App.tsx debe pasar { voluntario: false } tanto en token inválido como en getTestigoData() vacío',
    );

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
    assert.equal(contarFotosRemotasDeRespuesta([{ fotos: [{ id: 'f1' }, { id: 'f2' }] }]), 2);
  });
});
