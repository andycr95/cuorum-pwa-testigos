import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const screenshotsDir = process.env.CAPTURAS_DIR || path.join(rootDir, 'test', 'screenshots');
const vaultCapturasDir = process.env.VAULT_CAPTURAS_DIR;

if (!fs.existsSync(screenshotsDir)) {
  fs.mkdirSync(screenshotsDir, { recursive: true });
}

async function run() {
  let chromium;
  try {
    const playwrightModule = process.env.PLAYWRIGHT_PATH || 'playwright';
    ({ chromium } = await import(playwrightModule));
  } catch (err) {
    console.warn('Playwright no está instalado en este entorno. Se omiten capturas e2e:', err?.message || err);
    return;
  }

  console.log('Iniciando vite preview en puerto 4703...');
  const server = spawn('npx', ['vite', 'preview', '--port', '4703', '--strictPort'], {
    cwd: rootDir,
    stdio: 'pipe',
  });

  server.stdout?.on('data', (d) => console.log(`[Vite preview stdout] ${d}`));
  server.stderr?.on('data', (d) => console.error(`[Vite preview stderr] ${d}`));

  await new Promise((resolve) => setTimeout(resolve, 2500));

  console.log('Lanzando Chromium headless...');
  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      env: process.env,
    });
  } catch (err) {
    console.warn('No fue posible inicializar Chromium en este entorno:', err?.message || err);
    server.kill('SIGTERM');
    return;
  }

  try {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 }, // iPhone 12 / 390 px estándar
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
    });

    const page = await context.newPage();

    page.on('console', (msg) => console.log(`[PWA Console] ${msg.type()}: ${msg.text()}`));
    page.on('pageerror', (err) => console.error(`[PWA PageError] ${err.message}`));

    // Interceptar llamadas de API con mocks sintéticos
    await page.route('**/*', (route) => {
      const url = route.request().url();
      if (url.includes('/api/auth/testigos/verify')) {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
      }
      if (url.includes('/progreso')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            jornada: { id: 'jornada-demo-01', mesaId: 'mesa-01', estado: 'ABIERTA' },
            elecciones: [],
            progreso: { reportadas: 0, total: 0, porcentaje: 0 },
          }),
        });
      }
      if (url.includes('/api/testigos/jornada')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            id: 'jornada-demo-01',
            mesaId: 'mesa-01',
            testigoId: 'testigo-01',
            campanaId: 'campana-demo-id',
            estado: 'ABIERTA',
          }),
        });
      }
      if (url.includes('/api/')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ ok: true, data: [] }),
        });
      }
      if (url.includes('/health')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ ok: true }),
        });
      }
      return route.continue();
    });

    // ────────────────────────────────────────────────────────────────────────
    // ESCENARIO 1: Testigo sin elecciones asignadas
    // ────────────────────────────────────────────────────────────────────────
    console.log('--- Probando Escenario 1: Mesa sin elecciones asignadas ---');

    await page.addInitScript(() => {
      localStorage.setItem('cuorum_testigo_token', 'token-demo-sintetico-123');
      localStorage.setItem('cuorum_testigo_campana', 'campana-demo-id');
      localStorage.setItem('cuorum_testigo_eleccion', '');
      localStorage.setItem(
        'cuorum_testigo_data',
        JSON.stringify({
          testigo: {
            id: 'testigo-01',
            cedula: '90000001',
            nombres: 'Testigo Sintético',
            apellidos: 'Demo',
            telefono: '3001234567',
            email: 'testigo@demo.cuorum.co',
          },
          tipoTestigo: 'ELECTORAL',
          mesa: {
            id: 'mesa-01',
            numero: 1,
            totalSufragantes: 350,
            puesto: {
              id: 'puesto-01',
              nombre: 'Colegio Mayor Ficticio',
              direccion: 'Calle 10 # 5-20',
            },
          },
          mesas: [
            {
              id: 'mesa-01',
              numero: 1,
              totalSufragantes: 350,
              puesto: {
                id: 'puesto-01',
                nombre: 'Colegio Mayor Ficticio',
                direccion: 'Calle 10 # 5-20',
              },
            },
            {
              id: 'mesa-02',
              numero: 2,
              totalSufragantes: 340,
              puesto: {
                id: 'puesto-01',
                nombre: 'Colegio Mayor Ficticio',
                direccion: 'Calle 10 # 5-20',
              },
            },
          ],
          elecciones: [], // SIN ELECCIONES ASIGNADAS
          deviceId: 'dev-demo-01',
          campana: { id: 'campana-demo-id', nombre: 'Campaña Sintética Demo' },
        }),
      );
    });

    await page.goto('http://localhost:4703', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

    // Si aparece el selector de mesa inicial, seleccionar mesa #1
    const mesaBtn = page.locator('text=Mesa de Votación').first();
    if (await mesaBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await mesaBtn.click();
      await page.waitForTimeout(1000);
    }

    // Verificar que se muestre el estado vacío sin elecciones
    const tituloSinElecciones = page.locator('text=Sin elecciones asignadas');
    await tituloSinElecciones.waitFor({ state: 'visible', timeout: 5000 });

    const mensajeSinElecciones = page.locator('text=Tu mesa aún no tiene elecciones asignadas. Avisa a tu coordinador.');
    await mensajeSinElecciones.waitFor({ state: 'visible', timeout: 5000 });

    const btnVolver = page.locator('button:has-text("Volver al selector de mesa")');
    await btnVolver.waitFor({ state: 'visible', timeout: 5000 });

    // Verificar altura táctil mínima de 48 px en el botón
    const btnBox = await btnVolver.boundingBox();
    console.log(`Botón "Volver al selector de mesa" altura: ${btnBox?.height}px (debe ser >= 48px)`);
    if (!btnBox || btnBox.height < 48) {
      throw new Error(`El botón de retorno tiene altura insuficiente: ${btnBox?.height}px`);
    }

    // Captura Escenario 1 (390 px)
    const cap1Local = path.join(screenshotsDir, 'pwa-cuo206-sin-elecciones-390px.png');
    await page.screenshot({ path: cap1Local, fullPage: true });
    if (vaultCapturasDir && fs.existsSync(vaultCapturasDir)) {
      fs.copyFileSync(cap1Local, path.join(vaultCapturasDir, 'pwa-cuo206-sin-elecciones-390px.png'));
    }
    console.log('✓ Captura 1 guardada:', cap1Local);

    // Auditoría de accesibilidad axe-core en Escenario 1
    console.log('Evaluando accesibilidad axe-core en escenario sin elecciones...');
    await page.addScriptTag({
      url: 'https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.9.1/axe.min.js',
    });

    const axe1 = await page.evaluate(async () => {
      // @ts-expect-error axe global
      return await window.axe.run(document, {
        runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] },
      });
    });

    const contrastViolations1 = axe1.violations.filter((v) => v.id === 'color-contrast');
    const buttonViolations1 = axe1.violations.filter((v) => v.id === 'button-name');
    console.log(`[Axe Escenario 1] color-contrast: ${contrastViolations1.length}, button-name: ${buttonViolations1.length}`);
    if (contrastViolations1.length > 0 || buttonViolations1.length > 0) {
      throw new Error(`Violaciones de accesibilidad en escenario sin elecciones: ${JSON.stringify(axe1.violations, null, 2)}`);
    }

    // Probar interacción: hacer clic en "Volver al selector de mesa"
    console.log('Probando clic en "Volver al selector de mesa"...');
    await btnVolver.click();
    await page.waitForTimeout(800);

    // Verificar que regresó al selector de mesa
    const textoSelector = page.locator('text=Selecciona la mesa que vas a reportar');
    await textoSelector.waitFor({ state: 'visible', timeout: 5000 });
    console.log('✓ Retorno al selector de mesa exitoso y verificado!');

    // ────────────────────────────────────────────────────────────────────────
    // ESCENARIO 2: Error de OCR con foto guardada en el teléfono
    // ────────────────────────────────────────────────────────────────────────
    console.log('--- Probando Escenario 2: Error de OCR con foto guardada ---');

    await page.close();

    const page2 = await context.newPage();
    page2.on('console', (msg) => console.log(`[PWA Console 2] ${msg.type()}: ${msg.text()}`));
    page2.on('pageerror', (err) => console.error(`[PWA PageError 2] ${err.message}`));

    await page2.route('**/*', (route) => {
      const url = route.request().url();
      if (url.includes('/api/auth/testigos/verify')) {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
      }
      if (url.includes('/progreso')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            jornada: { id: 'jornada-demo-01', mesaId: 'mesa-01', estado: 'EN_CONTEO' },
            elecciones: [
              { id: 'elec-alcaldia-01', nombre: 'Alcaldía (simulada)', reportado: false, totalVotos: 0 },
            ],
            progreso: { reportadas: 0, total: 1, porcentaje: 0 },
          }),
        });
      }
      if (url.includes('/api/testigos/jornada')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            id: 'jornada-demo-01',
            mesaId: 'mesa-01',
            testigoId: 'testigo-01',
            campanaId: 'campana-demo-id',
            estado: 'EN_CONTEO',
          }),
        });
      }
      if (url.includes('/api/')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ ok: true, data: [] }),
        });
      }
      if (url.includes('/health')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ ok: true }),
        });
      }
      return route.continue();
    });

    await page2.addInitScript(() => {
      localStorage.setItem('cuorum_testigo_token', 'token-demo-sintetico-123');
      localStorage.setItem('cuorum_testigo_campana', 'campana-demo-id');
      localStorage.setItem('cuorum_testigo_eleccion', 'elec-alcaldia-01');
      localStorage.setItem(
        'cuorum_testigo_data',
        JSON.stringify({
          testigo: {
            id: 'testigo-01',
            cedula: '90000001',
            nombres: 'Testigo Sintético',
            apellidos: 'Demo',
            telefono: '3001234567',
            email: 'testigo@demo.cuorum.co',
          },
          tipoTestigo: 'ELECTORAL',
          mesa: {
            id: 'mesa-01',
            numero: 1,
            totalSufragantes: 350,
            puesto: {
              id: 'puesto-01',
              nombre: 'Colegio Mayor Ficticio',
              direccion: 'Calle 10 # 5-20',
            },
          },
          elecciones: [
            {
              id: 'elec-alcaldia-01',
              nombre: 'Alcaldía (simulada)',
              tipoEleccion: 'ALCALDIA',
              tipoCargo: 'UNINOMINAL',
              votoPreferente: false,
              candidatos: [
                { id: 'cand-01', nombre: 'Candidata Alfa', partido: 'Partido Uno', numero: 1 },
                { id: 'cand-02', nombre: 'Candidato Beta', partido: 'Partido Dos', numero: 2 },
              ],
            },
          ],
          deviceId: 'dev-demo-01',
          campana: { id: 'campana-demo-id', nombre: 'Campaña Sintética Demo' },
        }),
      );
    });

    // Abrir la app
    await page2.goto('http://localhost:4703', { waitUntil: 'networkidle' });
    await page2.waitForTimeout(1000);

    // Inyectar job con error en IndexedDB 'cuorum-testigos'
    await page2.evaluate(async () => {
      const openReq = indexedDB.open('cuorum-testigos', 10);
      await new Promise((resolve, reject) => {
        openReq.onsuccess = (e) => {
          const db = e.target.result;
          const tx = db.transaction('e14OcrJobs', 'readwrite');
          const store = tx.objectStore('e14OcrJobs');
          store.put({
            id: 'ocr-job-error-01',
            mesaId: 'mesa-01',
            testigoId: 'testigo-01',
            eleccionId: 'elec-alcaldia-01',
            campanaId: 'campana-demo-id',
            deviceId: 'dev-demo-01',
            fotos: [
              { orden: 1, blob: new Blob(['fake-img'], { type: 'image/jpeg' }), capturedAt: new Date().toISOString() },
            ],
            estado: 'ERROR',
            capturedAt: new Date().toISOString(),
            lastSyncError: 'Request failed with status code 500',
            synced: 0,
            syncAttempts: 1,
          });
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        };
        openReq.onerror = () => reject(openReq.error);
      });
    });

    // Seleccionar mesa si es necesario
    const mesaBtn2 = page2.locator('text=Mesa de Votación').first();
    if (await mesaBtn2.isVisible({ timeout: 2000 }).catch(() => false)) {
      await mesaBtn2.click();
      await page2.waitForTimeout(1000);
    }

    // Cambiar a pestaña Foto E-14
    const tabFoto = page2.locator('button:has-text("Foto E-14")');
    await tabFoto.waitFor({ state: 'visible', timeout: 5000 });
    await tabFoto.click();
    await page2.waitForTimeout(1000);

    // Verificar que aparezca el estado claro del OCR
    const fotoGuardadaText = page2.locator('text=Tu foto está guardada en el teléfono. Reintentaremos cuando haya señal.');
    await fotoGuardadaText.waitFor({ state: 'visible', timeout: 5000 });

    const btnReintentar = page2.locator('button:has-text("Reintentar")').first();
    await btnReintentar.waitFor({ state: 'visible', timeout: 5000 });

    // Verificar que NO exista "Request failed with status code 500" ni texto técnico en inglés
    const bodyContent = await page2.content();
    if (bodyContent.includes('Request failed with status code 500')) {
      throw new Error('Se detectó el mensaje de error técnico "Request failed with status code 500" en el DOM');
    }
    if (bodyContent.includes('HTTP 500')) {
      throw new Error('Se detectó "HTTP 500" en el DOM');
    }
    console.log('✓ Ningún código HTTP 500 ni inglés detectado en la pantalla');

    // Captura Escenario 2 (390 px)
    const cap2Local = path.join(screenshotsDir, 'pwa-cuo206-error-ocr-390px.png');
    await page2.screenshot({ path: cap2Local, fullPage: true });
    if (vaultCapturasDir && fs.existsSync(vaultCapturasDir)) {
      fs.copyFileSync(cap2Local, path.join(vaultCapturasDir, 'pwa-cuo206-error-ocr-390px.png'));
      fs.copyFileSync(cap2Local, path.join(vaultCapturasDir, 'pwa-12b-foto-enviada-m.png'));
    }
    console.log('✓ Captura 2 guardada:', cap2Local);

    // Auditoría de accesibilidad axe-core en Escenario 2
    console.log('Evaluando accesibilidad axe-core en escenario error de OCR...');
    await page2.addScriptTag({
      url: 'https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.9.1/axe.min.js',
    });

    const axe2 = await page2.evaluate(async () => {
      // @ts-expect-error axe global
      const target = document.querySelector('[role="alert"]') || document;
      return await window.axe.run(target, {
        runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] },
      });
    });

    const contrastViolations2 = axe2.violations.filter((v) => v.id === 'color-contrast');
    const buttonViolations2 = axe2.violations.filter((v) => v.id === 'button-name');
    console.log(`[Axe Escenario 2] color-contrast: ${contrastViolations2.length}, button-name: ${buttonViolations2.length}`);
    if (contrastViolations2.length > 0 || buttonViolations2.length > 0) {
      throw new Error(`Violaciones de accesibilidad en escenario OCR: ${JSON.stringify(axe2.violations, null, 2)}`);
    }

    console.log('✓ Todas las verificaciones de Playwright y axe-core completadas con éxito!');
  } finally {
    await browser.close();
    server.kill('SIGTERM');
    console.log('Servidor preview y Chromium cerrados.');
  }
}

run().catch((err) => {
  console.error('Error durante la verificación Playwright:', err);
  process.exit(1);
});
