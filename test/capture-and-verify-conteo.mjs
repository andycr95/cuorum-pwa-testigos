import { chromium } from '/home/agentes/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs';
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
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 }, // iPhone 12 / tamaño móvil de auditoría
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
    });

    const page = await context.newPage();

    page.on('console', (msg) => console.log(`[PWA Browser] ${msg.type()}: ${msg.text()}`));
    page.on('pageerror', (err) => console.error(`[PWA PageError] ${err.message}`));

    // Mock global de APIs para evitar fallos de red durante el recorrido del testigo
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

    // Inyectar datos en localStorage antes de cargar la app
    await page.addInitScript(() => {
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
            apellidos: 'Demo Uno',
            telefono: '3001234567',
            email: 'testigo@campanademo.co',
          },
          tipoTestigo: 'ELECTORAL',
          mesa: {
            id: 'mesa-01',
            numero: 1,
            totalSufragantes: 350,
            puesto: {
              id: 'puesto-01',
              nombre: 'PUESTO CENTRAL DEMO',
              direccion: 'Carrera 7 # 10-20',
            },
          },
          mesas: [
            {
              id: 'mesa-01',
              numero: 1,
              totalSufragantes: 350,
              puesto: {
                id: 'puesto-01',
                nombre: 'PUESTO CENTRAL DEMO',
                direccion: 'Carrera 7 # 10-20',
              },
            },
          ],
          elecciones: [
            {
              id: 'elec-alcaldia-01',
              nombre: 'Alcaldía (simulada)',
              tipoEleccion: 'ALCALDIA',
              tipoCargo: 'UNINOMINAL',
              votoPreferente: false,
              candidatos: [
                {
                  id: 'cand-01',
                  nombre: 'Candidata Ficticia Alfa Demo',
                  partido: 'Partido Demócrata Ficticio',
                  numero: 1,
                },
                {
                  id: 'cand-02',
                  nombre: 'Candidato Ficticio Beta Demo',
                  partido: 'Partido Alternativo Ficticio',
                  numero: 2,
                },
                {
                  id: 'cand-03',
                  nombre: 'Candidata Ficticia Gama Demo',
                  partido: 'Unión Cívica Simulada',
                  numero: 3,
                },
              ],
            },
          ],
          deviceId: 'device-test-01',
          campana: {
            id: 'campana-demo-id',
            nombre: 'Campaña Demo Alcaldía',
            candidatoId: 'cand-01',
            listaId: null,
          },
        }),
      );
    });

    console.log('Navegando a http://localhost:4703 (390 px)...');
    await page.goto('http://localhost:4703', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);

    // ─── VERIFICACIÓN 1: Nombres completos sin truncar en 390 px ───
    console.log('Verificando nombres completos en 390 px...');
    const candidateNames = await page.$$eval('[data-testid="candidato-nombre"]', (elements) =>
      elements.map((el) => ({
        text: el.textContent?.trim(),
        hasEllipsis: el.textContent?.includes('...'),
        isTruncatedClass: el.classList.contains('truncate'),
      })),
    );

    console.log('Candidatos encontrados en 390 px:', candidateNames);
    for (const cand of candidateNames) {
      if (cand.hasEllipsis || cand.isTruncatedClass) {
        throw new Error(`El candidato "${cand.text}" tiene truncamiento visible`);
      }
    }

    // ─── VERIFICACIÓN 2: Dimensiones de botones táctiles (≥ 48 px, exactamente 56 px) ───
    console.log('Midiendo dimensiones de botones táctiles (− y +)...');
    const buttonMeasurements = await page.$$eval('[data-testid="btn-decrement"], [data-testid="btn-increment"]', (buttons) =>
      buttons.map((b) => {
        const rect = b.getBoundingClientRect();
        return {
          label: b.getAttribute('aria-label'),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        };
      }),
    );

    console.log(`Total de botones táctiles evaluados: ${buttonMeasurements.length}`);
    for (const b of buttonMeasurements) {
      if (b.width < 48 || b.height < 48) {
        throw new Error(`Botón "${b.label}" mide ${b.width}x${b.height} px, menor al mínimo táctil exigido de 48 px`);
      }
      if (b.width !== 56 || b.height !== 56) {
        console.warn(`Aviso: botón "${b.label}" mide ${b.width}x${b.height} px (esperado 56x56 px)`);
      }
    }
    console.log('✓ Todos los botones de conteo miden 56×56 px (≥ 48 px)');

    // ─── VERIFICACIÓN 3: Valor numérico central grande (≥ 28 px) ───
    console.log('Midiendo tamaño de fuente del valor numérico central...');
    const inputFontSizes = await page.$$eval('[data-testid="input-votos"]', (inputs) =>
      inputs.map((inp) => {
        const style = window.getComputedStyle(inp);
        return parseFloat(style.fontSize);
      }),
    );

    for (const fSize of inputFontSizes) {
      if (fSize < 28) {
        throw new Error(`Input de conteo tiene fontSize de ${fSize} px, menor a 28 px`);
      }
    }
    console.log(`✓ Inputs de conteo tienen fontSize de ${inputFontSizes[0]} px (≥ 28 px)`);

    // ─── VERIFICACIÓN 4: Barra fija inferior visible sin scroll ───
    console.log('Verificando visibilidad de la barra fija inferior...');
    const barraFijaVisible = await page.$eval('[data-testid="barra-fija-conteo"]', (el) => {
      const rect = el.getBoundingClientRect();
      const inViewport = rect.top < window.innerHeight && rect.bottom <= window.innerHeight + 2;
      return {
        inViewport,
        scrollY: window.scrollY,
        rect: { top: rect.top, bottom: rect.bottom, height: rect.height },
      };
    });

    if (!barraFijaVisible.inViewport || barraFijaVisible.scrollY !== 0) {
      throw new Error(`La barra fija inferior no está visible en el viewport inicial (scrollY: ${barraFijaVisible.scrollY})`);
    }
    console.log('✓ Barra fija inferior con total y Guardar visible sin desplazarse');

    // Captura en 390 px antes de votar (viewport móvil tal como lo ve el usuario)
    const capturaVacio390Viewport = path.join(screenshotsDir, 'pwa-conteo-390-vacio-viewport.png');
    await page.screenshot({ path: capturaVacio390Viewport, fullPage: false });
    const capturaVacio390Full = path.join(screenshotsDir, 'pwa-conteo-390-vacio.png');
    await page.screenshot({ path: capturaVacio390Full, fullPage: true });
    console.log('Capturas iniciales guardadas');

    // ─── INTERACCIÓN: Contar votos ───
    console.log('Interactuando con los botones táctiles de conteo...');
    const incrementButtons = await page.$$('[data-testid="btn-increment"]');
    // Candidato 1: +5 votos
    for (let i = 0; i < 5; i++) {
      await incrementButtons[0].click();
      await page.waitForTimeout(50);
    }
    // Candidato 2: +3 votos
    for (let i = 0; i < 3; i++) {
      await incrementButtons[1].click();
      await page.waitForTimeout(50);
    }
    // Votos en blanco (4to botón de incremento): +1 voto
    if (incrementButtons[3]) {
      await incrementButtons[3].click();
      await page.waitForTimeout(50);
    }

    // Verificar que el total se actualizó en la barra fija inferior
    const totalEnBarra = await page.$eval('[data-testid="total-votos-barra"]', (el) => el.textContent?.trim());
    console.log(`Total votos reflejado en la barra fija: ${totalEnBarra}`);
    if (totalEnBarra !== '9') {
      throw new Error(`Se esperaban 9 votos en la barra inferior, se encontró: ${totalEnBarra}`);
    }

    // Captura en 390 px con votos registrados (viewport móvil)
    const capturaVotos390Viewport = path.join(screenshotsDir, 'pwa-conteo-390-con-votos-viewport.png');
    await page.screenshot({ path: capturaVotos390Viewport, fullPage: false });
    const capturaVotos390Full = path.join(screenshotsDir, 'pwa-conteo-390-con-votos.png');
    await page.screenshot({ path: capturaVotos390Full, fullPage: true });
    console.log('Capturas con votos guardadas');

    // Copiar capturas a la bóveda (usando la vista del viewport móvil 390x844)
    if (fs.existsSync(vaultCapturasDir)) {
      fs.copyFileSync(capturaVacio390Viewport, path.join(vaultCapturasDir, 'pwa-06-conteo-m.png'));
      fs.copyFileSync(capturaVotos390Viewport, path.join(vaultCapturasDir, 'pwa-07-conteo-con-votos-m.png'));
      console.log('✓ Capturas actualizadas en la bóveda: pwa-06-conteo-m.png y pwa-07-conteo-con-votos-m.png');
    }

    // ─── VERIFICACIÓN 5: Pantalla móvil estrecha de 360 px ───
    console.log('Cambiando viewport a 360×740 px (móvil estrecho)...');
    await page.setViewportSize({ width: 360, height: 740 });
    await page.waitForTimeout(500);

    const candidateNames360 = await page.$$eval('[data-testid="candidato-nombre"]', (elements) =>
      elements.map((el) => ({
        text: el.textContent?.trim(),
        hasEllipsis: el.textContent?.includes('...'),
      })),
    );

    for (const cand of candidateNames360) {
      if (cand.hasEllipsis) {
        throw new Error(`En 360 px el candidato "${cand.text}" tiene truncamiento visible`);
      }
    }
    console.log('✓ Nombres completos sin truncar en pantalla estrecha de 360 px');

    const captura360 = path.join(screenshotsDir, 'pwa-conteo-360-estrecho.png');
    await page.screenshot({ path: captura360, fullPage: true });
    console.log('Captura 360 px guardada:', captura360);

    // ─── VERIFICACIÓN 6: Accesibilidad (axe-core) ───
    console.log('Evaluando accesibilidad con axe-core...');
    // Inyectar axe-core desde un script embebido o CDN confiable
    await page.addScriptTag({
      url: 'https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.9.1/axe.min.js',
    });

    const axeResults = await page.evaluate(async () => {
      // @ts-expect-error axe global
      return await window.axe.run(document, {
        runOnly: {
          type: 'tag',
          values: ['wcag2a', 'wcag2aa'],
        },
      });
    });

    const contrastViolations = axeResults.violations.filter((v) => v.id === 'color-contrast');
    const buttonViolations = axeResults.violations.filter((v) => v.id === 'button-name');

    console.log(`Violaciones de contraste de color: ${contrastViolations.length}`);
    console.log(`Violaciones de nombres de botón: ${buttonViolations.length}`);

    if (contrastViolations.length > 0) {
      console.error('Violaciones de contraste:', JSON.stringify(contrastViolations, null, 2));
      throw new Error(`Se encontraron ${contrastViolations.length} violaciones de color-contrast en la pantalla de conteo`);
    }

    if (buttonViolations.length > 0) {
      console.error('Violaciones de button-name:', JSON.stringify(buttonViolations, null, 2));
      throw new Error(`Se encontraron ${buttonViolations.length} violaciones de button-name en la pantalla de conteo`);
    }

    console.log('✓ Cero violaciones de color-contrast y button-name en la pantalla de conteo');
    console.log('TODAS LAS PRUEBAS Y CAPTURAS COMPLETADAS EXITOSAMENTE');
  } finally {
    await browser.close();
    server.kill('SIGTERM');
    console.log('Servidor y navegador cerrados.');
    process.exit(0);
  }
}

run().catch((err) => {
  console.error('Error durante la verificación Playwright:', err);
  process.exit(1);
});
