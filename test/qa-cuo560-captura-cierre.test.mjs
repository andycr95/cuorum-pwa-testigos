import test, { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

describe('CUO-560: PWA: Captura directa a cola S3 y cierre validado con acuse remoto', () => {
  const formularioPath = path.join(rootDir, 'src', 'components', 'formulario', 'FormularioMesaMultiple.tsx');
  const wizardPath = path.join(rootDir, 'src', 'components', 'jornada', 'WizardCierre.tsx');
  const syncServicePath = path.join(rootDir, 'src', 'services', 'syncService.ts');

  const formularioCode = readFileSync(formularioPath, 'utf8');
  const wizardCode = readFileSync(wizardPath, 'utf8');
  const syncServiceCode = readFileSync(syncServicePath, 'utf8');

  it('1. Captura en paso 1: guarda directamente en fotosE14 y no en e14OcrJobs', () => {
    // onFotosListas guarda en fotosE14 con guardarResultadosYFoto([], fotosData)
    assert.match(
      formularioCode,
      /await\s+guardarResultadosYFoto\s*\(\s*\[\]\s*,\s*fotosData\s*\)/,
      'onFotosListas debe llamar guardarResultadosYFoto([], fotosData) para encolar la evidencia',
    );
    // No debe llamar ocrJobs.guardar(fotos)
    assert.doesNotMatch(
      formularioCode,
      /ocrJobs\.guardar\s*\(/,
      'onFotosListas NO debe llamar ocrJobs.guardar (no enviar foto por OCR job)',
    );
    // Debe actualizar el conteo local de fotos de la mesa
    assert.match(
      formularioCode,
      /setFotosMesaCount\s*\(/,
      'onFotosListas debe actualizar fotosMesaCount',
    );
  });

  it('2. Captura en paso 1: dispara subida directa a S3 sin esperar a guardar votos', () => {
    assert.match(
      formularioCode,
      /sincronizar\s*\(\)\.catch/,
      'onFotosListas debe disparar sincronizar() en segundo plano al confirmar evidencia',
    );
  });

  it('3. Recarga de página: recupera evidencia previa de IndexedDB y no duplica fotos al guardar votos', () => {
    // Carga fotos de la mesa al montar
    assert.match(
      formularioCode,
      /getFotosByMesa\(mesaId[\s\S]*?setFotosMesaCount\(fotos\.length\)/,
      'Debe consultar getFotosByMesa al montar y actualizar fotosMesaCount',
    );
    // Al guardar votos, comprueba si ya existen fotos para no duplicarlas
    assert.match(
      formularioCode,
      /const fotosExistentes = \(await getFotosByMesa\(mesaId\)\)\.length > 0/,
      'handleGuardar debe comprobar si ya existen fotos guardadas en IDB',
    );
  });

  it('4. Cierre «Cerrar y firmar acta»: envía sinFotoMotivo y espera acuse remoto', () => {
    // handleCerrarActa debe llamar jornadaService.cerrar con sinFotoMotivo
    assert.match(
      formularioCode,
      /jornadaService\.cerrar\(mesaId,\s*\{[\s\S]*?sinFotoMotivo:/,
      'handleCerrarActa debe enviar sinFotoMotivo a jornadaService.cerrar',
    );
    // Debe esperar el acuse del servidor antes de fijar actaCerrada
    assert.match(
      formularioCode,
      /const jornada = await jornadaService\.cerrar[\s\S]*?setActaCerrada\(true\)/,
      'handleCerrarActa debe esperar la respuesta del servidor antes de confirmar el acta',
    );
    // Si el servidor falla (ej. E14_FOTO_REQUERIDA), debe atrapar el error sin cerrar
    assert.match(
      formularioCode,
      /catch\s*\(\s*err[\s\S]*?E14_FOTO_REQUERIDA[\s\S]*?setError\(/,
      'handleCerrarActa debe manejar E14_FOTO_REQUERIDA mostrando el error amigable sin cerrar',
    );
  });

  it('5. Ambos caminos de cierre (botón directo y WizardCierre) envían sinFotoMotivo a /testigos/jornada/cerrar', () => {
    assert.match(
      formularioCode,
      /jornadaService\.cerrar\([\s\S]*?sinFotoMotivo:/,
      'FormularioMesaMultiple debe enviar sinFotoMotivo en su cierre directo',
    );
    assert.match(
      wizardCode,
      /jornadaService\.cerrar\(mesaId,[\s\S]*?sinFotoMotivo:/,
      'WizardCierre debe enviar sinFotoMotivo en el cierre asistido',
    );
  });

  it('6. Contrato de subida S3 en syncService: sube fotos sin votos y no pasa por /testigos/sync ni /e14/foto', () => {
    // syncService puede subir fotos incluso si resultados está vacío
    assert.match(
      syncServiceCode,
      /if\s*\(\s*fotos\.length\s*>\s*0\s*\)\s*\{[\s\S]*?subirFotoE14Directo/,
      'syncService debe procesar fotos independientemente de que haya resultados',
    );
    // No envía las fotos como multipart en /testigos/sync
    assert.doesNotMatch(
      syncServiceCode,
      /\/testigos\/sync['"],\s*[\s\S]*?foto\.blob/,
      'No debe enviar blob de fotos a /testigos/sync',
    );
  });
});
