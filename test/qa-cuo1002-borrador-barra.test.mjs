import test, { beforeEach, afterEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import ts from 'typescript';
import { JSDOM } from 'jsdom';
import 'fake-indexeddb/auto';

// Producto real: componentes, hook, servicios y transacciones IndexedDB.
// Fronteras sustituidas: API HTTP y cámara. Todos los datos son sintéticos.
const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'http://localhost/qa-sintetica' });
for (const k of ['window', 'document', 'navigator', 'HTMLElement', 'HTMLInputElement', 'HTMLTextAreaElement', 'Event', 'MouseEvent', 'CustomEvent', 'localStorage', 'sessionStorage']) {
  Object.defineProperty(globalThis, k, { value: dom.window[k], configurable: true, writable: true });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => globalThis.__cuo997?.online ?? true });
window.confirm = () => true;
dom.window.HTMLCanvasElement.prototype.getContext = () => ({ scale() {}, clearRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {} });
const reactUrl = new URL('../node_modules/react/index.js', import.meta.url).href;
const mocks = {
  '/src/services/api.ts': `export const api={get:(...a)=>globalThis.__cuo997.get(...a),post:(...a)=>globalThis.__cuo997.post(...a),patch:async()=>({data:{}})};`,
  '/src/components/camera/CapturaMultipleE14.tsx': `import React from ${JSON.stringify(reactUrl)};export const CapturaMultipleE14=()=>React.createElement('p',null,'Cámara sintética');`,
};
const previousFiles = ['src/components/formulario/FormularioMesaMultiple.tsx', 'src/components/camera/EstadoOcrE14.tsx', 'src/hooks/useOcrJobsE14.ts', 'src/db/indexeddb.ts'];
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (context.parentURL?.includes('/src/') && specifier.startsWith('.')) {
      const base = new URL(specifier, context.parentURL);
      for (const url of [base.href, base.href + '.ts', base.href + '.tsx', base.href + '/index.ts']) {
        const mock = Object.keys(mocks).find(k => new URL(url).pathname.endsWith(k));
        if (mock) return { url: 'data:text/javascript,' + encodeURIComponent(mocks[mock]), shortCircuit: true };
        if (existsSync(fileURLToPath(url))) return { url, shortCircuit: true };
      }
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.startsWith('file:') && /\.tsx?$/.test(url)) return {
      format: 'module', shortCircuit: true,
      source: ts.transpileModule(
        process.env.CUO997_ANTERIOR === '1' && previousFiles.some(p => new URL(url).pathname.endsWith('/' + p))
          ? execFileSync('git', ['show', 'b80b459^:' + previousFiles.find(p => new URL(url).pathname.endsWith('/' + p))], { encoding: 'utf8' })
          : readFileSync(fileURLToPath(url), 'utf8'),
        { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText,
    };
    return nextLoad(url, context);
  },
});
const React = await import('react');
const { act } = React;
const { createRoot } = await import('react-dom/client');
const { FormularioMesaMultiple } = await import('../src/components/formulario/FormularioMesaMultiple.tsx');
const { EstadoOcrE14 } = await import('../src/components/camera/EstadoOcrE14.tsx');
const { useOcrJobsE14 } = await import('../src/hooks/useOcrJobsE14.ts');
const db = await import('../src/db/indexeddb.ts');
const sync = await import('../src/services/syncService.ts');
const logic = await import('../src/services/borradorVotosLogic.ts');
const props = {
  mesaId: 'mesa-sintetica-997', mesaNumero: 1, totalSufragantes: 100,
  testigoId: 'testigo-sintetico-997', deviceId: 'dispositivo-sintetico-997',
  elecciones: [{ id: 'eleccion-sintetica-a', nombre: 'ELECCIÓN SINTÉTICA A', tipoEleccion: 'ALCALDIA', tipoCargo: 'UNINOMINAL', votoPreferente: false,
    candidatos: [{ id: 'candidato-sintetico-a', nombre: 'CANDIDATO SINTÉTICO A', partido: 'AGRUPACIÓN SINTÉTICA' }] }],
};
const job = (extra = {}) => ({
  id: 'job-sintetico-997', mesaId: props.mesaId, testigoId: props.testigoId,
  eleccionId: props.elecciones[0].id, campanaId: 'campana-sintetica-997', deviceId: props.deviceId,
  estado: 'COMPLETADO', serverJobId: 'job-sintetico-997', fotos: [],
  capturedAt: '2026-10-28T00:00:00.000Z', synced: 1, syncAttempts: 0,
  resultadoOcr: { 'candidato-sintetico-a': 12, _totalVotosMesa: 12, _votosBlanco: 0, _votosNulos: 0, _votosNoMarcados: 0 },
  candidatosMap: { 'candidato-sintetico-a': { nombre: 'CANDIDATO SINTÉTICO A', partido: 'AGRUPACIÓN SINTÉTICA', posicion: 1 } },
  ...extra,
});
let root;
const flush = async (ms = 35) => act(async () => { await new Promise(resolve => setTimeout(resolve, ms)); });
const buttons = () => [...document.querySelectorAll('button')];
const button = text => { const b = buttons().find(x => x.textContent.includes(text)); assert.ok(b, 'Botón esperado: ' + text); return b; };
const click = async el => { await act(async () => el.dispatchEvent(new MouseEvent('click', { bubbles: true }))); await flush(); };
const fill = async (el, value) => {
  assert.ok(el, 'campo numérico disponible');
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
};
const mount = async component => { await act(async () => root.render(component)); await flush(); await flush(); };
const mountForm = async () => { await mount(React.createElement(FormularioMesaMultiple, props)); await click(document.getElementById('tab-contar')); };
beforeEach(async () => {
  const idb = await db.getDB();
  for (const store of idb.objectStoreNames) await idb.clear(store);
  localStorage.clear(); sessionStorage.clear();
  localStorage.setItem('cuorum_testigo_campana', 'campana-sintetica-997');
  localStorage.setItem('cuorum_testigo_data', JSON.stringify({ testigo: { id: props.testigoId } }));
  sync.clearLastSyncTime(); sync.clearLastSyncError();
  const s = globalThis.__cuo997 = { online: true, serverJobs: [], calls: [], submissions: [], hook: null };
  s.get = async url => {
    s.calls.push({ method: 'GET', url });
    if (url.includes('/actas/by-mesa/')) return { data: structuredClone(s.serverJobs) };
    if (url.includes('/actas/ocr-job/')) return { data: structuredClone(s.serverJobs.find(x => url.endsWith(x.id))) };
    if (url.includes('/progreso')) return { data: { elecciones: [], progreso: { reportadas: 0, total: 1, porcentaje: 0 } } };
    if (url.includes('/validar/')) return { data: { valido: true, alertas: [] } };
    return { data: { data: [] } };
  };
  s.post = async (url, body) => {
    s.calls.push({ method: 'POST', url });
    if (url.endsWith('/confirmar')) { s.submissions.push(structuredClone(body)); return { data: { confirmado: true } }; }
    if (url === '/testigos/sync') {
      const rows = JSON.parse(body.get('resultados'));
      s.submissions.push({ sync: rows });
      return { data: { aceptados: { resultados: rows.map(r => r.id), fotos: [] }, rechazados: { resultados: [], fotos: [] } } };
    }
    throw new Error('POST inesperado: ' + url);
  };
  document.body.innerHTML = '<div id="root"></div>';
  root = createRoot(document.getElementById('root'));
});
afterEach(async () => { await act(async () => root.unmount()); });
after(() => { db.closeDB(); dom.window.close(); });


