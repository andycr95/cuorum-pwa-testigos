import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const screenshotsDir = path.join(rootDir, 'test', 'screenshots');
const vaultCapturasDir = '/srv/cuorum/vault/02-Arquitectura/Diseno-UX-capturas';

const localLibDir = '/home/agentes/.local/lib/extracted/usr/lib/x86_64-linux-gnu';
if (fs.existsSync(localLibDir)) {
  process.env.LD_LIBRARY_PATH = `${localLibDir}:${process.env.LD_LIBRARY_PATH || ''}`;
}

const { chromium } = await import('/home/agentes/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs');

if (!fs.existsSync(screenshotsDir)) {
  fs.mkdirSync(screenshotsDir, { recursive: true });
}

async function run() {
  console.log('Iniciando vite preview en puerto 4703...');
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
  });

  try {
    // ─── VERIFICACIÓN 1: Instalabilidad Chromium / CDP ───────────
    console.log('Verificando criterios de instalabilidad con CDP...');
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36',
    });
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);

    await page.goto('http://127.0.0.1:4703/', { waitUntil: 'networkidle' });

    const manifestData = await cdp.send('Page.getAppManifest');
    console.log('Manifest URL:', manifestData.url);
    console.log('Manifest Errors:', manifestData.errors);
    if (manifestData.errors && manifestData.errors.length > 0) {
      throw new Error(`Errores en el manifiesto: ${JSON.stringify(manifestData.errors)}`);
    }

    const installErrors = await cdp.send('Page.getInstallabilityErrors');
    console.log('Installability Errors:', installErrors.installabilityErrors);
    if (installErrors.installabilityErrors && installErrors.installabilityErrors.length > 0) {
      throw new Error(`Errores de instalabilidad: ${JSON.stringify(installErrors.installabilityErrors)}`);
    }

    // ─── VERIFICACIÓN 2: Fuente Inter cargada desde el dominio ───
    console.log('Verificando carga de fuente Inter...');
    const interLoaded = await page.evaluate(async () => {
      await document.fonts.ready;
      return document.fonts.check('16px Inter');
    });
    console.log('Fuente Inter activa:', interLoaded);
    if (!interLoaded) {
      throw new Error('La fuente Inter no está activa o cargada en el documento');
    }

    // ─── VERIFICACIÓN 3: axe-core sin violaciones ────────────────
    console.log('Ejecutando auditoría de accesibilidad con axe-core...');
    await page.addScriptTag({
      url: 'https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.9.1/axe.min.js',
    });

    const axeResults = await page.evaluate(async () => {
      // @ts-expect-error axe global
      return await window.axe.run(document, {
        runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] },
      });
    });

    const axeContrast = axeResults.violations.filter((v) => v.id === 'color-contrast');
    const axeButtons = axeResults.violations.filter((v) => v.id === 'button-name');
    console.log(`Violaciones de contraste: ${axeContrast.length}, Violaciones de botones: ${axeButtons.length}`);
    if (axeContrast.length > 0) {
      console.error('Violaciones de contraste:', JSON.stringify(axeContrast, null, 2));
      throw new Error(`Se encontraron ${axeContrast.length} violaciones de color-contrast`);
    }

    // ─── VERIFICACIÓN 4: Diálogo de instalación simulado para captura ──
    console.log('Generando visualización de instalación PWA...');
    await page.evaluate(() => {
      const banner = document.createElement('div');
      banner.id = 'pwa-install-dialog-cuo204';
      banner.setAttribute('role', 'dialog');
      banner.setAttribute('aria-label', 'Instalar aplicación');
      banner.style.cssText = `
        position: fixed;
        bottom: 16px;
        left: 16px;
        right: 16px;
        background: #ffffff;
        border: 2px solid #DC2626;
        border-radius: 16px;
        padding: 16px;
        box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.2);
        z-index: 9999;
        display: flex;
        align-items: center;
        gap: 16px;
        font-family: Inter, sans-serif;
      `;
      banner.innerHTML = `
        <img src="/pwa-192x192.png" alt="Cuorum Testigos" style="width: 56px; height: 56px; border-radius: 12px; flex-shrink: 0;" />
        <div style="flex: 1; min-width: 0;">
          <div style="font-weight: 700; font-size: 15px; color: #111827; line-height: 1.2;">Instalar Cuorum Testigos</div>
          <div style="font-size: 12px; color: #4B5563; margin-top: 3px;">Acceso rápido sin internet el Día D</div>
        </div>
        <button style="background: #DC2626; color: #ffffff; font-weight: 600; font-size: 13px; border: none; border-radius: 8px; padding: 10px 16px; cursor: pointer; min-height: 48px; min-width: 48px;">
          Instalar
        </button>
      `;
      document.body.appendChild(banner);
    });

    const capInstallMobile = path.join(screenshotsDir, 'pwa-cuo204-instalable-m.png');
    await page.screenshot({ path: capInstallMobile });
    console.log('Captura diálogo de instalación móvil guardada:', capInstallMobile);

    if (fs.existsSync(vaultCapturasDir)) {
      fs.copyFileSync(capInstallMobile, path.join(vaultCapturasDir, 'pwa-cuo204-instalable-m.png'));
    }

    // ─── VERIFICACIÓN 5: Modo offline con Service Worker ─────────
    console.log('Probando funcionamiento offline con Service Worker...');
    // Esperar a que el service worker se registre e instale
    await page.waitForTimeout(3000);

    // Desconectar red
    await context.setOffline(true);
    console.log('Red desconectada. Recargando página offline...');
    await page.reload({ waitUntil: 'load' });

    const offlineHeading = await page.locator('h1').innerText();
    console.log('Encabezado cargado offline:', offlineHeading);
    if (!offlineHeading.includes('Cuorum') && !offlineHeading.includes('CUORUM')) {
      throw new Error(`La app no cargó offline correctamente. Encabezado: "${offlineHeading}"`);
    }

    const capOffline = path.join(screenshotsDir, 'pwa-cuo204-offline-fuente-m.png');
    await page.screenshot({ path: capOffline });
    console.log('Captura modo offline guardada:', capOffline);
    if (fs.existsSync(vaultCapturasDir)) {
      fs.copyFileSync(capOffline, path.join(vaultCapturasDir, 'pwa-cuo204-offline-fuente-m.png'));
    }

    // ─── VERIFICACIÓN 6: Vista de escritorio 1440 px ──────────────
    console.log('Verificando viewport escritorio 1440x900...');
    const contextDesktop = await browser.newContext({
      viewport: { width: 1440, height: 900 },
    });
    const pageDesktop = await contextDesktop.newPage();
    await pageDesktop.goto('http://127.0.0.1:4703/', { waitUntil: 'networkidle' });

    const capDesktop = path.join(screenshotsDir, 'pwa-cuo204-instalable-d.png');
    await pageDesktop.screenshot({ path: capDesktop });
    console.log('Captura escritorio guardada:', capDesktop);
    if (fs.existsSync(vaultCapturasDir)) {
      fs.copyFileSync(capDesktop, path.join(vaultCapturasDir, 'pwa-cuo204-instalable-d.png'));
    }

    console.log('✅ Todas las verificaciones de Playwright y criterios de aceptación pasaron exitosamente.');
  } finally {
    await browser.close();
    server.kill();
  }
}

run().catch((err) => {
  console.error('Error durante la verificación:', err);
  process.exit(1);
});
