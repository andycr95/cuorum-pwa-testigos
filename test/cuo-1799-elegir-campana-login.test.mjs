import { describe, it, beforeEach, afterEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { z } from 'zod';
import { JSDOM } from 'jsdom';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const pwaDir = path.resolve(__dirname, '..');

// Entorno DOM sintético para pruebas de servicio + componente React LoginPage
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

// Hook para transpilar archivos .ts y .tsx de src/ al vuelo
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
    if (url.startsWith('file:') && /\.tsx?$/.test(url)) {
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

/**
 * Carga `testigoLoginSchema` cruzándolo directamente con `backend/src/modules/auth/testigos-auth.ts`
 * cuando el monorepo contiguo está presente, o usando la definición idéntica en checkout aislado.
 */
function cargarTestigoLoginSchema() {
  const schemaBase = z.object({
    cedula: z.string().min(5).max(15),
    pin: z.string().length(6, 'El PIN debe tener 6 dígitos'),
    campanaId: z.string().min(1).max(64).optional(),
  });

  const backendAuthPath = path.resolve(
    pwaDir,
    '../cuorum-platform/backend/src/modules/auth/testigos-auth.ts',
  );
  if (existsSync(backendAuthPath)) {
    const backendSource = readFileSync(backendAuthPath, 'utf8');
    const match = backendSource.match(/const\s+testigoLoginSchema\s*=\s*z\.object\(\{[\s\S]*?\}\);/);
    assert.ok(match, 'Debe encontrarse testigoLoginSchema en backend/src/modules/auth/testigos-auth.ts');
    const fn = new Function('z', `${match[0]}; return testigoLoginSchema;`);
    return fn(z);
  }

  return schemaBase;
}

const testigoLoginSchema = cargarTestigoLoginSchema();

const React = await import('react');
const { act } = React;
const { createRoot } = await import('react-dom/client');
const { api } = await import('../src/services/api.ts');
const { authService, esElegirCampana } = await import('../src/services/authService.ts');
const { LoginPage } = await import('../src/components/auth/LoginPage.tsx');

function crearRespuestaLoginSintetica(cedula, campanaId, campanaNombre) {
  return {
    token: `jwt-sintetico-${campanaId}`,
    tipoTestigo: 'ELECTORAL',
    testigo: {
      id: `testigo-${campanaId}`,
      cedula,
      nombres: 'Lucía',
      apellidos: 'Testigo Sintética',
      telefono: '3000000000',
      email: 'testigo@example.invalid',
    },
    mesa: {
      id: 'mesa-sintetica-01',
      numero: 1,
      totalSufragantes: 300,
      puesto: {
        id: 'puesto-sintetico-01',
        nombre: 'Colegio Sintético Central',
        direccion: 'Calle 10 # 20-30',
      },
    },
    elecciones: [
      {
        id: 'eleccion-sintetica-01',
        nombre: 'Alcaldía Sintética',
        tipoEleccion: 'ALCALDIA',
        tipoCargo: 'UNINOMINAL',
        votoPreferente: false,
        candidatos: [],
      },
    ],
    deviceId: 'device-sintetico-01',
    campana: {
      id: campanaId,
      nombre: campanaNombre,
      candidatoId: null,
      listaId: null,
    },
  };
}

describe('CUO-1799: elegir la campaña cuando el login responde 409 ELEGIR_CAMPANA', () => {
  let llamadasHttp = [];
  let responderLogin;
  let root = null;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    llamadasHttp = [];

    api.defaults.adapter = async (config) => {
      const url = config.url || '';
      const method = (config.method || 'get').toUpperCase();
      let payload = config.data;
      if (typeof payload === 'string') {
        try {
          payload = JSON.parse(payload);
        } catch {}
      }
      llamadasHttp.push({ url, method, payload });

      if (url.includes('/auth/testigos/login')) {
        const respuesta = await responderLogin(payload, config);
        if (respuesta.status >= 400) {
          const err = new Error(`Request failed with status code ${respuesta.status}`);
          err.isAxiosError = true;
          err.config = config;
          err.response = {
            status: respuesta.status,
            data: respuesta.body,
            headers: {},
            config,
          };
          throw err;
        }
        return {
          status: respuesta.status,
          statusText: 'OK',
          headers: {},
          config,
          data: respuesta.body,
        };
      }

      return { status: 200, statusText: 'OK', headers: {}, config, data: { ok: true } };
    };
  });

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root.unmount();
      });
      root = null;
    }
    document.body.innerHTML = '<div id="root"></div>';
  });

  after(() => {
    dom.window.close();
  });

  it('1. Servicio: 409 con codigo ELEGIR_CAMPANA devuelve la lista sin guardar nada en localStorage y el 2.º login envía campanaId válido según testigoLoginSchema', async () => {
    const campanas = [
      { id: 'campana-sintetica-norte', nombre: 'Campaña Sintética Norte' },
      { id: 'campana-sintetica-sur', nombre: 'Campaña Sintética Sur' },
    ];

    responderLogin = async (payload) => {
      const validacion = testigoLoginSchema.safeParse(payload);
      assert.equal(
        validacion.success,
        true,
        `El payload enviado ${JSON.stringify(payload)} debe cumplir testigoLoginSchema`,
      );

      if (!payload.campanaId) {
        return {
          status: 409,
          body: {
            error: 'Tu cédula está registrada en varias campañas. Elige con cuál vas a reportar.',
            codigo: 'ELEGIR_CAMPANA',
            campanas,
          },
        };
      }

      const elegida = campanas.find((c) => c.id === payload.campanaId);
      assert.ok(elegida, 'Debe enviar un campanaId de la lista');
      return {
        status: 200,
        body: crearRespuestaLoginSintetica(payload.cedula, elegida.id, elegida.nombre),
      };
    };

    // Primer llamado sin campanaId -> 409 ELEGIR_CAMPANA
    const primerResultado = await authService.login('1000000099', '333333');
    assert.equal(esElegirCampana(primerResultado), true);
    assert.equal(primerResultado.codigo, 'ELEGIR_CAMPANA');
    assert.deepEqual(primerResultado.campanas, campanas);

    // No debe haber guardado nada en localStorage
    assert.equal(authService.getToken(), null);
    assert.equal(authService.getCampanaId(), null);
    assert.equal(authService.getTestigoData(), null);
    assert.equal(localStorage.length, 0);

    // Verificar payload de la primera llamada contra testigoLoginSchema
    assert.equal(llamadasHttp.length, 1);
    assert.deepEqual(llamadasHttp[0].payload, { cedula: '1000000099', pin: '333333' });
    assert.equal(testigoLoginSchema.safeParse(llamadasHttp[0].payload).success, true);

    // Segundo llamado con campanaId -> 200 con sesión en esa campaña
    const segundoResultado = await authService.login(
      '1000000099',
      '333333',
      'campana-sintetica-sur',
    );
    assert.equal(esElegirCampana(segundoResultado), false);
    assert.equal(segundoResultado.token, 'jwt-sintetico-campana-sintetica-sur');
    assert.equal(authService.getToken(), 'jwt-sintetico-campana-sintetica-sur');
    assert.equal(authService.getCampanaId(), 'campana-sintetica-sur');
    assert.equal(authService.getTestigoData()?.campana?.id, 'campana-sintetica-sur');

    // Verificar payload de la segunda llamada contra testigoLoginSchema
    assert.equal(llamadasHttp.length, 2);
    assert.deepEqual(llamadasHttp[1].payload, {
      cedula: '1000000099',
      pin: '333333',
      campanaId: 'campana-sintetica-sur',
    });
    assert.equal(testigoLoginSchema.safeParse(llamadasHttp[1].payload).success, true);
  });

  it('2. Login normal (una sola campaña) no cambia: guarda sesión al primer intento sin pedir campaña', async () => {
    responderLogin = async (payload) => {
      assert.equal(testigoLoginSchema.safeParse(payload).success, true);
      assert.equal(payload.campanaId, undefined);
      return {
        status: 200,
        body: crearRespuestaLoginSintetica(
          payload.cedula,
          'campana-unica-01',
          'Campaña Única Sintética',
        ),
      };
    };

    const res = await authService.login('1000000011', '123456');
    assert.equal(esElegirCampana(res), false);
    assert.equal(authService.getToken(), 'jwt-sintetico-campana-unica-01');
    assert.equal(authService.getCampanaId(), 'campana-unica-01');
    assert.equal(llamadasHttp.length, 1);
    assert.deepEqual(llamadasHttp[0].payload, { cedula: '1000000011', pin: '123456' });
  });

  it('3. Pantalla LoginPage: con 409 muestra botones con los nombres de las campañas, repite login con campanaId elegido, entra y no guarda el PIN', async () => {
    const campanas = [
      { id: 'campana-alfa-01', nombre: 'Campaña Alfa Territorial' },
      { id: 'campana-beta-02', nombre: 'Campaña Beta Ciudadana' },
    ];

    responderLogin = async (payload) => {
      assert.equal(testigoLoginSchema.safeParse(payload).success, true);
      if (!payload.campanaId) {
        return {
          status: 409,
          body: {
            error: 'Tu cédula está registrada en varias campañas. Elige con cuál vas a reportar.',
            codigo: 'ELEGIR_CAMPANA',
            campanas,
          },
        };
      }
      const elegida = campanas.find((c) => c.id === payload.campanaId);
      return {
        status: 200,
        body: crearRespuestaLoginSintetica(payload.cedula, elegida.id, elegida.nombre),
      };
    };

    let loginExitoso = 0;
    root = createRoot(document.getElementById('root'));
    await act(async () => {
      root.render(React.createElement(LoginPage, { onLoginSuccess: () => { loginExitoso++; } }));
    });

    const inputCedula = document.querySelector('#cedula');
    const inputPin = document.querySelector('#pin');
    const form = document.querySelector('form');
    assert.ok(inputCedula && inputPin && form);

    const nativeValueSetter = Object.getOwnPropertyDescriptor(
      dom.window.HTMLInputElement.prototype,
      'value',
    ).set;

    await act(async () => {
      nativeValueSetter.call(inputCedula, '1000000077');
      inputCedula.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
      nativeValueSetter.call(inputPin, '654321');
      inputPin.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    });

    await act(async () => {
      form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
      await new Promise((r) => setTimeout(r, 0));
    });

    // Todavía no entró ni guardó token
    assert.equal(loginExitoso, 0);
    assert.equal(authService.getToken(), null);

    // Deben mostrarse los botones con el nombre de cada campaña
    const btnAlfa = document.querySelector('[data-testid="elegir-campana-campana-alfa-01"]');
    const btnBeta = document.querySelector('[data-testid="elegir-campana-campana-beta-02"]');
    assert.ok(btnAlfa, 'Debe existir el botón para Campaña Alfa Territorial');
    assert.ok(btnBeta, 'Debe existir el botón para Campaña Beta Ciudadana');
    assert.match(btnAlfa.textContent, /Campaña Alfa Territorial/);
    assert.match(btnBeta.textContent, /Campaña Beta Ciudadana/);

    // Elegir la segunda campaña
    await act(async () => {
      btnBeta.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
      await new Promise((r) => setTimeout(r, 0));
    });

    // Ahora sí completó login en la campaña elegida
    assert.equal(loginExitoso, 1);
    assert.equal(authService.getCampanaId(), 'campana-beta-02');
    assert.equal(authService.getToken(), 'jwt-sintetico-campana-beta-02');
    assert.deepEqual(llamadasHttp[1].payload, {
      cedula: '1000000077',
      pin: '654321',
      campanaId: 'campana-beta-02',
    });

    // Verificar que el PIN nunca quedó guardado en localStorage ni sessionStorage
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      assert.doesNotMatch(localStorage.getItem(k) || '', /654321/, `El PIN no debe guardarse en localStorage (${k})`);
    }
    assert.equal(sessionStorage.length, 0);
  });

  it('4. Pantalla LoginPage: un 401 tras elegir campaña vuelve a pedir el PIN y limpia el PIN anterior', async () => {
    const campanas = [
      { id: 'campana-alfa-01', nombre: 'Campaña Alfa Territorial' },
      { id: 'campana-beta-02', nombre: 'Campaña Beta Ciudadana' },
    ];

    responderLogin = async (payload) => {
      assert.equal(testigoLoginSchema.safeParse(payload).success, true);
      if (!payload.campanaId) {
        return {
          status: 409,
          body: {
            error: 'Tu cédula está registrada en varias campañas. Elige con cuál vas a reportar.',
            codigo: 'ELEGIR_CAMPANA',
            campanas,
          },
        };
      }
      return {
        status: 401,
        body: { error: 'Credenciales inválidas' },
      };
    };

    let loginExitoso = 0;
    root = createRoot(document.getElementById('root'));
    await act(async () => {
      root.render(React.createElement(LoginPage, { onLoginSuccess: () => { loginExitoso++; } }));
    });

    const inputCedula = document.querySelector('#cedula');
    const inputPin = document.querySelector('#pin');
    const form = document.querySelector('form');
    const nativeValueSetter = Object.getOwnPropertyDescriptor(
      dom.window.HTMLInputElement.prototype,
      'value',
    ).set;

    await act(async () => {
      nativeValueSetter.call(inputCedula, '1000000077');
      inputCedula.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
      nativeValueSetter.call(inputPin, '654321');
      inputPin.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    });

    await act(async () => {
      form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
      await new Promise((r) => setTimeout(r, 0));
    });

    const btnAlfa = document.querySelector('[data-testid="elegir-campana-campana-alfa-01"]');
    assert.ok(btnAlfa, 'Debe mostrar selector de campañas tras 409');

    // Al elegir campaña, el servidor responde 401
    await act(async () => {
      btnAlfa.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
      await new Promise((r) => setTimeout(r, 0));
    });

    assert.equal(loginExitoso, 0);
    assert.equal(authService.getToken(), null);

    // Debe haber salido de la lista de campañas y vuelto a mostrar el campo #pin vacío
    assert.equal(document.querySelector('[data-testid="selector-campana-login"]'), null);
    const inputPinDeNuevo = document.querySelector('#pin');
    assert.ok(inputPinDeNuevo, 'Debe volver a mostrar el input de PIN tras un 401');
    assert.equal(inputPinDeNuevo.value, '', 'El campo de PIN debe haberse limpiado para volver a pedirlo');

    // Debe mostrar el mensaje de error 401 mapeado al español
    const alerta = document.querySelector('[role="alert"]');
    assert.ok(alerta);
    assert.match(alerta.textContent, /Cédula o PIN incorrectos/);
  });
});
