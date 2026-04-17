import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import basicSsl from '@vitejs/plugin-basic-ssl'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/** Optional: put mkcert (or openssl) key.pem + cert.pem here so the cert matches your LAN IP. */
function readOptionalLanTls():
  | undefined
  | {
      key: Buffer
      cert: Buffer
    } {
  const dir = path.join(__dirname, 'certs')
  const keyFile = path.join(dir, 'key.pem')
  const certFile = path.join(dir, 'cert.pem')
  if (fs.existsSync(keyFile) && fs.existsSync(certFile)) {
    return {
      key: fs.readFileSync(keyFile),
      cert: fs.readFileSync(certFile),
    }
  }
  return undefined
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const lanDev = mode === 'lan'
  const customTls = lanDev ? readOptionalLanTls() : undefined
  const useBasicSsl = lanDev && !customTls

  return {
    plugins: [
      react(),
      ...(useBasicSsl ? [basicSsl()] : []),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.svg', 'pwa-192.png', 'pwa-512.png'],
        // Service worker + manifest in dev (localhost); required to test install in Chrome.
        devOptions: {
          enabled: true,
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
        },
      }),
    ],
    server: {
      // LAN / phone: service workers need HTTPS (or localhost). Plain http://<LAN-IP> is not a secure context.
      host: lanDev ? true : undefined,
      // basicSsl plugin sets server.https when custom TLS is not provided.
      ...(customTls ? { https: customTls } : {}),
      proxy: {
        '/api': {
          target: 'http://localhost:8000',
          changeOrigin: true,
        },
      },
    },
  }
})
