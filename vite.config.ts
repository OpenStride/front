/// <reference types="vitest" />
// vite.config.ts
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
    plugins: [vue(), tailwindcss(), VitePWA({
        registerType: 'autoUpdate',
        strategies: 'injectManifest',
        srcDir: 'src',
        filename: 'sw.ts',
        injectManifest: {
            globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}']
        },
        devOptions: {
            enabled: true,
            type: 'module'
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
