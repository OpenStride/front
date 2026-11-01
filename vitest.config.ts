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
      // Under `thresholds`, in percent. Written as `lines: 0.6` at the top
      // level, Vitest never read them, and the CI step that was meant to check
      // them only printed the numbers.
      thresholds: {
        lines: 60,
        statements: 60,
        functions: 60,
        branches: 50
      }
    }
  }
})
