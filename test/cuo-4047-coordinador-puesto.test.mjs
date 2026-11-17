import { describe, it, beforeEach, afterEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { JSDOM } from 'jsdom';
import 'fake-indexeddb/auto';

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
    configurable: true,
    writable: true,
  });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let simulatedOnline = true;
Object.defineProperty(navigator, 'onLine', {
  configurable: true,
  get: () => simulatedOnline,
});
window.matchMedia = (q) => ({
  matches: q === '(prefers-color-scheme: dark)' && document.documentElement.classList.contains('dark'),
  addEventListener: () => {},
  removeEventListener: () => {},
});
if (!globalThis.URL.revokeObjectURL) {
  globalThis.URL.revokeObjectURL = () => {};
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (
      (context.parentURL?.includes('/src/') || context.parentURL?.includes('/test/')) &&
      (specifier.startsWith('./') || specifier.startsWith('../'))
    ) {
      const base = new URL(specifier, context.parentURL);
      for (const ext of ['', '.ts', '.tsx', '/index.ts', '/index.tsx']) {
        const candidate = new URL(base.href + ext);
        if (existsSync(fileURLToPath(candidate))) {
          return { url: candidate.href, shortCircuit: true };
        }
      }
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.startsWith('file:') && /\.tsx?$/.test(url)) {
      const source = readFileSync(fileURLToPath(url), 'utf8');
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
const { App } = await import('../src/App.tsx');
const { api } = await import('../src/services/api.ts');
const { authService } = await import('../src/services/authService.ts');
const db = await import('../src/db/indexeddb.ts');

const CAMPANA = { id: 'campana-sintetica-a', nombre: 'Campaña Sintética A', candidatoId: null, listaId: null };
const PUESTO = { id: 'puesto-sintetico-01', nombre: 'Colegio Sintético Central', direccion: 'Calle 10 # 20-30' };
const LOGIN_COORDINADOR = {
  token: 'jwt-sintetico-coordinador',
  tipoTestigo: 'ELECTORAL',
  rol: 'COORDINADOR_PUESTO',
  puesto: PUESTO,
  testigo: {
    id: 'testigo-coordinador-01', cedula: 'TEST-0009', nombres: 'FICTICIA', apellidos: 'Coordinadora Sintética',
    telefono: '3000000009', email: 'coordinadora@example.invalid',
  },
  mesa: null,
  elecciones: [],
  deviceId: 'device-sintetico-09',
  campana: CAMPANA,
};
const MESAS = {
  puesto: { ...PUESTO, municipio: { nombre: 'MUNICIPIO FICTICIO' } },
  mesas: [
    { id: 'mesa-sintetica-01', numero: 1, totalSufragantes: 300, tieneTitular: true, resultadosEnviados: 2,
      ultimoResultadoAt: '2027-10-31T21:10:00.000Z',
      jornada: { estado: 'ABIERTA', checkinAt: '2027-10-31T12:30:00.000Z', aperturaAt: '2027-10-31T13:00:00.000Z',
        cierreAt: null, firmadoAt: null, requiereSeguimiento: false, updatedAt: '2027-10-31T13:00:00.000Z' } },
    { id: 'mesa-sintetica-02', numero: 2, totalSufragantes: 280, tieneTitular: false, resultadosEnviados: 0,
      ultimoResultadoAt: null, jornada: null },
  ],
};
const DETALLE = {
  mesa: { id: 'mesa-sintetica-01', numero: 1, totalSufragantes: 300 },
  jornada: MESAS.mesas[0].jornada,
  resultados: [
    { id: 'r1', eleccionId: null, candidato: 'CANDIDATO FICTICIO', partido: 'PARTIDO FICTICIO', tipoVoto: 'CANDIDATO',
      votos: 41, votosBlanco: 0, votosNulos: 0, votosNoMarcados: 0, totalVotosMesa: 120, capturedAt: '2027-10-31T21:10:00.000Z' },
  ],
};

let root;
let llamadas = [];
let responder;

const flush = async (ms = 30) =>
  act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });

