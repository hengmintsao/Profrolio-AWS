import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import process from 'node:process';
const cmsPort = Number(process.env.PORTFOLIO_CMS_PORT || 8787);
if (!Number.isInteger(cmsPort) || cmsPort < 1024 || cmsPort > 65535)
  throw Error('Invalid local CMS port.');
export default defineConfig(({ command }) => ({
  plugins: [
    react(),
    ...(command === 'serve'
      ? [
          {
            name: 'local-preview-config',
            transformIndexHtml(html: string) {
              return html.replace(
                '<script src="/config.js"></script>',
                '<script>window.PORTFOLIO_CONFIG={apiBase:"/api",localDevelopment:true};</script>',
              );
            },
          },
        ]
      : []),
  ],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': { target: `http://127.0.0.1:${cmsPort}`, changeOrigin: true },
    },
  },
  test: { environment: 'jsdom', globals: true },
}));
