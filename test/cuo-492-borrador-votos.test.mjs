import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

import {
  evaluarOrigenBorrador,
  identificarBajaConfianza,
  determinarModoRevision,
} from '../src/services/borradorVotosLogic.ts';

describe('CUO-492: PWA: borrador de votos para aceptar o corregir, con conteo manual de respaldo', () => {
  const formularioPath = path.join(rootDir, 'src', 'components', 'formulario', 'FormularioMesaMultiple.tsx');
  const estadoOcrPath = path.join(rootDir, 'src', 'components', 'camera', 'EstadoOcrE14.tsx');
  const hookPath = path.join(rootDir, 'src', 'hooks', 'useOcrJobsE14.ts');
  const idbPath = path.join(rootDir, 'src', 'db', 'indexeddb.ts');

  const formularioCode = fs.readFileSync(formularioPath, 'utf8');
  const estadoOcrCode = fs.readFileSync(estadoOcrPath, 'utf8');
  const hookCode = fs.readFileSync(hookPath, 'utf8');
  const idbCode = fs.readFileSync(idbPath, 'utf8');

  // ─── 1. Camino 1: Borrador aceptado sin cambios ('sin_cambios') ───

  describe('Camino 1: Borrador aceptado sin cambios', () => {
    it('1.1 Con borrador idéntico al original, el origen se evalúa como «sin_cambios» sin que el testigo teclee votos', () => {
      const resultadoOriginal = {
        'cand-sint-101': 25,
        'cand-sint-102': 14,
        '_lista:lista-sint-01': 5,
        _totalVotosMesa: 46,
        _votosBlanco: 1,
        _votosNulos: 1,
        _votosNoMarcados: 0,
      };

      const votosAceptados = {
        'cand-sint-101': 25,
        'cand-sint-102': 14,
        '_lista:lista-sint-01': 5,
      };

      const origen = evaluarOrigenBorrador({
        votos: votosAceptados,
        votosBlanco: 1,
        votosNulos: 1,
        votosNoMarcados: 0,
        totalVotosMesa: 46,
        resultadoOcrOriginal: resultadoOriginal,
      });

      assert.equal(origen, 'sin_cambios', 'Debe clasificar como sin_cambios cuando los votos no fueron modificados');
    });

    it('1.2 Cuando hay borrador disponible y no se fuerza conteo manual, determinarModoRevision activa «borrador»', () => {
      const modo = determinarModoRevision({
        estadoJob: 'COMPLETADO',
        tieneResultadoOcr: true,
        forzarConteoManual: false,
        isOnline: true,
      });
      assert.equal(modo, 'borrador');
    });

    it('1.3 Las casillas con número claro y sin alertas no se marcan como baja confianza', () => {
      const resultado = {
        'cand-sint-101': 42,
        'cand-sint-102': 18,
        _totalVotosMesa: 60,
      };
      const bajaConfianza = identificarBajaConfianza(resultado, []);
      assert.equal(bajaConfianza.size, 0, 'No debe haber baja confianza si todos los valores son numéricos legibles');
      assert.equal(bajaConfianza.has('cand-sint-101'), false);
    });
  });

  // ─── 2. Camino 2: Borrador corregido ('corregido') ───────────────

  describe('Camino 2: Borrador corregido', () => {
    it('2.1 Si el testigo modifica cualquier voto de candidato, se evalúa como «corregido»', () => {
      const resultadoOriginal = {
        'cand-sint-101': 25,
        'cand-sint-102': 14,
        _totalVotosMesa: 39,
        _votosBlanco: 0,
        _votosNulos: 0,
        _votosNoMarcados: 0,
      };

      // Testigo corrige el candidato 102 de 14 a 15
      const votosModificados = {
        'cand-sint-101': 25,
        'cand-sint-102': 15,
      };

      const origen = evaluarOrigenBorrador({
        votos: votosModificados,
        votosBlanco: 0,
        votosNulos: 0,
        votosNoMarcados: 0,
        totalVotosMesa: 40,
        resultadoOcrOriginal: resultadoOriginal,
      });

      assert.equal(origen, 'corregido', 'Debe clasificar como corregido al cambiar el valor de un candidato');
    });

    it('2.2 Si el borrador tenía casilla en null (manchada/dudosa) y el testigo la completa, se evalúa como «corregido»', () => {
      const resultadoOriginal = {
        'cand-sint-101': 19,
        'cand-sint-102': null, // Casilla ilegible en borrador
        _totalVotosMesa: 26,
      };

      const votosCompletados = {
        'cand-sint-101': 19,
        'cand-sint-102': 7, // Completado por el testigo
      };

      const origen = evaluarOrigenBorrador({
        votos: votosCompletados,
        votosBlanco: 0,
        votosNulos: 0,
        votosNoMarcados: 0,
        totalVotosMesa: 26,
        resultadoOcrOriginal: resultadoOriginal,
      });

      assert.equal(origen, 'corregido', 'Completar una casilla null debe marcar el resultado como corregido');
    });

    it('2.3 identificarBajaConfianza resalta casillas con valor null o señaladas en alertas', () => {
      const resultado = {
        'cand-sint-101': 20,
        'cand-sint-102': null, // Casilla manchada
        'cand-sint-103': 0,
      };
      const alertas = [
        { tipo: 'ALTERACION_DOCUMENTO', mensaje: 'Borrones en la celda cand-sint-103' },
      ];

      const baja = identificarBajaConfianza(resultado, alertas);
      assert.equal(baja.has('cand-sint-102'), true, 'El candidato con null debe estar en baja confianza');
      assert.equal(baja.has('cand-sint-103'), true, 'El candidato con alerta debe estar en baja confianza');
      assert.equal(baja.has('cand-sint-101'), false, 'El candidato normal no debe estar en baja confianza');
    });

    it('2.4 Si se modifican votos especiales (blanco, nulo o no marcado), se evalúa como «corregido»', () => {
      const resultadoOriginal = {
        'cand-sint-101': 10,
        _totalVotosMesa: 10,
        _votosBlanco: 0,
        _votosNulos: 0,
        _votosNoMarcados: 0,
      };

      const origen = evaluarOrigenBorrador({
        votos: { 'cand-sint-101': 10 },
        votosBlanco: 2, // Corregido
        votosNulos: 0,
        votosNoMarcados: 0,
        totalVotosMesa: 12,
        resultadoOcrOriginal: resultadoOriginal,
      });

      assert.equal(origen, 'corregido');
    });
  });

  // ─── 3. Camino 3: Conteo manual de respaldo ('manual') ─────────────

  describe('Camino 3: Conteo manual de respaldo', () => {
    it('3.1 Mientras se lee el acta (PROCESANDO), el modo es «leyendo» con opción de contar a mano', () => {
      const modo = determinarModoRevision({
        estadoJob: 'PROCESANDO',
        tieneResultadoOcr: false,
        forzarConteoManual: false,
        isOnline: true,
      });
      assert.equal(modo, 'leyendo', 'Debe estar en modo leyendo mientras el job procesa');
    });

    it('3.2 Si el testigo elige «Contar a mano», forzarConteoManual activa el modo «manual» de inmediato', () => {
      const modo = determinarModoRevision({
        estadoJob: 'PROCESANDO',
        tieneResultadoOcr: false,
        forzarConteoManual: true,
        isOnline: true,
      });
      assert.equal(modo, 'manual', 'forzarConteoManual debe activar el modo manual aunque el job esté procesando');
    });

    it('3.3 Si la lectura automática falló (ERROR), se activa automáticamente el modo «manual»', () => {
      const modo = determinarModoRevision({
        estadoJob: 'ERROR',
        tieneResultadoOcr: false,
        forzarConteoManual: false,
        isOnline: true,
      });
      assert.equal(modo, 'manual', 'Job en estado ERROR debe activar modo manual de respaldo');
    });

    it('3.4 Si no hay señal ni borrador previo, se activa automáticamente el modo «manual»', () => {
      const modo = determinarModoRevision({
        estadoJob: null,
        tieneResultadoOcr: false,
        forzarConteoManual: false,
        isOnline: false,
      });
      assert.equal(modo, 'manual', 'Sin conexión y sin borrador debe permitir el conteo manual como hoy');
    });

    it('3.5 Si hay borrador listo pero el testigo decide descartarlo, se activa el modo «manual»', () => {
      const modo = determinarModoRevision({
        estadoJob: 'COMPLETADO',
        tieneResultadoOcr: true,
        forzarConteoManual: true,
        isOnline: true,
      });
      assert.equal(modo, 'manual', 'El testigo puede descartar el borrador y contar a mano');
    });
  });

  // ─── 4. Integración en el código fuente de los componentes ─────────

  describe('Integración y contratos de componentes', () => {
    it('4.1 FormularioMesaMultiple importa determinarModoRevision y gestiona forzarConteoManual', () => {
      assert.match(
        formularioCode,
        /determinarModoRevision/,
        'FormularioMesaMultiple debe importar y utilizar determinarModoRevision',
      );
      assert.match(
        formularioCode,
        /const\s*\[forzarConteoManual,\s*setForzarConteoManual\]\s*=\s*useState\(false\)/,
        'Debe declarar estado forzarConteoManual',
      );
    });

    it('4.2 FormularioMesaMultiple en paso 2 bifurca entre borrador, leyendo y manual', () => {
      assert.match(
        formularioCode,
        /modoRevision\s*===\s*['"]borrador['"]/,
        'Debe tener rama para borrador en paso 2',
      );
      assert.match(
        formularioCode,
        /modoRevision\s*===\s*['"]leyendo['"]/,
        'Debe tener rama para estado leyendo en paso 2',
      );
    });

    it('4.3 Al guardar manualmente, cada registro enviado o persistido lleva origen: manual', () => {
      assert.match(
        formularioCode,
        /origen:\s*['"]manual['"]/,
        'handleGuardar debe persistir origen: manual',
      );
    });

    it('4.4 handleConfirmarOcr envía el origen (sin_cambios o corregido) y persiste en IDB', () => {
      assert.match(
        formularioCode,
        /handleConfirmarOcr/,
        'Debe existir manejador handleConfirmarOcr',
      );
      assert.match(
        formularioCode,
        /origen:\s*origenFinal/,
        'handleConfirmarOcr debe asignar el origen calculado al lote de resultados',
      );
    });

    it('4.5 RevisionOcrInline resalta candidatos de baja confianza y provee opción de contar a mano', () => {
      assert.match(
        estadoOcrCode,
        /identificarBajaConfianza/,
        'EstadoOcrE14 debe llamar a identificarBajaConfianza',
      );
      assert.match(
        estadoOcrCode,
        /Baja confianza\s*·\s*Verificar en acta/i,
        'RevisionOcrInline debe mostrar insignia de baja confianza',
      );
      assert.match(
        estadoOcrCode,
        /border-amber-400/,
        'RevisionOcrInline debe resaltar con borde amber la casilla dudosa',
      );
      assert.match(
        estadoOcrCode,
        /Descartar borrador y contar a mano/i,
        'RevisionOcrInline debe incluir botón para descartar y contar a mano',
      );
    });

    it('4.6 EstadoOcrE14 muestra «Leyendo el acta…» con botón de «Contar a mano»', () => {
      assert.match(
        estadoOcrCode,
        /Leyendo el acta…/i,
        'EstadoOcrE14 debe mostrar Leyendo el acta…',
      );
      assert.match(
        estadoOcrCode,
        /Contar a mano/i,
        'EstadoOcrE14 debe incluir botón Contar a mano mientras procesa',
      );
    });

    it('4.7 useOcrJobsE14 propaga origen en confirmarJob hacia la API y hacia el estado local', () => {
      assert.match(
        hookCode,
        /origen\?:?\s*['"]sin_cambios['"]\s*\|\s*['"]corregido['"]/,
        'confirmarJob debe aceptar el parámetro origen',
      );
      assert.match(
        hookCode,
        /updateOcrJobEstado\([\s\S]*?origen:\s*datos\.origen/,
        'confirmarJob debe persistir origen en el estado del job',
      );
    });

    it('4.8 indexeddb declara origen opcional en e14OcrJobs y resultados sin romper la base', () => {
      assert.match(
        idbCode,
        /origen\?:?\s*['"]sin_cambios['"]\s*\|\s*['"]corregido['"]\s*\|\s*['"]manual['"]/,
        'IndexedDB debe tipar origen en resultados y e14OcrJobs',
      );
      assert.match(
        idbCode,
        /updateOcrJobEstado[\s\S]*?origen\?:?\s*['"]sin_cambios['"]\s*\|\s*['"]corregido['"]\s*\|\s*['"]manual['"]/,
        'updateOcrJobEstado debe admitir origen en sus opciones extra',
      );
    });

    it('4.9 Ningún componente usa texto en 10px o 11px ni nombres prohibidos', () => {
      assert.doesNotMatch(formularioCode, /text-\[10px\]|text-\[11px\]/, 'FormularioMesaMultiple no debe tener texto menor de 12px');
      assert.doesNotMatch(estadoOcrCode, /text-\[10px\]|text-\[11px\]/, 'EstadoOcrE14 no debe tener texto menor de 12px');
      const proveedoresIa = new RegExp(['Gem' + 'ini', 'Anthro' + 'pic', 'Chat' + 'GPT', 'Open' + 'AI'].join('|'), 'i');
      assert.doesNotMatch(formularioCode, proveedoresIa, 'No debe nombrar proveedores prohibidos de IA');
      assert.doesNotMatch(estadoOcrCode, proveedoresIa, 'No debe nombrar proveedores prohibidos de IA');
      assert.doesNotMatch(hookCode, proveedoresIa, 'No debe nombrar proveedores prohibidos de IA');
    });
  });
});