const click = async (el) => {
  assert.ok(el, 'Elemento a clicar debe existir');
  await act(async () => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await flush();
};

describe('CUO-4047 · Coordinador de puesto en la PWA: solo lectura de las mesas de su puesto', () => {
  beforeEach(async () => {
    const idb = await db.getDB();
    for (const store of idb.objectStoreNames) await idb.clear(store);
    localStorage.clear();
    sessionStorage.clear();
    simulatedOnline = true;
    llamadas = [];
    responder = ({ url }) => {
      if (url.includes('/auth/testigos/login')) return { status: 200, body: LOGIN_COORDINADOR };
      if (url.includes('/auth/testigos/verify')) return { status: 200, body: { valid: true } };
      if (url.endsWith('/testigos/puesto/mesas')) return { status: 200, body: MESAS };
      if (url.includes('/testigos/puesto/mesas/mesa-sintetica-01')) return { status: 200, body: DETALLE };
      return { status: 404, body: { error: 'Ruta no esperada en la prueba' } };
    };
    api.defaults.adapter = async (config) => {
      const llamada = { url: config.url || '', method: (config.method || 'get').toUpperCase() };
      llamadas.push(llamada);
      const { status, body } = await responder(llamada);
      if (status >= 400) {
        const err = new Error(`Request failed with status code ${status}`);
        err.isAxiosError = true;
        err.config = config;
        err.response = { status, data: body, headers: {}, config };
        throw err;
      }
      return { status, statusText: 'OK', headers: {}, config, data: body };
    };
    document.body.innerHTML = '<div id="root"></div>';
    root = createRoot(document.getElementById('root'));
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
  });

  after(() => {
    db.closeDB();
    dom.window.close();
  });

  it('1. Servicio: el login del coordinador guarda su rol y su puesto, sin mesa', async () => {
    await authService.login('TEST-0009', '246810');
    const data = authService.getTestigoData();
    assert.equal(data.rol, 'COORDINADOR_PUESTO');
    assert.deepEqual(data.puesto, PUESTO);
    assert.equal(data.mesa, null);
  });

  it('2. Una sesión anterior sin rol sigue siendo de titular', async () => {
    const { rol, puesto, ...sinRol } = LOGIN_COORDINADOR;
    responder = () => ({ status: 200, body: { ...sinRol, mesa: MESAS.mesas[0] } });
    await authService.login('TEST-0010', '246810');
    assert.equal(authService.getTestigoData().rol, 'TITULAR');
  });

  it('3. App: el coordinador ve las mesas de su puesto y nunca pide la jornada de la mesa ni escribe', async () => {
    await authService.login('TEST-0009', '246810');
    llamadas = [];
    await act(async () => {
      root.render(React.createElement(App));
    });
    await flush(60);

    const panel = document.querySelector('[data-testid="panel-puesto"]');
    assert.ok(panel, 'Debe mostrarse el panel del puesto');
    assert.match(panel.textContent, /Colegio Sintético Central/);
    assert.match(panel.textContent, /Mesa #1/);
    assert.match(panel.textContent, /Mesa abierta/);
    assert.match(panel.textContent, /Sin testigo asignado/);
    assert.equal(document.querySelector('#cedula'), null, 'No vuelve al login');
    assert.ok(llamadas.some((l) => l.url.endsWith('/testigos/puesto/mesas')));
    assert.ok(!llamadas.some((l) => l.url.includes('/testigos/jornada')), 'No pide la jornada de una mesa');
    assert.ok(llamadas.every((l) => l.method === 'GET'), 'Solo lee');
  });

  it('4. App: al tocar una mesa ve su jornada y los resultados enviados, y vuelve a la lista', async () => {
    await authService.login('TEST-0009', '246810');
    await act(async () => {
      root.render(React.createElement(App));
    });
    await flush(60);
    await click(document.querySelector('[data-testid="mesa-puesto-mesa-sintetica-01"]'));
    await flush(60);

    const detalle = document.querySelector('[data-testid="detalle-mesa-puesto"]');
    assert.ok(detalle, 'Debe mostrarse el detalle de la mesa');
    assert.match(detalle.textContent, /CANDIDATO FICTICIO/);
    assert.match(detalle.textContent, /41/);
    const volver = [...detalle.querySelectorAll('button')].find((b) => /Volver a las mesas/.test(b.textContent));
    await click(volver);
    assert.equal(document.querySelector('[data-testid="detalle-mesa-puesto"]'), null);
    assert.ok(document.querySelector('[data-testid="mesa-puesto-mesa-sintetica-02"]'));
  });

  it('5. App: un titular sigue en el flujo de su mesa, no en el panel del puesto', async () => {
    const { rol, puesto, ...sinRol } = LOGIN_COORDINADOR;
    responder = ({ url }) => {
      if (url.includes('/auth/testigos/login')) return { status: 200, body: { ...sinRol, mesa: MESAS.mesas[0] } };
      if (url.includes('/auth/testigos/verify')) return { status: 200, body: { valid: true } };
      if (url.includes('/testigos/jornada')) return { status: 200, body: { id: 'j1', estado: 'PENDIENTE' } };
      return { status: 404, body: {} };
    };
    await authService.login('TEST-0010', '246810');
    await act(async () => {
      root.render(React.createElement(App));
    });
    await flush(60);
    assert.equal(document.querySelector('[data-testid="panel-puesto"]'), null);
    assert.ok(!llamadas.some((l) => l.url.includes('/testigos/puesto')));
  });
});
