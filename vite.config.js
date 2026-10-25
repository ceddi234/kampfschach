import { defineConfig } from 'vite';

// relative Pfade: läuft lokal und unter https://<user>.github.io/kampfschach/
export default defineConfig({
  base: './',
  build: { chunkSizeWarningLimit: 1200 },
});
