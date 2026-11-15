import { defineConfig } from 'vite';
import { crx } from '@crxjs/vite-plugin';
import preact from '@preact/preset-vite';
import { fileURLToPath } from 'node:url';
import manifest from './manifest.config.ts';

export default defineConfig({
  plugins: [preact(), crx({ manifest })],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: {
      input: {
        popup: 'src/popup/index.html',
        options: 'src/options/index.html',
        sidepanel: 'src/sidepanel/index.html',
      },
    },
  },
  server: { port: 5173, strictPort: true, hmr: { port: 5173 } },
});
