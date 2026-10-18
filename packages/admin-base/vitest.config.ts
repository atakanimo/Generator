import { defineConfig } from 'vitest/config';

// Kendi config'i olmazsa vitest üst dizindeki Generator `vite.config.ts`'ini (root: src/renderer) bulur.
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node'
  }
});
