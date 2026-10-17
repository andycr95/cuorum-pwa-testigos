import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Importar lógica de formateo de errores
import {
  formatearErrorAmigable,
  MENSAJES_OCR,
} from '../src/utils/formatoError.ts';

describe('CUO-206: Sanitización de errores sin códigos HTTP ni inglés', () => {
  it('convierte "Request failed with status code 500" a lenguaje no técnico en español', () => {
    const rawError = 'Request failed with status code 500';
    const amigable = formatearErrorAmigable(rawError);

    assert.ok(!amigable.includes('500'), 'No debe contener el código HTTP 500');
    assert.ok(!amigable.toLowerCase().includes('request failed'), 'No debe contener inglés');
    assert.ok(!amigable.toLowerCase().includes('status code'), 'No debe contener status code');
    assert.ok(
      amigable.includes('servidor') && amigable.includes('guardada en el teléfono'),
      'Debe indicar en español que los datos están guardados en el teléfono',
    );
  });

  it('convierte "Network Error" a mensaje claro en español con garantía de datos locales', () => {
    const rawError = new Error('Network Error');
    const amigable = formatearErrorAmigable(rawError);

    assert.ok(!amigable.toLowerCase().includes('network error'), 'No debe contener Network Error');
    assert.ok(
      amigable.toLowerCase().includes('sin conexión') || amigable.toLowerCase().includes('señal'),
      'Debe orientar sobre la conexión o señal',
    );
    assert.ok(
      amigable.toLowerCase().includes('teléfono'),
      'Debe asegurar que los datos están en el teléfono',
    );
  });

  it('convierte errores 404, 403, 401 y 400 a mensajes orientadores en español', () => {
    const e404 = formatearErrorAmigable('Request failed with status code 404');
    const e403 = formatearErrorAmigable('HTTP 403 Forbidden');
    const e400 = formatearErrorAmigable('Request failed with status code 400');

    assert.ok(!e404.includes('404') && !e404.includes('Request failed'));
    assert.ok(!e403.includes('403') && !e403.includes('Forbidden'));
    assert.ok(!e400.includes('400') && !e400.includes('Bad Request'));
    assert.ok(e404.includes('coordinador') || e404.includes('disponible'));
    assert.ok(e403.includes('permisos') || e403.includes('sesión') || e403.includes('coordinador'));
  });

  it('garantiza que ningún mensaje formateado retenga códigos HTTP ni inglés', () => {
    const casos = [
      'Error: Request failed with status code 502 Bad Gateway',
      'timeout of 10000ms exceeded',
      'Failed to fetch',
      'AxiosError: Request failed with status code 503',
    ];

    for (const caso of casos) {
      const res = formatearErrorAmigable(caso);
      assert.ok(!/\b\d{3}\b/.test(res), `No debe incluir números HTTP: "${res}"`);
      assert.ok(!res.includes('Request failed'), `No debe tener texto en inglés: "${res}"`);
      assert.ok(!res.includes('timeout'), `No debe tener timeout en inglés: "${res}"`);
    }
  });

  it('preserva mensajes útiles de validación y dominio sin ocultar cifras legítimas', () => {
    const validacionSuma = 'La suma (305) supera los 300 sufragantes';
    assert.equal(
      formatearErrorAmigable(validacionSuma),
      validacionSuma,
      'Debe preservar mensajes con cifras numéricas de validación',
    );

    const mensajeVotos = '500 votos registrados en la mesa';
    assert.equal(
      formatearErrorAmigable(mensajeVotos),
      mensajeVotos,
      'No debe confundir números en el texto con códigos de error HTTP',
    );

    const axiosValidation = {
      response: {
        status: 400,
        data: { error: 'La suma (305) supera los 300 sufragantes' },
      },
    };
    assert.equal(
      formatearErrorAmigable(axiosValidation),
      'La suma (305) supera los 300 sufragantes',
      'Debe extraer y retornar el mensaje de dominio de response.data',
    );
  });

  it('decide por response.status o err.code cuando no hay mensaje de dominio', () => {
    const err500 = { response: { status: 500 } };
    const res500 = formatearErrorAmigable(err500);
    assert.ok(res500.includes('servidor') && res500.includes('teléfono'));

    const err404 = { response: { status: 404 } };
    const res404 = formatearErrorAmigable(err404);
    assert.ok(res404.includes('coordinador') || res404.includes('disponible'));

    const errNet = { code: 'ERR_NETWORK' };
    const resNet = formatearErrorAmigable(errNet);
    assert.ok(resNet.includes('conexión') && resNet.includes('teléfono'));
  });

  it('proporciona constantes orientadoras para OCR con estado de foto guardada', () => {
    assert.equal(
      MENSAJES_OCR.FOTO_GUARDADA,
      'Tu foto está guardada en el teléfono. Reintentaremos cuando haya señal.',
      'Debe contener la frase exacta exigida en el criterio de aceptación del ticket',
    );
  });
});

