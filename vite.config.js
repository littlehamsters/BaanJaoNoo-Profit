import { defineConfig } from 'vite';

const PORT = 8091;

export default defineConfig({
  root: '.',
  // Local dev serves at root ('/'). GitHub Pages serves this repo under
  // /BaanJaoNoo-Profit/ — the Pages workflow sets DEPLOY_BASE for that build
  // only, so local dev stays at '/'.
  base: process.env.DEPLOY_BASE || '/',
  server: {
    port: PORT,
    strictPort: true, // fail instead of picking a new port if 8091 is taken
    open: true,
  },
  preview: {
    port: PORT,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
