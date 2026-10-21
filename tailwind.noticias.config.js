/** Tailwind compilado solo para noticias.html y los componentes que inyecta. */
module.exports = {
  content: [
    './public/noticias.html',
    './public/assets/components/**/*.html',
    './public/assets/js/shared.js',
    './public/assets/js/cosmos-search.js',
    './public/assets/js/blendy-wrapper.js',
  ],
  theme: {
    extend: {
      colors: {
        bg: { primary: '#0a0a0f', card: '#1a1a28', sidebar: '#12121a' },
        gold: { DEFAULT: '#d4af37', 20: 'rgba(212,175,55,0.125)', 40: 'rgba(212,175,55,0.25)' },
        txt: { primary: '#ffffff', secondary: '#a0a0b8', muted: '#5a5a7a' },
      },
      fontFamily: { sans: ['Inter', 'system-ui', 'sans-serif'] },
    },
  },
  plugins: [],
};
