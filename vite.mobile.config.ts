import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

// Mobile build config for Capacitor.
// Outputs to dist/mobile — Capacitor's webDir points here.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  root: 'src/app',
  base: './',
  build: {
    outDir: '../../dist/mobile',
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      '@app': path.resolve(__dirname, 'src/app'),
      '@shared': path.resolve(__dirname, 'src/shared'),
    },
  },
  define: {
    // Ensure cloud mode — no Electron IPC available
    'import.meta.env.VITE_API_URL': JSON.stringify(
      process.env.VITE_API_URL || 'http://localhost:3001'
    ),
  },
  server: {
    port: 5174,
  },
});
