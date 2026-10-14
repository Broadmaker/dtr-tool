import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'DTR Tool — Privacy-First CSC DTR Generator',
        short_name: 'DTR Tool',
        description: 'Turn biometric exports into CSC-ready DTRs. 100% in-browser — no upload, no database.',
        theme_color: '#1748b5',
        background_color: '#f1f5f9',
        display: 'standalone',
        start_url: '.',
        icons: [
          { src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,jpg}'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
      },
    }),
  ],
  build: {
    target: 'es2022',
    cssMinify: 'lightningcss',
    reportCompressedSize: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('xlsx')) return 'xlsx'
            if (id.includes('jszip')) return 'jszip'
            if (id.includes('lucide-react')) return 'lucide'
            if (id.includes('react')) return 'vendor'
          }
        },
      },
    },
  },
  optimizeDeps: {
    // jszip stays lazy (dynamic import) but IS pre-bundled so dev serves it
    // with a proper `default` export. xlsx stays excluded (it works as-is).
    include: ['react', 'react-dom', 'lucide-react', 'jszip'],
    exclude: ['xlsx'],
  },
})
