import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'

export default defineConfig({
  base: '/', // se hospedar em subpasta, ajuste ex.: '/app/'
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'), // ✅ habilita "@/..."
    },
  },
  server: {
    port: 3000,
    open: true,

    // ✅ COOP/COEP para habilitar SharedArrayBuffer no DEV
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },

    proxy: {
      // Opcional: facilita chamadas ao backend sem CORS
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        // reescreve /api/xxxxx -> /xxxxx
        rewrite: (p) => p.replace(/^\/api/, ''),
      }
    }
  },

  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      devOptions: { enabled: false }, // SW desligado no dev
      includeAssets: ['favicon.ico', 'logo192.png', 'logo512.png'],
      manifest: {
        name: 'Sistema Academia SA',
        short_name: 'AcademiaSA',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#6C4FFF',
        icons: [
          { src: 'logo192.png', sizes: '192x192', type: 'image/png' },
          { src: 'logo512.png', sizes: '512x512', type: 'image/png' }
        ]
      },
      workbox: {
        // Não cachear chamadas ao backend
        navigateFallbackDenylist: [/^\/api\//, /^http/],
      },
    })
  ]
})
