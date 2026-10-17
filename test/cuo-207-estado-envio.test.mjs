import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Importar lógica pura de resolución de estado de envío
import {
  resolverEstadoEnvio,
  formatearHoraActual,
} from '../src/components/sync/estadoEnvioLogic.ts';

// ─── Funciones de cálculo de contraste WCAG AA ──────────────────────
function parseHex(hex) {
  const clean = hex.replace('#', '');
  return [
    parseInt(clean.substring(0, 2), 16),
    parseInt(clean.substring(2, 4), 16),
    parseInt(clean.substring(4, 6), 16),
  ];
}

function srgbToLinear(c) {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

function relativeLuminance([r, g, b]) {
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
}

function contrastRatio(hex1, hex2) {
  const l1 = relativeLuminance(parseHex(hex1));
  const l2 = relativeLuminance(parseHex(hex2));
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

test('1. resolverEstadoEnvio cubre los estados requeridos (offline, enviando, guardado, enviado)', () => {
  // Estado Enviando...
  const enviando = resolverEstadoEnvio({
    isOnline: true,
    pendingCount: 0,
    isSyncing: true,
    lastSyncTime: '12:00',
  });
  assert.equal(enviando.estado, 'ENVIANDO');
  assert.equal(enviando.texto, 'Enviando…');

  // Estado Guardado en el teléfono con 1 pendiente
  const guardado1 = resolverEstadoEnvio({
    isOnline: false,
    pendingCount: 1,
    isSyncing: false,
    lastSyncTime: '12:00',
  });
  assert.equal(guardado1.estado, 'PENDIENTE');
  assert.equal(guardado1.texto, 'Guardado en el teléfono (1 pendiente)');

  // Estado Guardado en el teléfono con múltiples pendientes
  const guardadoMulti = resolverEstadoEnvio({
    isOnline: false,
    pendingCount: 4,
    isSyncing: false,
    lastSyncTime: '12:00',
  });
  assert.equal(guardadoMulti.estado, 'PENDIENTE');
  assert.equal(guardadoMulti.texto, 'Guardado en el teléfono (4 pendientes)');

  // Estado Sin internet como estado propio cuando no hay cola pendiente
  const sinInternet = resolverEstadoEnvio({
    isOnline: false,
    pendingCount: 0,
    isSyncing: false,
    lastSyncTime: '12:00',
  });
  assert.equal(sinInternet.estado, 'OFFLINE');
  assert.equal(sinInternet.texto, 'Sin internet');

  // Estado Enviado con marca de verificación y hora
  const enviado = resolverEstadoEnvio({
    isOnline: true,
    pendingCount: 0,
    isSyncing: false,
    lastSyncTime: '15:42',
  });
  assert.equal(enviado.estado, 'ENVIADO');
  assert.equal(enviado.texto, 'Enviado ✓ 15:42');
});

test('2. formatearHoraActual retorna formato militar hh:mm de 24 horas', () => {
  const d = new Date(2026, 9, 17, 14, 5, 0);
  const hora = formatearHoraActual(d);
  assert.equal(hora, '14:05');
  assert.match(hora, /^\d{2}:\d{2}$/);
});

test('3. Colores de la barra cumplen contraste accesible WCAG AA (> 4.5:1)', () => {
  // ENVIANDO: #1D4ED8 sobre #EFF6FF (info-700 sobre info-50)
  const ratioEnviando = contrastRatio('#1D4ED8', '#EFF6FF');
  assert.ok(ratioEnviando >= 4.5, `Ratio ENVIANDO (${ratioEnviando.toFixed(2)}) debe ser >= 4.5:1`);

  // PENDIENTE: #B45309 sobre #FFFBEB (warn-700 sobre warn-50)
  const ratioPendiente = contrastRatio('#B45309', '#FFFBEB');
  assert.ok(ratioPendiente >= 4.5, `Ratio PENDIENTE (${ratioPendiente.toFixed(2)}) debe ser >= 4.5:1`);

  // OFFLINE: #B91C1C sobre #FEF2F2 (err-700 sobre err-50)
  const ratioOffline = contrastRatio('#B91C1C', '#FEF2F2');
  assert.ok(ratioOffline >= 4.5, `Ratio OFFLINE (${ratioOffline.toFixed(2)}) debe ser >= 4.5:1`);

  // ENVIADO: #15803D sobre #F0FDF4 (ok-700 sobre ok-50)
  const ratioEnviado = contrastRatio('#15803D', '#F0FDF4');
  assert.ok(ratioEnviado >= 4.5, `Ratio ENVIADO (${ratioEnviado.toFixed(2)}) debe ser >= 4.5:1`);
});

test('4. BarraEstadoSync.tsx tiene la estructura semántica y atributos de accesibilidad', () => {
  const barraCode = fs.readFileSync(
    path.join(rootDir, 'src', 'components', 'sync', 'BarraEstadoSync.tsx'),
    'utf-8',
  );

  assert.ok(barraCode.includes('role="status"'), 'Debe incluir role="status"');
  assert.ok(barraCode.includes('aria-live="polite"'), 'Debe incluir aria-live="polite"');
  assert.ok(barraCode.includes('data-testid="barra-estado-envio"'), 'Debe incluir data-testid');
  assert.ok(barraCode.includes('data-testid="texto-estado-envio"'), 'Debe incluir data-testid de texto');
  assert.ok(
    !barraCode.includes('fixed top-0 inset-x-0'),
    'No debe usar fixed top-0 inset-x-0 para no tapar la cabecera',
  );
});

test('5. PendingSyncBadge está retirado y no renderiza contenido duplicado', () => {
  const badgeCode = fs.readFileSync(
    path.join(rootDir, 'src', 'components', 'ui', 'PendingSyncBadge.tsx'),
    'utf-8',
  );
  assert.ok(badgeCode.includes('return null;'), 'PendingSyncBadge debe retornar null');
});

test('6. Verificación estática: botón de guardar cumple 56 px y no hay indicadores duplicados', () => {
  const formCode = fs.readFileSync(
    path.join(rootDir, 'src', 'components', 'formulario', 'FormularioMesaMultiple.tsx'),
    'utf-8',
  );

  // La píldora enterrada al final fue retirada
  assert.ok(
    !formCode.includes('En línea · Sync automática'),
    'La píldora enterrada "En línea · Sync automática" debe estar retirada',
  );
  assert.ok(
    !formCode.includes('Sin conexión · Guardado local'),
    'El texto "Sin conexión · Guardado local" no debe existir al final',
  );

  // Botón de guardar tiene 56 px de alto y texto "Guardado"
  assert.ok(
    formCode.includes('min-h-[56px]'),
    'El botón de guardar debe medir al menos 56 px de alto (min-h-[56px])',
  );
  assert.ok(
    formCode.includes('Guardado'),
    'El botón de guardar debe mostrar el estado "Guardado"',
  );
  assert.ok(
    !formCode.includes('Resultados Guardados'),
    'El texto anterior "Resultados Guardados" fue reemplazado para no recortarse',
  );

  // App.tsx ubica la barra de estado fija bajo la cabecera
  const appCode = fs.readFileSync(path.join(rootDir, 'src', 'App.tsx'), 'utf-8');
  assert.ok(
    appCode.includes('<BarraEstadoEnvio />'),
    'App.tsx debe renderizar BarraEstadoEnvio bajo la cabecera',
  );
  assert.ok(
    !appCode.includes('<PendingSyncBadge />'),
    'App.tsx no debe incluir la insignia duplicada PendingSyncBadge',
  );
});

test('7. Transacción de guardarResultadosYFoto permanece intacta en IndexedDB', () => {
  const idbCode = fs.readFileSync(path.join(rootDir, 'src', 'db', 'indexeddb.ts'), 'utf-8');
  assert.ok(
    idbCode.includes('export async function guardarResultadosYFoto('),
    'La función transaccional guardarResultadosYFoto debe existir',
  );
  assert.ok(
    idbCode.includes("db.transaction(storeNames, 'readwrite')"),
    'La transacción atómica con storeNames de resultados y fotosE14 debe preservarse',
  );
  assert.ok(
    idbCode.includes("storeNames.push('fotosE14')"),
    'Debe incluir fotosE14 en la misma transacción IDB',
  );
});

test('8. Regresión de arranque (CUO-253): sin historial de sincronización, cola 0 y online muestra estado neutral sin inventar fecha de envío', () => {
  // Con lastSyncTime = null (arranque en frío sin sync previa)
  const arranqueNull = resolverEstadoEnvio({
    isOnline: true,
    pendingCount: 0,
    isSyncing: false,
    lastSyncTime: null,
  });
  assert.notEqual(arranqueNull.estado, 'ENVIADO', 'No debe mostrar ENVIADO sin fecha de sincronización confirmada');
  assert.equal(arranqueNull.estado, 'ONLINE');
  assert.equal(arranqueNull.texto, 'En línea');

  // Con lastSyncTime = undefined
  const arranqueUndefined = resolverEstadoEnvio({
    isOnline: true,
    pendingCount: 0,
    isSyncing: false,
    lastSyncTime: undefined,
  });
  assert.notEqual(arranqueUndefined.estado, 'ENVIADO');
  assert.equal(arranqueUndefined.estado, 'ONLINE');
  assert.equal(arranqueUndefined.texto, 'En línea');

  // Con lastSyncTime = ''
  const arranqueVacio = resolverEstadoEnvio({
    isOnline: true,
    pendingCount: 0,
    isSyncing: false,
    lastSyncTime: '',
  });
  assert.notEqual(arranqueVacio.estado, 'ENVIADO');
  assert.equal(arranqueVacio.estado, 'ONLINE');
  assert.equal(arranqueVacio.texto, 'En línea');

  // Comprobar que BarraEstadoSync.tsx no inicializa con formatearHoraActual como fallback en el render de arranque
  const barraCode = fs.readFileSync(
    path.join(rootDir, 'src', 'components', 'sync', 'BarraEstadoSync.tsx'),
    'utf-8',
  );
  assert.ok(
    !barraCode.includes('getLastSyncTime() || formatearHoraActual()'),
    'BarraEstadoSync no debe fabricar la hora actual en el arranque si getLastSyncTime es null',
  );
});
