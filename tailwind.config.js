/** @type {import('tailwindcss').Config} */
import themeExtend from './tailwind.tokens.js';

export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: themeExtend,
  },
  plugins: [],
};
