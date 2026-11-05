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

function srgbChannelToLinear(c) {
  const s = c / 255
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
}

function hexToRgb(hex) {
  const clean = hex.replace('#', '')
  const num = parseInt(clean, 16)
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  }
}

function relativeLuminance(hex) {
  const { r, g, b } = hexToRgb(hex)
  return (
    0.2126 * srgbChannelToLinear(r) +
    0.7152 * srgbChannelToLinear(g) +
    0.0722 * srgbChannelToLinear(b)
  )
}

function contrastRatio(hexA, hexB) {
  const l1 = relativeLuminance(hexA)
  const l2 = relativeLuminance(hexB)
  const lighter = Math.max(l1, l2)
  const darker = Math.min(l1, l2)
  return (lighter + 0.05) / (darker + 0.05)
}

describe('CUO-1030 Paso 1 — Jornada (check-in, apertura, progreso, cierre) e incidencias con tokens del tema', () => {
  const archivosPaso1 = [
    'src/components/jornada/CheckinTestigo.tsx',
    'src/components/jornada/AperturaMesa.tsx',
    'src/components/jornada/ProgresoElecciones.tsx',
    'src/components/jornada/WizardCierre.tsx',
    'src/components/incidencias/PanelIncidencias.tsx',
  ]

  it('App.tsx migra las ramas de jornada a bg-app-canvas y elimina bg-gray-50 / bg-white en la vista de acta cerrada', () => {
    const appSrc = read('src/App.tsx')
    const mainsJornada = appSrc.match(/<main className="[^"]+"/g) ?? []
    assert.equal(mainsJornada.length, 4, 'App.tsx debe tener 4 elementos <main> para las ramas de jornada')
    for (const m of mainsJornada) {
      assert.match(m, /bg-app-canvas/, `Cada <main> de jornada debe usar bg-app-canvas: ${m}`)
      assert.doesNotMatch(m, /bg-gray-50/, `Ningún <main> de jornada debe usar bg-gray-50: ${m}`)
    }
    assert.doesNotMatch(appSrc, /bg-gray-50|text-gray-|border-gray-|shadow-2xl/)
  })

  it('los 5 componentes de jornada/* e incidencias usan tokens app-* sin clases fijas de claro (bg-white, bg-gray-*, text-gray-*, border-gray-*)', () => {
    for (const rel of archivosPaso1) {
      const src = read(rel)
      assert.match(src, /bg-app-(surface|elevated)/, `${rel} debe usar bg-app-surface o bg-app-elevated`)
      assert.match(src, /text-app-fg/, `${rel} debe usar text-app-fg`)
      assert.match(src, /border-app-line/, `${rel} debe usar border-app-line`)
      assert.doesNotMatch(
        src,
        /\b(bg-white|bg-gray-\d+|text-gray-\d+|border-gray-\d+|shadow-2xl|shadow-xl|bg-purple-\d+|text-purple-\d+|border-purple-\d+)\b/,
        `${rel} no debe contener colores claros fijos, morado ni sombras pesadas`
      )
    }
  })

  it('los estados de error (role="alert") y de envío pendiente destacan en claro y oscuro sin ocultarse', () => {
    for (const rel of [
      'src/components/jornada/CheckinTestigo.tsx',
      'src/components/jornada/AperturaMesa.tsx',
      'src/components/jornada/WizardCierre.tsx',
      'src/components/incidencias/PanelIncidencias.tsx',
    ]) {
      const src = read(rel)
      assert.match(src, /role="alert"/, `${rel} debe marcar errores con role="alert"`)
      assert.match(src, /text-red-800\s+dark:text-red-300/, `${rel} debe usar par semántico de error legible en claro y oscuro`)
    }

    const incSrc = read('src/components/incidencias/PanelIncidencias.tsx')
    assert.match(
      incSrc,
      /text-amber-800\s+dark:text-amber-300/,
      'PanelIncidencias debe resaltar el estado Pendiente de sincronización en claro y oscuro'
    )
    assert.doesNotMatch(incSrc, /text-\[10px\]/, 'PanelIncidencias no debe usar texto menor a 12px (text-[10px])')
  })

  it('WizardCierre mantiene fondo blanco explícito (#FFFFFF) en el lienzo de firma para trazos oscuros y objetivos táctiles >= 44px', () => {
    const src = read('src/components/jornada/WizardCierre.tsx')
    assert.match(src, /bg-\[#FFFFFF\]/, 'SignatureCanvas debe conservar fondo blanco explícito bg-[#FFFFFF] en modo oscuro')
    assert.match(src, /text-\[#57534E\]/, 'El placeholder de firma debe tener contraste AA sobre #FFFFFF')
    assert.doesNotMatch(src, /text-\[10px\]/, 'WizardCierre no debe usar text-[10px]')
    assert.match(src, /min-h-\[44px\]|min-h-\[48px\]/, 'WizardCierre debe garantizar objetivos táctiles >= 44px')
  })

  it('los pares semánticos de estado (éxito, alerta, error, incidencia) cumplen contraste WCAG AA >= 4.5:1 en claro y oscuro', () => {
    const pares = [
      // Claro sobre #FFFFFF / #EFECE6
      ['#166534', '#FFFFFF', 'green-800 sobre surface claro'],
      ['#92400E', '#FFFFFF', 'amber-800 sobre surface claro'],
      ['#991B1B', '#FFFFFF', 'red-800 sobre surface claro'],
      ['#9A3412', '#FFFFFF', 'orange-800 sobre surface claro'],
      ['#1E40AF', '#FFFFFF', 'blue-800 sobre surface claro'],
      ['#57534E', '#FFFFFF', 'placeholder firma sobre #FFFFFF'],
      // Oscuro sobre #131316 / #1A1A1F
      ['#86EFAC', '#131316', 'green-300 sobre surface oscuro'],
      ['#FCD34D', '#131316', 'amber-300 sobre surface oscuro'],
      ['#FCA5A5', '#131316', 'red-300 sobre surface oscuro'],
      ['#FDBA74', '#131316', 'orange-300 sobre surface oscuro'],
      ['#93C5FD', '#131316', 'blue-300 sobre surface oscuro'],
      // Botones sólidos con texto blanco
      ['#FFFFFF', '#DC2626', 'blanco sobre editorial-red'],
      ['#FFFFFF', '#15803D', 'blanco sobre green-700'],
      ['#FFFFFF', '#C2410C', 'blanco sobre orange-700'],
    ]

    for (const [fg, bg, desc] of pares) {
      const ratio = contrastRatio(fg, bg)
      assert.ok(ratio >= 4.5, `Contraste insuficiente en ${desc}: ${ratio.toFixed(2)}:1 (mínimo 4.5:1)`)
    }
  })
})
