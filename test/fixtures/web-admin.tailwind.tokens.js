/**
 * SISTEMA DE DISEÑO BASE CUORUM
 * Fuente única de verdad de tokens compartidos para web-admin y cuorum-pwa-testigos.
 * Basado en la sección «Sistema de diseño base» de [[Diseno-y-UX]] (CUO-217).
 *
 * Cualquier modificación a estos tokens debe reflejarse idéntica en:
 * - web-admin/tailwind.tokens.js
 * - cuorum-pwa-testigos/tailwind.tokens.js
 */

export const themeExtend = {
  colors: {
    // Marca principal
    'brand-600': '#DC2626',
    'brand-700': '#B91C1C',
    'brand-50': '#FEF2F2',
    brand: {
      50: '#FEF2F2',
      100: '#FEE2E2',
      200: '#FECACA',
      300: '#FCA5A5',
      400: '#F87171',
      500: '#DC2626',
      600: '#DC2626',
      700: '#B91C1C',
      800: '#7F1D1D',
      900: '#262627',
      950: '#0A0A0A',
    },

    // Texto y tinta
    'ink-900': '#111827',
    'ink-600': '#4B5563',
    ink: {
      900: '#111827',
      600: '#4B5563',
    },

    // Bordes y líneas
    'line-300': '#D1D5DB',
    line: {
      300: '#D1D5DB',
    },

    // Superficie y lienzo
    surface: '#FFFFFF',
    canvas: '#F9FAFB',

    // Estados semánticos
    'ok-700': '#15803D',
    'ok-50': '#F0FDF4',
    ok: {
      50: '#F0FDF4',
      700: '#15803D',
    },

    'warn-700': '#B45309',
    'warn-50': '#FFFBEB',
    warn: {
      50: '#FFFBEB',
      700: '#B45309',
    },

    'err-700': '#B91C1C',
    'err-50': '#FEF2F2',
    err: {
      50: '#FEF2F2',
      700: '#B91C1C',
    },

    'info-700': '#1D4ED8',
    'info-50': '#EFF6FF',
    info: {
      50: '#EFF6FF',
      700: '#1D4ED8',
    },

    // Compatibilidad retroactiva editorial
    'editorial-red': '#DC2626',
    'editorial-black': '#262627',
    editorial: {
      red: '#DC2626',
      black: '#262627',
      gray: {
        50: '#FAFAFA',
        100: '#F5F5F5',
        200: '#E5E5E5',
        300: '#D4D4D4',
        400: '#A1A1A1',
        500: '#737373',
        600: '#525252',
        700: '#404040',
        800: '#262626',
        900: '#2F3338',
        950: '#1A1C1E',
      },
    },
  },

  fontFamily: {
    sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
  },

  fontSize: {
    // web: 12/14/16/20/24/32 px; PWA: base 16, títulos 20/24/32, cifras de conteo 28–40
    'caption': ['12px', { lineHeight: '16px' }],
    'body-sm': ['14px', { lineHeight: '20px' }],
    'body': ['16px', { lineHeight: '24px' }],
    'title-sm': ['20px', { lineHeight: '28px' }],
    'title-md': ['24px', { lineHeight: '32px' }],
    'title-lg': ['32px', { lineHeight: '40px' }],
    'conteo': ['36px', { lineHeight: '44px' }],
    'conteo-lg': ['40px', { lineHeight: '48px' }],
  },

  spacing: {
    // base 4 px: 4, 8, 12, 16, 24, 32, 48
    '1': '4px',
    '2': '8px',
    '3': '12px',
    '4': '16px',
    '6': '24px',
    '8': '32px',
    '12': '48px',
    'touch-web': '40px',
    'touch-mobile': '44px',
    'touch-pwa': '48px',
    'touch-conteo': '56px',
  },

  borderRadius: {
    // 8 px (botones, campos), 12 px (tarjetas, modales), 9999 (insignias)
    'btn': '8px',
    'field': '8px',
    'card': '12px',
    'modal': '12px',
    'badge': '9999px',
  },

  boxShadow: {
    // solo sm (0 1px 2px rgb(0 0 0 / .06))
    'sm': '0 1px 2px 0 rgb(0 0 0 / 0.06)',
    'card': '0 1px 2px 0 rgb(0 0 0 / 0.06)',
  },

  minHeight: {
    'touch-web': '40px',
    'touch-mobile': '44px',
    'touch-pwa': '48px',
    'touch-conteo': '56px',
  },

  minWidth: {
    'touch-web': '40px',
    'touch-mobile': '44px',
    'touch-pwa': '48px',
    'touch-conteo': '56px',
  },

  keyframes: {
    shimmer: {
      '0%': { transform: 'translateX(-100%)' },
      '100%': { transform: 'translateX(100%)' },
    },
  },

  animation: {
    shimmer: 'shimmer 2s infinite',
  },
};

export default themeExtend;
