/** @type {import('tailwindcss').Config} */
import themeExtend from './tailwind.tokens.js';
import temaPanel from './tailwind.tema.js';

export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: { ...themeExtend, colors: { ...themeExtend.colors, ...temaPanel } },
  },
  plugins: [],
};
