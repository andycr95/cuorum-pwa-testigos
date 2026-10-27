import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Cuorum no se presenta como sistema oficial ni como autorizado por la Registraduría.
// Las únicas menciones permitidas están en los paneles de resultados del día D (escrutinio).
const PANTALLAS_DEL_TESTIGO = [
  ['src', 'components', 'auth', 'LoginPage.tsx'],
  ['src', 'components', 'auth', 'SelectorMesa.tsx'],
];
const FRASES = [/sistema oficial/i, /\boficial(es)?\b/i, /autorizad[oa]s? por/i, /registradur/i];

describe('CUO-941: la PWA no se presenta como sistema oficial', () => {
  for (const partes of PANTALLAS_DEL_TESTIGO) {
    const archivo = path.join(rootDir, ...partes);
    it(`${partes.at(-1)} no usa tono oficial`, () => {
      const codigo = fs.readFileSync(archivo, 'utf8');
      for (const frase of FRASES) assert.doesNotMatch(codigo, frase);
    });
  }

  it('el login muestra el subtítulo neutro', () => {
    const codigo = fs.readFileSync(path.join(rootDir, 'src', 'components', 'auth', 'LoginPage.tsx'), 'utf8');
    assert.match(codigo, /Reporte de testigos · Cuorum/);
  });
});
