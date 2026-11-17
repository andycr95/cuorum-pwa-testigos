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
const { App, INTERVALO_REVISION_SESION_MS } = await import('../src/App.tsx');
const { LoginPage } = await import('../src/components/auth/LoginPage.tsx');
const { SelectorMesa } = await import('../src/components/auth/SelectorMesa.tsx');
const { api } = await import('../src/services/api.ts');
const { authService, esSuplenteSinActivar, AUTH_NOTICE_KEY } = await import('../src/services/authService.ts');
const db = await import('../src/db/indexeddb.ts');

const MENSAJE_SUPLENTE = 'Eres testigo suplente de esta mesa. Podrás reportar cuando la campaña te active.';
const CUERPO_SUPLENTE = { error: MENSAJE_SUPLENTE, codigo: 'SUPLENTE_SIN_ACTIVAR' };
const CAMPANA = { id: 'campana-sintetica-a', nombre: 'Campaña Sintética A', candidatoId: null, listaId: null };
const MESA = {
  id: 'mesa-sintetica-07',
  numero: 7,
  totalSufragantes: 300,
  puesto: { id: 'puesto-sintetico-01', nombre: 'Colegio Sintético Central', direccion: 'Calle 10 # 20-30' },
};

function respuestaLogin(cedula) {
  return {
    token: 'jwt-sintetico-suplente-activado',
    tipoTestigo: 'ELECTORAL',
    testigo: {
      id: 'testigo-suplente-01', cedula, nombres: 'FICTICIA', apellidos: 'Suplente Sintética',
      telefono: '3000000000', email: 'suplente@example.invalid',
    },
    mesa: MESA,
    elecciones: [],
    deviceId: 'device-sintetico-01',
    campana: CAMPANA,
  };
}

function guardarSesionTitular() {
  localStorage.setItem('cuorum_testigo_token', 'jwt-sintetico-titular');
  localStorage.setItem('cuorum_testigo_campana', CAMPANA.id);
  localStorage.setItem('cuorum_testigo_data', JSON.stringify({
    testigo: {
      id: 'testigo-titular-01', cedula: 'TEST-0001', nombres: 'FICTICIO', apellidos: 'Titular Sintético',
      telefono: '3000000001', email: 'titular@example.invalid',
    },
    tipoTestigo: 'ELECTORAL',
    mesa: MESA,
    elecciones: [],
    deviceId: 'device-sintetico-02',
    campana: CAMPANA,
  }));
}

let root;
let llamadas = [];
let responder;

function errorHttp(config, status, data) {
  const err = new Error(`Request failed with status code ${status}`);
  err.isAxiosError = true;
  err.config = config;
  err.response = { status, data, headers: {}, config };
  return err;
}

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

