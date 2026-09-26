import { defineConfig } from 'vite';

// GitHub Pages serves the built app as a project site at /wiraqocha/, so its asset URLs need
// that prefix — without it, index.html would reference /assets/... instead of
// /wiraqocha/assets/... and 404 on Pages. Only applied to the production build (not `serve`,
// i.e. `npm run dev`), so the dev server keeps running at the plain http://localhost:5173/.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/wiraqocha/' : '/',
  server: { port: 5173 }
}));
