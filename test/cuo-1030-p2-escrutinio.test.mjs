import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import postcss from 'postcss'
import tailwindcss from 'tailwindcss'
import tailwindConfig from '../tailwind.config.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')

function read(relPath) {
  return readFileSync(resolve(ROOT, relPath), 'utf-8')
}

describe('CUO-1030 Paso 4 — Tablero de Escrutinio con tokens del tema', () => {
  it('EscrutinioDashboard usa tokens app-* sin clases fijas de claro (bg-gray-*, text-gray-*, border-gray-*) ni morado', () => {
    const src = read('src/components/escrutinio/EscrutinioDashboard.tsx')
    assert.match(src, /\bbg-app-canvas\b/, 'EscrutinioDashboard debe usar bg-app-canvas en el contenedor principal')
    assert.doesNotMatch(src, /\bbg-app-bg\b/, 'EscrutinioDashboard no debe usar el token inexistente bg-app-bg')
    assert.match(src, /bg-app-surface/, 'EscrutinioDashboard debe usar bg-app-surface en tarjetas y barra superior')
    assert.match(src, /bg-app-elevated/, 'EscrutinioDashboard debe usar bg-app-elevated en controles e insignias')
    assert.match(src, /text-app-fg/, 'EscrutinioDashboard debe usar text-app-fg')
    assert.match(src, /text-app-muted/, 'EscrutinioDashboard debe usar text-app-muted')
    assert.match(src, /border-app-line/, 'EscrutinioDashboard debe usar border-app-line')
    assert.doesNotMatch(
      src,
      /\b(bg-gray-\d+|text-gray-\d+|border-gray-\d+|divide-gray-\d+|bg-purple-\d+|text-purple-\d+|border-purple-\d+)\b/,
      'EscrutinioDashboard no debe contener colores grises claros fijos ni morado'
    )
  })

  it('todas las utilidades app-* usadas en EscrutinioDashboard existen en el CSS compilado por Tailwind (incluyendo .bg-app-canvas)', async () => {
    const src = read('src/components/escrutinio/EscrutinioDashboard.tsx')
    const clasesApp = [...new Set(src.match(/\b(?:bg|text|border|ring|divide)-app-[a-z-]+/g) || [])]

    const resultado = await postcss([
      tailwindcss({
        ...tailwindConfig,
        content: [{ raw: src, extension: 'tsx' }],
      }),
    ]).process('@tailwind utilities;', { from: undefined })

    const css = resultado.css
    for (const clase of clasesApp) {
      const escapada = clase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      assert.match(
        css,
        new RegExp(`\\.${escapada}(?:\\s*[:,{]|\\s+>)`),
        `La utilidad ${clase} usada en EscrutinioDashboard no generó ninguna regla CSS en Tailwind`
      )
    }

    assert.ok(clasesApp.includes('bg-app-canvas'), 'EscrutinioDashboard debe incluir bg-app-canvas entre sus utilidades app-*')
    assert.match(css, /\.bg-app-canvas\s*\{/, 'El CSS compilado debe emitir la regla .bg-app-canvas')
    assert.doesNotMatch(css, /\.bg-app-bg\b/, 'El CSS compilado no debe emitir .bg-app-bg')
  })

  it('EscrutinioDashboard destaca en modo oscuro los estados sin conexión, datos en caché, errores y discrepancias', () => {
    const src = read('src/components/escrutinio/EscrutinioDashboard.tsx')
    assert.match(src, /text-amber-800 dark:text-amber-300/, 'EscrutinioDashboard debe resaltar estados de caché y sin conexión en oscuro')
    assert.match(src, /text-red-800 dark:text-red-300/, 'EscrutinioDashboard debe resaltar errores y discrepancias en oscuro')
    assert.match(src, /text-green-800 dark:text-green-300/, 'EscrutinioDashboard debe resaltar estados verificados en oscuro')
    assert.match(src, /min-h-\[44px\]/, 'EscrutinioDashboard debe asegurar objetivos táctiles de al menos 44 px')
  })
})
