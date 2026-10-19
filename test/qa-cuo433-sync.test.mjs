import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

// Solo cambia la resolución en memoria. HTTP e IndexedDB son dobles sintéticos.
const mockSources = {
  './api': `export const api = {post: async (url) => ({data: globalThis.__qaSync.responses[url]}), get: async () => ({data:{ok:true}})};`,
  './jornadaService': `export const jornadaService = {checkin: async () => {}, apertura: async () => {}};`,
  '../db/indexeddb': `
    const state = () => globalThis.__qaSync;
    const pending = (name) => state()[name].filter(x => x.synced === 0);
    const mark = (name, ids) => { for (const id of ids) {const x=state()[name].find(x=>x.id===id);if(x)x.synced=1;} };
    const reject = (name, items) => { for (const r of items) {const x=state()[name].find(x=>x.id===r.id);if(x){x.synced=0;x.lastSyncError=r.error;x.syncAttempts++;}} };
    export const getPendientes = async () => ({resultados:pending('resultados'),fotos:pending('fotos')});
    export const getIncidenciasPendientes = async () => pending('incidencias');
    export const getJornadasPendientes = async () => [];
    export const saveJornada = async () => {};
    export const marcarSincronizados = async (r,f) => {mark('resultados',r);mark('fotos',f);};
    export const marcarRechazados = async (r,f=[]) => {reject('resultados',r);reject('fotos',f);};
    export const marcarIncidenciasSincronizadas = async ids => mark('incidencias',ids);
    export const marcarIncidenciasError = async errors => reject('incidencias',errors);
    export const logSync = async (...args) => state().logs.push(args);
  `,
};
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (context.parentURL?.endsWith('/src/services/syncService.ts')) {
      if (mockSources[specifier]) return {url:'data:text/javascript,'+encodeURIComponent(mockSources[specifier]),shortCircuit:true};
      if (specifier === './syncResponseLogic') return {url:new URL('./syncResponseLogic.ts',context.parentURL).href,shortCircuit:true};
    }
    return nextResolve(specifier,context);
  },
  load(url, context, nextLoad) {
    if (url.startsWith('file:') && url.endsWith('.ts')) {
      const source = process.env.QA_SYNC_PARSER_OVERRIDE && url.endsWith('/src/services/syncResponseLogic.ts') ? readFileSync(process.env.QA_SYNC_PARSER_OVERRIDE,'utf8') : readFileSync(fileURLToPath(url),'utf8');
      return {format:'module',source:ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText,shortCircuit:true};
    }
    return nextLoad(url,context);
  },
});
const storage = () => {const m=new Map();return {getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k),clear:()=>m.clear()};};
globalThis.localStorage=storage();globalThis.sessionStorage=storage();
globalThis.window=new EventTarget();
const {procesarRespuestaSync,sincronizar,getLastSyncTime,getLastSyncError,clearLastSyncTime,clearLastSyncError}=await import('../src/services/syncService.ts');
const {resolverEstadoEnvio}=await import('../src/components/sync/estadoEnvioLogic.ts');
const nested = () => ({
  aceptados:{resultados:['r-ok'],fotos:['f-ok']},
  rechazados:{resultados:[{id:'r-rechazado',error:'No se pudo registrar el resultado. Reintenta el envío.'}],fotos:[{id:'f-rechazada',error:'No se pudo procesar la foto E-14. Revisa la imagen y reintenta el envío.'}]},
  resultados:[{id:'servidor-r-ok'}],fotos:[{id:'servidor-f-ok'}],alertas:[],
  errores:['No se pudo registrar el resultado. Reintenta el envío.','No se pudo procesar la foto E-14. Revisa la imagen y reintenta el envío.'],
  resumen:{resultadosSincronizados:1,resultadosFallidos:1,fotosSincronizadas:1,fotosFallidas:1,alertasFraude:0},
});
const item=(id,photo=false)=>({id,synced:0,syncAttempts:0,mesaId:'mesa-sintetica',testigoId:'testigo-sintetico',deviceId:'dispositivo-sintetico',capturedAt:'2026-10-19T00:00:00.000Z',...(photo?{blob:new Blob(['evidencia sintetica'],{type:'image/jpeg'})}:{})});
beforeEach(()=>{
  localStorage.clear();sessionStorage.clear();clearLastSyncTime();clearLastSyncError();
  globalThis.__qaSync={resultados:[],fotos:[],incidencias:[],logs:[],responses:{}};
});
test('Contrato CUO-428: un resultado rechazado no es aceptado',()=>{
  const actual=procesarRespuestaSync([{id:'r-ok'},{id:'r-rechazado'}],nested(),'resultado');
  assert.deepEqual(actual.acceptedIds,['r-ok']);
  assert.equal(actual.rejectedItems[0]?.id,'r-rechazado');
});
test('Contrato CUO-428: una foto rechazada no es aceptada',()=>{
  const actual=procesarRespuestaSync([{id:'f-ok'},{id:'f-rechazada'}],nested(),'foto');
  assert.deepEqual(actual.acceptedIds,['f-ok']);
  assert.equal(actual.rejectedItems[0]?.id,'f-rechazada');
});
test('Respuesta ausente no confirma IDs',()=>{
  assert.deepEqual(procesarRespuestaSync([{id:'r-rechazado'}],null,'resultado').acceptedIds,[]);
});
test('Contrato anterior: errores y resultadosFallidos no confirman IDs',()=>{
  const actual=procesarRespuestaSync([{id:'r-rechazado'}],{errores:['No se pudo registrar el resultado'],resumen:{resultadosFallidos:1}},'resultado');
  assert.deepEqual(actual.acceptedIds,[]);
});
test('Contrato anterior: incidenciasFallidas no confirma incidencias',()=>{
  const actual=procesarRespuestaSync([{id:'i-rechazada'}],{incidenciasSincronizadas:0,incidenciasFallidas:1,errores:['No se pudo registrar la incidencia']},'incidencia');
  assert.deepEqual(actual.acceptedIds,[]);
});
test('Control positivo: el contrato plano de incidencias conserva el ID aceptado',()=>{
  const actual=procesarRespuestaSync([{id:'i-ok'},{id:'i-rechazada'}],{aceptados:['i-ok'],rechazados:[{id:'i-rechazada',error:'Error sintetico'}]},'incidencia');
  assert.deepEqual(actual.acceptedIds,['i-ok']);
  assert.equal(actual.rejectedItems[0].id,'i-rechazada');
});
test('Servicio real: acuses mixtos CUO-428 dejan rechazados pendientes y sin Enviado',async()=>{
  const s=globalThis.__qaSync;
  s.resultados=[item('r-ok'),item('r-rechazado')];s.fotos=[item('f-ok',true),item('f-rechazada',true)];
  s.responses['/testigos/sync']=nested();
  const result=await sincronizar();
  const pending=[...s.resultados,...s.fotos].filter(x=>x.synced===0).length;
  const banner=resolverEstadoEnvio({isOnline:true,pendingCount:pending,isSyncing:false,lastSyncTime:getLastSyncTime(),error:getLastSyncError()});
  console.log('QA_RESULTADO_REAL',JSON.stringify({result,rows:[...s.resultados,...s.fotos].map(({id,synced,lastSyncError})=>({id,synced,lastSyncError})),banner}));
  assert.equal(result.success,false,'el servidor rechazó dos elementos');
  assert.equal(s.resultados[1].synced,0);assert.equal(s.fotos[1].synced,0);
  assert.notEqual(banner.estado,'ENVIADO');assert.equal(getLastSyncTime(),null);
});
test('Servicio real: respuesta legacy con fallos no produce éxito',async()=>{
  const s=globalThis.__qaSync;s.resultados=[item('r-rechazado')];
  s.responses['/testigos/sync']={resultados:[],fotos:[],errores:['Error sintetico'],resumen:{resultadosSincronizados:0,resultadosFallidos:1,fotosSincronizadas:0,fotosFallidas:0}};
  const result=await sincronizar();
  assert.equal(result.success,false);assert.equal(s.resultados[0].synced,0);
});
test('Control positivo: el servicio real sí persiste un rechazo plano de incidencias',async()=>{
  const s=globalThis.__qaSync;s.incidencias=[item('i-ok'),item('i-rechazada')];
  s.responses['/testigos/incidencias']={aceptados:['i-ok'],rechazados:[{id:'i-rechazada',error:'Error sintetico'}]};
  const result=await sincronizar();
  assert.equal(result.success,false);assert.equal(s.incidencias[0].synced,1);assert.equal(s.incidencias[1].synced,0);assert.equal(s.incidencias[1].lastSyncError,'Error sintetico');
});

