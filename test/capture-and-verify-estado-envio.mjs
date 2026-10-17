import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const screenshotsDir = path.join(rootDir, 'test', 'screenshots');
const vaultCapturasDir = process.env.EXTRA_CAPTURAS_DIR || null;

const playwrightPath = process.env.PLAYWRIGHT_PATH || 'playwright';
const { chromium } = await import(playwrightPath);

if (process.env.LOCAL_LIB_DIR && fs.existsSync(process.env.LOCAL_LIB_DIR)) {
  process.env.LD_LIBRARY_PATH = `${process.env.LOCAL_LIB_DIR}:${process.env.LD_LIBRARY_PATH || ''}`;
}

if (!fs.existsSync(screenshotsDir)) {
  fs.mkdirSync(screenshotsDir, { recursive: true });
}

async function run() {
  console.log('Compilando PWA con vite build...');
  await new Promise((resolve, reject) => {
    const buildProc = spawn('npx', ['vite', 'build'], {
      cwd: rootDir,
      stdio: 'inherit',
    });
    buildProc.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`vite build falló con código ${code}`));
    });
  });

  console.log('Iniciando vite preview en puerto 4703...');
  const server = spawn('npx', ['vite', 'preview', '--port', '4703', '--strictPort'], {
    cwd: rootDir,
    stdio: 'pipe',
  });

  server.stdout?.on('data', (d) => console.log(`[Vite preview] ${d}`));
  server.stderr?.on('data', (d) => console.error(`[Vite stderr] ${d}`));

  // Esperar a que el servidor responda
  await new Promise((resolve) => setTimeout(resolve, 2000));

  console.log('Lanzando Chromium headless...');
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    env: {
      ...process.env,
      LD_LIBRARY_PATH: process.env.LD_LIBRARY_PATH || '',
    },
  });

  const context = await browser.newContext({
    viewport: { width: 390, height: 844 }, // iPhone estándar móvil (390 px)
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });

  const page = await context.newPage();
  page.on('console', (msg) => console.log(`[Browser Console ${msg.type()}]`, msg.text()));
  page.on('pageerror', (err) => console.error('[Browser Uncaught Error]', err));

  try {
    // Interceptar rutas de backend para testing offline y mock sintético
    await page.route('**/*', (route) => {
      const url = route.request().url();
      if (url.includes('/auth/testigos/verify')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ ok: true }),
        });
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
      if (url.includes('/health')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ ok: true }),
        });
      }
      if (url.includes('/validar')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ valido: true, alertas: [] }),
        });
      }
      if (url.includes('/api/testigos/sync')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            resultadosSincronizados: 1,
            fotosSincronizadas: 0,
            incidenciasSincronizadas: 0,
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
      return route.continue();
    });

    // Inyectar datos en localStorage antes de que inicie la app
    await page.addInitScript(() => {
      localStorage.setItem('cuorum_testigo_token', 'token-demo-sintetico-123');
      localStorage.setItem('cuorum_testigo_campana', 'campana-demo-id');
      localStorage.setItem('cuorum_testigo_eleccion', 'elec-alcaldia-01');
      localStorage.setItem('cuorum_last_sync_time', '14:30');
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
            nombre: 'Campaña Ficticia Demo 2026',
          },
        }),
      );
      localStorage.setItem(
        'cuorum_mesa_seleccionada',
        JSON.stringify({
          id: 'mesa-01',
          numero: 1,
          totalSufragantes: 350,
          puesto: {
            id: 'puesto-01',
            nombre: 'PUESTO CENTRAL DEMO',
            direccion: 'Carrera 7 # 10-20',
          },
        }),
      );
    });

    console.log('Navegando a http://localhost:4703/...');
    await page.goto('http://localhost:4703/', { waitUntil: 'networkidle' });
    console.log('Esperando selector de barra-estado-envio...');
    try {
      await page.waitForSelector('[data-testid="barra-estado-envio"]', { timeout: 8000 });
    } catch {
      console.log('Contenido rendered:', await page.content());
    }
    await page.waitForTimeout(500);

    // ─── VERIFICACIÓN 1: Posición fija bajo la cabecera sin taparla ───
    console.log('Evaluando posición fija de la cabecera y la barra de estado...');

    const headerGeometry = await page.evaluate(() => {
      const headerEl = document.querySelector('header');
      const barraEl = document.querySelector('[data-testid="barra-estado-envio"]');
      if (!headerEl || !barraEl) {
        return { error: 'No se encontró header o barra-estado-envio' };
      }
      const headerRect = headerEl.getBoundingClientRect();
      const barraRect = barraEl.getBoundingClientRect();
      return {
        headerTop: Math.round(headerRect.top),
        headerBottom: Math.round(headerRect.bottom),
        headerHeight: Math.round(headerRect.height),
        barraTop: Math.round(barraRect.top),
        barraBottom: Math.round(barraRect.bottom),
        barraHeight: Math.round(barraRect.height),
        // La barra debe estar pegada abajo del header, nunca encima
        tapaCabecera: barraRect.top < headerRect.bottom - 2,
      };
    });

    console.log('Geometría de cabecera y barra:', headerGeometry);
    if (headerGeometry.error) {
      throw new Error(headerGeometry.error);
    }
    if (headerGeometry.headerTop !== 0) {
      throw new Error(`La cabecera no inicia en top: 0 (inicia en ${headerGeometry.headerTop} px)`);
    }
    if (headerGeometry.tapaCabecera) {
      throw new Error('La barra de estado está tapando la cabecera');
    }
    console.log('✓ La cabecera está en top: 0 y la barra de estado se ubica exactamente debajo sin taparla');

    // ─── VERIFICACIÓN 2: Desplazamiento y sticky simultáneo ───
    console.log('Simulando desplazamiento vertical de 300 px...');
    await page.evaluate(() => window.scrollTo(0, 300));
    await page.waitForTimeout(200);

    const scrolledGeometry = await page.evaluate(() => {
      const headerEl = document.querySelector('header');
      const barraEl = document.querySelector('[data-testid="barra-estado-envio"]');
      const headerRect = headerEl.getBoundingClientRect();
      const barraRect = barraEl.getBoundingClientRect();
      return {
        scrollY: window.scrollY,
        headerTop: Math.round(headerRect.top),
        barraTop: Math.round(barraRect.top),
        headerVisible: headerRect.top >= 0 && headerRect.bottom > 0,
        barraVisible: barraRect.top >= headerRect.bottom - 1,
      };
    });

    console.log('Geometría tras scroll:', scrolledGeometry);
    if (!scrolledGeometry.headerVisible || !scrolledGeometry.barraVisible) {
      throw new Error('Cabecera o barra de estado no permanecen visibles durante el scroll');
    }
    console.log('✓ Cabecera y barra de estado permanecen fijas y visibles tras scroll');

    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(200);

    // ─── CAPTURA 1: Con internet (Estado «Enviado ✓ hh:mm») ───
    console.log('Comprobando estado con internet («Enviado ✓ hh:mm»)...');
    const textoEnviado = await page.$eval(
      '[data-testid="texto-estado-envio"]',
      (el) => el.textContent?.trim(),
    );
    console.log(`Texto en barra (con internet): "${textoEnviado}"`);
    if (!textoEnviado?.includes('Enviado ✓')) {
      throw new Error(`Se esperaba texto con "Enviado ✓", se obtuvo: "${textoEnviado}"`);
    }

    const captura1Path = path.join(screenshotsDir, 'pwa-estado-01-con-internet-enviado.png');
    await page.screenshot({ path: captura1Path, fullPage: false });
    console.log('✓ Captura 1 guardada:', captura1Path);

    // ─── CAPTURA 2: Sin internet (Estado «Sin internet» como estado propio) ───
    console.log('Simulando desconexión (offline) con 0 pendientes...');
    await context.setOffline(true);
    await page.evaluate(() => {
      window.dispatchEvent(
        new CustomEvent('cuorum:online-status', { detail: { isOnline: false } }),
      );
      window.dispatchEvent(new Event('offline'));
    });
    await page.waitForTimeout(500);

    const textoOffline = await page.$eval(
      '[data-testid="texto-estado-envio"]',
      (el) => el.textContent?.trim(),
    );
    console.log(`Texto en barra (sin internet): "${textoOffline}"`);
    if (textoOffline !== 'Sin internet') {
      throw new Error(`Se esperaba "Sin internet", se obtuvo: "${textoOffline}"`);
    }

    const captura2Path = path.join(screenshotsDir, 'pwa-estado-02-sin-internet.png');
    await page.screenshot({ path: captura2Path, fullPage: false });
    console.log('✓ Captura 2 guardada:', captura2Path);

    // ─── CAPTURA 3: Con cola pendiente («Guardado en el teléfono (1 pendiente)») ───
    console.log('Guardando resultados de mesa en modo offline...');
    const btnGuardar = await page.$('[data-testid="btn-guardar-resultados"]');
    if (!btnGuardar) {
      throw new Error('No se encontró el botón de guardar resultados');
    }

    // Medir dimensiones del botón de guardar
    const btnBox = await btnGuardar.boundingBox();
    console.log(`Dimensiones del botón de guardar: ${btnBox?.width}x${btnBox?.height} px`);
    if (!btnBox || btnBox.height < 54) { // 56 px nominales
      throw new Error(`El botón de guardar mide ${btnBox?.height} px de alto, se exigía 56 px`);
    }

    await btnGuardar.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    await btnGuardar.click();
    await page.waitForTimeout(1000);

    let textoPendiente = '';
    try {
      await page.waitForSelector('[data-testid="texto-estado-envio"]', { timeout: 4000 });
      textoPendiente = await page.$eval(
        '[data-testid="texto-estado-envio"]',
        (el) => el.textContent?.trim() || '',
      );
    } catch (evalErr) {
      console.error('Error buscando texto-estado-envio. HTML:', (await page.content()).substring(0, 1500));
      throw evalErr;
    }
    console.log(`Texto en barra (con cola pendiente): "${textoPendiente}"`);
    if (!textoPendiente?.includes('Guardado en el teléfono')) {
      throw new Error(`Se esperaba "Guardado en el teléfono", se obtuvo: "${textoPendiente}"`);
    }

    // Verificar texto del botón tras guardar
    const textoBotonGuardado = await page.$eval(
      '[data-testid="btn-guardar-resultados"]',
      (el) => el.textContent?.trim(),
    );
    console.log(`Texto del botón tras guardar: "${textoBotonGuardado}"`);
    if (!textoBotonGuardado?.includes('Guardado')) {
      throw new Error(`El botón no muestra el estado "Guardado": "${textoBotonGuardado}"`);
    }

    const captura3Path = path.join(screenshotsDir, 'pwa-estado-03-guardado-pendiente.png');
    await page.screenshot({ path: captura3Path, fullPage: false });
    console.log('✓ Captura 3 guardada:', captura3Path);

    // Copiar la captura corregida de guardado offline a la bóveda
    if (fs.existsSync(vaultCapturasDir)) {
      fs.copyFileSync(captura3Path, path.join(vaultCapturasDir, 'pwa-10-guardar-offline-m.png'));
      console.log('✓ Actualizada captura en bóveda: pwa-10-guardar-offline-m.png');
    }

    // ─── VERIFICACIÓN 3: Accesibilidad con axe-core ───
    console.log('Evaluando contraste y nombres accesibles con axe-core...');
    const axePath = path.join(__dirname, 'axe.min.js');
    if (!fs.existsSync(axePath)) {
      const res = await fetch('https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.9.1/axe.min.js');
      fs.writeFileSync(axePath, await res.text());
    }
    await page.addScriptTag({
      path: axePath,
    });

    // Verificar axe específicamente en los componentes tocados por el ticket:
    // barra-estado-envio, btn-guardar-resultados y la cabecera
    const axeResults = await page.evaluate(async () => {
      // @ts-expect-error axe global
      return await window.axe.run({
        include: [
          ['[data-testid="barra-estado-envio"]'],
          ['[data-testid="btn-guardar-resultados"]'],
          ['[data-testid="cabecera-roja"]'],
        ],
      }, {
        runOnly: {
          type: 'tag',
          values: ['wcag2a', 'wcag2aa'],
        },
      });
    });

    const contrastViolations = axeResults.violations.filter((v) => v.id === 'color-contrast');
    const buttonViolations = axeResults.violations.filter((v) => v.id === 'button-name');

    console.log(`Violaciones de contraste de color en componentes tocados: ${contrastViolations.length}`);
    console.log(`Violaciones de nombres de botón en componentes tocados: ${buttonViolations.length}`);

    if (contrastViolations.length > 0) {
      console.error('Violaciones de contraste:', JSON.stringify(contrastViolations, null, 2));
      throw new Error(`Se encontraron ${contrastViolations.length} violaciones de contraste de color en componentes tocados`);
    }

    if (buttonViolations.length > 0) {
      console.error('Violaciones de button-name:', JSON.stringify(buttonViolations, null, 2));
      throw new Error(`Se encontraron ${buttonViolations.length} violaciones de button-name en componentes tocados`);
    }

    console.log('✓ 0 violaciones de contraste y 0 violaciones de button-name');
    console.log('¡TODAS LAS VERIFICACIONES VISUALES Y FUNCIONALES COMPLETADAS EXITOSAMENTE!');
  } catch (err) {
    console.error('Error detallado en prueba Playwright:', err);
    throw err;
  } finally {
    await browser.close().catch(() => {});
    server.kill('SIGTERM');
    console.log('Servidor vite y navegador cerrados.');
  }
}

run().then(() => {
  process.exit(0);
}).catch((err) => {
  console.error('Error durante la verificación Playwright:', err);
  process.exit(1);
});
