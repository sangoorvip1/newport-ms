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
    /**
     * Vite يرفض المضيفين الخارجيين في التطوير (حماية من DNS rebinding) فيمنع الدخول من جهاز آخر
     * أو من نفق/معاينة. الافتراضي يبقى الرفض؛ للمراجعة من جهاز آخر اضبط:
     *   NEWPORT_DEV_ALLOW_ANY_HOST=1 npm run dev   (وضع تطوير فقط — لا مساس بـvite build)
     */
    allowedHosts: process.env.NEWPORT_DEV_ALLOW_ANY_HOST === '1' ? true : undefined,
  },
  build: { outDir: 'dist', emptyOutDir: true, sourcemap: true, target: 'chrome140' },
});
