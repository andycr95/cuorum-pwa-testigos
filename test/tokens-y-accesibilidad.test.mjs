import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const srcDir = path.join(rootDir, 'src');

function getAllFiles(dir, exts = ['.tsx', '.ts', '.css']) {
  let results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results = results.concat(getAllFiles(fullPath, exts));
    } else if (exts.includes(path.extname(entry.name))) {
      results.push(fullPath);
    }
  }
  return results;
}

test('CUO-209: Cero usos de bg-gradient en src/ (regla sin degradados)', () => {
  const allFiles = getAllFiles(srcDir);
  const violations = [];

  for (const file of allFiles) {
    const content = fs.readFileSync(file, 'utf8');
    const lines = content.split('\n');
    lines.forEach((line, index) => {
      if (line.includes('bg-gradient')) {
        violations.push(`${path.relative(rootDir, file)}:${index + 1}: ${line.trim()}`);
      }
    });
  }

  assert.equal(
    violations.length,
    0,
    `Se encontraron ${violations.length} usos de bg-gradient:\n${violations.join('\n')}`
  );
});

test('CUO-209: Ningún emoji utilizado como icono en componentes clave', () => {
  const keyFiles = [
    'src/components/auth/LoginPage.tsx',
    'src/components/auth/SelectorMesa.tsx',
    'src/components/camera/CapturaE14.tsx',
    'src/components/camera/CapturaMultipleE14.tsx',
    'src/components/formulario/SelectorEleccion.tsx',
    'src/components/formulario/CapturaFoto.tsx',
    'src/components/formulario/FormularioMesaMultiple.tsx',
    'src/components/formulario/ObservacionesInput.tsx',
    'src/components/incidencias/PanelIncidencias.tsx',
    'src/components/resultados/PanelHistorialResultados.tsx',
  ];

  const prohibitedEmojis = ['🗳️', '🗳', '🚨', '📧', '✉️', '⚠️', '⚠', '📷', '📸', '🔒', '🗑️', '🗑'];
  const violations = [];

  for (const relPath of keyFiles) {
    const fullPath = path.join(rootDir, relPath);
    if (!fs.existsSync(fullPath)) continue;
    const content = fs.readFileSync(fullPath, 'utf8');
    for (const emoji of prohibitedEmojis) {
      if (content.includes(emoji)) {
        violations.push(`${relPath} contiene el emoji como ícono: ${emoji}`);
      }
    }
  }

  assert.equal(
    violations.length,
    0,
    `Se encontraron emojis en componentes que deben usar SVG:\n${violations.join('\n')}`
  );
});

test('CUO-209: Botones de icono tienen aria-label y tamaño táctil mínimo de 44x44px', () => {
  const multipleE14 = fs.readFileSync(
    path.join(rootDir, 'src/components/camera/CapturaMultipleE14.tsx'),
    'utf8'
  );
  assert.ok(
    multipleE14.includes('aria-label={`Mover foto ${idx + 1} hacia arriba`}'),
    'CapturaMultipleE14 debe tener aria-label para subir foto'
  );
  assert.ok(
    multipleE14.includes('aria-label={`Mover foto ${idx + 1} hacia abajo`}'),
    'CapturaMultipleE14 debe tener aria-label para bajar foto'
  );
  assert.ok(
    multipleE14.includes('aria-label={`Eliminar foto ${idx + 1}`}'),
    'CapturaMultipleE14 debe tener aria-label para eliminar foto'
  );
  assert.ok(
    multipleE14.includes('min-w-[48px] min-h-[48px]') || multipleE14.includes('min-w-[44px] min-h-[44px]'),
    'Botones de foto deben medir al menos 44x44px'
  );

  const appTsx = fs.readFileSync(path.join(rootDir, 'src/App.tsx'), 'utf8');
  assert.ok(
    appTsx.includes('aria-label="Cerrar sesion"') || appTsx.includes('aria-label="Cerrar sesión"'),
    'App.tsx debe tener aria-label en botones de cerrar sesion'
  );
  assert.ok(
    appTsx.includes('aria-label="Cambiar de mesa"'),
    'App.tsx debe tener aria-label en boton cambiar de mesa'
  );
});

test('CUO-209: Vistas principales envueltas en <main> con encabezado <h1>', () => {
  const appTsx = fs.readFileSync(path.join(rootDir, 'src/App.tsx'), 'utf8');
  const loginTsx = fs.readFileSync(path.join(rootDir, 'src/components/auth/LoginPage.tsx'), 'utf8');
  const selectorTsx = fs.readFileSync(path.join(rootDir, 'src/components/auth/SelectorMesa.tsx'), 'utf8');

  assert.ok(loginTsx.includes('<main'), 'LoginPage debe tener <main>');
  assert.ok(loginTsx.includes('<h1'), 'LoginPage debe tener <h1>');
  assert.ok(selectorTsx.includes('<h1'), 'SelectorMesa debe tener <h1>');
  assert.ok(appTsx.includes('<main'), 'App.tsx debe envolver vistas en <main>');
});
