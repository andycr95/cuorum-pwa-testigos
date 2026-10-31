/**
 * TEMA DEL PANEL (CUO-1172)
 * Colores del shell y de los componentes base de web-admin, en claro y en oscuro.
 * Leen las variables CSS de src/index.css (:root y .dark), así un mismo nombre
 * sirve para los dos temas. No se comparte con la PWA: tailwind.tokens.js sigue intacto.
 */
const variable = (nombre) => `rgb(var(--app-${nombre}) / <alpha-value>)`;

export const temaPanel = {
  app: {
    canvas: variable('canvas'),
    surface: variable('surface'),
    elevated: variable('elevated'),
    line: variable('line'),
    fg: variable('fg'),
    muted: variable('muted'),
    accent: variable('accent'),
    'accent-fg': variable('accent-fg'),
  },
};

export default temaPanel;
