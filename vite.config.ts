/// <reference types="vitest" />
// vite.config.ts
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import pkg from './package.json'

export default defineConfig({
  plugins: [
    vue(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      manifest: {
        id: '/',
        name: 'OpenStride',
        short_name: 'OpenStride',
        description: 'Your activity companion that respects your privacy',
        // theme_color : barre de statut de la PWA installée. Même valeur que le
        // <meta name="theme-color"> de index.html — les deux divergeaient, et
        // seul le manifeste portait encore un vert (#88aa00) hors palette.
        theme_color: '#1e1e2e',
        // background_color : c'est LE fond du splash screen au lancement.
        // Doit rester égal à --surface-app (variables.css), qui est le fond du
        // <body> : toute autre valeur provoque un flash à la première frame.
        background_color: '#ececea',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: '/icon-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: '/icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any'
          }
        ],
        screenshots: [
          {
            src: '/screenshot-desktop.png',
            sizes: '1280x720',
            type: 'image/png',
            form_factor: 'wide',
            label: 'OpenStride Dashboard'
          },
          {
            src: '/screenshot-mobile.png',
            sizes: '750x1334',
            type: 'image/png',
            form_factor: 'narrow',
            label: 'OpenStride Mobile View'
          }
        ]
      },
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}']
      },
      devOptions: {
        enabled: true,
        type: 'module'
      }
    })
  ],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString())
  },
  resolve: {
    alias: {
      '@plugins': path.resolve(__dirname, './plugins'),
      '@': path.resolve(__dirname, './src')
    }
  },
  build: {
    target: 'esnext', // Support Top-level await
    minify: 'esbuild'
  },
  server: {
    port: 3000
  },
  optimizeDeps: {
    // Ces dépendances ne sont importées que par le service worker (src/sw.ts),
    // que Vite ne parcourt pas au démarrage : il ne les découvre qu'au moment
    // où le navigateur enregistre le SW, puis force un rechargement complet
    // de la page (« optimized dependencies changed. reloading »). En CI le
    // cache de l'optimiseur est toujours froid, donc ce rechargement tombe au
    // milieu du test E2E et annule sa navigation. Les déclarer ici les
    // pré-bundle au démarrage du serveur. Sans effet sur le build de prod.
    include: [
      'workbox-precaching',
      'workbox-routing',
      'workbox-strategies',
      'workbox-expiration',
      'firebase/messaging/sw'
    ]
  },
  test: {
    globals: true,
    environment: 'happy-dom'
    // Ensure aliases are available to Vitest if needed
    // setupFiles: './tests/setup.ts', // Optional: if you need a setup file
  }
})
