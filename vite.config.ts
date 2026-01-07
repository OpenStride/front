/// <reference types="vitest" />
// vite.config.ts
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
    plugins: [vue(), tailwindcss(), VitePWA({
        registerType: 'autoUpdate',   // SW updates itself silently
        workbox: {
            cleanupOutdatedCaches: true // remove caches with obsolete keys
        }
    })],
    resolve: {
        alias: {
            '@plugins': path.resolve(__dirname, './plugins'),
            '@': path.resolve(__dirname, './src'),
        }
    },
    build: {
        target: 'esnext', // Support Top-level await
        minify: 'esbuild',
    },
    server: {
        port: 3000
    },
    test: {
        globals: true,
        environment: 'happy-dom',
        // Ensure aliases are available to Vitest if needed
        // setupFiles: './tests/setup.ts', // Optional: if you need a setup file
    },
})
