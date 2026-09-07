import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/** alias لـ expo-sqlite لأن الجسر الأصلي لا يتوفر في CI — بقية الكود (الاستعلامات والمنطق) حقيقي */
export default defineConfig({
  resolve: {
    alias: {
      'expo-sqlite': fileURLToPath(new URL('./tests/stubs/expo-sqlite.ts', import.meta.url)),
    },
  },
  test: { environment: 'node', include: ['tests/**/*.spec.ts'], testTimeout: 20_000 },
});
