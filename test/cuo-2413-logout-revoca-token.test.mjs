import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import ts from 'typescript';
import { JSDOM } from 'jsdom';

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
  'HTMLInputElement',
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
dom.window.matchMedia = () => ({
  matches: false,
  addEventListener: () => {},
  removeEventListener: () => {},
});

let cacheClearedCount = 0;
const colaOffline = {
  resultados: [],
  fotos: [],
  incidencias: [],
};

const mockIndexedDbSource = `
  export const clearEscrutinioCache = async () => {
    globalThis.__cuo2413OnClearCache?.();
  };
  export const getPendientes = async () => ({
    resultados: globalThis.__cuo2413Cola?.resultados || [],
    fotos: globalThis.__cuo2413Cola?.fotos || [],
  });
  export const getFotosPendientes = async () => globalThis.__cuo2413Cola?.fotos || [];
  export const getIncidenciasPendientes = async () => globalThis.__cuo2413Cola?.incidencias || [];
  export const getJornadasPendientes = async () => [];
  export const marcarSincronizados = async () => {};
  export const marcarRechazados = async () => {};
  export const marcarIncidenciasSincronizadas = async () => {};
  export const marcarIncidenciasError = async () => {};
  export const saveJornada = async () => {};
  export const guardarJornada = async () => {};
  export const logSync = async () => {};
`;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (
      specifier === '../db/indexeddb' ||
      specifier === './indexeddb' ||
      specifier.endsWith('/indexeddb.ts')
    ) {
      return {
        url: 'data:text/javascript,' + encodeURIComponent(mockIndexedDbSource),
        shortCircuit: true,
      };
    }
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

globalThis.__cuo2413OnClearCache = () => {
  cacheClearedCount += 1;
};
globalThis.__cuo2413Cola = colaOffline;

const React = await import('react');
const { act } = React;
const { createRoot } = await import('react-dom/client');
const { api, AUTH_NOTICE_KEY, extraerMensajeSesion401 } = await import('../src/services/api.ts');
const { authService, mapearErrorAuth } = await import('../src/services/authService.ts');
const { setLastSyncTime, setLastSyncError, getLastSyncTime, getLastSyncError } = await import(
  '../src/services/syncService.ts'
);
const { LoginPage } = await import('../src/components/auth/LoginPage.tsx');

function sembrarSesionActiva(valorSesion = 't-1') {
  localStorage.setItem('cuorum_testigo_token', valorSesion);
  localStorage.setItem(
    'cuorum_testigo_data',
    JSON.stringify({
      testigo: {
        id: 'testigo-sintetico-01',
        cedula: 'TEST-2413',
        nombres: 'Testigo',
        apellidos: 'Sintético',
        telefono: '3000000000',
        email: null,
      },
      tipoTestigo: 'ELECTORAL',
      mesa: { id: 'mesa-sintetica-01', numero: 1, totalSufragantes: 300, puesto: null },
      elecciones: [],
      deviceId: 'device-sintetico-01',
      campana: { id: 'campana-sintetica-01', nombre: 'Campaña Sintética', candidatoId: null, listaId: null },
    }),
  );
  localStorage.setItem('cuorum_testigo_campana', 'campana-sintetica-01');
  localStorage.setItem('cuorum_testigo_eleccion', 'eleccion-sintetica-01');
  localStorage.setItem('cuorum_testigo_eleccion_data', '[]');
  setLastSyncTime('16:00');
  setLastSyncError('Error previo');
}

