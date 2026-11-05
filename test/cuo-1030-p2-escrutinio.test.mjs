import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')

function read(relPath) {
  return readFileSync(resolve(ROOT, relPath), 'utf-8')
}

describe('CUO-1030 Paso 4 — Tablero de Escrutinio con tokens del tema', () => {
  it('EscrutinioDashboard usa tokens app-* sin clases fijas de claro (bg-gray-*, text-gray-*, border-gray-*) ni morado', () => {
    const src = read('src/components/escrutinio/EscrutinioDashboard.tsx')
    assert.match(src, /bg-app-bg/, 'EscrutinioDashboard debe usar bg-app-bg en el contenedor principal')
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

  it('EscrutinioDashboard destaca en modo oscuro los estados sin conexión, datos en caché, errores y discrepancias', () => {
    const src = read('src/components/escrutinio/EscrutinioDashboard.tsx')
    assert.match(src, /text-amber-800 dark:text-amber-300/, 'EscrutinioDashboard debe resaltar estados de caché y sin conexión en oscuro')
    assert.match(src, /text-red-800 dark:text-red-300/, 'EscrutinioDashboard debe resaltar errores y discrepancias en oscuro')
    assert.match(src, /text-green-800 dark:text-green-300/, 'EscrutinioDashboard debe resaltar estados verificados en oscuro')
    assert.match(src, /min-h-\[44px\]/, 'EscrutinioDashboard debe asegurar objetivos táctiles de al menos 44 px')
  })
})
