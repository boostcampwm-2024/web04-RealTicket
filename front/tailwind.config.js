import { fontFamily } from 'tailwindcss/defaultTheme';

import { colors } from './style/colors.ts';
import { fontSize } from './style/fontSize.ts';

/** @type {import('tailwindcss').Config} */

const WIDTH = 300;
const WIDTH_LIst = Array.from({ length: 100 }, (_, index) => WIDTH + index);

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  safelist: [...WIDTH_LIst.map((width) => `w-[${width}px]`)],
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
