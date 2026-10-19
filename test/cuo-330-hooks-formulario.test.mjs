import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import React from 'react';
import ts from 'typescript';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

describe('CUO-330: Reglas de Hooks en FormularioMesaMultiple y datos sintéticos', () => {
  const formularioPath = path.join(rootDir, 'src', 'components', 'formulario', 'FormularioMesaMultiple.tsx');
  const formularioCode = fs.readFileSync(formularioPath, 'utf8');

  it('Todos los hooks se llaman antes de cualquier return (los estados vacíos van al final)', () => {
    // Encontrar dónde se declara el componente
    const compStart = formularioCode.indexOf('export function FormularioMesaMultiple');
    assert.ok(compStart !== -1, 'Debe exportar FormularioMesaMultiple');
    const compBody = formularioCode.slice(compStart);

    // Encontrar el primer return en el cuerpo del componente (excluyendo funciones internas)
    // Buscamos los retornos de estados vacíos al final
    const idxReturnSinElecciones = compBody.indexOf('if (elecciones.length === 0) {');
    const idxReturnEleccionNoEncontrada = compBody.indexOf('if (!eleccion) {');
    const idxReturnPrincipal = compBody.indexOf('return (\n    <div className="max-w-md mx-auto');

    assert.ok(idxReturnSinElecciones !== -1, 'Debe contener la guarda de elecciones vacías');
    assert.ok(idxReturnEleccionNoEncontrada !== -1, 'Debe contener la guarda de elección no encontrada');

    // Verificar que limpiarFormulario está ANTES de los retornos de estados vacíos
    const idxLimpiarFormulario = compBody.indexOf('const limpiarFormulario = useCallback(');
    assert.ok(idxLimpiarFormulario !== -1, 'Debe definir limpiarFormulario con useCallback');
    assert.ok(
      idxLimpiarFormulario < idxReturnSinElecciones,
      'limpiarFormulario (useCallback) debe llamarse ANTES del return de elecciones.length === 0',
    );

    // Verificar que TODOS los hooks (useState, useEffect, useCallback, useOcrJobsE14) están antes de idxReturnSinElecciones
    const hookMatches = [...compBody.matchAll(/\b(use[A-Z][a-zA-Z0-9]*)\s*\(/g)];
    for (const match of hookMatches) {
      const hookName = match[1];
      const hookIdx = match.index;
      assert.ok(
        hookIdx < idxReturnSinElecciones,
        `El hook ${hookName} en la posición ${hookIdx} debe estar antes del return temprano en ${idxReturnSinElecciones}`,
      );
    }
  });

  it('Renderiza con elecciones=[] y después con una elección sin lanzar error de hooks', () => {
    const transpiled = ts.transpileModule(formularioCode, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
      },
    }).outputText;

    const mockAuthService = {
      getCandidatoId: () => null,
      getListaId: () => null,
      getCampanaId: () => 'campana-demo-id',
    };

    const context = {
      exports: {},
      require: (id) => {
        if (id === 'react') return React;
        if (id === 'react/jsx-runtime') {
          return {
            jsx: (type, props) => ({ type, props }),
            jsxs: (type, props) => ({ type, props }),
          };
        }
        if (id.includes('authService')) return { authService: mockAuthService };
        if (id.includes('useOcrJobsE14')) {
          return {
            useOcrJobsE14: () => ({ jobs: [], uploading: false, polling: false, refetch: () => {} }),
          };
        }
        if (id.includes('indexeddb')) {
          return {
            getResultadosByMesa: async () => [],
            guardarResultadosYFoto: async () => {},
          };
        }
        if (id.includes('api')) return { api: { get: async () => ({ data: [] }) } };
        if (id.includes('autoSyncService')) {
          return { pauseAutoSync: () => {}, resumeAutoSync: () => {} };
        }
        if (id.includes('jornadaService')) {
          return { jornadaService: { validar: async () => ({}) } };
        }
        if (id.includes('codigoActa')) return { generarCodigoActa: async () => 'COD-TEST' };
        if (id.includes('formatoError')) return { formatearErrorAmigable: (e) => String(e) };
        return () => null;
      },
      console,
      window: { confirm: () => true, history: { length: 1 } },
    };

    vm.createContext(context);
    vm.runInContext(transpiled, context);

    const FormularioMesaMultiple = context.exports.FormularioMesaMultiple;
    assert.equal(typeof FormularioMesaMultiple, 'function');

    // Arnés de verificación de orden y conteo de hooks de React
    const internals = React.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
    let isMount = true;
    const hooks = [];
    let hookIndex = 0;

    function recordHook(name, val) {
      if (isMount) {
        hooks.push({ name, val });
        hookIndex++;
        return [val, () => {}];
      } else {
        if (hookIndex >= hooks.length) {
          throw new Error('Rendered more hooks than during the previous render');
        }
        if (hooks[hookIndex].name !== name) {
          throw new Error(
            `Rendered fewer or different hooks than during the previous render: expected ${hooks[hookIndex].name}, got ${name}`,
          );
        }
        const prev = hooks[hookIndex];
        hookIndex++;
        return [prev.val, () => {}];
      }
    }

    const dispatcher = {
      useState: (init) => {
        const v = typeof init === 'function' ? init() : init;
        return recordHook('useState', v);
      },
      useCallback: (fn) => recordHook('useCallback', fn)[0],
      useEffect: (create) => recordHook('useEffect', create),
      useMemo: (create) => recordHook('useMemo', create())[0],
      useRef: (init) => recordHook('useRef', { current: init })[0],
    };

    const render = (props) => {
      internals.H = dispatcher;
      hookIndex = 0;
      try {
        const out = FormularioMesaMultiple(props);
        if (!isMount && hookIndex < hooks.length) {
          throw new Error('Rendered fewer hooks than during the previous render');
        }
        isMount = false;
        return out;
      } finally {
        internals.H = null;
      }
    };

    const baseProps = {
      mesaId: 'mesa-test-01',
      testigoId: 'testigo-test-01',
      mesaNumero: 1,
      totalSufragantes: 300,
      deviceId: 'device-test-01',
      onMesaCerrada: () => {},
      onVolverSelector: () => {},
    };

    // Render 1: mesa sin elecciones asignadas (elecciones=[])
    const outVacio = render({ ...baseProps, elecciones: [] });
    assert.ok(outVacio, 'Debe renderizar la vista de estado vacío');
    const totalHooksMount = hooks.length;
    assert.ok(totalHooksMount > 0, 'Debe haber registrado hooks');

    // Render 2: la mesa ahora recibe una elección sin desmontar el componente
    const outConEleccion = render({
      ...baseProps,
      elecciones: [
        {
          id: 'elec-01',
          nombre: 'Alcaldía Municipal',
          tipoEleccion: 'ALCALDIA',
          tipoCargo: 'UNINOMINAL',
          votoPreferente: false,
          candidatos: [{ id: 'cand-01', nombre: 'Candidata A', partido: 'Partido 1', numero: 1 }],
        },
      ],
    });
    assert.ok(outConEleccion, 'Debe renderizar el formulario con elecciones');
    assert.equal(hookIndex, totalHooksMount, 'La cantidad de hooks llamados en render 2 debe coincidir exactamente con render 1');
  });

  it('Verifica que un componente con hooks después de return temprano falle (control negativo)', () => {
    function ComponenteRoto({ elecciones }) {
      React.useState(1);
      if (elecciones.length === 0) {
        return 'vacio';
      }
      React.useCallback(() => {}, []);
      return 'lleno';
    }

    const internals = React.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
    let isMount = true;
    const hooks = [];
    let hookIndex = 0;

    function recordHook(name, val) {
      if (isMount) {
        hooks.push({ name, val });
        hookIndex++;
        return [val, () => {}];
      } else {
        if (hookIndex >= hooks.length) {
          throw new Error('Rendered more hooks than during the previous render');
        }
        hookIndex++;
        return [val, () => {}];
      }
    }

    const dispatcher = {
      useState: (init) => recordHook('useState', init),
      useCallback: (fn) => recordHook('useCallback', fn)[0],
    };

    const renderRoto = (props) => {
      internals.H = dispatcher;
      hookIndex = 0;
      try {
        const out = ComponenteRoto(props);
        isMount = false;
        return out;
      } finally {
        internals.H = null;
      }
    };

    // Render 1 con elecciones vacías
    renderRoto({ elecciones: [] });

    // Render 2 con elecciones: debe lanzar el error exacto de React
    assert.throws(
      () => renderRoto({ elecciones: [{ id: 'e1' }] }),
      /Rendered more hooks than during the previous render/,
      'El componente roto debe fallar con error de hook adicional',
    );
  });

  it('Garantiza teléfonos y correos sintéticos en test/ y documentación (sin números móviles ni @demo.cuorum)', () => {
    const testFiles = fs.readdirSync(path.join(rootDir, 'test'))
      .filter((f) => (f.endsWith('.mjs') || f.endsWith('.js')) && f !== 'cuo-330-hooks-formulario.test.mjs');

    const regexTelInseguro = new RegExp('300' + '1234567');
    const regexEmailInseguro = new RegExp('@demo' + '\\.cuorum');

    for (const file of testFiles) {
      const content = fs.readFileSync(path.join(rootDir, 'test', file), 'utf8');
      assert.doesNotMatch(
        content,
        regexTelInseguro,
        `El archivo test/${file} no debe contener 3001234567`,
      );
      assert.doesNotMatch(
        content,
        regexEmailInseguro,
        `El archivo test/${file} no debe contener correos @demo.cuorum`,
      );
    }

    const authDoc = fs.readFileSync(path.join(rootDir, 'AUTHENTICATION.md'), 'utf8');
    assert.doesNotMatch(authDoc, regexTelInseguro, 'AUTHENTICATION.md no debe contener 3001234567');
  });
});
