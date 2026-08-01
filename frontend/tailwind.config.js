/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        cc: {
          bg:         '#1a1a18',
          sidebar:    '#1f2118',
          card:       '#252520',
          inner:      '#2c2c26',
          border:     '#3a3a32',
          'border-lt':'#4a4a40',
          text:       '#e8e4d9',
          'text-sec': '#9a9689',
          'text-mut': '#6b6860',
          red:        '#c0392b',
          'red-bg':   '#3a1f1f',
          'red-dim':  '#8b2020',
          gold:       '#c4a035',
          'gold-bg':  '#3a3520',
          'gold-dim': '#8a7020',
          green:      '#27ae60',
          'green-bg': '#1f3a25',
          'green-dim':'#1a6b3a',
          olive:      '#5a6e3a',
          'olive-bg': '#2a3420',
          'olive-dim':'#3d4d28',
        },
      },
      fontFamily: {
        mono: ['ui-monospace', 'SFMono-Regular', 'SF Mono', 'Menlo', 'Consolas', 'monospace'],
      },
      keyframes: {
        'cc-flash': {
          '0%': { backgroundColor: '#3a3520' },
          '50%': { backgroundColor: '#4a4530' },
          '100%': { backgroundColor: '#3a3520' },
        },
        'cc-pulse': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.5' },
        },
      },
      animation: {
        'cc-flash': 'cc-flash 1.5s ease-in-out',
        'cc-pulse': 'cc-pulse 2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
