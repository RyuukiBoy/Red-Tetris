import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const serverPort = Number(env.PORT || 3001);
  const configuredHost = env.HOST || '0.0.0.0';
  const proxyHost = ['0.0.0.0', '::'].includes(configuredHost) ? '127.0.0.1' : configuredHost;
  const proxyTarget = env.SERVER_URL || `http://${proxyHost}:${serverPort}`;

  return {
    plugins: [react()],
    server: {
      host: env.VITE_HOST || '0.0.0.0',
      port: Number(env.VITE_PORT || 5173),
      proxy: {
        '/socket.io': { target: proxyTarget, ws: true },
        '/api': { target: proxyTarget },
      },
    },
    build: { rollupOptions: { output: { entryFileNames: 'bundle.js', chunkFileNames: 'assets/[name].js', assetFileNames: 'assets/[name][extname]' } } },
    test: { environment: 'jsdom', coverage: { provider: 'v8', include: ['client/src/game/logic.js', 'server/src/classes/*.js'], thresholds: { statements: 80, functions: 80, lines: 80, branches: 65 } } },
  };
});
