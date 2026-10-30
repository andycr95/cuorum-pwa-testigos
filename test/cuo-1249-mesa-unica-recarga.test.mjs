import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { mesasDelTestigo } from '../src/services/mesasTestigo.ts';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const appCode = fs.readFileSync(path.join(rootDir, 'src', 'App.tsx'), 'utf8');

const mesa = (id) => ({ id, numero: 1 });

describe('CUO-1249: una sola mesa se autoselecciona también al recargar', () => {
  it('la sesión guardada al iniciar sesión (mesa sin mesas) da una mesa', () => {
    assert.deepStrictEqual(mesasDelTestigo({ mesa: mesa('m1') }), [mesa('m1')]);
  });

  it('una lista de mesas vacía cae en la mesa actual', () => {
    assert.deepStrictEqual(mesasDelTestigo({ mesa: mesa('m1'), mesas: [] }), [mesa('m1')]);
  });

  it('con varias mesas devuelve la lista completa', () => {
    const mesas = [mesa('m1'), mesa('m2')];
    assert.deepStrictEqual(mesasDelTestigo({ mesa: mesa('m1'), mesas }), mesas);
  });

  it('la recarga (checkAuth) y el login usan la misma regla', () => {
    const checkAuth = appCode.slice(appCode.indexOf('const checkAuth'), appCode.indexOf('checkAuth();'));
    const login = appCode.slice(appCode.indexOf('const handleLoginSuccess'), appCode.indexOf('// Manejar logout'));
    assert.match(checkAuth, /const listaMesas = mesasDelTestigo\(data\);/);
    assert.match(login, /const listaMesas = mesasDelTestigo\(data\);/);
  });
});
