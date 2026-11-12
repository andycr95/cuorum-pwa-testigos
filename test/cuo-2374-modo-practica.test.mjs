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

    // Paso 3: Cerrar y firmar acta en memoria
    await click(document.getElementById('tab-cierre'));
    const btnCerrarDirecto = [...document.querySelectorAll('button')].find((b) =>
      b.textContent.includes('Cerrar y firmar acta'),
    );
    assert.ok(btnCerrarDirecto, 'Debe permitir cerrar el acta con la foto en memoria');
    assert.equal(btnCerrarDirecto.disabled, false);
    await click(btnCerrarDirecto);

    assert.match(document.body.textContent, /Acta cerrada y firmada/);

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
      /La suma de votos individuales \(80\) no coincide con el total de votos de mesa \(100\)/,
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
});
