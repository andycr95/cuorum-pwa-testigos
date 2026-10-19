import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Importar lógica pura de resolución de estado y procesamiento de sync
import {
  resolverEstadoEnvio,
  formatearHoraActual,
} from '../src/components/sync/estadoEnvioLogic.ts';

import {
  procesarRespuestaSync,
  getLastSyncTime,
  setLastSyncTime,
  clearLastSyncTime,
  getLastSyncError,
  setLastSyncError,
  clearLastSyncError,
} from '../src/services/syncResponseLogic.ts';

describe('CUO-331: PWA no mostrar «Enviado ✓» ni marcar sincronizado lo que el servidor rechazó', () => {
  // Simulación de localStorage para el entorno Node
  const storage = new Map();
  globalThis.localStorage = {
    getItem: (k) => (storage.has(k) ? storage.get(k) : null),
    setItem: (k, v) => storage.set(k, String(v)),
    removeItem: (k) => storage.delete(k),
    clear: () => storage.clear(),
  };

  beforeEach(() => {
    storage.clear();
    clearLastSyncTime();
    clearLastSyncError();
  });

  describe('1. procesarRespuestaSync: separación estricta de aceptados y rechazados', () => {
    const itemsPrueba = [
      { id: 'res-mesa-1' },
      { id: 'res-mesa-2' },
      { id: 'res-mesa-3' },
    ];

    it('Respuesta exitosa sin rechazos marca todos los IDs explícitamente aceptados', () => {
      const resp = {
        aceptados: ['res-mesa-1', 'res-mesa-2', 'res-mesa-3'],
        resultados: [{ id: 'srv-1' }, { id: 'srv-2' }, { id: 'srv-3' }],
        rechazados: [],
        alertas: [],
      };

      const resultado = procesarRespuestaSync(itemsPrueba, resp, 'resultado');
      assert.deepEqual(resultado.acceptedIds, ['res-mesa-1', 'res-mesa-2', 'res-mesa-3']);
      assert.deepEqual(resultado.rejectedItems, []);
      assert.equal(resultado.tieneRechazos, false);
    });

    it('Respuesta con rechazados y aceptados aísla rechazados y conserva aceptados explícitos', () => {
      const resp = {
        aceptados: ['res-mesa-1', 'res-mesa-3'],
        rechazados: ['res-mesa-2'],
      };

      const resultado = procesarRespuestaSync(itemsPrueba, resp, 'resultado');
      assert.deepEqual(resultado.acceptedIds, ['res-mesa-1', 'res-mesa-3']);
      assert.equal(resultado.rejectedItems.length, 1);
      assert.equal(resultado.rejectedItems[0].id, 'res-mesa-2');
      assert.equal(resultado.rejectedItems[0].error, 'Rechazado por el servidor');
      assert.equal(resultado.tieneRechazos, true);
    });

    it('Respuesta con rechazados con mensaje legible preserva el motivo exacto del servidor y confirma aceptados explícitos', () => {
      const resp = {
        aceptados: ['res-mesa-2'],
        rechazados: [
          { id: 'res-mesa-1', error: 'Total votos supera el censo electoral de la mesa' },
          { id: 'res-mesa-3', motivo: 'Mesa ya reportada por otro jurado' },
        ],
      };

      const resultado = procesarRespuestaSync(itemsPrueba, resp, 'resultado');
      assert.deepEqual(resultado.acceptedIds, ['res-mesa-2']);
      assert.equal(resultado.rejectedItems.length, 2);
      assert.equal(resultado.rejectedItems[0].id, 'res-mesa-1');
      assert.equal(resultado.rejectedItems[0].error, 'Total votos supera el censo electoral de la mesa');
      assert.equal(resultado.rejectedItems[1].id, 'res-mesa-3');
      assert.equal(resultado.rejectedItems[1].error, 'Mesa ya reportada por otro jurado');
      assert.equal(resultado.tieneRechazos, true);
    });

    it('Respuesta con aceptados explícitos no marca sincronizado ningún ID ajeno al listado', () => {
      const resp = {
        aceptados: ['res-mesa-1'],
        rechazados: [{ id: 'res-mesa-2', error: 'Firma E-14 ilegible' }],
      };

      const resultado = procesarRespuestaSync(itemsPrueba, resp, 'resultado');
      assert.deepEqual(resultado.acceptedIds, ['res-mesa-1']);
      assert.equal(resultado.rejectedItems.length, 2);
      assert.equal(resultado.rejectedItems.some((r) => r.id === 'res-mesa-2'), true);
      assert.equal(resultado.rejectedItems.some((r) => r.id === 'res-mesa-3'), true);
      assert.equal(resultado.tieneRechazos, true);
    });

    it('Respuesta con conteo de rechazados sin IDs no acepta ningún ítem del lote a ciegas', () => {
      const resp = {
        rechazados: 1,
      };

      const resultado = procesarRespuestaSync(itemsPrueba, resp, 'resultado');
      assert.deepEqual(resultado.acceptedIds, []);
      assert.equal(resultado.rejectedItems.length, 3);
      assert.match(resultado.rejectedItems[0].error, /sin confirmación/i);
      assert.equal(resultado.tieneRechazos, true);
    });

    it('Mapeo de fotos rechazadas con fotosRechazadas o rechazadosFotos preservando aceptadas explícitas', () => {
      const fotosPrueba = [{ id: 'foto-1' }, { id: 'foto-2' }];
      const resp = {
        fotosAceptadas: ['foto-2'],
        fotosRechazadas: [{ id: 'foto-1', error: 'Imagen borrosa no cumple resolución mínima' }],
      };

      const resultado = procesarRespuestaSync(fotosPrueba, resp, 'foto');
      assert.deepEqual(resultado.acceptedIds, ['foto-2']);
      assert.equal(resultado.rejectedItems.length, 1);
      assert.equal(resultado.rejectedItems[0].id, 'foto-1');
      assert.equal(resultado.rejectedItems[0].error, 'Imagen borrosa no cumple resolución mínima');
      assert.equal(resultado.tieneRechazos, true);
    });

    it('Ausencia en rechazados NO confirma un ID si no viene en aceptados (permanece pendiente con error)', () => {
      const resp = {
        rechazados: ['res-mesa-2'],
      };
      const resultado = procesarRespuestaSync(itemsPrueba, resp, 'resultado');
      assert.deepEqual(resultado.acceptedIds, []);
      assert.equal(resultado.rejectedItems.length, 3);
      assert.equal(resultado.rejectedItems.find((r) => r.id === 'res-mesa-2')?.error, 'Rechazado por el servidor');
      assert.equal(resultado.rejectedItems.find((r) => r.id === 'res-mesa-1')?.error, 'Respuesta sin confirmación del servidor');
      assert.equal(resultado.tieneRechazos, true);
    });

    it('Contador legacy o IDs no correlacionables no confirman ítems locales sin acuse explícito', () => {
      const resp = {
        resultados: [{ id: 'id-servidor-no-correlacionable' }],
        resumen: { resultadosSincronizados: 1 },
      };
      const resultado = procesarRespuestaSync(itemsPrueba, resp, 'resultado');
      assert.deepEqual(resultado.acceptedIds, []);
      assert.equal(resultado.rejectedItems.length, 3);
      assert.equal(resultado.tieneRechazos, true);
    });

    it('Rechazar un ID ajeno al lote no confirma el ID enviado sin acuse', () => {
      const resp = {
        rechazados: [{ id: 'id-ajeno-al-lote', error: 'Error sintético' }],
      };
      const resultado = procesarRespuestaSync([{ id: 'res-mesa-1' }], resp, 'resultado');
      assert.deepEqual(resultado.acceptedIds, []);
      assert.equal(resultado.rejectedItems.length, 1);
      assert.equal(resultado.rejectedItems[0].id, 'res-mesa-1');
      assert.equal(resultado.tieneRechazos, true);
    });
  });

  describe('2. resolverEstadoEnvio: nunca mostrar «Enviado ✓» ante rechazos o fallos', () => {
    it('Con hasRechazos o error la barra muestra ERROR y nunca «Enviado ✓»', () => {
      const estadoConError = resolverEstadoEnvio({
        isOnline: true,
        pendingCount: 1,
        isSyncing: false,
        lastSyncTime: '14:30',
        error: '1 elemento rechazado por el servidor',
      });

      assert.equal(estadoConError.estado, 'ERROR');
      assert.equal(estadoConError.texto, '1 elemento rechazado por el servidor');
      assert.notEqual(estadoConError.estado, 'ENVIADO');
      assert.ok(!estadoConError.texto.includes('Enviado ✓'));
    });

    it('Con rechazos sin mensaje de error específico muestra texto amigable de rechazo', () => {
      const estadoRechazo = resolverEstadoEnvio({
        isOnline: true,
        pendingCount: 2,
        isSyncing: false,
        hasRechazos: true,
      });

      assert.equal(estadoRechazo.estado, 'ERROR');
      assert.equal(estadoRechazo.texto, 'Envío rechazado por el servidor');
    });

    it('Con incidencias fallidas o cola pendiente muestra PENDIENTE y nunca «Enviado ✓» aunque exista lastSyncTime previo', () => {
      const estadoPendiente = resolverEstadoEnvio({
        isOnline: true,
        pendingCount: 1,
        isSyncing: false,
        lastSyncTime: '10:00', // hora anterior
      });

      assert.equal(estadoPendiente.estado, 'PENDIENTE');
      assert.equal(estadoPendiente.texto, 'Guardado en el teléfono (1 pendiente)');
      assert.notEqual(estadoPendiente.estado, 'ENVIADO');
      assert.ok(!estadoPendiente.texto.includes('Enviado ✓'));
    });

    it('Solo muestra «Enviado ✓» cuando pendingCount === 0, no hay error ni rechazos, y hay lastSyncTime', () => {
      const estadoExitoso = resolverEstadoEnvio({
        isOnline: true,
        pendingCount: 0,
        isSyncing: false,
        lastSyncTime: '16:45',
      });

      assert.equal(estadoExitoso.estado, 'ENVIADO');
      assert.equal(estadoExitoso.texto, 'Enviado ✓ 16:45');
    });
  });

  describe('3. Limpieza de cuorum_last_sync_time al cerrar sesión', () => {
    it('setLastSyncTime y clearLastSyncTime administran correctamente localStorage y memoria', () => {
      setLastSyncTime('15:30');
      assert.equal(getLastSyncTime(), '15:30');
      assert.equal(localStorage.getItem('cuorum_last_sync_time'), '15:30');

      clearLastSyncTime();
      assert.equal(getLastSyncTime(), null);
      assert.equal(localStorage.getItem('cuorum_last_sync_time'), null);
    });

    it('authService.logout() limpia cuorum_last_sync_time de localStorage y el estado en memoria', () => {
      const authServiceCode = fs.readFileSync(
        path.join(rootDir, 'src', 'services', 'authService.ts'),
        'utf8',
      );
      assert.ok(
        authServiceCode.includes('clearLastSyncTime()'),
        'authService.logout debe llamar a clearLastSyncTime()',
      );
      assert.ok(
        authServiceCode.includes('clearLastSyncError()'),
        'authService.logout debe llamar a clearLastSyncError()',
      );

      // Verificar ejecución directa de la lógica de limpieza
      localStorage.setItem('cuorum_last_sync_time', '17:00');
      setLastSyncTime('17:00');
      setLastSyncError('Error previo');

      assert.equal(localStorage.getItem('cuorum_last_sync_time'), '17:00');
      assert.equal(getLastSyncTime(), '17:00');
      assert.equal(getLastSyncError(), 'Error previo');

      clearLastSyncTime();
      clearLastSyncError();

      assert.equal(localStorage.getItem('cuorum_last_sync_time'), null);
      assert.equal(getLastSyncTime(), null);
      assert.equal(getLastSyncError(), null);
    });
  });

  describe('4. Flujo funcional observable: contratos reales y persistencia de rechazos', () => {
    it('Contrato anidado CUO-428: discrimina resultados y fotos aceptados de los rechazados con motivo', () => {
      const respAnidada = {
        aceptados: { resultados: ['r-ok'], fotos: ['f-ok'] },
        rechazados: {
          resultados: [{ id: 'r-rechazado', error: 'Total votos inconsistente' }],
          fotos: [{ id: 'f-rechazada', error: 'Foto ilegible' }],
        },
      };

      const resProc = procesarRespuestaSync([{ id: 'r-ok' }, { id: 'r-rechazado' }], respAnidada, 'resultado');
      assert.deepEqual(resProc.acceptedIds, ['r-ok']);
      assert.equal(resProc.rejectedItems.length, 1);
      assert.equal(resProc.rejectedItems[0].id, 'r-rechazado');
      assert.equal(resProc.rejectedItems[0].error, 'Total votos inconsistente');

      const fotoProc = procesarRespuestaSync([{ id: 'f-ok' }, { id: 'f-rechazada' }], respAnidada, 'foto');
      assert.deepEqual(fotoProc.acceptedIds, ['f-ok']);
      assert.equal(fotoProc.rejectedItems.length, 1);
      assert.equal(fotoProc.rejectedItems[0].id, 'f-rechazada');
      assert.equal(fotoProc.rejectedItems[0].error, 'Foto ilegible');
    });

    it('Respuesta ausente o con contadores de fallos no confirma ningún ítem enviado', () => {
      const respAusente = procesarRespuestaSync([{ id: 'r-1' }], null, 'resultado');
      assert.deepEqual(respAusente.acceptedIds, []);
      assert.equal(respAusente.rejectedItems.length, 1);

      const respFallos = procesarRespuestaSync(
        [{ id: 'r-2' }],
        { errores: ['Error general'], resumen: { resultadosFallidos: 1 } },
        'resultado',
      );
      assert.deepEqual(respFallos.acceptedIds, []);
      assert.equal(respFallos.rejectedItems.length, 1);
      assert.equal(respFallos.rejectedItems[0].error, 'Error general');

      const respSinConfirmacion = procesarRespuestaSync([{ id: 'r-3' }], {}, 'resultado');
      assert.deepEqual(respSinConfirmacion.acceptedIds, []);
      assert.equal(respSinConfirmacion.rejectedItems.length, 1);
      assert.match(respSinConfirmacion.rejectedItems[0].error, /sin confirmación/i);
    });

    it('Persistencia simulada y resolución de estado: rechazos impiden hora de éxito y producen ERROR', () => {
      // Simular tabla local de IndexedDB
      const tablaLocal = [
        { id: 'r-ok', synced: 0, syncAttempts: 0, lastSyncError: null },
        { id: 'r-rechazado', synced: 0, syncAttempts: 0, lastSyncError: null },
      ];

      const resp = {
        aceptados: { resultados: ['r-ok'] },
        rechazados: { resultados: [{ id: 'r-rechazado', error: 'Mesa no habilitada' }] },
      };

      const proc = procesarRespuestaSync(tablaLocal, resp, 'resultado');

      // Aplicar actualización observable equivalente a marcarSincronizados y marcarRechazados
      for (const id of proc.acceptedIds) {
        const item = tablaLocal.find((x) => x.id === id);
        if (item) item.synced = 1;
      }
      for (const rej of proc.rejectedItems) {
        const item = tablaLocal.find((x) => x.id === rej.id);
        if (item) {
          item.synced = 0;
          item.lastSyncError = rej.error;
          item.syncAttempts++;
        }
      }

      // Verificación de persistencia observable
      assert.equal(tablaLocal[0].synced, 1, 'r-ok debe quedar sincronizado');
      assert.equal(tablaLocal[1].synced, 0, 'r-rechazado debe permanecer pendiente con synced: 0');
      assert.equal(tablaLocal[1].lastSyncError, 'Mesa no habilitada', 'debe guardar el motivo exacto');
      assert.equal(tablaLocal[1].syncAttempts, 1, 'debe incrementar syncAttempts');

      // Verificación de flujo: presencia de rechazos impide registrar hora de éxito
      if (proc.tieneRechazos) {
        setLastSyncError('1 elemento rechazado por el servidor');
      } else {
        setLastSyncTime('18:00');
      }

      assert.equal(getLastSyncTime(), null, 'no debe registrarse hora de éxito ante rechazos');
      assert.equal(getLastSyncError(), '1 elemento rechazado por el servidor');

      // Verificación de barra de estado
      const pendientes = tablaLocal.filter((x) => x.synced === 0).length;
      const estado = resolverEstadoEnvio({
        isOnline: true,
        pendingCount: pendientes,
        isSyncing: false,
        lastSyncTime: getLastSyncTime(),
        error: getLastSyncError(),
      });

      assert.equal(estado.estado, 'ERROR');
      assert.notEqual(estado.estado, 'ENVIADO');
      assert.ok(!estado.texto.includes('Enviado ✓'));
    });
  });

  describe('5. Accesibilidad e interfaz de BarraEstadoSync', () => {
    it('BarraEstadoSync.tsx define estilo y rol para estado ERROR sin violar WCAG AA', () => {
      const barraCode = fs.readFileSync(
        path.join(rootDir, 'src', 'components', 'sync', 'BarraEstadoSync.tsx'),
        'utf8',
      );

      assert.ok(
        barraCode.includes("ERROR: 'bg-[#FEF2F2] text-[#B91C1C] border-[#FECACA]'"),
        'Debe definir el estilo accesible para ERROR',
      );
      assert.ok(
        barraCode.includes('data-testid="icono-error"'),
        'Debe incluir icono accesible para estado ERROR',
      );
    });
  });
});