test('QA1002 control: botón verde confirma el voto editado y lo deja sincronizado', async () => {
  await db.guardarOcrJob(job(), { synced: 1 });
  await mountForm();
  await fill(document.querySelector('input[type="number"]'), '13');
  await click(button('Aceptar y confirmar votos'));
  const rows = await db.getResultadosByMesa(props.mesaId);
  assert.equal(rows[0].votos, 13);
  assert.equal(rows[0].origen, 'corregido');
  assert.equal(rows[0].synced, 1);
});
test('QA1002 regresión: Guardar de la barra no sustituye un borrador editado por cero manual', async () => {
  const s = globalThis.__cuo997;
  s.online = false;
  await db.guardarOcrJob(job(), { synced: 1 });
  await mountForm();
  const input = document.querySelector('input[type="number"]');
  assert.equal(input.value, '12');
  await fill(input, '13');
  assert.equal(input.value, '13', 'control: la edición es visible');
  const footer = document.querySelector('[data-testid="btn-guardar-barra"]');
  assert.ok(footer);
  if (footer.disabled) return;
  await click(footer);
  const rows = await db.getResultadosByMesa(props.mesaId);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].votos, 13, 'El botón fijo Guardar persistió un voto distinto al borrador visible');
  assert.equal(rows[0].origen, 'corregido');
});
test('QA1002 control: barra de guardado manual persiste el conteo visible', async () => {
  globalThis.__cuo997.online = false;
  await mountForm();
  await click(document.querySelector('[aria-label="Aumentar votos para CANDIDATO SINTÉTICO A"]'));
  assert.equal(document.querySelector('[data-testid="total-votos-barra"]').textContent, '1');
  await click(document.querySelector('[data-testid="btn-guardar-barra"]'));
  const rows = await db.getResultadosByMesa(props.mesaId);
  assert.equal(rows[0].votos, 1);
  assert.equal(rows[0].origen, 'manual');
  assert.equal(rows[0].synced, 0);
});
test('QA1002 regresión: no conservar cola manual oculta al confirmar el borrador después de Guardar fijo', async () => {
  const s = globalThis.__cuo997;
  s.online = false;
  await db.guardarOcrJob(job(), { synced: 1 });
  await mountForm();
  const footer = document.querySelector('[data-testid="btn-guardar-barra"]');
  if (footer.disabled) return;
  await click(footer);
  s.online = true;
  await click(button('Aceptar y confirmar votos'));
  assert.equal(s.submissions[0].resultados['candidato-sintetico-a'], 12);
  await act(async () => { await sync.sincronizar(); });
  assert.equal(s.calls.filter(c => c.url === '/testigos/sync').length, 0, 'El flujo confirmó 12 pero después envió la cola manual oculta con 0');
});
test('QA1002 regresión: confirmar borrador OCR limpia capturas manuales previas no sincronizadas de la misma mesa y elección', async () => {
  const s = globalThis.__cuo997;
  await db.guardarOcrJob(job(), { synced: 1 });
  await mountForm();

  await db.guardarResultadosYFoto([{
    id: `${props.mesaId}_${props.elecciones[0].id}_previo_manual`,
    mesaId: props.mesaId,
    testigoId: props.testigoId,
    eleccionId: props.elecciones[0].id,
    candidato: 'CANDIDATO SINTÉTICO A',
    partido: 'AGRUPACIÓN SINTÉTICA',
    candidatoId: 'candidato-sintetico-a',
    tipoVoto: 'CANDIDATO',
    votos: 0,
    votosBlanco: 0,
    votosNulos: 0,
    votosNoMarcados: 0,
    totalVotosMesa: 0,
    capturedAt: '2026-10-28T00:00:00.000Z',
    deviceId: props.deviceId,
    origen: 'manual',
    synced: 0,
    syncAttempts: 0,
  }]);
  const pendientesAntes = await db.getResultadosPendientes();
  assert.equal(pendientesAntes.length, 1, 'control: había un resultado manual pendiente');

  await click(button('Aceptar y confirmar votos'));

  const pendientesDespues = await db.getResultadosPendientes();
  assert.equal(pendientesDespues.length, 0, 'No debe quedar ningún resultado manual con synced: 0 tras confirmar el borrador');

  await act(async () => { await sync.sincronizar(); });
  assert.equal(s.calls.filter(c => c.url === '/testigos/sync').length, 0, 'No debe dispararse sync con resultados manuales obsoletos');

  const rows = await db.getResultadosByMesa(props.mesaId);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].votos, 12);
  assert.equal(rows[0].synced, 1);
});
test('QA1002 control: reconexión descubre y sigue un trabajo del servidor', async () => {
  const s = globalThis.__cuo997;
  s.online = false;
  function HookProbe() {
    s.hook = useOcrJobsE14({ ...props, eleccionId: props.elecciones[0].id, campanaId: 'campana-sintetica-997' });
    return React.createElement('p', null, s.hook.jobs[0]?.estado || 'SIN JOB');
  }
  await mount(React.createElement(HookProbe));
  assert.equal(s.hook.jobs.length, 0);
  s.online = true;
  s.serverJobs = [job({ estado: 'PROCESANDO', resultadoOcr: undefined })];
  await act(async () => { window.dispatchEvent(new Event('online')); });
  await flush(100);
  assert.equal(s.hook.jobs[0].estado, 'PROCESANDO');
  s.serverJobs = [job()];
  await flush(3300);
  assert.equal(s.hook.jobs[0].estado, 'COMPLETADO');
});
test('QA1002 regresión: un envío ERROR anterior no debe ocultar el borrador disponible de la misma elección', async () => {
  await db.guardarOcrJob(job({ id: 'a-job-sintetico-anterior', serverJobId: 'a-job-sintetico-anterior', estado: 'ERROR', resultadoOcr: undefined,
    capturedAt: '2026-10-27T00:00:00.000Z' }), { synced: 1 });
  await db.guardarOcrJob(job({ id: 'z-job-sintetico-nuevo', serverJobId: 'z-job-sintetico-nuevo', capturedAt: '2026-10-28T00:00:00.000Z' }), { synced: 1 });
  await mountForm();
  assert.ok(buttons().some(b => b.textContent.includes('Aceptar y confirmar votos')), 'Hay un job COMPLETADO de la elección actual, pero find() eligió el ERROR anterior y ocultó el borrador');
});
