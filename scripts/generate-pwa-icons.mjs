import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const playwrightModule = process.env.PLAYWRIGHT_PATH || 'playwright';
let chromium;
try {
  const mod = await import(playwrightModule);
  chromium = mod.chromium || mod.default?.chromium || mod;
} catch (err) {
  throw new Error(`No se pudo cargar Playwright desde "${playwrightModule}". Define PLAYWRIGHT_PATH o instala playwright: ${err.message}`);
}

const rawSvg = fs.readFileSync(path.join(rootDir, 'public', 'logo.svg'), 'utf8');
// Replace red fill with white fill
const whiteLogoSvg = rawSvg.replace(/fill:rgb\(220,38,38\);/g, 'fill:#FFFFFF;');

async function generateIcon({ size, svgHeight, outputPath, isMaskable }) {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage({
      viewport: { width: size, height: size },
      deviceScaleFactor: 1,
    });

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body {
      width: ${size}px;
      height: ${size}px;
      overflow: hidden;
      background-color: #DC2626;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .icon-container {
      width: ${size}px;
      height: ${size}px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .logo-wrapper {
      height: ${svgHeight}px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .logo-wrapper svg {
      height: ${svgHeight}px;
      width: auto;
      display: block;
    }
  </style>
</head>
<body>
  <div class="icon-container">
    <div class="logo-wrapper">
      ${whiteLogoSvg}
    </div>
  </div>
</body>
</html>`;

    await page.setContent(html, { waitUntil: 'load' });
    await page.screenshot({
      path: outputPath,
      type: 'png',
      clip: { x: 0, y: 0, width: size, height: size },
      omitBackground: false,
    });
    console.log(`Generated: ${outputPath} (${size}x${size}, svgHeight=${svgHeight})`);
  } finally {
    await browser.close();
  }
}

async function main() {
  const publicDir = path.join(rootDir, 'public');

  // 1. 192x192 icon (standard, ~130px logo height)
  await generateIcon({
    size: 192,
    svgHeight: 130,
    outputPath: path.join(publicDir, 'pwa-192x192.png'),
    isMaskable: false,
  });

  // 2. 512x512 icon (standard, ~346px logo height)
  await generateIcon({
    size: 512,
    svgHeight: 346,
    outputPath: path.join(publicDir, 'pwa-512x512.png'),
    isMaskable: false,
  });

  // 3. 512x512 maskable icon (safe zone diameter 80% = 410px circle; 280px height fits safely inside)
  await generateIcon({
    size: 512,
    svgHeight: 280,
    outputPath: path.join(publicDir, 'pwa-maskable-512x512.png'),
    isMaskable: true,
  });

  // 4. apple-touch-icon.png (180x180)
  await generateIcon({
    size: 180,
    svgHeight: 122,
    outputPath: path.join(publicDir, 'apple-touch-icon.png'),
    isMaskable: false,
  });

  console.log('All icons generated successfully!');
}

main().catch((err) => {
  console.error('Error generating icons:', err);
  process.exit(1);
});