async function llenarYEnviarLogin(cedula, pin) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  await act(async () => {
    const c = document.querySelector('#cedula');
    const p = document.querySelector('#pin');
    setter.call(c, cedula);
    c.dispatchEvent(new Event('input', { bubbles: true }));
    setter.call(p, pin);
    p.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => {
    document.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
  await flush();
}

describe('CUO-4046 · Testigo suplente en la PWA: espera la activación y el titular sale de la mesa', () => {
  beforeEach(async () => {
    const idb = await db.getDB();
    for (const store of idb.objectStoreNames) await idb.clear(store);
    localStorage.clear();
    sessionStorage.clear();
    simulatedOnline = true;
    llamadas = [];
    responder = () => ({ status: 200, body: {} });
    api.defaults.adapter = async (config) => {
      let payload = config.data;
      if (typeof payload === 'string') {
        try { payload = JSON.parse(payload); } catch {}
      }
      const llamada = { url: config.url || '', method: (config.method || 'get').toUpperCase(), payload };
      llamadas.push(llamada);
      const { status, body } = await responder(llamada);
      if (status >= 400) throw errorHttp(config, status, body);
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

  it('1. Servicio: el 403 SUPLENTE_SIN_ACTIVAR del login vuelve como estado, sin token ni datos guardados', async () => {
    responder = () => ({ status: 403, body: CUERPO_SUPLENTE });
    const res = await authService.login('TEST-0002', '246810');
    assert.equal(esSuplenteSinActivar(res), true);
    assert.equal(res.error, MENSAJE_SUPLENTE);
    assert.equal(authService.getToken(), null);
    assert.equal(authService.getTestigoData(), null);
    assert.equal(localStorage.length, 0);
  });

  it('2. Servicio: otro 403 del login sigue siendo un error (testigo desactivado), no la espera del suplente', async () => {
    responder = () => ({ status: 403, body: { error: 'Testigo desactivado. Contacte al coordinador de la campaña.' } });
    await assert.rejects(authService.login('TEST-0003', '246810'));
    assert.equal(authService.getToken(), null);
  });

  it('3. Login: el suplente ve «Esperas la activación», no entra a la mesa y entra cuando la campaña lo activa', async () => {
    let activado = false;
    responder = ({ url }) => {
      if (!url.includes('/auth/testigos/login')) return { status: 200, body: {} };
      return activado ? { status: 200, body: respuestaLogin('TEST-0002') } : { status: 403, body: CUERPO_SUPLENTE };
    };
    let entradas = 0;
    await act(async () => {
      root.render(React.createElement(LoginPage, { onLoginSuccess: () => { entradas++; } }));
    });
    await llenarYEnviarLogin('TEST-0002', '246810');

    const espera = document.querySelector('[data-testid="espera-activacion-suplente"]');
    assert.ok(espera, 'Debe mostrarse la pantalla de espera');
    assert.match(espera.textContent, /Esperas la activación/);
    assert.equal(document.querySelector('[data-testid="mensaje-espera-activacion"]').textContent, MENSAJE_SUPLENTE);
    assert.equal(document.querySelector('form'), null, 'No debe seguir el formulario');
    assert.equal(document.querySelector('[role="alert"]'), null, 'La espera no es un error');
    assert.equal(entradas, 0);
    assert.equal(authService.getToken(), null);

    // Sin activar: «Ya me activaron» vuelve a la misma espera.
    await click(document.querySelector('[data-testid="btn-comprobar-activacion"]'));
    assert.ok(document.querySelector('[data-testid="espera-activacion-suplente"]'));
    assert.equal(entradas, 0);

    // La campaña lo activa: repite el login con las mismas credenciales y entra.
    activado = true;
    await click(document.querySelector('[data-testid="btn-comprobar-activacion"]'));
    assert.equal(entradas, 1);
    assert.equal(authService.getToken(), 'jwt-sintetico-suplente-activado');
    const logins = llamadas.filter((l) => l.url.includes('/auth/testigos/login'));
    assert.equal(logins.length, 3);
    for (const l of logins) assert.deepEqual(l.payload, { cedula: 'TEST-0002', pin: '246810' });
    for (let i = 0; i < localStorage.length; i++) {
      assert.doesNotMatch(localStorage.getItem(localStorage.key(i)) || '', /246810/, 'El PIN no se guarda');
    }
  });

  it('4. Login: «Salir» de la espera vuelve al formulario sin el PIN', async () => {
    responder = () => ({ status: 403, body: CUERPO_SUPLENTE });
    await act(async () => {
      root.render(React.createElement(LoginPage, { onLoginSuccess: () => {} }));
    });
    await llenarYEnviarLogin('TEST-0002', '246810');
    await click(document.querySelector('[data-testid="btn-salir-espera"]'));
    assert.equal(document.querySelector('[data-testid="espera-activacion-suplente"]'), null);
    assert.equal(document.querySelector('#pin').value, '');
  });

  it('5. Interceptor: un 403 SUPLENTE_SIN_ACTIVAR con token cierra la sesión y deja el aviso; otro 403 no', async () => {
    guardarSesionTitular();
    responder = () => ({ status: 403, body: { error: 'Sin permiso para esta acción' } });
    await assert.rejects(api.get('/testigos/jornada/mesa-sintetica-07'));
    assert.equal(authService.getToken(), 'jwt-sintetico-titular', 'Otro 403 no cierra la sesión');

    let avisos = 0;
    const alAviso = () => { avisos++; };
    window.addEventListener('cuorum:unauthorized', alAviso);
    responder = () => ({ status: 403, body: CUERPO_SUPLENTE });
    await assert.rejects(api.get('/testigos/jornada/mesa-sintetica-07'));
    window.removeEventListener('cuorum:unauthorized', alAviso);
    assert.equal(avisos, 1);
    assert.equal(authService.getToken(), null);
    assert.equal(authService.getTestigoData(), null);
    assert.equal(localStorage.getItem(AUTH_NOTICE_KEY), MENSAJE_SUPLENTE);
  });

  it('6. Titular reemplazado: con la app abierta, la revisión periódica lo saca de la mesa al recibir 401', async () => {
    guardarSesionTitular();
    let reemplazado = false;
    responder = ({ url }) => {
      if (url.includes('/auth/testigos/verify')) {
        return reemplazado
          ? { status: 401, body: { error: 'Sesión de testigo vencida. Inicia sesión de nuevo.' } }
          : { status: 200, body: { valido: true } };
      }
      if (url.includes('/auth/logout')) return { status: 401, body: {} };
      return { status: 200, body: {} };
    };

    const intervalos = [];
    const setIntervalOriginal = window.setInterval;
    window.setInterval = (fn, ms) => {
      intervalos.push({ fn, ms });
      return setIntervalOriginal.call(window, () => {}, 1_000_000);
    };
    try {
      await act(async () => {
        root.render(React.createElement(App));
      });
      await flush(60);
      assert.equal(document.querySelector('#cedula'), null, 'El titular está dentro de la app');

      const revision = intervalos.find((i) => i.ms === INTERVALO_REVISION_SESION_MS);
      assert.ok(revision, 'Debe programarse la revisión de la sesión');
      assert.equal(INTERVALO_REVISION_SESION_MS, 60_000);

      // Sin red no se revisa.
      simulatedOnline = false;
      const verificacionesAntes = llamadas.filter((l) => l.url.includes('/auth/testigos/verify')).length;
      await act(async () => { await revision.fn(); });
      assert.equal(llamadas.filter((l) => l.url.includes('/auth/testigos/verify')).length, verificacionesAntes);

      // La campaña activa al suplente: la siguiente revisión saca al titular al login con el aviso.
      simulatedOnline = true;
      reemplazado = true;
      await act(async () => { await revision.fn(); });
      await flush(60);
      assert.ok(document.querySelector('#cedula'), 'Debe volver al login');
      assert.equal(authService.getToken(), null);
      assert.match(document.body.textContent, /Sesión de testigo vencida/);
    } finally {
      window.setInterval = setIntervalOriginal;
    }
  });

  it('7. Titular reemplazado: al volver a la app (visibilitychange) se revisa la sesión', async () => {
    guardarSesionTitular();
    let reemplazado = false;
    responder = ({ url }) => {
      if (url.includes('/auth/testigos/verify')) {
        return reemplazado
          ? { status: 401, body: { error: 'Sesión de testigo vencida. Inicia sesión de nuevo.' } }
          : { status: 200, body: { valido: true } };
      }
      return { status: 200, body: {} };
    };
    await act(async () => {
      root.render(React.createElement(App));
    });
    await flush(60);
    assert.equal(document.querySelector('#cedula'), null);

    reemplazado = true;
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await flush(60);
    assert.ok(document.querySelector('#cedula'), 'Debe volver al login');
  });

  it('8. Sin mesa asignada (titular que vuelve a entrar después de la activación): mensaje claro en vez del selector vacío', async () => {
    await act(async () => {
      root.render(React.createElement(SelectorMesa, { mesas: [], onSelect: () => {}, testigoNombre: 'FICTICIO Titular' }));
    });
    const aviso = document.querySelector('[data-testid="sin-mesa-asignada"]');
    assert.ok(aviso);
    assert.match(document.body.textContent, /No tienes una mesa asignada/);
    assert.match(aviso.textContent, /suplente/);
  });
});
