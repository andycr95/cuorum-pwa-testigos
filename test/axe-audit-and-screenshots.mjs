import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const screenshotsDir = process.env.CAPTURAS_DIR || path.join(rootDir, 'test', 'screenshots');
const vaultDir = process.env.VAULT_CAPTURAS_DIR || null;
const pwaPort = process.env.PORT || process.env.PWA_PORT || '4703';

if (!fs.existsSync(screenshotsDir)) {
  fs.mkdirSync(screenshotsDir, { recursive: true });
}

function resolveAxeScript() {
  if (process.env.AXE_PATH && fs.existsSync(process.env.AXE_PATH)) {
    return fs.readFileSync(process.env.AXE_PATH, 'utf8');
  }
  const candidate = path.join(rootDir, 'node_modules', 'axe-core', 'axe.min.js');
  if (fs.existsSync(candidate)) {
    return fs.readFileSync(candidate, 'utf8');
  }
  return null;
}

async function loadPlaywright() {
  if (process.env.PLAYWRIGHT_PATH) {
    try {
      let p = process.env.PLAYWRIGHT_PATH;
      if (fs.existsSync(p) && fs.statSync(p).isDirectory()) {
        const candidate = path.join(p, 'index.mjs');
        if (fs.existsSync(candidate)) p = candidate;
      }
      const mod = await import(p.startsWith('/') ? pathToFileURL(p).href : p);
      return mod.chromium || mod.default?.chromium || mod;
    } catch {}
  }
  try {
    const mod = await import('playwright');
    return mod.chromium || mod.default?.chromium || mod;
  } catch {}
  return null;
}

const mockTestigoData = {
  testigo: {
    id: 'TEST-001',
    cedula: '1000000001',
    nombres: 'JUAN PABLO',
    apellidos: 'GÓMEZ PÉREZ',
    telefono: '3000000000',
    email: 'testigo@example.invalid',
  },
  tipoTestigo: 'ELECTORAL',
  mesa: {
    id: 'TEST-MESA-01',
    numero: 12,
    totalSufragantes: 350,
    puesto: {
      id: 'TEST-PUESTO-01',
      nombre: 'Colegio San José',
      direccion: 'Calle 45 # 12-34',
    },
  },
  mesas: [
    {
      id: 'TEST-MESA-01',
      numero: 12,
      totalSufragantes: 350,
      puesto: {
        id: 'TEST-PUESTO-01',
        nombre: 'Colegio San José',
        direccion: 'Calle 45 # 12-34',
      },
    },
    {
      id: 'TEST-MESA-02',
      numero: 13,
      totalSufragantes: 340,
      puesto: {
        id: 'TEST-PUESTO-01',
        nombre: 'Colegio San José',
        direccion: 'Calle 45 # 12-34',
      },
    },
  ],
  elecciones: [
    {
      id: 'TEST-ELEC-01',
      nombre: 'Alcaldía Mayor',
      tipoEleccion: 'ALCALDIA',
      tipoCargo: 'UNINOMINAL',
      votoPreferente: false,
      candidatos: [
        { id: 'cand-1', nombre: 'CARLOS MENDOZA', partido: 'MOVIMIENTO DEMOCRÁTICO', numero: 1 },
        { id: 'cand-2', nombre: 'MARÍA RÍOS', partido: 'ALIANZA CIUDADANA', numero: 2 },
      ],
    },
    {
      id: 'TEST-ELEC-02',
      nombre: 'Concejo Municipal',
      tipoEleccion: 'CONCEJO',
      tipoCargo: 'PLURINOMINAL',
      votoPreferente: true,
      candidatos: [
        { id: 'cand-3', nombre: 'LISTA DEMOCRACIA VIVA', partido: 'PARTIDO DEMOCRACIA VIVA', numero: 0 },
      ],
    },
  ],
  campana: {
    id: 'TEST-CAMPANA-01',
    nombre: 'Campaña Democrática 2026',
    municipio: 'Bogotá, D.C.',
  },
  departamento: 'BOGOTA D.C.',
  municipio: 'BOGOTA D.C.',
  deviceId: 'TEST-DEVICE-01',
  configuracion: {
    id: 'TEST-CONFIG-01',
    campanaId: 'TEST-CAMPANA-01',
    nombre: 'Campaña Democrática 2026',
    candidatoId: 'cand-1',
    listaId: null,
  },
};

async function run() {
  const chromium = await loadPlaywright();
  if (!chromium) {
    console.log('Playwright no está instalado o disponible. Omitiendo auditoría en vivo axe.');
    return;
  }

  const axeScript = resolveAxeScript();
  if (!axeScript) {
    console.log('axe-core no está instalado en node_modules. Omitiendo auditoría en vivo axe.');
    return;
  }

  console.log(`Iniciando vite preview en puerto ${pwaPort}...`);
  const server = spawn('pnpm', ['exec', 'vite', 'preview', '--port', pwaPort, '--strictPort'], {
    cwd: rootDir,
    stdio: 'pipe',
  });

  server.stdout.on('data', (d) => console.log(`[Preview] ${d.toString().trim()}`));
  server.stderr.on('data', (d) => console.error(`[Preview Err] ${d.toString().trim()}`));

  await new Promise((resolve) => setTimeout(resolve, 2000));

  console.log('Lanzando Playwright Chromium...');
  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      env: process.env,
    });
  } catch (err) {
    console.warn('No fue posible inicializar Chromium en este entorno:', err?.message || err);
    try { server.kill('SIGKILL'); } catch {}
    process.exit(0);
  }

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
          id: 'TEST-JORNADA-01',
          mesaId: 'TEST-MESA-01',
          testigoId: 'TEST-001',
          campanaId: 'TEST-CAMPANA-01',
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

      if (vaultDir && fs.existsSync(vaultDir)) {
        const vaultScreenshotPath = path.join(vaultDir, filename);
        fs.copyFileSync(screenshotPath, vaultScreenshotPath);
        console.log(`Copia en bóveda guardada: ${vaultScreenshotPath}`);
      }

      return seriousAndCritical;
    };

    // 1. Pantalla de Login
    await page.goto(`http://localhost:${pwaPort}`);
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

run().then(() => {
  process.exit(0);
}).catch((err) => {
  console.error('Error durante la ejecución del script:', err);
  process.exit(1);
});