describe('CUO-2413: logout revoca el token en el servidor antes de borrarlo y manejo de 401 Sesión de testigo vencida', () => {
  let llamadasHttp = [];

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    llamadasHttp = [];
    cacheClearedCount = 0;
    colaOffline.resultados = [{ id: 'res-pendiente-1', synced: 0 }];
    colaOffline.fotos = [{ id: 'foto-pendiente-1', synced: 0 }];
    colaOffline.incidencias = [{ id: 'inc-pendiente-1', synced: 0 }];
  });

  it('1. logout() hace POST /auth/logout con Authorization del token vigente ANTES de borrar el almacenamiento local', async () => {
    sembrarSesionActiva('t-1');

    api.defaults.adapter = async (config) => {
      const authHeader = config.headers?.Authorization ?? config.headers?.get?.('Authorization');
      const tokenEnStorageDurantePeticion = localStorage.getItem('cuorum_testigo_token');
      const dataEnStorageDurantePeticion = localStorage.getItem('cuorum_testigo_data');
      llamadasHttp.push({
        method: (config.method || 'get').toUpperCase(),
        url: config.url,
        authorization: authHeader,
        tokenEnStorageDurantePeticion,
        dataEnStorageDurantePeticion,
      });
      return { status: 204, statusText: 'No Content', headers: {}, config, data: '' };
    };

    await authService.logout();

    assert.equal(llamadasHttp.length, 1, 'Debe enviar exactamente una petición a /auth/logout');
    assert.equal(llamadasHttp[0].method, 'POST');
    assert.equal(llamadasHttp[0].url, '/auth/logout');
    assert.equal(
      llamadasHttp[0].authorization,
      'Bearer t-1',
      'Debe enviar el encabezado Authorization con el token vigente',
    );
    assert.equal(
      llamadasHttp[0].tokenEnStorageDurantePeticion,
      't-1',
      'El token debe seguir en localStorage mientras se envía POST /auth/logout (antes de borrarlo)',
    );
    assert.ok(
      llamadasHttp[0].dataEnStorageDurantePeticion,
      'Los datos de sesión deben seguir en localStorage en el momento de enviar POST /auth/logout',
    );

    // Luego de completar la petición, todo el almacenamiento de sesión queda limpio
    assert.equal(localStorage.getItem('cuorum_testigo_token'), null);
    assert.equal(localStorage.getItem('cuorum_testigo_data'), null);
    assert.equal(localStorage.getItem('cuorum_testigo_campana'), null);
    assert.equal(localStorage.getItem('cuorum_testigo_eleccion'), null);
    assert.equal(localStorage.getItem('cuorum_testigo_eleccion_data'), null);
    assert.equal(getLastSyncTime(), null);
    assert.equal(getLastSyncError(), null);

    // La cola offline sin sincronizar se conserva intacta
    assert.equal(colaOffline.resultados[0].synced, 0);
    assert.equal(colaOffline.fotos[0].synced, 0);
    assert.equal(colaOffline.incidencias[0].synced, 0);
  });

  it('2. logout() borra el almacenamiento local sin lanzar error cuando POST /auth/logout falla por red o 401', async () => {
    // Caso A: fallo de red (offline)
    sembrarSesionActiva('t-2');
    api.defaults.adapter = async (config) => {
      llamadasHttp.push({
        url: config.url,
        authorization: config.headers?.Authorization ?? config.headers?.get?.('Authorization'),
        tokenAntesDeFallo: localStorage.getItem('cuorum_testigo_token'),
      });
      const netErr = new Error('Network Error');
      netErr.code = 'ERR_NETWORK';
      netErr.config = config;
      throw netErr;
    };

    await assert.doesNotReject(
      async () => {
        await authService.logout();
      },
      'Nunca se debe bloquear al testigo si falla por falta de red',
    );

    assert.equal(llamadasHttp.length, 1);
    assert.equal(llamadasHttp[0].url, '/auth/logout');
    assert.equal(llamadasHttp[0].authorization, 'Bearer t-2');
    assert.equal(llamadasHttp[0].tokenAntesDeFallo, 't-2');
    assert.equal(localStorage.getItem('cuorum_testigo_token'), null);
    assert.equal(localStorage.getItem('cuorum_testigo_data'), null);
    assert.equal(localStorage.getItem('cuorum_testigo_campana'), null);

    // Caso B: fallo con HTTP 401 en /auth/logout (token ya revocado/vencido)
    sembrarSesionActiva('t-3');
    let unauthorizedDisparadoEnLogout = false;
    const onUnauth = () => {
      unauthorizedDisparadoEnLogout = true;
    };
    window.addEventListener('cuorum:unauthorized', onUnauth);

    try {
      api.defaults.adapter = async (config) => {
        llamadasHttp.push({
          url: config.url,
          authorization: config.headers?.Authorization ?? config.headers?.get?.('Authorization'),
        });
        const err401 = new Error('Request failed with status code 401');
        err401.config = config;
        err401.response = {
          status: 401,
          data: { error: 'Sesión revocada. Inicia sesión de nuevo.' },
          headers: {},
          config,
        };
        throw err401;
      };

      await assert.doesNotReject(
        async () => {
          await authService.logout();
        },
        'Nunca se debe bloquear al testigo si POST /auth/logout responde 401',
      );

      assert.equal(llamadasHttp.length, 2);
      assert.equal(llamadasHttp[1].authorization, 'Bearer t-3');
      assert.equal(localStorage.getItem('cuorum_testigo_token'), null);
      assert.equal(localStorage.getItem('cuorum_testigo_data'), null);
      assert.equal(localStorage.getItem('cuorum_testigo_campana'), null);
      assert.equal(
        unauthorizedDisparadoEnLogout,
        false,
        'Un 401 en /auth/logout no debe disparar cuorum:unauthorized ni aviso de sesión vencida',
      );
      assert.equal(authService.getAuthNotice(), null);
    } finally {
      window.removeEventListener('cuorum:unauthorized', onUnauth);
    }
  });

  it('3. Ante un 401 «Sesión de testigo vencida» en cualquier llamada (CUO-2410), limpia la sesión y LoginPage muestra el mensaje claro', async () => {
    sembrarSesionActiva('t-4');

    let eventoRecibido = null;
    const listener = (ev) => {
      eventoRecibido = ev.detail;
    };
    window.addEventListener('cuorum:unauthorized', listener);

    const container = document.getElementById('root');
    const root = createRoot(container);

    try {
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
        await api.post('/testigos/resultado', { mesaId: 'mesa-sintetica-01' });
      });

      // El interceptor de api.ts limpia la sesión local
      assert.equal(localStorage.getItem('cuorum_testigo_token'), null);
      assert.equal(localStorage.getItem('cuorum_testigo_data'), null);
      assert.equal(localStorage.getItem('cuorum_testigo_campana'), null);
      assert.equal(localStorage.getItem('cuorum_testigo_eleccion'), null);
      assert.equal(localStorage.getItem('cuorum_testigo_eleccion_data'), null);

      // Deja el mensaje claro para que LoginPage lo muestre al testigo
      assert.equal(
        authService.getAuthNotice(),
        'Sesión de testigo vencida. Inicia sesión de nuevo.',
      );
      assert.equal(
        localStorage.getItem(AUTH_NOTICE_KEY),
        'Sesión de testigo vencida. Inicia sesión de nuevo.',
      );
      assert.deepEqual(eventoRecibido, {
        mensaje: 'Sesión de testigo vencida. Inicia sesión de nuevo.',
      });

      // Renderizar LoginPage y verificar que muestra el mensaje claro en role="alert"
      await act(async () => {
        root.render(React.createElement(LoginPage, { onLoginSuccess: () => {} }));
      });

      const alertEl = container.querySelector('[role="alert"]');
      assert.ok(alertEl, 'LoginPage debe renderizar una alerta visible con el motivo del 401');
      assert.match(
        alertEl.textContent || '',
        /Sesión de testigo vencida\. Inicia sesión de nuevo\./,
      );

      // También normaliza mensajes cortos o de revocación por cambio de PIN
      assert.equal(
        extraerMensajeSesion401({ response: { data: { error: 'Sesión de testigo vencida' } } }),
        'Sesión de testigo vencida. Inicia sesión de nuevo.',
      );
      assert.equal(
        extraerMensajeSesion401({
          response: { data: { error: 'Sesión revocada. Inicia sesión de nuevo.' } },
        }),
        'Sesión revocada. Inicia sesión de nuevo.',
      );
      assert.equal(
        mapearErrorAuth({
          isAxiosError: true,
          response: {
            status: 401,
            data: { error: 'Sesión de testigo vencida. Inicia sesión de nuevo.' },
          },
        }),
        'Sesión de testigo vencida. Inicia sesión de nuevo.',
      );
    } finally {
      await act(async () => {
        root.unmount();
      });
      window.removeEventListener('cuorum:unauthorized', listener);
    }
  });
});
