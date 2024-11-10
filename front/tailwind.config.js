import { fontFamily } from 'tailwindcss/defaultTheme';

import { colors } from './style/colors.ts';
import { fontSize } from './style/fontSize.ts';

/** @type {import('tailwindcss').Config} */

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors,
      fontSize,
      fontFamily: {
        sans: ['pretendard', ...fontFamily.sans],
      },
    },
  },
  plugins: [],
};
