import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

// https://vitejs.dev/config/
export default defineConfig({
  base: './',
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('/src/core/director/')) return 'director-engine';
          if (id.includes('/src/core/editing/')) return 'editing-engine';
          if (id.includes('/src/core/audio-production/')) return 'audio-production-engine';
          return undefined;
        },
      },
    },
  },
  test: {
    environment: 'node',
    environmentMatchGlobs: [['tests/recovery/**', 'jsdom'], ['tests/views/**', 'jsdom']],
    include: ['tests/**/*.test.{ts,tsx}'],
    clearMocks: true,
    restoreMocks: true,
  },
});
