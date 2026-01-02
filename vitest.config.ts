import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    exclude: ['**/node_modules/**', '**/e2e/**', '**/.next/**', '**/dist/**'],
    watch: false, // Set to true for watch mode, but we'll use --watch flag
    setupFiles: ['./vitest.setup.ts'],
    testTimeout: 10000,
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './'),
    },
  },
})

