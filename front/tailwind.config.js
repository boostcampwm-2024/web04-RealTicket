import { fontFamily } from 'tailwindcss/defaultTheme';

import { colors } from './style/colors.ts';
import { fontSize } from './style/fontSize.ts';

/** @type {import('tailwindcss').Config} */

const WIDTH_LIst = Array.from({ length: 1000 }, (_, index) => index);
const COL_LENGTH_RANGE = Array.from({ length: 20 }, (_, index) => index + 1);
const TRANSLATE_VALUE_RANGE = Array.from({ length: 101 }, (_, index) => index);
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  safelist: [
    ...WIDTH_LIst.map((width) => `w-[${width}px]`),
    ...COL_LENGTH_RANGE.map((length) => `grid-cols-${length}`),
    ...TRANSLATE_VALUE_RANGE.map((percent) => `translate-x-[${percent}%]`),
  ],
  theme: {
    extend: {
      colors,
      fontSize,
      fontFamily: {
        sans: ['pretendard', ...fontFamily.sans],
      },
      animation: {
        'fade-in': 'fadeIn 0.5s ease-in-out forwards',
        'fade-out': 'fadeOut 0.5s ease-in-out forwards',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: 0, transform: 'translateY(-50px)' },
          '100%': { opacity: 1, transform: 'translateY(0)' },
        },
        fadeOut: {
          '0%': { opacity: 1, transform: 'translateY(0)' },
          '100%': { opacity: 0, transform: 'translateY(50px)' },
        },
      },
    },
  },
  plugins: [],
};
