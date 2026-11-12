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
dom.window.HTMLCanvasElement.prototype.getContext = () => ({
  scale() {},
  clearRect() {},
  beginPath() {},
  moveTo() {},
  lineTo() {},
  stroke() {},
  drawImage() {},
  getImageData: () => ({ data: new Uint8ClampedArray(4) }),
  putImageData() {},
});
dom.window.HTMLCanvasElement.prototype.toBlob = function (cb, type = 'image/jpeg') {
  cb(new Blob(['compressed-image'], { type }));
};
globalThis.createImageBitmap = async () => ({ width: 200, height: 200, close() {} });
if (!globalThis.URL.createObjectURL) {
  globalThis.URL.createObjectURL = () => 'blob:practica-preview';
}
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
const { FormularioMesaMultiple } = await import('../src/components/formulario/FormularioMesaMultiple.tsx');
const { api } = await import('../src/services/api.ts');
const db = await import('../src/db/indexeddb.ts');
const {
  MESA_PRACTICA,
  ELECCIONES_PRACTICA,
  evaluarAritmeticaPractica,
} = await import('../src/services/modoPractica.ts');

let root;
let fetchCalls = [];
let apiCalls = [];
let idbWrites = [];
const origFetch = globalThis.fetch;
const origApiGet = api.get;
const origApiPost = api.post;
const origApiPatch = api.patch;
const origIdbPut = IDBObjectStore.prototype.put;
const origIdbAdd = IDBObjectStore.prototype.add;

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

