import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const lanDev = mode === 'lan'

  return {
    plugins: [
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.svg', 'pwa-192.png', 'pwa-512.png'],
        // Keep SW off in dev so localhost does not keep serving stale bundles after code changes.
        // Use `vite preview` after a build to test PWA install / offline.
        devOptions: {
          enabled: false,
        },
        manifest: {
          name: 'LearnTogether',
          short_name: 'LearnTogether',
          description: 'Learn together — attendance, members, and sessions.',
          theme_color: '#1f6feb',
          background_color: '#ffffff',
          display: 'standalone',
          orientation: 'portrait',
          start_url: '/',
          scope: '/',
          icons: [
            {
              src: '/pwa-192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/favicon.svg',
              sizes: '64x64',
              type: 'image/svg+xml',
              purpose: 'any',
            },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
          skipWaiting: true,
          clientsClaim: true,
        },
      }),
    ],
    server: {
      host: lanDev ? true : undefined,
      allowedHosts: ['nut-friday-modeling-fair.trycloudflare.com'],
      proxy: {
        '/api': {
          target: 'http://localhost:8000',
          changeOrigin: true,
          ws: true,
        },
      },
    },
  }
})
