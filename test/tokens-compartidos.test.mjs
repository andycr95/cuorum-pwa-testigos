import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { themeExtend } from '../tailwind.tokens.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const pwaDir = path.resolve(__dirname, '..');

const fixtureWebAdminTokensPath = path.join(pwaDir, 'test/fixtures/web-admin.tailwind.tokens.js');

const candidateExternalWebAdminPaths = [
  process.env.WEB_ADMIN_TOKENS_PATH,
  path.resolve(pwaDir, '../cuorum-platform/web-admin/tailwind.tokens.js'),
  path.resolve(pwaDir, '../../cuorum-platform/web-admin/tailwind.tokens.js'),
].filter(Boolean);

// Función estándar WCAG 2.1 para cálculo de contraste de luminancia relativa
function calcularLuminanciaRelativa(hexColor) {
  const hex = hexColor.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16) / 255;
  const g = parseInt(hex.substring(2, 4), 16) / 255;
  const b = parseInt(hex.substring(4, 6), 16) / 255;

  const a = [r, g, b].map((val) => {
    return val <= 0.03928 ? val / 12.92 : Math.pow((val + 0.055) / 1.055, 2.4);
  });

  return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
}

function calcularRatioContraste(hex1, hex2) {
  const l1 = calcularLuminanciaRelativa(hex1);
  const l2 = calcularLuminanciaRelativa(hex2);
  const masClaro = Math.max(l1, l2);
  const masOscuro = Math.min(l1, l2);
  return (masClaro + 0.05) / (masOscuro + 0.05);
}

test('tokens compartidos: tailwind.tokens.js es idéntico a la contraparte fijada (web-admin)', () => {
  const pwaTokensPath = path.join(pwaDir, 'tailwind.tokens.js');

  assert.ok(fs.existsSync(pwaTokensPath), 'cuorum-pwa-testigos/tailwind.tokens.js debe existir');
  assert.ok(fs.existsSync(fixtureWebAdminTokensPath), 'test/fixtures/web-admin.tailwind.tokens.js debe existir');

  const pwaContent = fs.readFileSync(pwaTokensPath, 'utf8').trim();
  const fixtureContent = fs.readFileSync(fixtureWebAdminTokensPath, 'utf8').trim();

  assert.equal(
    pwaContent,
    fixtureContent,
    'El archivo tailwind.tokens.js debe ser idéntico al fixture versionado de la contraparte'
  );
  assert.ok(
    pwaContent.includes('Fuente única de verdad de tokens compartidos'),
    'Debe incluir el comentario que lo declara fuente única de verdad'
  );

  // Si existe un checkout contiguo accesible de la contraparte en el entorno, verificar paridad en vivo
  for (const externalPath of candidateExternalWebAdminPaths) {
    if (fs.existsSync(externalPath)) {
      const externalContent = fs.readFileSync(externalPath, 'utf8').trim();
      assert.equal(
        pwaContent,
        externalContent,
        `tailwind.tokens.js debe ser idéntico al encontrado en ${externalPath}`
      );
      break;
    }
  }
});

test('tokens de Tailwind: contiene todos los tokens base especificados en Diseno-y-UX.md', () => {
  // 1. Colores de marca
  assert.equal(themeExtend.colors['brand-600'], '#DC2626');
  assert.equal(themeExtend.colors['brand-700'], '#B91C1C');
  assert.equal(themeExtend.colors['brand-50'], '#FEF2F2');

  // 2. Colores de texto / tinta
  assert.equal(themeExtend.colors['ink-900'], '#111827');
  assert.equal(themeExtend.colors['ink-600'], '#4B5563');

  // 3. Bordes y superficies
  assert.equal(themeExtend.colors['line-300'], '#D1D5DB');
  assert.equal(themeExtend.colors.surface, '#FFFFFF');
  assert.equal(themeExtend.colors.canvas, '#F9FAFB');

  // 4. Estados semánticos (ok, warn, err, info)
  assert.equal(themeExtend.colors['ok-700'], '#15803D');
  assert.equal(themeExtend.colors['ok-50'], '#F0FDF4');
  assert.equal(themeExtend.colors['warn-700'], '#B45309');
  assert.equal(themeExtend.colors['warn-50'], '#FFFBEB');
  assert.equal(themeExtend.colors['err-700'], '#B91C1C');
  assert.equal(themeExtend.colors['err-50'], '#FEF2F2');
  assert.equal(themeExtend.colors['info-700'], '#1D4ED8');
  assert.equal(themeExtend.colors['info-50'], '#EFF6FF');

  // 5. Tipografía
  assert.ok(themeExtend.fontFamily.sans.includes('Inter'));
  assert.ok(themeExtend.fontSize['caption'][0], '12px');
  assert.ok(themeExtend.fontSize['body-sm'][0], '14px');
  assert.ok(themeExtend.fontSize['body'][0], '16px');
  assert.ok(themeExtend.fontSize['title-sm'][0], '20px');
  assert.ok(themeExtend.fontSize['title-md'][0], '24px');
  assert.ok(themeExtend.fontSize['title-lg'][0], '32px');
  assert.ok(themeExtend.fontSize['conteo'][0], '36px');

  // 6. Espacios base 4px y táctiles
  assert.equal(themeExtend.spacing['1'], '4px');
  assert.equal(themeExtend.spacing['2'], '8px');
  assert.equal(themeExtend.spacing['3'], '12px');
  assert.equal(themeExtend.spacing['4'], '16px');
  assert.equal(themeExtend.spacing['6'], '24px');
  assert.equal(themeExtend.spacing['8'], '32px');
  assert.equal(themeExtend.spacing['12'], '48px');
  assert.equal(themeExtend.spacing['touch-web'], '40px');
  assert.equal(themeExtend.spacing['touch-mobile'], '44px');
  assert.equal(themeExtend.spacing['touch-pwa'], '48px');
  assert.equal(themeExtend.spacing['touch-conteo'], '56px');

  // 7. Radios
  assert.equal(themeExtend.borderRadius['btn'], '8px');
  assert.equal(themeExtend.borderRadius['field'], '8px');
  assert.equal(themeExtend.borderRadius['card'], '12px');
  assert.equal(themeExtend.borderRadius['modal'], '12px');
  assert.equal(themeExtend.borderRadius['badge'], '9999px');

  // 8. Sombras
  assert.equal(themeExtend.boxShadow['sm'], '0 1px 2px 0 rgb(0 0 0 / 0.06)');

  // 9. Objetivos táctiles mínimos
  assert.equal(themeExtend.minHeight['touch-web'], '40px');
  assert.equal(themeExtend.minHeight['touch-mobile'], '44px');
  assert.equal(themeExtend.minHeight['touch-pwa'], '48px');
  assert.equal(themeExtend.minHeight['touch-conteo'], '56px');
});

