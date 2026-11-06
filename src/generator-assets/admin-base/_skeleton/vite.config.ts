import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import pkg from './package.json';

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  // Geliştirmede `VITE_API_BASE_URL` boşsa istekler aynı origin'den gider, `/api` backend'e yönlenir (CORS gerekmez).
  const proxyTarget = env.VITE_API_PROXY;

  return {
    plugins: [react()],
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version)
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src')
      },
      // @atakanimo/ata-admin-base peer'ları host'unkiyle tek kopya olsun.
      dedupe: ['react', 'react-dom', 'react-router-dom', '@mui/material', '@emotion/react', '@emotion/styled', '@tanstack/react-query', 'axios', 'chart.js', 'react-chartjs-2']
    },
    server: proxyTarget ? { proxy: { '/api': { target: proxyTarget, changeOrigin: true } } } : undefined
  };
});
