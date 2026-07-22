import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['src/core/__tests__/setup.ts'],
    exclude: ['node_modules/**', 'dist/**', 'dist-packages/**'],
  },
  resolve: {
    alias: {
      '@core': path.resolve(__dirname, 'src/core'),
      '@shared': path.resolve(__dirname, 'src/shared'),
    },
  },
});
