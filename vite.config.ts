import { defineConfig } from 'vite';

// GitHub Pages serves this as a project site at /wiraqocha/, so built asset URLs need that
// prefix — without it, index.html would reference /assets/... instead of /wiraqocha/assets/...
// and 404 on Pages while still working fine locally (base only affects the production build).
export default defineConfig({
  base: '/wiraqocha/',
  server: { port: 5173 }
});
