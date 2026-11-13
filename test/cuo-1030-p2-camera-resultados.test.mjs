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

describe('CUO-1030 Paso 3 — Cámara E-14, Estado OCR y Resultados con tokens del tema', () => {
  const archivosPaso3 = [
    'src/components/camera/CapturaE14.tsx',
    'src/components/camera/CapturaMultipleE14.tsx',
    'src/components/camera/EstadoOcrE14.tsx',
    'src/components/resultados/PanelHistorialResultados.tsx',
  ]

  it('los 4 archivos de camera/* y resultados/* usan tokens app-* sin clases fijas de claro (bg-white, bg-gray-*, text-gray-*, border-gray-*)', () => {
    for (const rel of archivosPaso3) {
      const src = read(rel)
      assert.match(src, /bg-app-(surface|elevated)/, `${rel} debe usar bg-app-surface o bg-app-elevated`)
      assert.match(src, /text-app-(fg|muted)/, `${rel} debe usar text-app-fg o text-app-muted`)
      assert.match(src, /border-app-line/, `${rel} debe usar border-app-line`)
      assert.doesNotMatch(
        src,
        /\b(bg-white(?![/-])|bg-gray-\d+|text-gray-\d+|border-gray-\d+|divide-gray-\d+|shadow-2xl|shadow-xl|bg-purple-\d+|text-purple-\d+|border-purple-\d+)\b/,
        `${rel} no debe contener colores claros fijos, morado ni sombras pesadas`
      )
    }
  })

  it('EstadoOcrE14 destaca en modo oscuro los estados de error, procesamiento pendiente y baja confianza sin ocultar alertas', () => {
    const src = read('src/components/camera/EstadoOcrE14.tsx')
    assert.match(src, /text-red-800\s+dark:text-red-300/, 'EstadoOcrE14 debe resaltar errores de lectura en claro y oscuro')
    assert.match(src, /text-amber-800\s+dark:text-amber-300/, 'EstadoOcrE14 debe resaltar baja confianza y alertas en claro y oscuro')
    assert.match(src, /border-amber-400/, 'EstadoOcrE14 debe preservar border-amber-400 en celdas de baja confianza')
    assert.doesNotMatch(src, /⚠️/, 'EstadoOcrE14 no debe usar emojis prohibidos')
  })

  it('PanelHistorialResultados muestra el historial enviado con contraste AA en claro y oscuro y sin text-[10px]', () => {
    const src = read('src/components/resultados/PanelHistorialResultados.tsx')
    assert.match(src, /text-green-800\s+dark:text-green-300/, 'PanelHistorialResultados debe resaltar el estado enviado en claro y oscuro')
    assert.doesNotMatch(src, /text-\[10px\]/, 'PanelHistorialResultados no debe usar text-[10px]')
  })
})