const observar = (result) => {
  const s=globalThis.__qaSync;
  const rows=[...s.resultados,...s.fotos,...s.incidencias];
  const banner=resolverEstadoEnvio({isOnline:true,pendingCount:rows.filter(x=>x.synced===0).length,isSyncing:false,lastSyncTime:getLastSyncTime(),error:getLastSyncError()});
  console.log('CUO433_OBSERVADO',JSON.stringify({result,rows:rows.map(({id,synced,lastSyncError})=>({id,synced,lastSyncError})),lastSyncTime:getLastSyncTime(),banner}));
  return banner;
};
test('CUO-433: un contador legacy parcial no confirma el resto del lote',async()=>{
  const s=globalThis.__qaSync;s.resultados=[item('r-uno'),item('r-sin-acuse')];
  s.responses['/testigos/sync']={resultados:[{id:'id-servidor-no-correlacionable'}],resumen:{resultadosSincronizados:1}};
  const result=await sincronizar(); const banner=observar(result);
  assert.equal(s.resultados[1].synced,0,'el segundo resultado no tiene acuse');
  assert.equal(result.success,false);assert.notEqual(banner.estado,'ENVIADO');assert.equal(getLastSyncTime(),null);
});
test('CUO-433: rechazar otro ID no acepta el ID enviado sin acuse',async()=>{
  const s=globalThis.__qaSync;s.resultados=[item('r-sin-acuse')];
  s.responses['/testigos/sync']={rechazados:{resultados:[{id:'r-ajeno-al-lote',error:'Error sintético'}]}};
  const result=await sincronizar();const banner=observar(result);
  assert.equal(s.resultados[0].synced,0,'no hay aceptados ni acuse del resultado local');
  assert.equal(result.success,false);assert.notEqual(banner.estado,'ENVIADO');assert.equal(getLastSyncTime(),null);
});
test('CUO-433: un rechazo conocido no confirma los demás IDs sin aceptación explícita',async()=>{
  const s=globalThis.__qaSync;s.resultados=[item('r-rechazado'),item('r-sin-acuse')];
  s.responses['/testigos/sync']={rechazados:{resultados:[{id:'r-rechazado',error:'Error sintético'}]}};
  const result=await sincronizar();observar(result);
  assert.equal(s.resultados[0].synced,0);
  assert.equal(s.resultados[1].synced,0,'la ausencia en rechazados no confirma el resultado');
});