describe('CUO-206: Componente EstadoVacio / ErrorAccion', () => {
  const estadoVacioPath = path.join(rootDir, 'src', 'components', 'ui', 'EstadoVacio.tsx');
  const errorAccionPath = path.join(rootDir, 'src', 'components', 'ui', 'ErrorAccion.tsx');
  const estadoVacioCode = fs.readFileSync(estadoVacioPath, 'utf8');
  const errorAccionCode = fs.readFileSync(errorAccionPath, 'utf8');

  it('EstadoVacio: implementa botón táctil con min-h-[48px] y color rojo de marca #DC2626', () => {
    assert.match(estadoVacioCode, /min-h-\[48px\]/, 'El botón debe tener objetivo táctil de al menos 48 px');
    assert.match(estadoVacioCode, /bg-editorial-red/, 'Debe usar el rojo editorial de marca');
    assert.doesNotMatch(estadoVacioCode, /bg-gradient/, 'No debe contener degradados en contra del sistema editorial');
  });

  it('EstadoVacio: implementa roles de accesibilidad semánticos (alert y status)', () => {
    assert.match(estadoVacioCode, /role=\{tipo === 'error' \? 'alert' : 'status'\}/, 'Debe configurar role="alert" o role="status"');
    assert.match(estadoVacioCode, /aria-hidden="true"/, 'Los íconos decorativos SVG deben tener aria-hidden');
  });

  it('EstadoVacio: exporta el alias semántico ErrorAccion', () => {
    assert.match(estadoVacioCode, /export const ErrorAccion = EstadoVacio/, 'Debe exportar ErrorAccion');
    assert.match(errorAccionCode, /export \{ EstadoVacio, ErrorAccion/, 'ErrorAccion.tsx debe reexportar el componente');
  });
});

describe('CUO-206: Caso sin elecciones en FormularioMesaMultiple', () => {
  const formularioPath = path.join(rootDir, 'src', 'components', 'formulario', 'FormularioMesaMultiple.tsx');
  const appPath = path.join(rootDir, 'src', 'App.tsx');
  const formularioCode = fs.readFileSync(formularioPath, 'utf8');
  const appCode = fs.readFileSync(appPath, 'utf8');

  it('FormularioMesaMultiple: elimina la pantalla sin salida antigua "Error: Elección no encontrada"', () => {
    assert.doesNotMatch(
      formularioCode,
      /<p className="text-red-700">Error: Elección no encontrada<\/p>/,
      'No debe existir el mensaje antiguo sin salida',
    );
  });

  it('FormularioMesaMultiple: implementa EstadoVacio cuando elecciones.length === 0 con mensaje textual y retorno', () => {
    assert.match(formularioCode, /if \(elecciones\.length === 0\)/, 'Debe verificar explícitamente elecciones.length === 0');
    assert.match(formularioCode, /titulo="Sin elecciones asignadas"/, 'Debe tener título claro');
    assert.match(
      formularioCode,
      /mensaje="Tu mesa aún no tiene elecciones asignadas\. Avisa a tu coordinador\."/,
      'Debe incluir la frase exigida: "Tu mesa aún no tiene elecciones asignadas. Avisa a tu coordinador."',
    );
    assert.match(
      formularioCode,
      /texto: 'Volver al selector de mesa'/,
      'Debe incluir el botón con texto "Volver al selector de mesa"',
    );
    assert.match(
      formularioCode,
      /onVolverSelector\?: \(\) => void/,
      'Debe aceptar la prop onVolverSelector',
    );
  });

  it('App.tsx: pasa handleBackToSelector como onVolverSelector a FormularioMesaMultiple', () => {
    assert.match(
      appCode,
      /onVolverSelector=\{handleBackToSelector\}/,
      'App.tsx debe suministrar handleBackToSelector para permitir el retorno',
    );
  });

  it('FormularioMesaMultiple: sanitiza syncStatus.error evitando códigos HTTP e inglés', () => {
    assert.match(
      formularioCode,
      /\{formatearErrorAmigable\(syncStatus\.error\)\}/,
      'Debe sanitizar syncStatus.error con formatearErrorAmigable',
    );
  });
});

describe('CUO-206: Error de OCR con foto guardada en el teléfono', () => {
  const estadoOcrPath = path.join(rootDir, 'src', 'components', 'camera', 'EstadoOcrE14.tsx');
  const useOcrJobsPath = path.join(rootDir, 'src', 'hooks', 'useOcrJobsE14.ts');
  const estadoOcrCode = fs.readFileSync(estadoOcrPath, 'utf8');
  const useOcrJobsCode = fs.readFileSync(useOcrJobsPath, 'utf8');

  it('EstadoOcrE14: muestra tarjeta con foto guardada en el teléfono y botón de reintento', () => {
    assert.match(estadoOcrCode, /if \(job\.estado === 'ERROR'\)/, 'Debe ramificar explícitamente job.estado === ERROR');
    assert.match(
      estadoOcrCode,
      /MENSAJES_OCR\.FOTO_GUARDADA/,
      'Debe mostrar MENSAJES_OCR.FOTO_GUARDADA ("Tu foto está guardada en el teléfono. Reintentaremos cuando haya señal.")',
    );
    assert.match(
      estadoOcrCode,
      /<span>Reintentar<\/span>/,
      'Debe mostrar botón con texto "Reintentar"',
    );
    assert.match(
      estadoOcrCode,
      /role="alert"/,
      'Debe tener rol accesible de alerta para lectores de pantalla',
    );
  });

  it('EstadoOcrE14: sanitiza lastSyncError para evitar texto técnico como "Request failed with status code 500"', () => {
    assert.match(
      estadoOcrCode,
      /formatearErrorAmigable\(job\.lastSyncError\)/,
      'Debe sanitizar job.lastSyncError con formatearErrorAmigable',
    );
  });

  it('useOcrJobsE14: sanitiza el error al actualizar el job a estado ERROR', () => {
    assert.match(
      useOcrJobsCode,
      /formatearErrorAmigable\(err, 'No fue posible conectar con el servidor'\)/,
      'Debe sanitizar el error en useOcrJobsE14 antes de persistirlo',
    );
  });
});

describe('CUO-206: Higiene de repo público (sin rutas internas ni usuarios de la VM)', () => {
  it('package.json no contiene rutas internas de la VM ni de la bóveda', () => {
    const pkgPath = path.join(rootDir, 'package.json');
    const pkgContent = fs.readFileSync(pkgPath, 'utf8');

    assert.doesNotMatch(pkgContent, /\/home\/agentes/, 'package.json no debe incluir /home/agentes');
    assert.doesNotMatch(pkgContent, /\/srv\/cuorum/, 'package.json no debe incluir /srv/cuorum');
  });

  it('scripts de test/e2e no contienen rutas absolutas de la VM hardcodeadas', () => {
    const captureScriptPath = path.join(rootDir, 'test', 'capture-and-verify-error-vacio.mjs');
    if (fs.existsSync(captureScriptPath)) {
      const scriptContent = fs.readFileSync(captureScriptPath, 'utf8');
      assert.doesNotMatch(scriptContent, /\/home\/agentes/, 'El script e2e no debe incluir /home/agentes');
      assert.doesNotMatch(scriptContent, /\/srv\/cuorum/, 'El script e2e no debe incluir /srv/cuorum');
    }
  });
});
