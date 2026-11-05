import test, { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: 'http://localhost/cuo-2015',
});
for (const k of [
  'window',
  'document',
  'navigator',
  'HTMLElement',
  'HTMLInputElement',
  'HTMLTextAreaElement',
  'Event',
  'MouseEvent',
  'CustomEvent',
  'localStorage',
  'sessionStorage',
]) {
  Object.defineProperty(globalThis, k, {
    value: dom.window[k],
    writable: true,
    configurable: true,
  });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
if (!globalThis.URL.createObjectURL) {
  globalThis.URL.createObjectURL = () => 'blob:http://localhost/sintetica';
}
if (!globalThis.URL.revokeObjectURL) {
  globalThis.URL.revokeObjectURL = () => {};
}

const mockSources = {
  '/src/services/api.ts': `
    export const api = {
      post: (url, body, options) => globalThis.__cuo2015.post(url, body, options),
      get: (url, options) => globalThis.__cuo2015.get(url, options),
    };
  `,
  '/src/services/jornadaService.ts': `
    export const jornadaService = { checkin: async () => {}, apertura: async () => {} };
  `,
  '/src/db/indexeddb.ts': `
    const st = () => globalThis.__cuo2015;
    export const getPendientes = async () => ({
      resultados: st().resultados.filter(x => x.synced === 0),
      fotos: st().fotos.filter(x => x.synced === 0),
    });
    export const getIncidenciasPendientes = async () => st().incidencias.filter(x => x.synced === 0);
    export const getIncidenciasByMesa = async (mesaId) => st().incidencias.filter(x => x.mesaId === mesaId);
    export const guardarIncidencia = async (inc) => {
      st().incidencias.push({ ...inc, synced: 0, syncAttempts: 0 });
    };
    export const getJornadasPendientes = async () => [];
    export const saveJornada = async () => {};
    export const marcarSincronizados = async (rIds, fIds) => {
      for (const id of rIds) { const r = st().resultados.find(x => x.id === id); if (r) r.synced = 1; }
      for (const id of fIds) { const f = st().fotos.find(x => x.id === id); if (f) f.synced = 1; }
    };
    export const marcarRechazados = async () => {};
    export const marcarIncidenciasSincronizadas = async (ids) => {
      for (const id of ids) {
        const item = st().incidencias.find(x => x.id === id);
        if (item) item.synced = 1;
      }
    };
    export const marcarIncidenciasError = async (errores) => {
      for (const { id, error } of errores) {
        const item = st().incidencias.find(x => x.id === id);
        if (item) {
          item.synced = 0;
          item.syncAttempts = (item.syncAttempts || 0) + 1;
          item.lastSyncError = error;
        }
      }
    };
    export const logSync = async (...args) => st().logs.push(args);
  `,
};

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (context.parentURL?.includes('/src/') && specifier.startsWith('.')) {
      const base = new URL(specifier, context.parentURL);
      const candidates = [base.href, base.href + '.ts', base.href + '.tsx', base.href + '/index.ts'];
      for (const url of candidates) {
        const pathname = new URL(url).pathname;
        const mockKey = Object.keys(mockSources).find((k) => pathname.endsWith(k));
        if (mockKey) {
          return {
            url: 'data:text/javascript,' + encodeURIComponent(mockSources[mockKey]),
            shortCircuit: true,
          };
        }
        if (existsSync(fileURLToPath(url))) {
          return { url, shortCircuit: true };
        }
      }
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.startsWith('file:') && /\.tsx?$/.test(url)) {
      const source = readFileSync(fileURLToPath(url), 'utf8');
      return {
        format: 'module',
        source: ts.transpileModule(source, {
          compilerOptions: {
            module: ts.ModuleKind.ESNext,
            target: ts.ScriptTarget.ES2022,
            jsx: ts.JsxEmit.ReactJSX,
          },
        }).outputText,
        shortCircuit: true,
      };
    }
    return nextLoad(url, context);
  },
});

const React = await import('react');
const { act } = React;
const { createRoot } = await import('react-dom/client');
const {
  comprimirFotoIncidencia,
  partirLotesIncidencias,
  dividirLoteAnte413,
  extraerRetryAfterMs,
  calcularBackoffSyncMs,
  MAX_FOTO_INCIDENCIA_BYTES,
  MAX_FOTOS_LOTE_INCIDENCIAS,
  MAX_BYTES_LOTE_INCIDENCIAS,
  sincronizar,
  getBackoffState,
  resetBackoffState,
  clearLastSyncTime,
  clearLastSyncError,
} = await import('../src/services/syncService.ts');
const { PanelIncidencias } = await import('../src/components/incidencias/PanelIncidencias.tsx');

