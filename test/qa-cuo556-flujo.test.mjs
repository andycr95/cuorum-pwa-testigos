import test, { beforeEach, afterEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks, createRequire } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

// Formulario, hooks, servicios y parser reales. Solo cámara, API e IndexedDB
// se sustituyen por límites sintéticos; no se modifica producto en disco.
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {url:'http://localhost/qa-sintetica'});
for (const k of ['window','document','navigator','HTMLElement','HTMLInputElement','HTMLTextAreaElement','Event','MouseEvent','CustomEvent','localStorage','sessionStorage']) {
  Object.defineProperty(globalThis,k,{value:dom.window[k],writable:true,configurable:true});
}
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
// El lienzo es otra frontera de hardware; el control de cierre no necesita trazo.
dom.window.HTMLCanvasElement.prototype.getContext=()=>({scale(){},clearRect(){},beginPath(){},moveTo(){},lineTo(){},stroke(){}});
Object.defineProperty(navigator,'onLine',{get:()=>globalThis.__qa556?.online ?? true,configurable:true});
window.confirm=()=>true;
const reactUrl = new URL('../node_modules/react/index.js', import.meta.url).href;
const mocks = {
 '/src/services/api.ts': `export const api={get:(url,options)=>globalThis.__qa556.get(url,options),post:(url,body,options)=>globalThis.__qa556.post(url,body,options),patch:async()=>({data:{}})};`,
 '/src/db/indexeddb.ts': `
  const s=()=>globalThis.__qa556;
  const pending=n=>s()[n].filter(x=>x.synced===0);
  const mark=(n,ids)=>ids.forEach(id=>{const row=s()[n].find(x=>x.id===id);if(row)row.synced=1;});
  const reject=(n,items)=>items.forEach(r=>{const row=s()[n].find(x=>x.id===r.id);if(row){row.synced=0;row.syncAttempts++;row.lastSyncError=r.error;}});
  export const getResultadosByMesa=async id=>s().resultados.filter(x=>x.mesaId===id);
  export const getFotosByMesa=async id=>s().fotos.filter(x=>x.mesaId===id);
  export const getPendientes=async()=>({resultados:pending('resultados'),fotos:pending('fotos')});
  export const guardarResultadosYFoto=async(rs,fs=[])=>{s().resultados.push(...rs.map(r=>({...r,synced:0,syncAttempts:0})));s().fotos.push(...fs.map(f=>({...f,synced:0,syncAttempts:0})));};
  export const marcarSincronizados=async(r,f)=>{mark('resultados',r);mark('fotos',f);};
  export const marcarRechazados=async(r,f=[])=>{reject('resultados',r);reject('fotos',f);};
  export const logSync=async(...args)=>s().logs.push(args);
  export const getIncidenciasPendientes=async()=>[];
  export const getIncidenciasByMesa=async()=>[];
  export const guardarIncidencia=async()=>{};
  export const marcarIncidenciasSincronizadas=async()=>{};
  export const marcarIncidenciasError=async()=>{};
  export const getJornadasPendientes=async()=>[];
  export const saveJornada=async()=>{};
  export const guardarOcrJob=async job=>s().jobs.push({...job,synced:0,syncAttempts:0});
  export const getOcrJobsByMesa=async id=>s().jobs.filter(x=>x.mesaId===id);
  export const getOcrJobsPendientes=async()=>s().jobs.filter(x=>x.synced===0);
  export const marcarOcrJobSyncado=async(id,estado,serverJobId)=>Object.assign(s().jobs.find(j=>j.id===id),{synced:1,estado,serverJobId});
  export const updateOcrJobEstado=async(id,estado,data={})=>Object.assign(s().jobs.find(j=>j.id===id),{estado,...data});
 `,
 '/src/components/camera/CapturaMultipleE14.tsx': `import React from ${JSON.stringify(reactUrl)};export const CapturaMultipleE14=({onFotosListas})=>React.createElement('button',{'data-testid':'qa-capturar',onClick:()=>onFotosListas([{orden:1,blob:new Blob(['FOTO EXCLUSIVAMENTE SINTÉTICA'],{type:'image/jpeg'})}])},'Capturar evidencia sintética');`,
};
registerHooks({
 resolve(specifier,context,nextResolve){
  if(context.parentURL?.includes('/src/') && specifier.startsWith('.')){
   const base=new URL(specifier,context.parentURL);
   const candidates=[base.href,base.href+'.ts',base.href+'.tsx',base.href+'/index.ts'];
   for(const url of candidates){
    const pathname=new URL(url).pathname;
    const mock=Object.keys(mocks).find(k=>pathname.endsWith(k));
    if(mock)return {url:'data:text/javascript,'+encodeURIComponent(mocks[mock]),shortCircuit:true};
    if(existsSync(fileURLToPath(url)))return {url,shortCircuit:true};
   }
  }
  return nextResolve(specifier,context);
 },
 load(url,context,nextLoad){
  if(url.startsWith('file:') && /\.tsx?$/.test(url))return {format:'module',source:ts.transpileModule(readFileSync(fileURLToPath(url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,shortCircuit:true};
  return nextLoad(url,context);
 }
});
const React=await import('react');
const {act}=React;
const {createRoot}=await import('react-dom/client');
const {FormularioMesaMultiple}=await import('../src/components/formulario/FormularioMesaMultiple.tsx');
const sync=await import('../src/services/syncService.ts');
const props={mesaId:'cm000000000000000000000001',mesaNumero:1,totalSufragantes:100,testigoId:'ct000000000000000000000001',deviceId:'dispositivo-sintetico-qa556',elecciones:[{id:'ce000000000000000000000001',nombre:'ELECCIÓN SINTÉTICA',tipoEleccion:'ALCALDIA',tipoCargo:'UNINOMINAL',votoPreferente:false,candidatos:[{id:'cc000000000000000000000001',nombre:'CANDIDATO SINTÉTICO',partido:'PARTIDO SINTÉTICO'}]}]};
let root;
const buttons=()=>[...document.querySelectorAll('button')];
const button=text=>{const b=buttons().find(x=>x.textContent.includes(text));assert.ok(b,'Botón esperado: '+text);return b;};
const click=async el=>act(async()=>{el.dispatchEvent(new MouseEvent('click',{bubbles:true}));await new Promise(r=>setTimeout(r,0));});
const fill=async(el,value)=>act(async()=>{Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(el,value);el.dispatchEvent(new Event('input',{bubbles:true}));});
const emit=tag=>{const s=globalThis.__qa556;console.log(tag,JSON.stringify({calls:s.calls,jobs:s.jobs.map(({id,estado,synced})=>({id,estado,synced})),fotos:s.fotos.map(({id,synced})=>({id,synced})),body:document.body.textContent.replace(/\s+/g,' ').slice(-650)}));};
beforeEach(async()=>{
 localStorage.clear();sessionStorage.clear();localStorage.setItem('cuorum_testigo_campana','campana-sintetica-qa556');sync.clearLastSyncTime();sync.clearLastSyncError();
 const s=globalThis.__qa556={online:true,resultados:[],fotos:[],jobs:[],calls:[],logs:[],expire:0,s3fail:false,confirmFail:false,signs:0};
 s.get=async(url)=>{
  s.calls.push({method:'GET',url});
  if(url.includes('/actas/by-mesa/'))return {data:[]};
  if(url.includes('/progreso'))return {data:{elecciones:[{...props.elecciones[0],reportado:s.resultados.length>0,totalVotos:0}],progreso:{reportadas:s.resultados.length?1:0,total:1,porcentaje:s.resultados.length?100:0}}};
  if(url.includes('/validar/'))return {data:{valido:true,alertas:[]}};
  return {data:{data:[],ok:true}};
 };
 s.post=async(url,body)=>{
  const multipart=body instanceof FormData;
  const files=multipart?[...body.entries()].filter(([,v])=>v instanceof Blob).map(([k,v])=>({field:k,size:v.size})):[];
  s.calls.push({method:'POST',url,files,body:multipart?undefined:body});
  if(url==='/testigos/actas/ocr-job')throw Object.assign(new Error('OCR sintético no disponible'),{response:{status:503,data:{error:'OCR sintético no disponible'}}});
  if(url==='/testigos/sync')return {data:{aceptados:{resultados:JSON.parse(body.get('resultados')).map(r=>r.id),fotos:[]},rechazados:{resultados:[],fotos:[]}}};
  if(url.endsWith('/firmar'))return {data:{fotos:[{id:'foto-servidor-'+(++s.signs),llave:'campanas/sintetica/e14.jpg',post:{url:'https://s3.example.invalid',fields:{key:'foto-sintetica.jpg'}},expiresIn:300}]}};
  if(url.endsWith('/subida')){if(s.confirmFail)throw new Error('Acuse sintético perdido');return {data:{estado:'SUBIDA'}};}
  if(url.endsWith('/cerrar'))return {data:{estado:'CERRADA',codigoVerificacion:'SINTETICO'}};
  throw new Error('Endpoint inesperado '+url);
 };
 globalThis.fetch=async(url,options)=>{s.calls.push({method:'S3_POST',url,files:[...options.body.keys()]});if(s.s3fail)throw new TypeError('Red sintética sin conexión');if(s.expire-->0)return {ok:false,status:403,text:async()=>'<Error><Code>ExpiredToken</Code></Error>'};return {ok:true,status:204,text:async()=>''};};
 document.body.innerHTML='<div id="root"></div>';
 root=createRoot(document.getElementById('root'));
 await act(async()=>{root.render(React.createElement(FormularioMesaMultiple,props));await new Promise(r=>setTimeout(r,0));});
});
afterEach(async()=>{await act(async()=>root.unmount());});
after(()=>dom.window.close());

test('control: sin foto ni motivo bloquea Cerrar Acta de Mesa',async()=>{
 await click(document.getElementById('tab-cierre'));
 assert.equal(button('Cerrar Acta de Mesa').disabled,true);
 await fill(document.querySelector('textarea[placeholder*="Explica detalladamente"]'),'123456789');
 assert.equal(button('Cerrar Acta de Mesa').disabled,true);
 await fill(document.querySelector('textarea[placeholder*="Explica detalladamente"]'),'Dispositivo sintético sin cámara');
 assert.equal(button('Cerrar Acta de Mesa').disabled,false);
});

test('captura real: la evidencia debe ir a S3 sin reenviar blobs a la API',async()=>{
 await click(document.querySelector('[data-testid="qa-capturar"]'));
 await act(async()=>{await new Promise(r=>setTimeout(r,140));});
 emit('CAPTURA_OBSERVADA');
 assert.equal(globalThis.__qa556.jobs.length+globalThis.__qa556.fotos.length,1,'captura persistida sintéticamente');
 const uploads=globalThis.__qa556.calls.filter(c=>c.method==='POST' && c.files?.length);
 assert.equal(uploads.length,0,'la foto vuelve a pasar por la API mediante el hook de OCR');
});

test('cierre sin cámara: Cerrar y firmar acta debe enviar sinFotoMotivo y esperar acuse',async()=>{
 await click(document.getElementById('tab-contar'));
 await click(document.querySelector('[aria-label="Aumentar votos para CANDIDATO SINTÉTICO"]'));
 const guardar=buttons().find(b=>/^Guardar/.test(b.textContent.trim()));
 assert.ok(guardar,document.body.textContent);
 await click(guardar);
 await click(document.getElementById('tab-cierre'));
 const motivo='Dispositivo sintético sin cámara';
 await fill(document.querySelector('textarea[placeholder*="Explica detalladamente"]'),motivo);
 await click(button('Cerrar y firmar acta'));
 emit('CIERRE_OBSERVADO');
 const cierre=globalThis.__qa556.calls.find(c=>c.url==='/testigos/jornada/cerrar');
 assert.ok(cierre,'la UI declara el acta cerrada sin llamar a la API ni registrar el seguimiento');
 assert.equal(cierre.body.sinFotoMotivo,motivo);
});

test('control: el wizard sí transmite el motivo y muestra el acuse',async()=>{
 await click(document.getElementById('tab-contar'));
 await click(document.querySelector('[aria-label="Aumentar votos para CANDIDATO SINTÉTICO"]'));
 await click(document.querySelector('[data-testid="btn-guardar-resultados"]'));
 await click(document.getElementById('tab-cierre'));
 const motivo='Dispositivo sintético sin cámara';
 await fill(document.querySelector('textarea[placeholder*="Explica detalladamente"]'),motivo);
 await click(button('Cerrar Acta de Mesa'));
 await click(button('Continuar'));
 await click(button('Continuar'));
 await click(button('Confirmar cierre'));
 assert.equal(globalThis.__qa556.calls.find(c=>c.url==='/testigos/jornada/cerrar')?.body.sinFotoMotivo,motivo);
 assert.match(document.body.textContent,/SINTETICO/);
});

const photo=()=>({id:'foto-sintetica-local',mesaId:props.mesaId,testigoId:props.testigoId,deviceId:props.deviceId,capturedAt:'2026-10-20T00:00:00.000Z',synced:0,syncAttempts:0,blob:new Blob(['FOTO SINTÉTICA'],{type:'image/jpeg'})});
test('servicio real: sube, confirma hash y solo entonces sincroniza',async()=>{
 const s=globalThis.__qa556;s.fotos=[photo()];
 const result=await sync.sincronizar();
 assert.equal(result.success,true);assert.equal(s.fotos[0].synced,1);
 const acuse=s.calls.find(c=>c.url.endsWith('/subida'));
 assert.match(acuse.body.hash,/^[a-f0-9]{64}$/);assert.equal(s.calls.filter(c=>c.method==='S3_POST').length,1);
});
test('servicio real: error de red deja pendiente y siguiente sync recupera',async()=>{
 const s=globalThis.__qa556;s.fotos=[photo()];s.s3fail=true;
 assert.equal((await sync.sincronizar()).success,false);assert.equal(s.fotos[0].synced,0);
 s.s3fail=false;assert.equal((await sync.sincronizar()).success,true);assert.equal(s.fotos[0].synced,1);
});
test('servicio real: firma vencida pide nueva firma y confirma segunda foto',async()=>{
 const s=globalThis.__qa556;s.fotos=[photo()];s.expire=1;
 assert.equal((await sync.sincronizar()).success,true);assert.equal(s.signs,2);
 assert.ok(s.calls.find(c=>c.url==='/testigos/e14/fotos/foto-servidor-2/subida'));
});
test('servicio real: acuse perdido no marca la foto como enviada',async()=>{
 const s=globalThis.__qa556;s.fotos=[photo()];s.confirmFail=true;
 assert.equal((await sync.sincronizar()).success,false);assert.equal(s.fotos[0].synced,0);
});
