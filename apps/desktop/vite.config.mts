import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * سطح المكتب: Vite يبني الواجهة (React) داخل dist/، ثم يغلّفها Electron من dist-electron/main.js.
 * في التطوير (vite dev) نتصل بخادم API عبر proxy حتى لا نضبط CORS على عنوان غريب.
 */
const API_TARGET = process.env.NEWPORT_API_URL ?? 'http://127.0.0.1:3000';
export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    port: Number(process.env.NEWPORT_DESKTOP_PORT ?? 5173),
    strictPort: false,
    proxy: { '/api': { target: API_TARGET, changeOrigin: true } },
  },
  build: { outDir: 'dist', emptyOutDir: true, sourcemap: true, target: 'chrome140' },
});
