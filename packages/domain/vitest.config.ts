import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.spec.ts', 'tests/**/*.spec.ts'],
    coverage: { reporter: ['text'], include: ['src/**/*.ts'], exclude: ['src/**/*.spec.ts'] },
  },
});
