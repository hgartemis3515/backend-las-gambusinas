/** Tailwind compilado solo para inventario.html y los componentes que inyecta. */
module.exports = {
  darkMode: 'class',
  content: [
    './public/inventario.html',
    './public/assets/components/**/*.html',
    './public/assets/js/shared.js',
    './public/assets/js/cosmos-search.js',
    './public/assets/js/page-transitions.js',
    './public/assets/js/notificaciones-dashboard.js',
  ],
  theme: {
    extend: {
      colors: {
        bg: { primary: '#0a0a0f', card: '#1a1a28', sidebar: '#12121a' },
        bgMain: '#0a0a0f',
        bgCard: '#14141f',
        bgCardAlt: '#1a1a28',
        bgElevated: '#1c1c2b',
        gold: { DEFAULT: '#d4af37', 20: 'rgba(212,175,55,0.125)', 40: 'rgba(212,175,55,0.25)' },
        goldDarkText: '#1a1200',
        txt: { primary: '#ffffff', secondary: '#a0a0b8', muted: '#5a5a7a' },
        textSecondary: '#a0a0b8',
        textMuted: '#5a5a7a',
        borderSubtle: '#26263a',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
    },
  },
  plugins: [],
};