const fillInput = async (el, val) => {
  assert.ok(el, 'Input a rellenar debe existir');
  await act(async () => {
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, String(val));
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await flush();
};

function luminancia([r, g, b]) {
  const c = [r, g, b].map((v) => {
    const x = v / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

function ratioContrasteHex(hex1, hex2) {
  const parse = (h) => {
    const clean = h.replace('#', '');
    return [
      parseInt(clean.slice(0, 2), 16),
      parseInt(clean.slice(2, 4), 16),
      parseInt(clean.slice(4, 6), 16),
    ];
  };
  const [l1, l2] = [luminancia(parse(hex1)), luminancia(parse(hex2))].sort((a, b) => b - a);
  return (l1 + 0.05) / (l2 + 0.05);
}

describe('CUO-2374 · Modo práctica con E-14 ficticio que no se guarda ni se envía', () => {
  beforeEach(async () => {
    const idb = await db.getDB();
    for (const store of idb.objectStoreNames) {
      await idb.clear(store);
    }
    localStorage.clear();
    sessionStorage.clear();
    document.documentElement.classList.remove('dark');
    simulatedOnline = true;

    fetchCalls = [];
    apiCalls = [];
    idbWrites = [];

    globalThis.fetch = async (...args) => {
      fetchCalls.push(args);
      if (!simulatedOnline) throw new TypeError('Failed to fetch');
      return { ok: true, status: 200, json: async () => ({}), text: async () => '' };
    };
    api.get = async (...args) => {
      apiCalls.push({ method: 'GET', args });
      throw new Error('Red no permitida en modo práctica');
    };
    api.post = async (...args) => {
      apiCalls.push({ method: 'POST', args });
      throw new Error('Red no permitida en modo práctica');
    };
    api.patch = async (...args) => {
      apiCalls.push({ method: 'PATCH', args });
      throw new Error('Red no permitida en modo práctica');
    };
    IDBObjectStore.prototype.put = function (...args) {
      idbWrites.push({ op: 'put', store: this.name, args });
      return origIdbPut.apply(this, args);
    };
    IDBObjectStore.prototype.add = function (...args) {
      idbWrites.push({ op: 'add', store: this.name, args });
      return origIdbAdd.apply(this, args);
    };

    document.body.innerHTML = '<div id="root"></div>';
    root = createRoot(document.getElementById('root'));
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    globalThis.fetch = origFetch;
    api.get = origApiGet;
    api.post = origApiPost;
    api.patch = origApiPatch;
    IDBObjectStore.prototype.put = origIdbPut;
    IDBObjectStore.prototype.add = origIdbAdd;
  });

  after(() => {
    db.closeDB();
    dom.window.close();
  });

  it('1. Botón «Practicar» en inicio abre el formulario con puesto «Puesto de práctica», candidatos «Candidato de prueba 1…» y franja «PRÁCTICA — no se envía»', async () => {
    await act(async () => {
      root.render(React.createElement(App));
    });
    await flush();

    const btnPracticar = document.querySelector('[data-testid="btn-practicar"]');
    assert.ok(btnPracticar, 'Debe existir el botón Practicar en la pantalla de inicio');
    await click(btnPracticar);

    const franja = document.querySelector('[data-testid="franja-modo-practica"]');
    assert.ok(franja, 'Debe mostrarse la franja de modo práctica');
    assert.match(franja.textContent, /PRÁCTICA — no se envía/);

    const puesto = document.querySelector('[data-testid="puesto-mesa-nombre"]');
    assert.ok(puesto, 'Debe mostrarse el nombre del puesto ficticio');
    assert.equal(puesto.textContent, 'Puesto de práctica');

    await click(document.getElementById('tab-contar'));
    assert.match(document.body.textContent, /Candidato de prueba 1/);
    assert.match(document.body.textContent, /Candidato de prueba 2/);
    assert.match(document.body.textContent, /Candidato de prueba 3/);

    assert.equal(fetchCalls.length, 0, 'No debe hacer llamadas fetch al abrir práctica');
    assert.equal(apiCalls.length, 0, 'No debe hacer llamadas a la API al abrir práctica');
    assert.equal(idbWrites.length, 0, 'No debe escribir en IndexedDB al abrir práctica');
  });

  it('2. Completar fotos, votos, novedades y «enviar»/cerrar no hace ninguna llamada de red ni escribe en IndexedDB (espías en fetch, api e IDB store)', async () => {
    await act(async () => {
      root.render(React.createElement(App));
    });
    await flush();
    await click(document.querySelector('[data-testid="btn-practicar"]'));

    // Paso 1: Subir foto en memoria y confirmar evidencia
    const fileInput = document.querySelector('input[type="file"][accept="image/*"]');
    assert.ok(fileInput, 'Debe existir el input de archivo de cámara/galería');
    const fakeFile = new dom.window.File(['contenido-imagen-ficticia'], 'e14-practica.jpg', {
      type: 'image/jpeg',
    });
    await act(async () => {
      Object.defineProperty(fileInput, 'files', {
        value: [fakeFile],
        configurable: true,
      });
      fileInput.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await flush();

    const btnConfirmarFoto = [...document.querySelectorAll('button')].find((b) =>
      /Confirmar .* como evidencia/.test(b.textContent),
    );
    assert.ok(btnConfirmarFoto, 'Debe mostrar el botón para confirmar la foto en memoria');
    await click(btnConfirmarFoto);

    // Verificar insignia de 1 foto en pestaña 1
    assert.match(document.getElementById('tab-foto').textContent, /1\.\s*Foto E-14\s*1/);

    // Paso 2: Llenar votos que cuadran (40 + 35 + 20 + 5 = 100) y guardar
    await click(document.getElementById('tab-contar'));
    await fillInput(document.querySelector('[aria-label="Votos para Candidato de prueba 1"]'), 40);
    await fillInput(document.querySelector('[aria-label="Votos para Candidato de prueba 2"]'), 35);
    await fillInput(document.querySelector('[aria-label="Votos para Candidato de prueba 3"]'), 20);
    await fillInput(document.querySelector('[aria-label="Votos para Votos en blanco"]'), 5);

    assert.equal(document.querySelector('[data-testid="total-votos-barra"]').textContent, '100');
    assert.equal(document.querySelector('[data-testid="estado-conteo-barra"]').textContent, '✓ Mesa completa');

    await click(document.querySelector('[data-testid="btn-guardar-resultados"]'));

    const resAritmetica = document.querySelector('[data-testid="resultado-aritmetica-practica"]');
    assert.ok(resAritmetica, 'Debe mostrar el resultado de la validación aritmética al guardar');
    assert.match(resAritmetica.textContent, /La suma cuadra/);

    // Paso 3: Registrar novedad con foto en PanelIncidencias y cerrar acta por WizardCierre en memoria
    await click(document.getElementById('tab-cierre'));

    // 3a. Abrir PanelIncidencias, adjuntar foto y registrar novedad en memoria
    const btnToggleIncidencias = [...document.querySelectorAll('button')].find((b) =>
      b.textContent.includes('Novedades / Incidencias'),
    );
    assert.ok(btnToggleIncidencias, 'Debe existir el encabezado de Novedades / Incidencias');
    await click(btnToggleIncidencias);

    const btnNuevaNovedad = [...document.querySelectorAll('button')].find((b) =>
      b.textContent.includes('Nueva novedad'),
    );
    assert.ok(btnNuevaNovedad, 'Debe existir la pestaña Nueva novedad');
    await click(btnNuevaNovedad);

    const btnTipoMateriales = [...document.querySelectorAll('button')].find((b) =>
      b.textContent.includes('Materiales faltantes'),
    );
    assert.ok(btnTipoMateriales, 'Debe existir el botón de tipo Materiales faltantes');
    await click(btnTipoMateriales);

    const textareaIncidencia = document.querySelector(
      'textarea[placeholder*="Describe la materiales faltantes"]',
    );
    assert.ok(textareaIncidencia, 'Debe existir el campo de descripción de la novedad');
    await fillInput(textareaIncidencia, 'Simulacro de novedad en mesa de práctica sin persistencia');

    const inputFotoIncidencia = document.querySelector('#panel-cierre input[type="file"][accept="image/*"]');
    assert.ok(inputFotoIncidencia, 'Debe existir el input de foto de evidencia en el panel de incidencias');
    const fakeIncFoto = new dom.window.File(['foto-incidencia-practica'], 'incidencia.jpg', {
      type: 'image/jpeg',
    });
    await act(async () => {
      Object.defineProperty(inputFotoIncidencia, 'files', {
        value: [fakeIncFoto],
        configurable: true,
      });
      inputFotoIncidencia.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await flush();

    const btnRegistrarNovedad = [...document.querySelectorAll('button')].find((b) =>
      b.textContent.includes('Registrar novedad'),
    );
    assert.ok(btnRegistrarNovedad, 'Debe existir el botón Registrar novedad');
    assert.equal(btnRegistrarNovedad.disabled, false);
    await click(btnRegistrarNovedad);

    assert.equal(idbWrites.length, 0, 'Registrar novedad en práctica no debe escribir en IndexedDB');
    assert.equal(apiCalls.length, 0, 'Registrar novedad en práctica no debe llamar a la API');
    assert.equal(fetchCalls.length, 0, 'Registrar novedad en práctica no debe llamar a fetch');
    assert.match(document.body.textContent, /1 reportada/, 'La novedad debe quedar en la lista en memoria');
    assert.match(document.body.textContent, /Con foto de evidencia/, 'Debe indicar foto de evidencia en memoria');

    // 3b. Abrir WizardCierre («Cerrar Acta de Mesa») y completar los 4 pasos en memoria
    const btnAbrirWizard = [...document.querySelectorAll('button')].find((b) =>
      b.textContent.includes('Cerrar Acta de Mesa'),
    );
    assert.ok(btnAbrirWizard, 'Debe existir el botón Cerrar Acta de Mesa para abrir WizardCierre');
    assert.equal(btnAbrirWizard.disabled, false);
    await click(btnAbrirWizard);

    assert.equal(apiCalls.length, 0, 'Abrir WizardCierre en práctica no debe llamar a la API');
    assert.match(document.body.textContent, /Resumen de elecciones/);
    const btnWizardPaso1 = [...document.querySelectorAll('button')].find(
      (b) => b.textContent.trim() === 'Continuar',
    );
    assert.ok(btnWizardPaso1, 'Debe poder continuar del paso 1 al paso 2 del WizardCierre');
    await click(btnWizardPaso1);

    assert.match(document.body.textContent, /Observaciones finales/);
    const textareaWizardObs = document.querySelector('textarea[placeholder*="observaciones"]');
    await fillInput(textareaWizardObs, 'Observación de cierre en modo práctica');
    const btnWizardPaso2 = [...document.querySelectorAll('button')].find(
      (b) => b.textContent.trim() === 'Continuar',
    );
    await click(btnWizardPaso2);

    assert.match(document.body.textContent, /Firma digital/);
    const btnConfirmarCierre = [...document.querySelectorAll('button')].find((b) =>
      b.textContent.includes('Confirmar cierre'),
    );
    assert.ok(btnConfirmarCierre, 'Debe existir el botón Confirmar cierre en el paso 3 del WizardCierre');
    await click(btnConfirmarCierre);

    assert.equal(apiCalls.length, 0, 'Confirmar cierre en WizardCierre en práctica no debe llamar a la API');
    assert.equal(idbWrites.length, 0, 'Confirmar cierre en WizardCierre en práctica no debe escribir en IndexedDB');
    assert.match(document.body.textContent, /Acta firmada exitosamente/);
    assert.match(document.body.textContent, /PRAC-0001/);

    const btnFinalizarWizard = [...document.querySelectorAll('button')].find(
      (b) => b.textContent.trim() === 'Finalizar',
    );
    assert.ok(btnFinalizarWizard, 'Debe existir el botón Finalizar en el paso 4 del WizardCierre');
    await click(btnFinalizarWizard);

    assert.match(document.body.textContent, /Acta cerrada y firmada/);
    assert.match(document.body.textContent, /PRAC-0001/);

    // Verificar espías de red e IndexedDB: CERO llamadas
    assert.equal(fetchCalls.length, 0, 'Cero llamadas a fetch durante todo el modo práctica');
    assert.equal(apiCalls.length, 0, 'Cero llamadas a api (GET/POST/PATCH) durante todo el modo práctica');
    assert.equal(idbWrites.length, 0, 'Cero escrituras (put/add) en IndexedDB durante todo el modo práctica');

    // Verificar que las colas de sincronización en IndexedDB están vacías
    const [resPend, fotosPend, ocrPend, incPend, jorPend] = await Promise.all([
      db.getResultadosPendientes(),
      db.getFotosPendientes(),
      db.getOcrJobsPendientes(),
      db.getIncidenciasPendientes(),
      db.getJornadasPendientes(),
    ]);
    assert.equal(resPend.length, 0);
    assert.equal(fotosPend.length, 0);
    assert.equal(ocrPend.length, 0);
    assert.equal(incPend.length, 0);
    assert.equal(jorPend.length, 0);

    // Al salir de la práctica y volver a entrar, la foto y los votos en memoria se descartaron
    await click(document.querySelector('[data-testid="btn-salir-practica"]'));
    await click(document.querySelector('[data-testid="btn-practicar"]'));
    assert.equal(document.getElementById('tab-foto').textContent.trim(), '1. Foto E-14');
    assert.equal(document.querySelector('[data-testid="total-votos-barra"]').textContent, '0');
  });

  it('3. La franja «PRÁCTICA — no se envía» es visible en todo el flujo y en modo oscuro con contraste WCAG AA', async () => {
    document.documentElement.classList.add('dark');
    await act(async () => {
      root.render(
        React.createElement(FormularioMesaMultiple, {
          mesaId: MESA_PRACTICA.id,
          testigoId: 'testigo-practica',
          mesaNumero: MESA_PRACTICA.numero,
          totalSufragantes: MESA_PRACTICA.totalSufragantes,
          puestoNombre: MESA_PRACTICA.puesto.nombre,
          elecciones: ELECCIONES_PRACTICA,
          deviceId: 'device-practica',
          modoPractica: true,
        }),
      );
    });
    await flush();

    for (const tabId of ['tab-foto', 'tab-contar', 'tab-cierre']) {
      await click(document.getElementById(tabId));
      const franja = document.querySelector('[data-testid="franja-modo-practica"]');
      assert.ok(franja, `La franja PRÁCTICA debe ser visible en ${tabId}`);
      assert.match(franja.textContent, /PRÁCTICA — no se envía/);
      assert.match(franja.className, /dark:bg-\[#451A03\]/);
      assert.match(franja.className, /dark:text-\[#FCD34D\]/);
    }

    // Verificar contraste >= 4.5:1 en claro y oscuro
    assert.ok(ratioContrasteHex('#B45309', '#FFFBEB') >= 4.5, 'Contraste AA en modo claro');
    assert.ok(ratioContrasteHex('#FCD34D', '#451A03') >= 4.5, 'Contraste AA en modo oscuro');
  });

  it('4. Una suma que no cuadra muestra el mismo aviso que en la jornada real', async () => {
    await act(async () => {
      root.render(
        React.createElement(FormularioMesaMultiple, {
          mesaId: MESA_PRACTICA.id,
          testigoId: 'testigo-practica',
          mesaNumero: MESA_PRACTICA.numero,
          totalSufragantes: 100,
          elecciones: ELECCIONES_PRACTICA,
          deviceId: 'device-practica',
          modoPractica: true,
        }),
      );
    });
    await flush();
    await click(document.getElementById('tab-contar'));

    // Caso A: Suma supera sufragantes (110 > 100)
    await fillInput(document.querySelector('[aria-label="Votos para Candidato de prueba 1"]'), 60);
    await fillInput(document.querySelector('[aria-label="Votos para Candidato de prueba 2"]'), 50);

    assert.equal(document.querySelector('[data-testid="total-votos-barra"]').textContent, '110');
    assert.equal(document.querySelector('[data-testid="estado-conteo-barra"]').textContent, 'Excede sufragantes');
    assert.match(document.body.textContent, /ALERTA DE FRAUDE/);
    assert.match(document.body.textContent, /Total de votos \(110\) SUPERA sufragantes habilitados \(100\)/);

    await click(document.querySelector('[data-testid="btn-guardar-resultados"]'));
    const avisoExceso = document.querySelector('[data-testid="resultado-aritmetica-practica"]');
    assert.ok(avisoExceso);
    assert.match(avisoExceso.textContent, /La suma no cuadra/);
    assert.match(avisoExceso.textContent, /Total de votos \(110\) SUPERA sufragantes habilitados \(100\)/);

    // Caso B: Corregir en la misma práctica a una suma menor (80 < 100)
    await fillInput(document.querySelector('[aria-label="Votos para Candidato de prueba 2"]'), 20);
    await click(document.querySelector('[data-testid="btn-guardar-resultados"]'));
    const avisoMenor = document.querySelector('[data-testid="resultado-aritmetica-practica"]');
    assert.match(avisoMenor.textContent, /La suma no cuadra/);
    assert.match(
      avisoMenor.textContent,
      /La suma de votos \(80\) no coincide con los sufragantes \(100\)/,
    );

    // Caso C: Ajustar para que cuadre exactamente (100 = 100)
    await fillInput(document.querySelector('[aria-label="Votos para Votos en blanco"]'), 20);
    await click(document.querySelector('[data-testid="btn-guardar-resultados"]'));
    const avisoCuadra = document.querySelector('[data-testid="resultado-aritmetica-practica"]');
    assert.match(avisoCuadra.textContent, /✓ La suma cuadra/);

    assert.equal(evaluarAritmeticaPractica(100, 100).cuadra, true);
    assert.equal(evaluarAritmeticaPractica(105, 100).excede, true);
  });

  it('5. Sin internet (offline), el modo práctica funciona igual de principio a fin', async () => {
    simulatedOnline = false;

    await act(async () => {
      root.render(React.createElement(App));
    });
    await flush();

    await click(document.querySelector('[data-testid="btn-practicar"]'));
    await click(document.getElementById('tab-contar'));

    await fillInput(document.querySelector('[aria-label="Votos para Candidato de prueba 1"]'), 100);
    await click(document.querySelector('[data-testid="btn-guardar-barra"]'));

    const resOffline = document.querySelector('[data-testid="resultado-aritmetica-practica"]');
    assert.ok(resOffline, 'Debe validar y mostrar que la suma cuadra aun sin internet');
    assert.match(resOffline.textContent, /✓ La suma cuadra/);

    await click(document.getElementById('tab-cierre'));
    const textareaJustificacion = document.querySelector('textarea[placeholder*="mínimo 10 caracteres"]');
    await fillInput(textareaJustificacion, 'Práctica sin cámara en modo avión');

    const btnCerrar = [...document.querySelectorAll('button')].find((b) =>
      b.textContent.includes('Cerrar y firmar acta'),
    );
    await click(btnCerrar);

    assert.match(document.body.textContent, /Acta cerrada y firmada/);
    assert.equal(fetchCalls.length, 0);
    assert.equal(apiCalls.length, 0);
    assert.equal(idbWrites.length, 0);
  });

  it('6. Con sesión iniciada (SelectorMesa y CheckinTestigo), entrar a práctica no contamina la mesa real y al salir vuelve a la vista previa sin cambios', async () => {
    const expFuture = Math.floor(Date.now() / 1000) + 3600;
    const payloadB64 = Buffer.from(JSON.stringify({ sub: 'testigo-real-1', exp: expFuture })).toString(
      'base64url',
    );
    const fakeJwt = `eyJhbGciOiJIUzI1NiJ9.${payloadB64}.firma`;

    const realTestigoData = {
      token: fakeJwt,
      deviceId: 'device-real-1',
      tipoTestigo: 'ELECTORAL',
      campanaId: 'campana-real-1',
      testigo: {
        id: 'testigo-real-1',
        cedula: 'TEST-TES-001',
        nombres: 'Valeria',
        apellidos: 'Sintética',
      },
      mesa: {
        id: 'mesa-real-10',
        numero: 10,
        totalSufragantes: 240,
        puesto: { nombre: 'Colegio Real Sintético', direccion: 'Calle 10 # 20-30' },
      },
      mesas: [
        {
          id: 'mesa-real-10',
          numero: 10,
          totalSufragantes: 240,
          puesto: { nombre: 'Colegio Real Sintético', direccion: 'Calle 10 # 20-30' },
        },
        {
          id: 'mesa-real-11',
          numero: 11,
          totalSufragantes: 210,
          puesto: { nombre: 'Colegio Real Sintético', direccion: 'Calle 10 # 20-30' },
        },
      ],
      elecciones: [
        {
          id: 'eleccion-real-1',
          nombre: 'Alcaldía Real',
          tipoEleccion: 'ALCALDIA',
          tipoCargo: 'UNINOMINAL',
          votoPreferente: false,
          candidatos: [{ id: 'cand-real-1', nombre: 'Candidata Real Uno', partido: 'Partido Real', numero: 1 }],
        },
      ],
    };

    localStorage.setItem('cuorum_testigo_token', fakeJwt);
    localStorage.setItem('cuorum_testigo_data', JSON.stringify(realTestigoData));

    await act(async () => {
      root.render(React.createElement(App));
    });
    await flush();

    // 1. Estamos en SelectorMesa con las 2 mesas reales
    assert.match(document.body.textContent, /Colegio Real Sintético/);
    assert.match(document.body.textContent, /#10/);
    assert.match(document.body.textContent, /#11/);

    const btnPracticarSelector = document.querySelector('[data-testid="btn-practicar"]');
    assert.ok(btnPracticarSelector, 'SelectorMesa debe mostrar el botón Practicar llenado E-14');
    apiCalls.length = 0;
    fetchCalls.length = 0;
    await click(btnPracticarSelector);

    // Verifica que abrió la mesa de práctica y no las reales
    assert.equal(document.querySelector('[data-testid="puesto-mesa-nombre"]').textContent, 'Puesto de práctica');
    await click(document.getElementById('tab-contar'));
    await fillInput(document.querySelector('[aria-label="Votos para Candidato de prueba 1"]'), 55);
    await click(document.querySelector('[data-testid="btn-guardar-resultados"]'));
    assert.equal(idbWrites.length, 0, 'Practicar con sesión activa no debe escribir en IndexedDB');
    assert.equal(apiCalls.length, 0, 'Practicar con sesión activa no debe llamar a la API');

    // Al salir de la práctica vuelve a SelectorMesa con las mesas reales intactas
    await click(document.querySelector('[data-testid="btn-salir-practica"]'));
    assert.match(document.body.textContent, /Colegio Real Sintético/);
    assert.ok(!document.querySelector('[data-testid="franja-modo-practica"]'));

    // 2. Seleccionar la mesa real #10 para ir a CheckinTestigo (estado PENDIENTE)
    const btnMesa10 = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('#10'));
    assert.ok(btnMesa10, 'Debe existir la tarjeta de la mesa real #10');
    await click(btnMesa10);
    await flush();

    // Limpiar contadores de la consulta inicial de estado de jornada real
    apiCalls.length = 0;
    fetchCalls.length = 0;

    assert.match(document.body.textContent, /Confirmar llegada/);
    const btnPracticarCheckin = document.querySelector('[data-testid="btn-practicar"]');
    assert.ok(btnPracticarCheckin, 'CheckinTestigo debe mostrar el botón Practicar llenado E-14');
    assert.match(btnPracticarCheckin.className, /bg-app-(surface|elevated)/, 'Botón en CheckinTestigo debe usar tokens app-* para modo oscuro');

    await click(btnPracticarCheckin);
    assert.ok(document.querySelector('[data-testid="franja-modo-practica"]'));
    assert.equal(document.querySelector('[data-testid="puesto-mesa-nombre"]').textContent, 'Puesto de práctica');
    assert.equal(idbWrites.length, 0);
    assert.equal(apiCalls.length, 0);

    // Salir desde la franja regresa a CheckinTestigo en la mesa real #10
    await click(document.querySelector('[data-testid="btn-salir-practica-franja"]'));
    assert.match(document.body.textContent, /Confirmar llegada/);
    assert.match(document.body.textContent, /Colegio Real Sintético/);
    assert.match(document.body.textContent, /#10/);
    assert.equal(idbWrites.length, 0);
  });
});
