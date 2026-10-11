import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist/site',
    rollupOptions: {
      input: {
        index: resolve('index.html'),
        research: resolve('research.html'),
        options: resolve('options.html'),
        panel: resolve('panel.html'),
        popup: resolve('popup.html'),
      },
    },
  },
  server: {
    host: '0.0.0.0',
    allowedHosts: ['.e2b.app', 'localhost'],
  },
});
