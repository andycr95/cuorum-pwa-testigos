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

describe('CUO-1030 Paso 2a — Formulario de conteo y votos con tokens del tema', () => {
  const archivosFormulario = [
    'src/components/formulario/VoteInput.tsx',
    'src/components/formulario/CapturaFoto.tsx',
    'src/components/formulario/ObservacionesInput.tsx',
    'src/components/formulario/SelectorEleccion.tsx',
    'src/components/formulario/FormularioMesaMultiple.tsx',
  ]

  it('los 5 archivos de formulario/* usan tokens app-* sin clases fijas de claro (bg-white, bg-gray-*, text-gray-*, border-gray-*)', () => {
    for (const rel of archivosFormulario) {
      const src = read(rel)
      assert.match(src, /bg-app-(surface|elevated)/, `${rel} debe usar bg-app-surface o bg-app-elevated`)
      assert.match(src, /text-app-(fg|muted)/, `${rel} debe usar text-app-fg o text-app-muted`)
      assert.match(src, /border-app-line/, `${rel} debe usar border-app-line`)
      assert.doesNotMatch(
        src,
        /\b(bg-white(?![/-])|bg-gray-\d+|text-gray-\d+|border-gray-\d+|divide-gray-\d+|shadow-2xl|shadow-xl|text-editorial-black)\b/,
        `${rel} no debe contener colores claros fijos ni sombras pesadas`
      )
    }
  })

  it('VoteInput mantiene botones táctiles 56x56 px, valor central >= 28 px y contraste en claro y oscuro', () => {
    const src = read('src/components/formulario/VoteInput.tsx')
    assert.match(src, /w-14 h-14 min-w-\[56px\] min-h-\[56px\]/, 'VoteInput debe mantener botones de 56x56 px')
    assert.match(src, /text-3xl font-black/, 'VoteInput debe mantener el contador central grande')
    assert.match(src, /bg-app-surface/, 'VoteInput debe usar bg-app-surface en la fila')
    assert.match(src, /bg-app-elevated/, 'VoteInput debe usar bg-app-elevated en controles e insignias')
  })

  it('FormularioMesaMultiple destaca alertas de fraude, falta de conexión y errores de sincronización en modo oscuro', () => {
    const src = read('src/components/formulario/FormularioMesaMultiple.tsx')
    assert.match(src, /ALERTA DE FRAUDE/, 'FormularioMesaMultiple debe conservar la alerta de fraude')
    assert.match(src, /text-amber-800 dark:text-amber-300/, 'FormularioMesaMultiple debe resaltar advertencias y errores de sync en oscuro')
    assert.match(src, /text-blue-800 dark:text-blue-300/, 'FormularioMesaMultiple debe resaltar el estado guardado localmente sin red en oscuro')
    assert.match(src, /data-testid="barra-fija-conteo"/, 'FormularioMesaMultiple debe mantener la barra fija inferior de conteo')
  })
})
