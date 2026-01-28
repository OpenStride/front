import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import path from 'path'

export default defineConfig({
  plugins: [vue()],
  test: {
    environment: 'happy-dom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/unit/**/*.{spec,test}.ts'],
    css: {
      modules: {
        classNameStrategy: 'non-scoped'
      }
    },
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@plugins': path.resolve(__dirname, './plugins')
    },
    coverage: {
      reporter: ['text', 'lcov'],
      include: ['src/services/**/*.ts', 'src/composables/**/*.ts'],
      lines: 0.6,
      statements: 0.6,
      functions: 0.6,
      branches: 0.5
    }
  }
})
