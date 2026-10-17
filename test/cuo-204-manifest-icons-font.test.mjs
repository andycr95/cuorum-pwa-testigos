import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import { execSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');

// Ensure dist exists before testing; build automatically if needed
if (!fs.existsSync(distDir) || !fs.existsSync(path.join(distDir, 'manifest.webmanifest'))) {
  execSync('pnpm run build', { cwd: rootDir, stdio: 'pipe' });
}

const manifestPath = path.join(distDir, 'manifest.webmanifest');
const rawManifest = fs.readFileSync(manifestPath, 'utf8');
const manifest = JSON.parse(rawManifest);

test('CUO-204: Manifiesto web existe y contiene idioma y orientación en español de Colombia', () => {
  assert.equal(manifest.lang, 'es-CO', 'El manifiesto debe especificar lang: "es-CO"');
  assert.equal(manifest.orientation, 'portrait', 'El manifiesto debe especificar orientation: "portrait"');
  assert.ok(manifest.short_name, 'El manifiesto debe tener short_name');
  assert.equal(manifest.short_name, 'Testigos', 'El short_name debe ser "Testigos"');
  assert.equal(manifest.theme_color, '#DC2626', 'El theme_color debe ser #DC2626 (rojo de marca)');
});

test('CUO-204: Manifiesto declara íconos 192, 512 y maskable con purpose adecuado', () => {
  assert.ok(Array.isArray(manifest.icons), 'manifest.icons debe ser un arreglo');
  assert.ok(manifest.icons.length >= 3, 'manifest.icons debe declarar al menos 3 íconos');

  const icon192 = manifest.icons.find((i) => i.sizes === '192x192');
  assert.ok(icon192, 'Debe existir un ícono de tamaño 192x192');
  assert.equal(icon192.type, 'image/png');
  assert.equal(icon192.purpose, 'any');

  const icon512Standard = manifest.icons.find((i) => i.sizes === '512x512' && i.purpose === 'any');
  assert.ok(icon512Standard, 'Debe existir un ícono 512x512 con purpose "any"');
  assert.equal(icon512Standard.type, 'image/png');

  const icon512Maskable = manifest.icons.find((i) => i.sizes === '512x512' && i.purpose === 'maskable');
  assert.ok(icon512Maskable, 'Debe existir un ícono 512x512 con purpose "maskable"');
  assert.equal(icon512Maskable.type, 'image/png');
});

test('CUO-204: Cada ícono del manifiesto existe físicamente en dist/ y es un archivo PNG válido', () => {
  const pngSignature = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);

  for (const icon of manifest.icons) {
    const iconRelativePath = icon.src.replace(/^\//, '');
    const iconFilePath = path.join(distDir, iconRelativePath);

    assert.ok(
      fs.existsSync(iconFilePath),
      `El ícono ${icon.src} declarado en el manifiesto debe existir físicamente en ${iconFilePath}`
    );

    const stats = fs.statSync(iconFilePath);
    assert.ok(stats.size > 1024, `El ícono ${icon.src} debe tener un tamaño razonable (> 1KB), actual: ${stats.size}B`);

    const buffer = fs.readFileSync(iconFilePath);
    assert.equal(
      buffer.subarray(0, 8).equals(pngSignature),
      true,
      `El ícono ${icon.src} debe comenzar con la firma mágica PNG`
    );

    // Leer dimensiones del encabezado IHDR
    const ihdrChunkType = buffer.toString('ascii', 12, 16);
    assert.equal(ihdrChunkType, 'IHDR', `El primer chunk de ${icon.src} debe ser IHDR`);

    const width = buffer.readUInt32BE(16);
    const height = buffer.readUInt32BE(20);
    const [expectedW, expectedH] = icon.sizes.split('x').map(Number);

    assert.equal(width, expectedW, `El ancho de ${icon.src} debe ser ${expectedW}px`);
    assert.equal(height, expectedH, `La altura de ${icon.src} debe ser ${expectedH}px`);
  }
});

test('CUO-204: La fuente Inter está empaquetada localmente en dist/assets/ con woff2', () => {
  const assetsDir = path.join(distDir, 'assets');
  const files = fs.readdirSync(assetsDir);

  const woff2Files = files.filter((f) => f.endsWith('.woff2') && f.includes('inter'));
  assert.ok(woff2Files.length > 0, 'Deben existir archivos de fuentes .woff2 para Inter en dist/assets/');

  // Verificar presencia de pesos 400, 600 y 700
  const has400 = woff2Files.some((f) => f.includes('400'));
  const has600 = woff2Files.some((f) => f.includes('600'));
  const has700 = woff2Files.some((f) => f.includes('700'));

  assert.ok(has400, 'Debe existir la fuente Inter peso 400 empaquetada en woff2');
  assert.ok(has600, 'Debe existir la fuente Inter peso 600 empaquetada en woff2');
  assert.ok(has700, 'Debe existir la fuente Inter peso 700 empaquetada en woff2');
});

test('CUO-204: El CSS compilado define @font-face para Inter referenciando activos locales', () => {
  const assetsDir = path.join(distDir, 'assets');
  const cssFiles = fs.readdirSync(assetsDir).filter((f) => f.endsWith('.css'));
  assert.ok(cssFiles.length > 0, 'Debe existir al menos un archivo CSS compilado');

  let fontFaceFound = false;
  let hasExternalUrl = false;

  for (const cssFile of cssFiles) {
    const cssContent = fs.readFileSync(path.join(assetsDir, cssFile), 'utf8');
    if (cssContent.includes('@font-face') && cssContent.includes('Inter')) {
      fontFaceFound = true;
    }
    if (cssContent.includes('fonts.googleapis.com') || cssContent.includes('fonts.gstatic.com')) {
      hasExternalUrl = true;
    }
  }

  assert.ok(fontFaceFound, 'El CSS compilado debe incluir declaraciones @font-face para la fuente Inter');
  assert.equal(hasExternalUrl, false, 'El CSS no debe depender de Google Fonts ni de URLs externas');
});

test('CUO-204: El Service Worker precachea los íconos y las fuentes woff2 para funcionamiento offline', () => {
  const swPath = path.join(distDir, 'sw.js');
  assert.ok(fs.existsSync(swPath), 'dist/sw.js debe existir');

  // Buscar archivos de manifiesto de workbox en dist
  const distFiles = fs.readdirSync(distDir);
  const workboxFile = distFiles.find((f) => f.startsWith('workbox-') && f.endsWith('.js'));
  assert.ok(workboxFile, 'Debe existir archivo workbox en dist/');

  const swContent = fs.readFileSync(swPath, 'utf8');

  // Verificar que los íconos están precacheados
  assert.ok(swContent.includes('pwa-192x192.png'), 'sw.js debe precachear pwa-192x192.png');
  assert.ok(swContent.includes('pwa-512x512.png'), 'sw.js debe precachear pwa-512x512.png');
  assert.ok(swContent.includes('pwa-maskable-512x512.png'), 'sw.js debe precachear pwa-maskable-512x512.png');

  // Verificar que los woff2 de las fuentes están precacheados
  assert.ok(swContent.includes('.woff2'), 'sw.js debe precachear archivos .woff2 de la fuente Inter');
});

test('CUO-204: Servidor estático responde con Content-Type: image/png para los íconos y no devuelve index.html', async () => {
  // Crear un servidor HTTP básico simulando el serving de dist/
  const mimeTypes = {
    '.html': 'text/html; charset=utf-8',
    '.png': 'image/png',
    '.json': 'application/json',
    '.webmanifest': 'application/manifest+json',
    '.woff2': 'font/woff2',
    '.js': 'application/javascript',
    '.css': 'text/css',
  };

  const server = http.createServer((req, res) => {
    let filePath = path.join(distDir, req.url === '/' ? 'index.html' : req.url.split('?')[0]);
    if (!fs.existsSync(filePath)) {
      // Fallback SPA
      filePath = path.join(distDir, 'index.html');
    }
    const ext = path.extname(filePath).toLowerCase();
    const contentType = mimeTypes[ext] || 'application/octet-stream';
    const content = fs.readFileSync(filePath);
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(content);
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;

  try {
    for (const icon of manifest.icons) {
      const res = await fetch(`http://127.0.0.1:${port}${icon.src}`);
      assert.equal(res.status, 200, `Petición a ${icon.src} debe responder 200`);
      assert.equal(
        res.headers.get('content-type'),
        'image/png',
        `Petición a ${icon.src} debe responder con Content-Type "image/png"`
      );

      const buffer = Buffer.from(await res.arrayBuffer());
      const isPng = buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47;
      assert.ok(isPng, `La respuesta de ${icon.src} debe ser binario PNG, no HTML`);
    }
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
