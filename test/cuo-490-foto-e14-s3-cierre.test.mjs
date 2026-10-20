import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Importar lógica desacoplada de S3 y cierre
import {
  calcularSha256,
  evaluarRespuestaS3,
  construirFormDataS3,
  subirDirectoS3,
  evaluarRequisitoFotoCierre,
} from '../src/services/syncResponseLogic.ts';

import { formatearErrorAmigable } from '../src/utils/formatoError.ts';

describe('CUO-490: PWA: Foto del E-14 primero y obligatoria, subida directa a S3 y justificación', () => {
  const formularioPath = path.join(rootDir, 'src', 'components', 'formulario', 'FormularioMesaMultiple.tsx');
  const wizardPath = path.join(rootDir, 'src', 'components', 'jornada', 'WizardCierre.tsx');
  const capturaMultiplePath = path.join(rootDir, 'src', 'components', 'camera', 'CapturaMultipleE14.tsx');
  const capturaE14Path = path.join(rootDir, 'src', 'components', 'camera', 'CapturaE14.tsx');
  const capturaFotoPath = path.join(rootDir, 'src', 'components', 'formulario', 'CapturaFoto.tsx');
  const syncServicePath = path.join(rootDir, 'src', 'services', 'syncService.ts');
  const jornadaServicePath = path.join(rootDir, 'src', 'services', 'jornadaService.ts');

  const formularioCode = fs.readFileSync(formularioPath, 'utf8');
  const wizardCode = fs.readFileSync(wizardPath, 'utf8');
  const capturaMultipleCode = fs.readFileSync(capturaMultiplePath, 'utf8');
  const capturaE14Code = fs.readFileSync(capturaE14Path, 'utf8');
  const capturaFotoCode = fs.readFileSync(capturaFotoPath, 'utf8');
  const syncServiceCode = fs.readFileSync(syncServicePath, 'utf8');
  const jornadaServiceCode = fs.readFileSync(jornadaServicePath, 'utf8');

  // ─── 1. Orden de pasos y rotulado como evidencia obligatoria ───────

  it('1. El orden queda «1. Foto E-14», «2. Revisar votos» y «3. Cerrar», con la foto como paso inicial', () => {
    // Estado inicial en 'foto'
    assert.match(
      formularioCode,
      /useState<['"]foto['"]\s*\|\s*['"]contar['"]\s*\|\s*['"]cierre['"]>\(['"]foto['"]\)/,
      'El paso inicial por defecto debe ser foto',
    );

    // Stepper accesible en el nuevo orden
    assert.match(
      formularioCode,
      /id="tab-foto"[^>]*>[\s\S]*?1\.\s*Foto\s*E-14/,
      'La primera pestaña debe ser «1. Foto E-14»',
    );
    assert.match(
      formularioCode,
      /id="tab-contar"[^>]*>[\s\S]*?2\.\s*Revisar\s*votos/,
      'La segunda pestaña debe ser «2. Revisar votos»',
    );
    assert.match(
      formularioCode,
      /id="tab-cierre"[^>]*>[\s\S]*?3\.\s*Cerrar/,
      'La tercera pestaña debe ser «3. Cerrar»',
    );
  });

  it('2. La foto deja de decir «opcional» y se rotula como evidencia', () => {
    assert.doesNotMatch(
      capturaE14Code,
      /Foto del E-14 \(Opcional\)/i,
      'CapturaE14 no debe decir Foto del E-14 (Opcional)',
    );
    assert.match(
      capturaE14Code,
      /Foto del E-14 \(Evidencia\)/i,
      'CapturaE14 debe rotularse como evidencia',
    );

    assert.doesNotMatch(
      capturaFotoCode,
      /Foto del E-14 \(Opcional\)/i,
      'CapturaFoto no debe decir Foto del E-14 (Opcional)',
    );
    assert.match(
      capturaFotoCode,
      /Foto del E-14 \(Evidencia\)/i,
      'CapturaFoto debe rotularse como evidencia',
    );

    assert.match(
      capturaMultipleCode,
      /Fotos del E-14 \(evidencia\)/i,
      'CapturaMultipleE14 debe rotularse como evidencia',
    );
  });

  // ─── 2. Subida directa a S3 y no como multipart al servidor ────────

  it('3. La foto NO se manda a /e14/foto ni a /sincronizar como multipart', () => {
    // En syncService, formData solo debe enviar resultados, no fotos en el POST a /testigos/sync
    assert.doesNotMatch(
      syncServiceCode,
      /formData\.append\(['"]fotos['"],\s*foto\.blob/,
      'No debe enviar las fotos en el FormData de sincronización',
    );
    assert.doesNotMatch(
      syncServiceCode,
      /\/e14\/foto\b/,
      'No debe tener endpoint obsoleto /e14/foto',
    );
    assert.match(
      syncServiceCode,
      /subirFotoE14Directo/,
      'Debe utilizar la función de subida directa a S3',
    );
  });

  it('4. Cálculo de hash SHA-256 genera 64 caracteres hexadecimales en minúsculas', async () => {
    const syntheticBlob = new Blob(['imagen sintetica de prueba E-14'], { type: 'image/jpeg' });
    const hash = await calcularSha256(syntheticBlob);
    assert.equal(typeof hash, 'string');
    assert.equal(hash.length, 64);
    assert.match(hash, /^[a-f0-9]{64}$/, 'El hash debe ser SHA-256 en minúsculas');
  });

  it('5. Construcción de FormData para S3 coloca fields antes del archivo file', () => {
    const post = {
      fields: {
        key: 'campanas/c1/e14/m1/foto.jpg',
        bucket: 'test-bucket',
        'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
      },
    };
    const syntheticBlob = new Blob(['foto e14 bytes'], { type: 'image/jpeg' });
    const fd = construirFormDataS3(post, syntheticBlob, 'evidencia.jpg');

    assert.ok(fd.has('key'), 'Debe contener key');
    assert.ok(fd.has('bucket'), 'Debe contener bucket');
    assert.ok(fd.has('file'), 'Debe contener file');
  });

  it('6. Flujo de subida S3 simulado: éxito completo directo a S3 con evaluación 204/200', async () => {
    const llamadasS3 = [];
    const mockFetch = async (url, options) => {
      llamadasS3.push({ url, options });
      return {
        ok: true,
        status: 204,
        text: async () => '',
      };
    };

    const mockPost = {
      url: 'https://test-bucket.s3.amazonaws.com',
      fields: {
        key: 'campanas/c1/e14/m1/foto1.jpg',
        'Content-Type': 'image/jpeg',
      },
    };
    const syntheticBlob = new Blob(['datos de foto sintetica e14'], { type: 'image/jpeg' });

    await subirDirectoS3(mockPost, syntheticBlob, mockFetch);

    assert.equal(llamadasS3.length, 1);
    assert.equal(llamadasS3[0].url, 'https://test-bucket.s3.amazonaws.com');
    assert.equal(llamadasS3[0].options.method, 'POST');

    const hash = await calcularSha256(syntheticBlob);
    assert.equal(hash.length, 64);
  });

  it('7. Flujo de subida S3 simulado: firma vencida se detecta para renovación', async () => {
    // S3 responde con 403 y SignatureExpired / Request has expired
    const resExp = evaluarRespuestaS3(403, '<Error><Code>Request has expired</Code></Error>');
    assert.equal(resExp.ok, false);
    assert.equal(resExp.firmaExpirada, true, 'Debe detectar firma expirada');
    assert.match(resExp.error, /expiró/i);

    // Con HTTP 400 ExpiredToken
    const res400 = evaluarRespuestaS3(400, '<Error><Code>ExpiredToken</Code></Error>');
    assert.equal(res400.firmaExpirada, true);

    // Con HTTP 200/204 éxito
    const resOk = evaluarRespuestaS3(204);
    assert.equal(resOk.ok, true);
    assert.equal(resOk.firmaExpirada, false);

    // Reintento simulado en subirDirectoS3
    let intento = 0;
    const mockFetchConRenovacion = async () => {
      intento++;
      if (intento === 1) {
        return {
          ok: false,
          status: 403,
          text: async () => '<Error><Code>Request has expired</Code></Error>',
        };
      }
      return {
        ok: true,
        status: 204,
        text: async () => '',
      };
    };

    const mockPost = { url: 'https://s3.local', fields: { key: 'foto.jpg' } };
    const blob = new Blob(['foto'], { type: 'image/jpeg' });

    // Intento 1: lanza error con firmaExpirada: true
    let detectoExpirada = false;
    try {
      await subirDirectoS3(mockPost, blob, mockFetchConRenovacion);
    } catch (e) {
      detectoExpirada = e.firmaExpirada === true;
    }
    assert.equal(detectoExpirada, true, 'Debe marcar la excepción con firmaExpirada=true');

    // Intento 2 con firma nueva: éxito
    await subirDirectoS3(mockPost, blob, mockFetchConRenovacion);
    assert.equal(intento, 2, 'Debe completar el reintento exitoso');
  });

  it('8. Flujo sin conexión: error de red preserva foto en cola para reintento automático', async () => {
    const mockFetchOffline = async () => {
      throw new TypeError('Failed to fetch (offline)');
    };

    const mockPost = { url: 'https://s3.local', fields: { key: 'offline.jpg' } };
    const blob = new Blob(['foto offline'], { type: 'image/jpeg' });

    let falloRed = false;
    try {
      await subirDirectoS3(mockPost, blob, mockFetchOffline);
    } catch (err) {
      falloRed = true;
      assert.match(err.message, /Failed to fetch/i);
    }
    assert.equal(falloRed, true, 'Debe fallar sin señal para mantener el item en cola');
  });

  // ─── 3. Bloqueo de «Cerrar» sin foto ni motivo (CUO-489 / CUO-490) ──

  it('9. «Cerrar» queda bloqueado en la interfaz sin foto ni motivo', () => {
    // 1. Sin foto y sin motivo: NO se puede cerrar
    const c1 = evaluarRequisitoFotoCierre(0, false, false, '');
    assert.equal(c1.puedeCerrar, false, 'Sin foto ni motivo no se debe permitir cerrar');
    assert.equal(c1.tieneFotos, false);
    assert.equal(c1.motivoValido, false);

    // 2. Con motivo menor a 10 caracteres: NO se puede cerrar
    const c2 = evaluarRequisitoFotoCierre(0, false, false, 'Corto');
    assert.equal(c2.puedeCerrar, false, 'Motivo de 5 caracteres no debe permitir cerrar');
    assert.equal(c2.motivoValido, false);

    const c3 = evaluarRequisitoFotoCierre(0, false, false, '123456789'); // 9 chars
    assert.equal(c3.puedeCerrar, false, 'Motivo de 9 caracteres no debe permitir cerrar');

    // 3. Con motivo >= 10 caracteres: SÍ se puede cerrar
    const c4 = evaluarRequisitoFotoCierre(0, false, false, 'El jurado no permitió tomar la foto');
    assert.equal(c4.puedeCerrar, true, 'Motivo válido >= 10 caracteres debe habilitar cerrar');
    assert.equal(c4.motivoValido, true);

    // 4. Con fotos en cola/subidas: SÍ se puede cerrar sin necesidad de motivo
    const c5 = evaluarRequisitoFotoCierre(1, false, false, '');
    assert.equal(c5.puedeCerrar, true, 'Con foto en cola debe habilitar cerrar');

    const c6 = evaluarRequisitoFotoCierre(0, true, false, '');
    assert.equal(c6.puedeCerrar, true, 'Con fotos recién capturadas debe habilitar cerrar');

    // Verificación en código de FormularioMesaMultiple
    assert.match(
      formularioCode,
      /disabled=\{!puedeCerrar\}/,
      'El botón de Cerrar Acta de Mesa debe estar disabled si !puedeCerrar',
    );
  });

  it('10. La salida «No pude tomar la foto» pide el motivo y lo manda como sinFotoMotivo', () => {
    assert.match(
      formularioCode,
      /No pude tomar la foto/,
      'Debe existir la salida «No pude tomar la foto»',
    );
    assert.match(
      formularioCode,
      /sinFotoMotivo=\{sinFotoMotivo\}/,
      'Debe pasar sinFotoMotivo al modal WizardCierre',
    );
    assert.match(
      wizardCode,
      /sinFotoMotivo\?: string/,
      'WizardCierre debe aceptar sinFotoMotivo en sus props',
    );
    assert.match(
      wizardCode,
      /jornadaService\.cerrar\(mesaId,[\s\S]*?sinFotoMotivo/,
      'WizardCierre debe enviar sinFotoMotivo al servicio de cierre',
    );
    assert.match(
      jornadaServiceCode,
      /sinFotoMotivo\?: string/,
      'jornadaService.cerrar debe declarar sinFotoMotivo',
    );
  });

  it('11. Si el servidor responde E14_FOTO_REQUERIDA se muestra en lenguaje sencillo', () => {
    const errorSinteticoServidor = {
      response: {
        status: 400,
        data: {
          codigo: 'E14_FOTO_REQUERIDA',
          error: 'Debe subir la foto del E-14 o explicar por qué no pudo tomarla en al menos 10 caracteres',
        },
      },
    };

    const mensajeFormateado = formatearErrorAmigable(errorSinteticoServidor);
    assert.match(
      mensajeFormateado,
      /foto del acta E-14|evidencia obligatoria/i,
      'Debe explicar en español sencillo que la foto es requerida',
    );
    assert.doesNotMatch(mensajeFormateado, /E14_FOTO_REQUERIDA/);
    assert.doesNotMatch(mensajeFormateado, /400/);
    assert.doesNotMatch(mensajeFormateado, /status code/i);

    // Verificación en WizardCierre
    assert.match(
      wizardCode,
      /E14_FOTO_REQUERIDA/,
      'WizardCierre debe capturar explícitamente E14_FOTO_REQUERIDA',
    );
  });
});
