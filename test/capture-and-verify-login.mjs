import { spawn, execSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const playwrightPath = process.env.PLAYWRIGHT_PATH || 'playwright';
const playwright = await import(playwrightPath);
const chromium = playwright.chromium || playwright.default?.chromium || playwright.default;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const screenshotsDir = path.join(rootDir, 'test', 'screenshots');
const capturasDir = process.env.CAPTURAS_DIR ? path.resolve(process.env.CAPTURAS_DIR) : null;

if (!fs.existsSync(screenshotsDir)) {
  fs.mkdirSync(screenshotsDir, { recursive: true });
}

async function run() {
  console.log('Compilando PWA con Vite...');
  execSync('npx vite build', { cwd: rootDir, stdio: 'inherit' });

  console.log('Iniciando vite preview en puerto 4703 (puerto de agy-3)...');
  const server = spawn('npx', ['vite', 'preview', '--port', '4703', '--strictPort'], {
    cwd: rootDir,
    stdio: 'pipe',
  });

  server.stdout?.on('data', (d) => console.log(`[Vite stdout] ${d}`));
  server.stderr?.on('data', (d) => console.error(`[Vite stderr] ${d}`));

  await new Promise((resolve) => setTimeout(resolve, 2500));

  console.log('Lanzando Chromium headless...');
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    env: process.env,
  });

  try {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 }, // iPhone 14 / estándar móvil
      deviceScaleFactor: 2,
    });
    const page = await context.newPage();

    // ─── 1. Cargar LoginPage ──────────────────────────────────────────
    console.log('Navegando a http://localhost:4703/...');
    await page.goto('http://localhost:4703/', { waitUntil: 'networkidle' });

    // Verificar que los inputs y botón existan
    const inputCedula = page.locator('#cedula');
    const inputPin = page.locator('#pin');
    const btnSubmit = page.locator('button[type="submit"]');

    await inputCedula.waitFor({ state: 'visible' });
    await inputPin.waitFor({ state: 'visible' });
    await btnSubmit.waitFor({ state: 'visible' });

    // ─── VERIFICACIÓN 1: Objetivos táctiles en Login (>= 48 px) ──────
    console.log('Verificando dimensiones de objetivos táctiles en Login...');
    const boxCedula = await inputCedula.boundingBox();
    const boxPin = await inputPin.boundingBox();
    const boxSubmit = await btnSubmit.boundingBox();

    console.log(`Altura input cédula: ${boxCedula?.height} px`);
    console.log(`Altura input PIN: ${boxPin?.height} px`);
    console.log(`Altura botón submit: ${boxSubmit?.height} px`);

    if (!boxCedula || boxCedula.height < 48) {
      throw new Error(`Input cédula mide ${boxCedula?.height} px, debe ser >= 48 px`);
    }
    if (!boxPin || boxPin.height < 48) {
      throw new Error(`Input PIN mide ${boxPin?.height} px, debe ser >= 48 px`);
    }
    if (!boxSubmit || boxSubmit.height < 48) {
      throw new Error(`Botón submit mide ${boxSubmit?.height} px, debe ser >= 48 px`);
    }

    // ─── VERIFICACIÓN 2: Cédula escrita aparece igual que se envía (sin recortar) ───
    console.log('Probando tipeo de cédula alfanumérica TEST-TES-001...');
    await inputCedula.fill('TEST-TES-001');
    const valorCedula = await inputCedula.inputValue();
    console.log(`Valor en campo cédula: "${valorCedula}"`);

    if (valorCedula !== 'TEST-TES-001') {
      throw new Error(`La cédula fue recortada a "${valorCedula}", se esperaba "TEST-TES-001"`);
    }

    await inputPin.fill('123456');

    // Captura móvil 390 px de LoginPage con cédula alfanumérica
    const capLoginM = path.join(screenshotsDir, 'pwa-01-login-m.png');
    await page.screenshot({ path: capLoginM });
    console.log('Captura guardada:', capLoginM);

    if (capturasDir && fs.existsSync(capturasDir)) {
      fs.copyFileSync(capLoginM, path.join(capturasDir, 'pwa-01-login-m.png'));
    }

    // ─── VERIFICACIÓN 3: Accesibilidad axe-core en LoginPage ──────────
    console.log('Evaluando axe-core en LoginPage...');
    await page.addScriptTag({
      url: 'https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.9.1/axe.min.js',
    });

    const axeLogin = await page.evaluate(async () => {
      // @ts-expect-error axe global
      return await window.axe.run(document, {
        runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] },
      });
    });

    const axeContrast = axeLogin.violations.filter((v) => v.id === 'color-contrast');
    const axeButtons = axeLogin.violations.filter((v) => v.id === 'button-name');
    console.log(`Violaciones contraste en LoginPage: ${axeContrast.length}`);
    console.log(`Violaciones nombres de botón en LoginPage: ${axeButtons.length}`);
    if (axeContrast.length > 0) {
      console.error('Violaciones de contraste:', JSON.stringify(axeContrast, null, 2));
      throw new Error(`Se encontraron ${axeContrast.length} violaciones de color-contrast en LoginPage`);
    }
    if (axeButtons.length > 0) {
      console.error('Violaciones de botones:', JSON.stringify(axeButtons, null, 2));
      throw new Error(`Se encontraron ${axeButtons.length} violaciones de button-name en LoginPage`);
    }

    // ─── VERIFICACIÓN 4: Validación local de longitud 5-15 y mensaje junto al campo ───
    console.log('Probando validación de cédula corta (longitud < 5)...');
    await inputCedula.fill('1234');
    await btnSubmit.click();

    const errorCedulaLoc = page.locator('#cedula-error');
    await errorCedulaLoc.waitFor({ state: 'visible' });
    const textoErrorCedula = await errorCedulaLoc.innerText();
    console.log(`Error de cédula mostrado: "${textoErrorCedula}"`);
    if (!textoErrorCedula.includes('entre 5 y 15')) {
      throw new Error(`Se esperaba error de longitud 5-15, se obtuvo "${textoErrorCedula}"`);
    }

    // ─── VERIFICACIÓN 5: Respuestas de error del servidor en español (sin axios crudo) ───
    console.log('Probando intercepción HTTP 400 y mensaje en español...');
    // Interceptar /api/auth/testigos/login para simular respuesta 400
    await page.route('**/api/auth/testigos/login', async (route) => {
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Datos inválidos' }),
      });
    });

    await inputCedula.fill('TEST-TES-001');
    await inputPin.fill('123456');
    await btnSubmit.click();

    // Esperar mensaje de error
    const alertBox = page.locator('[role="alert"]').filter({ hasText: 'Revisa tu cédula' });
    await alertBox.waitFor({ state: 'visible' });
    const textoError400 = await alertBox.innerText();
    console.log(`Mensaje error 400 recibido: "${textoError400}"`);

    if (!textoError400.includes('Revisa tu cédula y tu PIN de 6 dígitos')) {
      throw new Error(`Se esperaba "Revisa tu cédula y tu PIN de 6 dígitos", se obtuvo "${textoError400}"`);
    }
    if (textoError400.toLowerCase().includes('status code') || textoError400.toLowerCase().includes('request failed')) {
      throw new Error(`Mensaje contiene texto crudo de axios: "${textoError400}"`);
    }

    // Captura móvil de error en español
    const capErrorM = path.join(screenshotsDir, 'pwa-02-despues-login-m.png');
    await page.screenshot({ path: capErrorM });
    console.log('Captura guardada:', capErrorM);
    if (capturasDir && fs.existsSync(capturasDir)) {
      fs.copyFileSync(capErrorM, path.join(capturasDir, 'pwa-02-despues-login-m.png'));
    }

    // ─── VERIFICACIÓN 6: SelectorMesa y botón «Cerrar sesión» >= 48 px ──
    console.log('Verificando SelectorMesa y botón Cerrar sesión...');
    await page.unroute('**/api/auth/testigos/login');

    // Inyectar datos sintéticos de autenticación en localStorage para visualizar SelectorMesa
    await page.evaluate(() => {
      localStorage.setItem('cuorum_testigo_token', 'jwt-token-sintetico-prueba');
      localStorage.setItem('cuorum_testigo_campana', 'campana-demo-id');
      localStorage.setItem('cuorum_testigo_data', JSON.stringify({
        testigo: {
          id: 'testigo-sintetico-01',
          cedula: 'TEST-TES-001',
          nombres: 'Carlos',
          apellidos: 'Testigo Demo',
          telefono: '3000000000',
          email: 'testigo@example.invalid',
        },
        tipoTestigo: 'ELECTORAL',
        mesa: {
          id: 'mesa-01',
          numero: 1,
          totalSufragantes: 350,
          puesto: { id: 'puesto-01', nombre: 'Colegio Mayor de Bolívar', direccion: 'Cra 7 # 12-34' },
        },
        mesas: [
          {
            id: 'mesa-01',
            numero: 1,
            totalSufragantes: 350,
            puesto: { id: 'puesto-01', nombre: 'Colegio Mayor de Bolívar', direccion: 'Cra 7 # 12-34' },
          },
          {
            id: 'mesa-02',
            numero: 2,
            totalSufragantes: 320,
            puesto: { id: 'puesto-01', nombre: 'Colegio Mayor de Bolívar', direccion: 'Cra 7 # 12-34' },
          },
        ],
        elecciones: [],
        deviceId: 'device-test-01',
        campana: { id: 'campana-demo-id', nombre: 'Campaña Demo Ficticia' },
      }));
    });

    await page.reload({ waitUntil: 'networkidle' });

    // Verificar botón Cerrar Sesión en cabecera
    const btnLogoutHeader = page.locator('button[aria-label="Cerrar sesión"]').first();
    await btnLogoutHeader.waitFor({ state: 'visible' });

    const boxLogoutHeader = await btnLogoutHeader.boundingBox();
    console.log(`Botón Cerrar Sesión cabecera: ancho=${boxLogoutHeader?.width}px, alto=${boxLogoutHeader?.height}px`);

    if (!boxLogoutHeader || boxLogoutHeader.height < 48 || boxLogoutHeader.width < 48) {
      throw new Error(`Botón Cerrar Sesión mide ${boxLogoutHeader?.width}x${boxLogoutHeader?.height} px, debe ser >= 48x48 px`);
    }

    // Verificar botones de mesa
    const mesaCards = page.locator('button').filter({ hasText: 'Mesa de Votación' });
    const countMesas = await mesaCards.count();
    console.log(`Mesas encontradas en selector: ${countMesas}`);
    for (let i = 0; i < countMesas; i++) {
      const boxMesa = await mesaCards.nth(i).boundingBox();
      console.log(`Mesa #${i + 1} altura: ${boxMesa?.height} px`);
      if (!boxMesa || boxMesa.height < 48) {
        throw new Error(`Tarjeta de mesa #${i + 1} mide ${boxMesa?.height} px, debe ser >= 48 px`);
      }
    }

    // ─── VERIFICACIÓN 6b: Accesibilidad axe-core en SelectorMesa ──────
    console.log('Evaluando axe-core en SelectorMesa...');
    await page.addScriptTag({
      url: 'https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.9.1/axe.min.js',
    });

    const axeSelector = await page.evaluate(async () => {
      // @ts-expect-error axe global
      return await window.axe.run(document, {
        runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] },
      });
    });

    const axeSelectorContrast = axeSelector.violations.filter((v) => v.id === 'color-contrast');
    const axeSelectorButtons = axeSelector.violations.filter((v) => v.id === 'button-name');
    console.log(`Violaciones contraste en SelectorMesa: ${axeSelectorContrast.length}`);
    console.log(`Violaciones nombres de botón en SelectorMesa: ${axeSelectorButtons.length}`);
    if (axeSelectorContrast.length > 0) {
      console.error('Violaciones de contraste en SelectorMesa:', JSON.stringify(axeSelectorContrast, null, 2));
      throw new Error(`Se encontraron ${axeSelectorContrast.length} violaciones de color-contrast en SelectorMesa`);
    }
    if (axeSelectorButtons.length > 0) {
      console.error('Violaciones de botones en SelectorMesa:', JSON.stringify(axeSelectorButtons, null, 2));
      throw new Error(`Se encontraron ${axeSelectorButtons.length} violaciones de button-name en SelectorMesa`);
    }

    // Captura móvil de SelectorMesa
    const capSelectorM = path.join(screenshotsDir, 'pwa-03-selector-mesa-m.png');
    await page.screenshot({ path: capSelectorM });
    console.log('Captura guardada:', capSelectorM);
    if (capturasDir && fs.existsSync(capturasDir)) {
      fs.copyFileSync(capSelectorM, path.join(capturasDir, 'pwa-03-selector-mesa-m.png'));
    }

    // ─── VERIFICACIÓN 7: Vista escritorio 1440 px ─────────────────────
    console.log('Verificando viewport escritorio 1440x900...');
    const contextDesktop = await browser.newContext({
      viewport: { width: 1440, height: 900 },
    });
    const pageDesktop = await contextDesktop.newPage();
    await pageDesktop.goto('http://localhost:4703/', { waitUntil: 'networkidle' });
    const capLoginD = path.join(screenshotsDir, 'pwa-01-login-d.png');
    await pageDesktop.screenshot({ path: capLoginD });
    console.log('Captura escritorio guardada:', capLoginD);
    if (capturasDir && fs.existsSync(capturasDir)) {
      fs.copyFileSync(capLoginD, path.join(capturasDir, 'pwa-01-login-d.png'));
    }

    console.log('✅ Todas las verificaciones de Playwright y criterios de aceptación pasaron exitosamente.');
  } finally {
    await browser.close();
    server.kill();
    process.exit(0);
  }
}

run().catch((err) => {
  console.error('Error durante la verificación:', err);
  process.exit(1);
});
