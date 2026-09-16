import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Local dev talks straight to the API Gateway on :8080 (proxied here so the
// browser only ever sees one origin, same as it will in production once
// this is served behind a real domain + gateway).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: process.env.VITE_API_PROXY_TARGET || 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
});
