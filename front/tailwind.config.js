/** @type {import('tailwindcss').Config} */
const defaultTheme = require('tailwindcss/defaultTheme');
const fontSize = require('./style/tailwindConfig/fontSize.tailwind.cjs');
const colors = require('./style/tailwindConfig/colors.tailwind.cjs');
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors,
      fontSize,
      fontFamily: {
        sans: ['pretendard', ...defaultTheme.fontFamily.sans],
      },
    },
  },
  plugins: [],
};
