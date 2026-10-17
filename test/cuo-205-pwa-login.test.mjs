import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Importar directamente la función de producto mapearErrorAuth
import { mapearErrorAuth } from '../src/services/authErrors.ts';

describe('CUO-205: PWA login sin recortar la cédula y con errores en español', () => {
  const loginPagePath = path.join(rootDir, 'src', 'components', 'auth', 'LoginPage.tsx');
  const selectorMesaPath = path.join(rootDir, 'src', 'components', 'auth', 'SelectorMesa.tsx');
  const appPath = path.join(rootDir, 'src', 'App.tsx');
  const authServicePath = path.join(rootDir, 'src', 'services', 'authService.ts');

  const loginPageCode = fs.readFileSync(loginPagePath, 'utf8');
  const selectorMesaCode = fs.readFileSync(selectorMesaPath, 'utf8');
  const appCode = fs.readFileSync(appPath, 'utf8');
  const authServiceCode = fs.readFileSync(authServicePath, 'utf8');

  // ─── 1. Mapeo de errores a español claro y sin textos de axios ──────────
  describe('mapearErrorAuth: traducción rigurosa de errores sin axios ni códigos crudos', () => {
    it('HTTP 400 mapea a «Revisa tu cédula y tu PIN de 6 dígitos»', () => {
      const axiosErr400 = {
        isAxiosError: true,
        response: { status: 400, data: { error: 'Datos inválidos' } },
        message: 'Request failed with status code 400',
      };
      assert.strictEqual(mapearErrorAuth(axiosErr400), 'Revisa tu cédula y tu PIN de 6 dígitos');

      // Error nativo con mensaje de 400
      assert.strictEqual(
        mapearErrorAuth(new Error('Request failed with status code 400')),
        'Revisa tu cédula y tu PIN de 6 dígitos'
      );
      assert.strictEqual(
        mapearErrorAuth('Request failed with status code 400'),
        'Revisa tu cédula y tu PIN de 6 dígitos'
      );
    });

    it('HTTP 401 mapea a «Cédula o PIN incorrectos»', () => {
      const axiosErr401 = {
        isAxiosError: true,
        response: { status: 401, data: { error: 'Credenciales inválidas' } },
        message: 'Request failed with status code 401',
      };
      assert.strictEqual(mapearErrorAuth(axiosErr401), 'Cédula o PIN incorrectos');
      assert.strictEqual(
        mapearErrorAuth(new Error('Request failed with status code 401')),
        'Cédula o PIN incorrectos'
      );
      assert.strictEqual(
        mapearErrorAuth('Request failed with status code 401'),
        'Cédula o PIN incorrectos'
      );
    });

    it('HTTP 429 mapea a «Demasiados intentos, espera unos minutos»', () => {
      const axiosErr429 = {
        isAxiosError: true,
        response: { status: 429, data: { error: 'Too many requests' } },
        message: 'Request failed with status code 429',
      };
      assert.strictEqual(mapearErrorAuth(axiosErr429), 'Demasiados intentos, espera unos minutos');
      assert.strictEqual(
        mapearErrorAuth(new Error('Request failed with status code 429')),
        'Demasiados intentos, espera unos minutos'
      );
      assert.strictEqual(
        mapearErrorAuth('Request failed with status code 429'),
        'Demasiados intentos, espera unos minutos'
      );
    });

    it('Sin red / timeout / offline mapea a «No hay internet; reintenta cuando tengas señal»', () => {
      const netErr = {
        isAxiosError: true,
        code: 'ERR_NETWORK',
        message: 'Network Error',
      };
      assert.strictEqual(mapearErrorAuth(netErr), 'No hay internet; reintenta cuando tengas señal');

      const econErr = {
        isAxiosError: true,
        code: 'ECONNABORTED',
        message: 'timeout of 5000ms exceeded',
      };
      assert.strictEqual(mapearErrorAuth(econErr), 'No hay internet; reintenta cuando tengas señal');

      assert.strictEqual(
        mapearErrorAuth(new Error('Network Error')),
        'No hay internet; reintenta cuando tengas señal'
      );
      assert.strictEqual(
        mapearErrorAuth(new Error('Failed to fetch')),
        'No hay internet; reintenta cuando tengas señal'
      );
    });

    it('Criterio de aceptación: NINGÚN mensaje contiene «status code» ni «Request failed»', () => {
      const escenarios = [
        { isAxiosError: true, response: { status: 400 }, message: 'Request failed with status code 400' },
        { isAxiosError: true, response: { status: 401 }, message: 'Request failed with status code 401' },
        { isAxiosError: true, response: { status: 403 }, message: 'Request failed with status code 403' },
        { isAxiosError: true, response: { status: 404 }, message: 'Request failed with status code 404' },
        { isAxiosError: true, response: { status: 429 }, message: 'Request failed with status code 429' },
        { isAxiosError: true, response: { status: 500 }, message: 'Request failed with status code 500' },
        new Error('Request failed with status code 400'),
        new Error('Request failed with status code 503'),
        'Request failed with status code 404',
        'Unknown request failed without code',
      ];

      for (const esc of escenarios) {
        const resultado = mapearErrorAuth(esc);
        assert.doesNotMatch(
          resultado,
          /status code/i,
          `El mensaje resultante "${resultado}" no debe contener "status code"`
        );
        assert.doesNotMatch(
          resultado,
          /request failed/i,
          `El mensaje resultante "${resultado}" no debe contener "request failed"`
        );
      }
    });

    it('authService.login lanza Error con mensaje limpio y no expone AxiosError crudo', () => {
      assert.match(
        authServiceCode,
        /const mensaje = mapearErrorAuth\(error\);/,
        'authService.login debe transformar cualquier error mediante mapearErrorAuth'
      );
      assert.match(
        authServiceCode,
        /throw new Error\(mensaje\);/,
        'authService.login debe lanzar un Error con el mensaje mapeado'
      );
      assert.doesNotMatch(
        authServiceCode,
        /if \(error instanceof Error\) \{\s*throw error;\s*\}/,
        'authService.login no debe relanzar errores de Axios sin procesar'
      );
    });
  });

  // ─── 2. Cédula sin recortar y validaciones de campo en LoginPage ────────
  describe('LoginPage: preservación de cédula alfanumérica y validación 5-15', () => {
    it('No recorta caracteres no numéricos en onChange de cédula', () => {
      // No debe existir replace(/\D/g, '') en el onChange de cédula
      assert.doesNotMatch(
        loginPageCode,
        /setCedula\([^)]*replace\(\/\\D\/g/i,
        'setCedula no debe eliminar caracteres no numéricos con replace(/\\D/g)'
      );
      // Debe permitir cédulas alfanuméricas con slice(0, 15)
      assert.match(
        loginPageCode,
        /setCedula\(e\.target\.value\.slice\(0,\s*15\)\)/,
        'setCedula debe mantener la cadena intacta hasta 15 caracteres'
      );
    });

    it('Cédula tiene inputMode="text" y autoComplete="username"', () => {
      assert.match(
        loginPageCode,
        /inputMode="text"/,
        'El campo de cédula debe tener inputMode="text" para permitir teclado alfanumérico'
      );
      assert.match(
        loginPageCode,
        /autoComplete="username"/,
        'El campo de cédula debe tener autoComplete="username"'
      );
      assert.match(
        loginPageCode,
        /maxLength=\{15\}/,
        'El campo de cédula debe limitar a 15 caracteres'
      );
    });

    it('PIN mantiene inputMode="numeric" y autoComplete="current-password"', () => {
      assert.match(
        loginPageCode,
        /inputMode="numeric"/,
        'El PIN debe tener inputMode="numeric"'
      );
      assert.match(
        loginPageCode,
        /autoComplete="current-password"/,
        'El PIN debe tener autoComplete="current-password"'
      );
      assert.match(
        loginPageCode,
        /maxLength=\{6\}/,
        'El PIN debe tener maxLength 6'
      );
    });

    it('Valida longitud de cédula entre 5 y 15 caracteres y muestra error junto al campo', () => {
      assert.match(
        loginPageCode,
        /cleanCedula\.length < 5 \|\| cleanCedula\.length > 15/,
        'Debe validar longitud de cédula entre 5 y 15 caracteres'
      );
      assert.match(
        loginPageCode,
        /setCedulaError\('La cédula debe tener entre 5 y 15 caracteres'\)/,
        'Debe mostrar mensaje explicativo de longitud de cédula'
      );
      assert.match(
        loginPageCode,
        /id="cedula-error"/,
        'Debe existir un elemento para el error de cédula junto al campo'
      );
      assert.match(
        loginPageCode,
        /aria-describedby=\{cedulaError \? 'cedula-error' : undefined\}/,
        'El input de cédula debe asociarse al error con aria-describedby'
      );
    });

    it('Muestra error de PIN junto al campo y valida exactamente 6 dígitos', () => {
      assert.match(
        loginPageCode,
        /setPinError\('El PIN debe tener 6 dígitos'\)/,
        'Debe validar que el PIN tenga 6 dígitos'
      );
      assert.match(
        loginPageCode,
        /id="pin-error"/,
        'Debe existir un elemento para el error de PIN junto al campo'
      );
      assert.match(
        loginPageCode,
        /aria-describedby=\{pinError \? 'pin-error' : 'pin-ayuda'\}/,
        'El input de PIN debe asociarse con aria-describedby'
      );
    });

    it('Accesibilidad aria-live="polite" en mensajes de error', () => {
      assert.match(
        loginPageCode,
        /id="cedula-error"[\s\S]*?aria-live="polite"/,
        'El error de cédula debe tener aria-live="polite"'
      );
      assert.match(
        loginPageCode,
        /id="pin-error"[\s\S]*?aria-live="polite"/,
        'El error de PIN debe tener aria-live="polite"'
      );
      assert.match(
        loginPageCode,
        /role="alert"[\s\S]*?aria-live="polite"/,
        'El contenedor de error general debe tener role="alert" y aria-live="polite"'
      );
    });

    it('Diseño editorial: sin degradados estéticos en login', () => {
      assert.doesNotMatch(
        loginPageCode,
        /bg-gradient-to-br from-editorial-red-50 to-red-700/,
        'No debe tener degradados en el logo de Login'
      );
      assert.doesNotMatch(
        loginPageCode,
        /bg-gradient-to-br from-editorial-red to-red-700/,
        'El botón no debe usar degradados'
      );
      assert.match(
        loginPageCode,
        /bg-editorial-red/,
        'Debe utilizar el rojo editorial #DC2626 plano'
      );
    });
  });

  // ─── 3. Objetivos táctiles de al menos 48 px ───────────────────────────
  describe('Objetivos táctiles (touch targets) >= 48 px en Login y Selector', () => {
    it('LoginPage: todos los controles interactivos tienen min-h-[48px]', () => {
      // Input cédula
      assert.match(
        loginPageCode,
        /id="cedula"[\s\S]*?min-h-\[48px\]/,
        'Input de cédula debe tener min-h-[48px]'
      );
      // Input PIN
      assert.match(
        loginPageCode,
        /id="pin"[\s\S]*?min-h-\[48px\]/,
        'Input de PIN debe tener min-h-[48px]'
      );
      // Botón submit
      assert.match(
        loginPageCode,
        /type="submit"[\s\S]*?min-h-\[48px\]/,
        'Botón de submit debe tener min-h-[48px]'
      );
    });

    it('SelectorMesa: tarjetas de mesa interactivas tienen min-h-[48px]', () => {
      assert.match(
        selectorMesaCode,
        /min-h-\[48px\]/,
        'Las tarjetas de mesa deben especificar min-h-[48px]'
      );
    });

    it('SelectorMesa y App.tsx: botón «Cerrar sesión» mide al menos 48 px', () => {
      // En App.tsx, en la cabecera del selector de mesa
      assert.match(
        appCode,
        /onClick=\{handleLogout\}[\s\S]*?min-h-\[48px\][\s\S]*?min-w-\[48px\][\s\S]*?>[\s\S]*?Cerrar Sesión/,
        'El botón Cerrar Sesión del selector en App.tsx debe tener min-h-[48px] y min-w-[48px]'
      );

      // En SelectorMesa.tsx cuando se pasa onLogout
      assert.match(
        selectorMesaCode,
        /onClick=\{onLogout\}[\s\S]*?min-h-\[48px\][\s\S]*?min-w-\[48px\]/,
        'El botón Cerrar Sesión en SelectorMesa debe tener min-h-[48px] y min-w-[48px]'
      );
    });
  });
});
