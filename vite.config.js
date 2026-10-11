import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({ plugins: [react(), VitePWA({
  registerType: 'prompt',
  injectRegister: false,
  manifest: {
    id: '/', name: 'AgentTrust', short_name: 'AgentTrust',
    description: 'Discover property agents across Kenya',
    start_url: '/', scope: '/', display: 'standalone',
    theme_color: '#087f8c', background_color: '#f6f7f8', lang: 'en-KE',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
    ]
  },
  workbox: {
    globPatterns: ['**/*.{js,css,png,html,woff2}'],
    globIgnores: ['index.html'],
    navigateFallback: null,
    cleanupOutdatedCaches: true,
    runtimeCaching: [
      { urlPattern: ({ url }) => url.pathname.startsWith('/api/'), handler: 'NetworkOnly' },
      { urlPattern: ({ request }) => request.mode === 'navigate', handler: 'NetworkOnly',
        options: { precacheFallback: { fallbackURL: '/offline.html' } } }
    ]
  }
})] });
