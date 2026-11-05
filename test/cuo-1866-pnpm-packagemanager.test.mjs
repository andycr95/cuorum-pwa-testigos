import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const leer = (archivo) => fs.readFileSync(path.join(rootDir, archivo), 'utf8');

test('packageManager fija pnpm 11 exacto, sin hash', () => {
  const { packageManager } = JSON.parse(leer('package.json'));
  // Sin `+sha512`: pnpm/action-setup@v4 no lo admite. 11 y no 12: 12 descarga aparte un binario nativo.
  assert.match(packageManager, /^pnpm@11\.\d+\.\d+$/);
});

test('pnpm-workspace.yaml rechaza paquetes de menos de 24 h', () => {
  const edad = leer('pnpm-workspace.yaml').match(/^minimumReleaseAge:\s*(\d+)\s*$/m);
  assert.ok(edad, 'falta minimumReleaseAge');
  assert.ok(Number(edad[1]) >= 1440, `minimumReleaseAge ${edad[1]} < 1440`);
});

test('Amplify toma pnpm de packageManager e instala con el lockfile congelado', () => {
  const amplify = leer('amplify.yml');
  assert.doesNotMatch(amplify, /npm install -g pnpm|corepack prepare pnpm@/);
  assert.match(amplify, /corepack install/);
  assert.match(amplify, /pnpm install --frozen-lockfile/);
});

test('la CI no fija otra versión de pnpm', () => {
  // Falla hasta que el dueño quite `version` de pnpm/action-setup (diff propuesto en el PR).
  const ci = leer('.github/workflows/ci.yml');
  const versiones = [...ci.matchAll(/pnpm\/action-setup@[^\n]*\n(?:\s+with:\s*\{[^}]*version:\s*([^,}\s]+)[^}]*\})?/g)]
    .map((m) => m[1])
    .filter(Boolean);
  assert.deepEqual(versiones, []);
});
