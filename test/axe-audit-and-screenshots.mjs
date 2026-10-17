import { chromium } from '/home/agentes/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const screenshotsDir = path.join(rootDir, 'test', 'screenshots');
const vaultDir = '/srv/cuorum/vault/02-Arquitectura/Diseno-UX-capturas';
const axePath = '/home/agentes/.agy-3/.cache/pnpm/dlx/4cd852e5e59c99fbcab669d576f38372/mvbsj80z-1y/node_modules/.pnpm/axe-core@4.14.0/node_modules/axe-core/axe.min.js';

const localLibDir = '/home/agentes/.local/lib/extracted/usr/lib/x86_64-linux-gnu';
if (fs.existsSync(localLibDir)) {
  process.env.LD_LIBRARY_PATH = `${localLibDir}:${process.env.LD_LIBRARY_PATH || ''}`;
}

if (!fs.existsSync(screenshotsDir)) {
  fs.mkdirSync(screenshotsDir, { recursive: true });
}

const mockTestigoData = {
  testigo: {
    id: 'testigo-synth-01',
    cedula: '1000000001',
    nombres: 'JUAN PABLO',
    apellidos: 'GÓMEZ PÉREZ',
    telefono: '3001234567',
    email: 'testigo@cuorum.co',
  },
  tipoTestigo: 'ELECTORAL',
  mesa: {
    id: 'mesa-synth-01',
    numero: 12,
    totalSufragantes: 350,
    puesto: {
      id: 'puesto-synth-01',
      nombre: 'Colegio San José',
      direccion: 'Calle 45 # 12-34',
    },
  },
  mesas: [
    {
      id: 'mesa-synth-01',
      numero: 12,
      totalSufragantes: 350,
      puesto: {
        id: 'puesto-synth-01',
        nombre: 'Colegio San José',
        direccion: 'Calle 45 # 12-34',
      },
    },
    {
      id: 'mesa-synth-02',
      numero: 13,
      totalSufragantes: 340,
      puesto: {
        id: 'puesto-synth-01',
        nombre: 'Colegio San José',
        direccion: 'Calle 45 # 12-34',
      },
    },
  ],
  elecciones: [
    {
      id: 'elec-synth-01',
      nombre: 'Alcaldía Mayor',
      tipoEleccion: 'ALCALDIA',
      tipoCargo: 'UNINOMINAL',
      votoPreferente: false,
      candidatos: [
        { id: 'cand-1', nombre: 'CARLOS MENDOZA', partido: 'MOVIMIENTO DEMOCRÁTICO', numero: 1 },
        { id: 'cand-2', nombre: 'MARÍA RÍOS', partido: 'ALIANZA CIUDADANA', numero: 2 },
      ],
    },
  ],
  deviceId: 'dev-synth-001',
  campana: {
    id: 'campana-synth-01',
    nombre: 'Campaña Democrática 2026',
    candidatoId: 'cand-1',
    listaId: null,
  },
};