test('variables CSS: cuorum-pwa-testigos/src/index.css contiene las variables de tokens compartidos', () => {
  const pwaCss = fs.readFileSync(path.join(pwaDir, 'src/index.css'), 'utf8');

  const variablesEsperadas = [
    '--color-brand-600: #DC2626',
    '--color-brand-700: #B91C1C',
    '--color-brand-50: #FEF2F2',
    '--color-ink-900: #111827',
    '--color-ink-600: #4B5563',
    '--color-line-300: #D1D5DB',
    '--color-surface: #FFFFFF',
    '--color-canvas: #F9FAFB',
    '--color-ok-700: #15803D',
    '--color-ok-50: #F0FDF4',
    '--color-warn-700: #B45309',
    '--color-warn-50: #FFFBEB',
    '--color-err-700: #B91C1C',
    '--color-err-50: #FEF2F2',
    '--color-info-700: #1D4ED8',
    '--color-info-50: #EFF6FF',
    '--space-1: 4px',
    '--space-2: 8px',
    '--space-3: 12px',
    '--space-4: 16px',
    '--space-6: 24px',
    '--space-8: 32px',
    '--space-12: 48px',
    '--radius-btn: 8px',
    '--radius-field: 8px',
    '--radius-card: 12px',
    '--radius-modal: 12px',
    '--radius-badge: 9999px',
    '--shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.06)',
    '--touch-web: 40px',
    '--touch-mobile: 44px',
    '--touch-pwa: 48px',
    '--touch-conteo: 56px',
    '--focus-ring: 0 0 0 2px #FFFFFF, 0 0 0 4px #B91C1C',
  ];

  for (const v of variablesEsperadas) {
    assert.ok(pwaCss.includes(v), `cuorum-pwa-testigos/src/index.css debe contener "${v}"`);
  }
});

test('accesibilidad: contraste de cada par texto/fondo del token >= 4,5:1 (WCAG AA)', () => {
  const paresTextoFondo = [
    { nombre: 'Texto blanco sobre marca brand-600', texto: '#FFFFFF', fondo: '#DC2626', minRatio: 4.5 },
    { nombre: 'Texto brand-700 sobre fondo blanco', texto: '#B91C1C', fondo: '#FFFFFF', minRatio: 4.5 },
    { nombre: 'Texto brand-700 sobre fondo brand-50', texto: '#B91C1C', fondo: '#FEF2F2', minRatio: 4.5 },
    { nombre: 'Texto ink-900 sobre surface blanco', texto: '#111827', fondo: '#FFFFFF', minRatio: 4.5 },
    { nombre: 'Texto ink-900 sobre canvas', texto: '#111827', fondo: '#F9FAFB', minRatio: 4.5 },
    { nombre: 'Texto ink-600 secundario sobre surface', texto: '#4B5563', fondo: '#FFFFFF', minRatio: 4.5 },
    { nombre: 'Texto ink-600 secundario sobre canvas', texto: '#4B5563', fondo: '#F9FAFB', minRatio: 4.5 },
    { nombre: 'Texto ok-700 sobre fondo ok-50', texto: '#15803D', fondo: '#F0FDF4', minRatio: 4.5 },
    { nombre: 'Texto ok-700 sobre surface blanco', texto: '#15803D', fondo: '#FFFFFF', minRatio: 4.5 },
    { nombre: 'Texto warn-700 sobre fondo warn-50', texto: '#B45309', fondo: '#FFFBEB', minRatio: 4.5 },
    { nombre: 'Texto warn-700 sobre surface blanco', texto: '#B45309', fondo: '#FFFFFF', minRatio: 4.5 },
    { nombre: 'Texto err-700 sobre fondo err-50', texto: '#B91C1C', fondo: '#FEF2F2', minRatio: 4.5 },
    { nombre: 'Texto err-700 sobre surface blanco', texto: '#B91C1C', fondo: '#FFFFFF', minRatio: 4.5 },
    { nombre: 'Texto info-700 sobre fondo info-50', texto: '#1D4ED8', fondo: '#EFF6FF', minRatio: 4.5 },
    { nombre: 'Texto info-700 sobre surface blanco', texto: '#1D4ED8', fondo: '#FFFFFF', minRatio: 4.5 },
  ];

  for (const par of paresTextoFondo) {
    const ratio = calcularRatioContraste(par.texto, par.fondo);
    assert.ok(
      ratio >= par.minRatio,
      `Contraste insuficiente para ${par.nombre}: obtenido ${ratio.toFixed(2)}:1, requerido >= ${par.minRatio}:1`
    );
  }
});