function crearIncidenciaSintetica(idx, bytesFoto = 150 * 1024) {
  return {
    id: `inc_sintetica_${idx}`,
    mesaId: 'mesa_sintetica_1',
    testigoId: 'testigo_sintetico_1',
    tipo: 'MATERIALES_FALTANTES',
    descripcion: `Incidencia sintética de prueba número ${idx}`,
    fotoBlob: bytesFoto > 0 ? new Blob([new Uint8Array(bytesFoto)], { type: 'image/jpeg' }) : undefined,
    capturedAt: new Date(Date.UTC(2026, 10, 5, 12, 0, idx)).toISOString(),
    deviceId: 'dev_sintetico_1',
    synced: 0,
    syncAttempts: 0,
  };
}

describe('CUO-2015: Compresión de fotos de incidencias y partido en lotes de sincronización', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    clearLastSyncTime();
    clearLastSyncError();
    resetBackoffState();
    globalThis.__cuo2015 = {
      resultados: [],
      fotos: [],
      incidencias: [],
      logs: [],
      postCalls: [],
      get: async () => ({ data: { data: [] } }),
      post: async (url, formData) => {
        const incRaw = JSON.parse(formData.get('incidencias') || '[]');
        const fotosIds = JSON.parse(formData.get('fotosIncidenciasIds') || '[]');
        const archivos = formData.getAll('fotosIncidencias');
        const totalBytes = archivos.reduce((acc, f) => acc + (f?.size || 0), 0);
        globalThis.__cuo2015.postCalls.push({
          url,
          incidenciasCount: incRaw.length,
          fotosCount: archivos.length,
          fotosIds,
          totalBytes,
          ids: incRaw.map((i) => i.id),
        });
        return {
          data: {
            aceptados: incRaw.map((i) => i.id),
            rechazados: [],
          },
        };
      },
    };
  });

  describe('1. Compresión de foto de incidencia (< 200 KB, máx. 1200 px, JPEG progresivo)', () => {
    it('Redimensiona imagen de cámara (4000x3000, 5 MB) a máx. 1200 px, escala de grises y JPEG progresivo < 200 KB', async () => {
      const calidadesProbadas = [];
      const canvasesCreados = [];
      const pixelData = new Uint8ClampedArray([100, 150, 200, 255, 50, 100, 150, 255]);
      let putImageDataCount = 0;

      const blobCrudo5MB = new Blob([new Uint8Array(5 * 1024 * 1024)], { type: 'image/jpeg' });
      const blobComprimido = await comprimirFotoIncidencia(blobComprimidoInput(blobCrudo5MB), {
        createImageBitmapFn: async () => ({ width: 4000, height: 3000, close() {} }),
        createCanvasFn: (w, h) => {
          const c = {
            width: w,
            height: h,
            getContext: () => ({
              drawImage: () => {},
              getImageData: () => ({ data: pixelData }),
              putImageData: () => {
                putImageDataCount++;
              },
            }),
            toBlob: (cb, type, quality) => {
              calidadesProbadas.push({ type, quality });
              // Simular que calidades > 0.60 pesan > 200 KB y <= 0.60 pesan 145 KB
              const simulatedSize = quality > 0.6 ? 240 * 1024 : 145 * 1024;
              cb(new Blob([new Uint8Array(simulatedSize)], { type }));
            },
          };
          canvasesCreados.push(c);
          return c;
        },
      });

      assert.equal(canvasesCreados.length, 1);
      assert.equal(canvasesCreados[0].width, 1200, 'El ancho máximo debe ser 1200 px');
      assert.equal(canvasesCreados[0].height, 900, 'El alto debe mantener proporción (900 px)');
      assert.equal(putImageDataCount, 1, 'Debe convertir a escala de grises en canvas');
      assert.equal(pixelData[0], pixelData[1], 'R y G deben quedar iguales en escala de grises');
      assert.equal(pixelData[1], pixelData[2], 'G y B deben quedar iguales en escala de grises');
      assert.deepEqual(
        calidadesProbadas.map((x) => x.quality),
        [0.75, 0.7, 0.65, 0.6],
        'Debe reducir la calidad JPEG progresivamente de 0.75 en pasos de 0.05',
      );
      assert.ok(
        blobComprimido.size < MAX_FOTO_INCIDENCIA_BYTES,
        `La foto comprimida (${blobComprimido.size} B) debe pesar < 200 KB`,
      );
      assert.equal(blobComprimido.type, 'image/jpeg');
    });

    it('Aplica fallback al 60% de resolución si a calidad 0.15 aún supera 200 KB', async () => {
      const canvasesCreados = [];
      const blobResultado = await comprimirFotoIncidencia(
        { width: 2000, height: 1500 },
        {
          createCanvasFn: (w, h) => {
            const c = {
              width: w,
              height: h,
              getContext: () => ({ drawImage: () => {} }),
              toBlob: (cb, type) => {
                // En el canvas principal de 1200x900 siempre supera 200 KB; en el fallback 720x540 baja a 95 KB
                const size = c.width < 1200 ? 95 * 1024 : 250 * 1024;
                cb(new Blob([new Uint8Array(size)], { type }));
              },
            };
            canvasesCreados.push(c);
            return c;
          },
        },
      );

      assert.equal(canvasesCreados.length, 2, 'Debe crear el segundo canvas al 60% de resolución');
      assert.equal(canvasesCreados[0].width, 1200);
      assert.equal(canvasesCreados[1].width, 720);
      assert.equal(canvasesCreados[1].height, 540);
      assert.ok(blobResultado.size < MAX_FOTO_INCIDENCIA_BYTES);
    });

    it('PanelIncidencias (handleFoto) comprime una foto cruda de 6 MB a < 200 KB antes de guardarla en IndexedDB', async () => {
      document.body.innerHTML = '<div id="root"></div>';
      const root = createRoot(document.getElementById('root'));

      try {
        await act(async () => {
          root.render(
            React.createElement(PanelIncidencias, {
              mesaId: 'mesa_sintetica_1',
              testigoId: 'testigo_sintetico_1',
              deviceId: 'dev_sintetico_1',
              mesaNumero: 1,
            }),
          );
          await new Promise((r) => setTimeout(r, 10));
        });

        // Abrir el panel de incidencias
        const toggleBtn = document.querySelector('button');
        await act(async () => {
          toggleBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        // Ir a pestaña "+ Nueva novedad"
        const btnNueva = [...document.querySelectorAll('button')].find((b) =>
          b.textContent.includes('Nueva novedad'),
        );
        await act(async () => {
          btnNueva.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        // Seleccionar tipo "Materiales faltantes"
        const btnTipo = [...document.querySelectorAll('button')].find((b) =>
          b.textContent.includes('Materiales faltantes'),
        );
        await act(async () => {
          btnTipo.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        // Escribir descripción >= 10 caracteres
        const textarea = document.querySelector('textarea');
        await act(async () => {
          const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
          setter.call(textarea, 'Faltaron los sobres de claveros en la mesa 1.');
          textarea.dispatchEvent(new Event('input', { bubbles: true }));
        });

        // Adjuntar foto cruda sintética de 6 MB (6 * 1024 * 1024 bytes)
        const fileInput = document.querySelector('input[type="file"]');
        const fotoCruda6MB = new File([new Uint8Array(6 * 1024 * 1024)], 'camara_cruda.jpg', {
          type: 'image/jpeg',
        });
        Object.defineProperty(fileInput, 'files', {
          value: [fotoCruda6MB],
          configurable: true,
        });

        await act(async () => {
          fileInput.dispatchEvent(new Event('change', { bubbles: true }));
          await new Promise((r) => setTimeout(r, 20));
        });

        // Guardar la incidencia
        const btnGuardar = [...document.querySelectorAll('button')].find((b) =>
          b.textContent.includes('Registrar novedad'),
        );
        await act(async () => {
          btnGuardar.dispatchEvent(new MouseEvent('click', { bubbles: true }));
          await new Promise((r) => setTimeout(r, 20));
        });

        assert.equal(globalThis.__cuo2015.incidencias.length, 1, 'Debe haber guardado 1 incidencia');
        const guardada = globalThis.__cuo2015.incidencias[0];
        assert.ok(guardada.fotoBlob instanceof Blob, 'Debe tener fotoBlob');
        assert.ok(
          guardada.fotoBlob.size < MAX_FOTO_INCIDENCIA_BYTES,
          `La foto guardada debe pesar < 200 KB, pero pesó ${guardada.fotoBlob.size} B`,
        );
        assert.ok(guardada.fotoBlob.size > 0);
      } finally {
        await act(async () => root.unmount());
      }
    });
  });

  describe('2. Partido en lotes (máximo 10 fotos o 20 MB)', () => {
    it('Parte 30 incidencias con foto en 3 lotes de 10 fotos cada uno', () => {
      const treintena = Array.from({ length: 30 }, (_, i) => crearIncidenciaSintetica(i + 1, 150 * 1024));
      const lotes = partirLotesIncidencias(treintena);

      assert.equal(lotes.length, 3, '30 incidencias con foto deben partirse en 3 lotes');
      for (const lote of lotes) {
        const fotosCount = lote.filter((x) => x.fotoBlob).length;
        const bytesLote = lote.reduce((acc, x) => acc + (x.fotoBlob?.size || 0), 0);
        assert.equal(fotosCount, 10);
        assert.ok(fotosCount <= MAX_FOTOS_LOTE_INCIDENCIAS);
        assert.ok(bytesLote <= MAX_BYTES_LOTE_INCIDENCIAS);
      }
    });

    it('Parte por el tope de 20 MB cuando las fotos son grandes aunque sean menos de 10', () => {
      // 5 fotos de 6 MB cada una = 30 MB total -> Lote 1: 3 fotos (18 MB <= 20 MB), Lote 2: 2 fotos (12 MB <= 20 MB)
      const cincoGrandes = Array.from({ length: 5 }, (_, i) =>
        crearIncidenciaSintetica(i + 1, 6 * 1024 * 1024),
      );
      const lotes = partirLotesIncidencias(cincoGrandes);

      assert.equal(lotes.length, 2, '5 fotos de 6 MB deben partirse en 2 lotes por el tope de 20 MB');
      assert.equal(lotes[0].length, 3, 'El primer lote lleva 3 fotos (18 MB)');
      assert.equal(lotes[1].length, 2, 'El segundo lote lleva 2 fotos (12 MB)');
      for (const lote of lotes) {
        const bytes = lote.reduce((acc, x) => acc + (x.fotoBlob?.size || 0), 0);
        assert.ok(bytes <= MAX_BYTES_LOTE_INCIDENCIAS, `Lote de ${bytes} B no debe superar 20 MB`);
      }
    });

    it('dividirLoteAnte413 parte un lote a la mitad y devuelve null para lotes de 1 elemento', () => {
      const lote10 = Array.from({ length: 10 }, (_, i) => ({ id: `inc_${i}` }));
      const partes = dividirLoteAnte413(lote10);
      assert.ok(partes);
      assert.equal(partes[0].length, 5);
      assert.equal(partes[1].length, 5);

      const lote1 = [{ id: 'inc_unico' }];
      assert.equal(dividirLoteAnte413(lote1), null);
    });
  });

  describe('3. Sincronización de 30 incidencias, reintento ante 413 y backoff con Retry-After en 429/503', () => {
    it('Criterio de aceptación: 30 incidencias con foto pendientes se sincronizan sin un 413', async () => {
      globalThis.__cuo2015.incidencias = Array.from({ length: 30 }, (_, i) =>
        crearIncidenciaSintetica(i + 1, 160 * 1024),
      );

      let errores413 = 0;
      globalThis.__cuo2015.post = async (url, formData) => {
        const incRaw = JSON.parse(formData.get('incidencias') || '[]');
        const archivos = formData.getAll('fotosIncidencias');
        const totalBytes = archivos.reduce((acc, f) => acc + (f?.size || 0), 0);

        // El servidor rechaza con 413 si supera 10 fotos o 20 MB
        if (archivos.length > 10 || totalBytes > 20 * 1024 * 1024) {
          errores413++;
          throw Object.assign(new Error('Payload Too Large'), { response: { status: 413 } });
        }

        globalThis.__cuo2015.postCalls.push({
          url,
          fotosCount: archivos.length,
          totalBytes,
          ids: incRaw.map((x) => x.id),
        });
        return { data: { aceptados: incRaw.map((x) => x.id), rechazados: [] } };
      };

      const res = await sincronizar();

      assert.equal(errores413, 0, 'No debe producirse ningún error 413');
      assert.equal(res.success, true);
      assert.equal(res.incidenciasSincronizadas, 30);
      assert.equal(globalThis.__cuo2015.postCalls.length, 3, 'Debe haberse enviado en 3 peticiones de 10');
      assert.ok(
        globalThis.__cuo2015.incidencias.every((inc) => inc.synced === 1),
        'Las 30 incidencias deben quedar con synced === 1',
      );
    });

    it('Ante 413 del servidor, parte el lote a la mitad y reintenta hasta sincronizar todas', async () => {
      globalThis.__cuo2015.incidencias = Array.from({ length: 8 }, (_, i) =>
        crearIncidenciaSintetica(i + 1, 150 * 1024),
      );

      let respuestas413 = 0;
      globalThis.__cuo2015.post = async (_url, formData) => {
        const incRaw = JSON.parse(formData.get('incidencias') || '[]');
        // Simular proxy intermedio que responde 413 si el lote lleva más de 2 incidencias
        if (incRaw.length > 2) {
          respuestas413++;
          throw Object.assign(new Error('La subida supera el límite'), {
            response: { status: 413, data: { error: 'Payload Too Large' } },
          });
        }
        globalThis.__cuo2015.postCalls.push({ count: incRaw.length, ids: incRaw.map((x) => x.id) });
        return { data: { aceptados: incRaw.map((x) => x.id), rechazados: [] } };
      };

      const res = await sincronizar();

      assert.ok(respuestas413 >= 3, 'Debe haber recibido 413 en los lotes de 8 y de 4');
      assert.equal(res.success, true, 'El reintento partido debe lograr éxito completo');
      assert.equal(res.incidenciasSincronizadas, 8);
      assert.equal(globalThis.__cuo2015.postCalls.length, 4, '4 sub-lotes de 2 elementos deben completarse');
      assert.ok(globalThis.__cuo2015.incidencias.every((inc) => inc.synced === 1));
    });

    it('Ante 429 o 503, respeta Retry-After combinándolo con el backoff exponencial e interrumpe lotes restantes', async () => {
      // Verificación unitaria de extraerRetryAfterMs y calcularBackoffSyncMs
      assert.equal(extraerRetryAfterMs({ response: { headers: { 'Retry-After': '10' } } }), 10_000);
      assert.equal(extraerRetryAfterMs({ response: { headers: { 'retry-after': '30' } } }), 30_000);
      assert.equal(calcularBackoffSyncMs(0, 10_000), 10_000, 'Primer 429 con Retry-After: 10 espera 10s');
      assert.equal(calcularBackoffSyncMs(10_000, 10_000), 20_000, 'Segundo 429 duplica el backoff a 20s');
      assert.equal(calcularBackoffSyncMs(30_000, 90_000), 90_000, 'Si Retry-After (90s) supera el doble (60s), respeta 90s');

      // Verificación en sincronizar() con 2 lotes (20 incidencias) cuando el 1er lote recibe 429 con Retry-After: 10
      globalThis.__cuo2015.incidencias = Array.from({ length: 20 }, (_, i) =>
        crearIncidenciaSintetica(i + 1, 100 * 1024),
      );

      let llamadasPost = 0;
      globalThis.__cuo2015.post = async () => {
        llamadasPost++;
        throw Object.assign(new Error('Too Many Requests'), {
          response: {
            status: 429,
            headers: { 'Retry-After': '10' },
            data: { error: 'Ya hay subidas en curso desde esta sesión.' },
          },
        });
      };

      const antes = Date.now();
      const res429 = await sincronizar();
      const estado429 = getBackoffState();

      assert.equal(res429.success, false);
      assert.equal(llamadasPost, 1, 'Debe detener el envío tras el 429 sin disparar el segundo lote');
      assert.equal(estado429.backoffMs, 10_000, 'Debe fijar backoffMs en 10s según Retry-After: 10');
      assert.ok(estado429.nextRetryAt >= antes + 10_000);

      // Si el siguiente intento recibe 503 con Retry-After: 30, el backoff sube a 30s (max(20s, 30s))
      globalThis.__cuo2015.post = async () => {
        llamadasPost++;
        throw Object.assign(new Error('Service Unavailable'), {
          response: {
            status: 503,
            headers: { 'retry-after': '30' },
            data: { error: 'El servidor está recibiendo muchas fotos.' },
          },
        });
      };

      const res503 = await sincronizar();
      const estado503 = getBackoffState();
      assert.equal(res503.success, false);
      assert.equal(estado503.backoffMs, 30_000, 'Debe respetar Retry-After: 30 sobre el backoff acumulado');
    });
  });
});

function blobComprimidoInput(blob) {
  return blob;
}
