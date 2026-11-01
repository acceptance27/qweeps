import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {defineConfig, type Plugin} from 'vite';

const studioDir = fileURLToPath(new URL('.', import.meta.url));
const repoRoot = path.resolve(studioDir, '..');
const localHyperframes = path.resolve(studioDir, 'node_modules/@hyperframes/core/dist/adapters/gsap.js');
const rootHyperframes = path.resolve(repoRoot, 'node_modules/@hyperframes/core/dist/adapters/gsap.js');

function ensurePythonBackend(): void {
  const socket = net.createConnection({host: '127.0.0.1', port: 4174});
  socket.on('connect', () => {
    socket.destroy();
  });
  socket.on('error', () => {
    socket.destroy();
    const child = spawn('python3', ['-m', 'assistant.visual.server', '--port', '4174', '--studio-dir', studioDir], {
      cwd: repoRoot,
      env: {
        ...process.env,
        PYTHONPATH: path.resolve(repoRoot, 'src'),
      },
      stdio: 'ignore',
      detached: true,
    });
    child.unref();
  });
}

function qweepsBackendPlugin(): Plugin {
  return {
    name: 'qweeps-python-backend',
    configureServer() {
      ensurePythonBackend();
    },
    configurePreviewServer() {
      ensurePythonBackend();
    },
  };
}

const loopbackProxy = {
  target: 'http://127.0.0.1:4174',
  changeOrigin: true,
  configure: (proxy: any) => {
    proxy.on('proxyReq', (proxyReq: any) => {
      proxyReq.setHeader('Host', '127.0.0.1:4174');
      proxyReq.removeHeader('Origin');
      proxyReq.removeHeader('origin');
    });
  },
};

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss(), qweepsBackendPlugin()],
    resolve: {
      alias: {
        // Core's root also exports Node-only compilation/parsing tools. Load the
        // pinned package's browser-safe adapter directly without bundling those.
        '@qweeps/hyperframes-adapter': fs.existsSync(localHyperframes) ? localHyperframes : rootHyperframes,
        '@': studioDir,
      },
    },
    preview: {
      allowedHosts: true as const,
      proxy: {'/api': loopbackProxy, '/renders': loopbackProxy, '/narration': loopbackProxy},
    },
    server: {
      host: '0.0.0.0',
      port: 3000,
      allowedHosts: true as const,
      proxy: {'/api': loopbackProxy, '/renders': loopbackProxy, '/narration': loopbackProxy},
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
