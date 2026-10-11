import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [react()],
  base: './',
  publicDir: false,
  build: {
    outDir: 'dist/extension',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: resolve('popup.html'),
        panel: resolve('panel.html'),
        options: resolve('options.html'),
        background: resolve('src/extension/background.ts'),
      },
      output: {
        entryFileNames: (chunk) =>
          chunk.name === 'background' ? 'background.js' : 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
});
