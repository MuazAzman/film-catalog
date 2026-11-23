/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{vue,js}'],
  theme: {
    extend: {
      colors: {
        brand: {
          950: '#090d16',
          900: '#0f172a',
          800: '#1e293b',
          accent: '#f59e0b',
        },
      },
    },
  },
  plugins: [],
}