async function run() {
  console.log('Iniciando vite preview en puerto 4703...');
  const server = spawn('pnpm', ['exec', 'vite', 'preview', '--port', '4703', '--strictPort'], {
    cwd: rootDir,
    stdio: 'pipe',
  });

  server.stdout.on('data', (d) => console.log(`[Preview] ${d.toString().trim()}`));
  server.stderr.on('data', (d) => console.error(`[Preview Err] ${d.toString().trim()}`));

  await new Promise((resolve) => setTimeout(resolve, 2000));

  console.log('Lanzando Playwright Chromium...');
  const browser = await chromium.launch({
    headless: true,
  });

  const axeScript = fs.readFileSync(axePath, 'utf8');

  try {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
    });

    const page = await context.newPage();

    let currentJornadaEstado = 'CHECKIN';

    // Mock network responses
    await page.route('**/auth/testigos/verify', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true }),
      })
    );

    await page.route('**/testigos/jornada*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'jornada-synth-01',
          mesaId: 'mesa-synth-01',
          testigoId: 'testigo-synth-01',
          campanaId: 'campana-synth-01',
          estado: currentJornadaEstado,
        }),
      })
    );

    await page.route('**/testigos/resultados/mesa/*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      })
    );

    await page.route('**/testigos/incidencias/mesa/*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      })
    );

    const auditScreen = async (nombre, filename) => {
      console.log(`\n========================================`);
      console.log(`Auditoría axe para: ${nombre}`);
      console.log(`========================================`);

      await page.waitForTimeout(500);

      // Inject axe
      await page.evaluate(axeScript);

      const axeResults = await page.evaluate(async () => {
        // @ts-ignore
        return await window.axe.run({
          runOnly: {
            type: 'tag',
            values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'],
          },
        });
      });

      const seriousAndCritical = axeResults.violations.filter(
        (v) => v.impact === 'serious' || v.impact === 'critical'
      );

      console.log(`Total violaciones axe: ${axeResults.violations.length}`);
      console.log(`Violaciones serious/critical: ${seriousAndCritical.length}`);

      if (seriousAndCritical.length > 0) {
        console.error(`DETALLE DE VIOLACIONES SERIOUS/CRITICAL EN ${nombre}:`);
        for (const v of seriousAndCritical) {
          console.error(`- [${v.impact.toUpperCase()}] ${v.id}: ${v.description}`);
          for (const node of v.nodes) {
            console.error(`  Target: ${node.target.join(' ')}`);
            console.error(`  HTML: ${node.html}`);
            console.error(`  Falla: ${node.failureSummary}`);
          }
        }
      }

      // Screenshot
      const screenshotPath = path.join(screenshotsDir, filename);
      await page.screenshot({ path: screenshotPath, fullPage: true });
      console.log(`Captura guardada: ${screenshotPath}`);

      if (fs.existsSync(vaultDir)) {
        const vaultScreenshotPath = path.join(vaultDir, filename);
        fs.copyFileSync(screenshotPath, vaultScreenshotPath);
        console.log(`Copia en bóveda guardada: ${vaultScreenshotPath}`);
      }

      return seriousAndCritical;
    };

    // 1. Pantalla de Login
    await page.goto('http://localhost:4703');
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'networkidle' });
    const loginViolations = await auditScreen('Login', 'pwa-cuo209-01-login-390px.png');

    // 2. Pantalla de Selector de Mesa
    await page.evaluate((data) => {
      localStorage.setItem('cuorum_testigo_token', 'synth-token-12345');
      localStorage.setItem('cuorum_testigo_data', JSON.stringify(data));
      localStorage.setItem('cuorum_testigo_campana', data.campana.id);
    }, mockTestigoData);
    await page.reload({ waitUntil: 'networkidle' });
    const selectorViolations = await auditScreen('Selector de Mesa', 'pwa-cuo209-02-selector-390px.png');

    // 3. Pantalla de Apertura de Mesa
    currentJornadaEstado = 'CHECKIN';
    // Click on mesa 12
    await page.click('button:has-text("#12")');
    await page.waitForTimeout(600);
    const aperturaViolations = await auditScreen('Apertura de Mesa', 'pwa-cuo209-03-apertura-390px.png');

    // 4. Pantalla de Conteo (FormularioMesaMultiple)
    currentJornadaEstado = 'ABIERTA';
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(800);
    const conteoViolations = await auditScreen('Conteo de Mesa', 'pwa-cuo209-04-conteo-390px.png');

    const totalViolations =
      loginViolations.length +
      selectorViolations.length +
      aperturaViolations.length +
      conteoViolations.length;

    console.log(`\n========================================`);
    console.log(`RESUMEN FINAL AUDITORÍA AXE:`);
    console.log(`- Login serious/critical: ${loginViolations.length}`);
    console.log(`- Selector serious/critical: ${selectorViolations.length}`);
    console.log(`- Apertura serious/critical: ${aperturaViolations.length}`);
    console.log(`- Conteo serious/critical: ${conteoViolations.length}`);
    console.log(`Total serious/critical: ${totalViolations}`);
    console.log(`========================================\n`);

    if (totalViolations > 0) {
      throw new Error(`Se encontraron ${totalViolations} violaciones serious/critical de accesibilidad.`);
    }

    console.log('¡TODAS LAS PANTALLAS CUMPLEN 0 VIOLACIONES SERIOUS/CRITICAL!');
  } finally {
    await browser.close();
    server.kill();
  }
}

run().catch((err) => {
  console.error('Error durante la ejecución del script:', err);
  process.exit(1);
});
