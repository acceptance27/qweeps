import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import {fileURLToPath} from 'node:url';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        // Core's root also exports Node-only compilation/parsing tools. Load the
        // pinned package's browser-safe adapter directly without bundling those.
        '@qweeps/hyperframes-adapter': fileURLToPath(new URL('./node_modules/@hyperframes/core/dist/adapters/gsap.js', import.meta.url)),
        '@': fileURLToPath(new URL('.', import.meta.url)),
      },
    },
    preview: { proxy: { '/api': 'http://127.0.0.1:4174', '/renders': 'http://127.0.0.1:4174', '/narration': 'http://127.0.0.1:4174' } },
    server: {
      proxy: { '/api': 'http://127.0.0.1:4174', '/renders': 'http://127.0.0.1:4174', '/narration': 'http://127.0.0.1:4174' },
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
