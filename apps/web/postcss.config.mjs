// Tailwind v4 is CSS-first: the theme lives in app/globals.css under @theme inline,
// which is why components.json has an empty tailwind.config (ADR 0016).
export default {
  plugins: ['@tailwindcss/postcss'],
};
