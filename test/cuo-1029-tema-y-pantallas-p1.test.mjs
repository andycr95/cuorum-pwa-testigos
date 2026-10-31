import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import {
  TEMA_PREDETERMINADO,
  leerTemaGuardado,
  resolverTemaOscuro,
  aplicarTema,
} from '../src/components/ui/temaLogic.ts';
import { temaPanel } from '../tailwind.tema.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const pwaDir = path.resolve(__dirname, '..');

function extraerVariablesApp(bloque) {
  const vars = {};
  for (const m of bloque.matchAll(/--app-([a-z-]+):\s*(\d+) (\d+) (\d+);/g)) {
    vars[m[1]] = [+m[2], +m[3], +m[4]];
  }
  return vars;
}

function luminancia([r, g, b]) {
  const c = [r, g, b].map((v) => {
    const x = v / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

function ratioContrasteRgb(a, b) {
  const [x, y] = [luminancia(a), luminancia(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}

function hexARgb(hex) {
  const limpio = hex.replace('#', '');
  return [
    parseInt(limpio.slice(0, 2), 16),
    parseInt(limpio.slice(2, 4), 16),
    parseInt(limpio.slice(4, 6), 16),
  ];
}

describe('CUO-1029 · Tema claro/oscuro compartido sin parpadeo', () => {
  const html = fs.readFileSync(path.join(pwaDir, 'index.html'), 'utf8');

  function cargarPagina(temaGuardado, sistemaOscuro) {
    const dom = new JSDOM(html, {
      url: 'http://localhost/',
      runScripts: 'dangerously',
      beforeParse(window) {
        if (temaGuardado !== null) window.localStorage.setItem('theme', temaGuardado);
        window.matchMedia = (q) => ({
          matches: sistemaOscuro && q === '(prefers-color-scheme: dark)',
          addEventListener: () => {},
          removeEventListener: () => {},
        });
      },
    });
    return dom.window.document.documentElement;
  }

  it('el guion en línea corre en <head>, antes de cargar React', () => {
    const cabeza = html.slice(0, html.indexOf('</head>'));
    assert.ok(cabeza.includes('<script id="tema-inicial">'));
    assert.ok(html.indexOf('id="tema-inicial"') < html.indexOf('/src/main.tsx'));
    assert.ok(html.includes('<meta name="color-scheme" content="light dark" />'));
  });

  it('por defecto sigue al sistema (prefers-color-scheme) cuando no hay preferencia guardada', () => {
    assert.equal(TEMA_PREDETERMINADO, 'system');
    assert.equal(cargarPagina(null, true).classList.contains('dark'), true);
    assert.equal(cargarPagina(null, true).style.colorScheme, 'dark');
    assert.equal(cargarPagina(null, false).classList.contains('dark'), false);
    assert.equal(cargarPagina(null, false).style.colorScheme, 'light');
    assert.equal(cargarPagina('invalido', true).classList.contains('dark'), true);
  });

  it('la preferencia guardada (light / dark / system) en localStorage manda sobre el sistema', () => {
    assert.equal(cargarPagina('light', true).classList.contains('dark'), false);
    assert.equal(cargarPagina('dark', false).classList.contains('dark'), true);
    assert.equal(cargarPagina('system', true).classList.contains('dark'), true);
    assert.equal(cargarPagina('system', false).classList.contains('dark'), false);
  });

  it('ControlTema resuelve y aplica el tema con la misma regla que el guion sin red', () => {
    assert.equal(resolverTemaOscuro('dark'), true);
    assert.equal(resolverTemaOscuro('light'), false);
    assert.equal(leerTemaGuardado(), 'system');

    const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
    const prevWin = globalThis.window;
    globalThis.window = dom.window;
    try {
      aplicarTema(true);
      assert.equal(dom.window.document.documentElement.classList.contains('dark'), true);
      assert.equal(dom.window.document.documentElement.style.colorScheme, 'dark');
      aplicarTema(false);
      assert.equal(dom.window.document.documentElement.classList.contains('dark'), false);
      assert.equal(dom.window.document.documentElement.style.colorScheme, 'light');
    } finally {
      globalThis.window = prevWin;
    }
  });
});

describe('CUO-1029 · Paridad de variables CSS :root/.dark y contraste WCAG AA', () => {
  const css = fs.readFileSync(path.join(pwaDir, 'src/index.css'), 'utf8');
  const claro = extraerVariablesApp(css.slice(css.indexOf(':root'), css.indexOf('.dark {')));
  const oscuro = extraerVariablesApp(css.slice(css.indexOf('.dark {')));

  it('define las 8 variables --app-* idénticas a web-admin en :root y .dark', () => {
    const esperadas = ['accent', 'accent-fg', 'canvas', 'elevated', 'fg', 'line', 'muted', 'surface'];
    assert.deepEqual(Object.keys(claro).sort(), esperadas);
    assert.deepEqual(Object.keys(oscuro).sort(), esperadas);

    assert.deepEqual(claro.canvas, [253, 252, 252]);
    assert.deepEqual(claro.surface, [255, 255, 255]);
    assert.deepEqual(claro.elevated, [245, 243, 241]);
    assert.deepEqual(claro.line, [235, 232, 228]);
    assert.deepEqual(claro.fg, [10, 10, 10]);
    assert.deepEqual(claro.muted, [87, 83, 78]);
    assert.deepEqual(claro.accent, [220, 38, 38]);
    assert.deepEqual(claro['accent-fg'], [185, 28, 28]);

    assert.deepEqual(oscuro.canvas, [10, 10, 11]);
    assert.deepEqual(oscuro.surface, [19, 19, 22]);
    assert.deepEqual(oscuro.elevated, [24, 24, 27]);
    assert.deepEqual(oscuro.line, [39, 39, 42]);
    assert.deepEqual(oscuro.fg, [250, 250, 250]);
    assert.deepEqual(oscuro.muted, [161, 161, 170]);
    assert.deepEqual(oscuro.accent, [220, 38, 38]);
    assert.deepEqual(oscuro['accent-fg'], [248, 113, 113]);

    const webAdminCssPath = path.resolve(pwaDir, '../cuorum-platform/web-admin/src/index.css');
    if (fs.existsSync(webAdminCssPath)) {
      const webCss = fs.readFileSync(webAdminCssPath, 'utf8');
      const webClaro = extraerVariablesApp(webCss.slice(webCss.indexOf(':root'), webCss.indexOf('.dark {')));
      const webOscuro = extraerVariablesApp(webCss.slice(webCss.indexOf('.dark {')));
      assert.deepEqual(claro, webClaro);
      assert.deepEqual(oscuro, webOscuro);
    }
  });

  it('todos los pares de texto (fg, muted, accent-fg) sobre fondos (canvas, surface, elevated) cumplen >= 4.5:1 en claro y oscuro', () => {
    for (const [nombreTema, tema] of [['claro', claro], ['oscuro', oscuro]]) {
      for (const fondo of ['canvas', 'surface', 'elevated']) {
        for (const tinta of ['fg', 'muted', 'accent-fg']) {
          const ratio = ratioContrasteRgb(tema[tinta], tema[fondo]);
          assert.ok(
            ratio >= 4.5,
            `Contraste insuficiente en ${nombreTema} (${tinta} sobre ${fondo}): ${ratio.toFixed(2)}:1`
          );
        }
      }
    }
  });

  it('pares oscuros de BarraEstadoSync y OfflineBanner cumplen contraste WCAG AA >= 4.5:1', () => {
    const paresOscuros = [
      ['ENVIANDO oscuro', '#93C5FD', '#172554'],
      ['PENDIENTE oscuro', '#FCD34D', '#451A03'],
      ['OFFLINE/ERROR oscuro', '#FCA5A5', '#450A0A'],
      ['ENVIADO/ONLINE oscuro', '#86EFAC', '#052E16'],
    ];
    for (const [etiqueta, texto, fondo] of paresOscuros) {
      const ratio = ratioContrasteRgb(hexARgb(texto), hexARgb(fondo));
      assert.ok(ratio >= 4.5, `${etiqueta} tiene ratio ${ratio.toFixed(2)}:1, requerido >= 4.5:1`);
    }
  });

  it('tailwind.config.js activa darkMode: class e integra temaPanel', () => {
    const configCode = fs.readFileSync(path.join(pwaDir, 'tailwind.config.js'), 'utf8');
    assert.match(configCode, /darkMode:\s*'class'/);
    assert.match(configCode, /import temaPanel from '\.\/tailwind\.tema\.js'/);
    assert.equal(temaPanel.app.canvas, 'rgb(var(--app-canvas) / <alpha-value>)');
  });
});

describe('CUO-1029 · Pantallas fuera de jornada, ui/* y barra de sincronización', () => {
  const appCode = fs.readFileSync(path.join(pwaDir, 'src/App.tsx'), 'utf8');
  const loginCode = fs.readFileSync(path.join(pwaDir, 'src/components/auth/LoginPage.tsx'), 'utf8');
  const selectorCode = fs.readFileSync(path.join(pwaDir, 'src/components/auth/SelectorMesa.tsx'), 'utf8');
  const controlTemaCode = fs.readFileSync(path.join(pwaDir, 'src/components/ui/ControlTema.tsx'), 'utf8');
  const estadoVacioCode = fs.readFileSync(path.join(pwaDir, 'src/components/ui/EstadoVacio.tsx'), 'utf8');
  const offlineBannerCode = fs.readFileSync(path.join(pwaDir, 'src/components/ui/OfflineBanner.tsx'), 'utf8');
  const pendingBadgeCode = fs.readFileSync(path.join(pwaDir, 'src/components/ui/PendingSyncBadge.tsx'), 'utf8');
  const barraSyncCode = fs.readFileSync(path.join(pwaDir, 'src/components/sync/BarraEstadoSync.tsx'), 'utf8');

  it('ControlTema expone botones Claro, Oscuro y Sistema con objetivo táctil >= 44px', () => {
    assert.match(controlTemaCode, /Claro/);
    assert.match(controlTemaCode, /Oscuro/);
    assert.match(controlTemaCode, /Sistema/);
    assert.match(controlTemaCode, /min-h-\[44px\]\s+min-w-\[44px\]/);
    assert.match(controlTemaCode, /aria-pressed=\{theme === valor\}/);
  });

  it('LoginPage y SelectorMesa usan tokens app-*, radios 8/12, sin sombras en tarjetas ni clases gray-*', () => {
    for (const [nombre, codigo] of [['LoginPage', loginCode], ['SelectorMesa', selectorCode], ['EstadoVacio', estadoVacioCode], ['PendingSyncBadge', pendingBadgeCode]]) {
      assert.doesNotMatch(codigo, /\b(text|bg|border)-gray-\d+\b/, `${nombre} no debe usar clases gray-* fijas`);
      assert.doesNotMatch(codigo, /\bshadow-(sm|md|lg|xl|2xl)\b/, `${nombre} no debe tener sombras en tarjetas ni botones`);
      assert.match(codigo, /bg-app-surface/, `${nombre} debe usar bg-app-surface`);
      assert.match(codigo, /border-app-line/, `${nombre} debe usar border-app-line`);
      assert.match(codigo, /rounded-card/, `${nombre} debe usar radio 12px (rounded-card)`);
    }
    assert.match(loginCode, /<ControlTema\s*\/>/);
    assert.match(barraSyncCode, /ESTILOS_OSCURO/);
    assert.match(offlineBannerCode, /dark:bg-\[#451A03\]/);
  });

  it('las cuatro ramas de jornada en App.tsx conservan un fondo claro fijo y no usan bg-app-canvas', () => {
    const seccionJornada = appCode.slice(appCode.indexOf('// CERRADA/FIRMADA'));
    const mainsJornada = [...seccionJornada.matchAll(/<main\s+className="([^"]+)"/g)].map((m) => m[1]);
    assert.equal(mainsJornada.length, 4, 'Deben existir los 4 <main> de jornada (CERRADA/FIRMADA, PENDIENTE, CHECKIN, ABIERTA/EN_CONTEO)');
    for (const clases of mainsJornada) {
      assert.doesNotMatch(clases, /\bbg-app-canvas\b/, `Rama de jornada no debe usar bg-app-canvas: ${clases}`);
      assert.match(clases, /\b(bg-gray-50|bg-\[#FDFCFC\])\b/, `Rama de jornada debe tener fondo claro fijo: ${clases}`);
    }
    const seccionSelector = appCode.slice(
      appCode.indexOf('if (!selectedMesaId || !mesaSeleccionada)'),
      appCode.indexOf('// Jornada loading state')
    );
    assert.match(seccionSelector, /bg-white border border-app-line rounded-btn[\s\S]*?<img src="\/logo\.svg"/);
  });
});
