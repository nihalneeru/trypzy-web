import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    setupFiles: ['./tests/setup.js'],
    include: ['tests/**/*.test.js'],
    exclude: ['e2e/**', 'node_modules/**'],
    environmentMatchGlobs: [
      ['tests/api/**', 'node'], // API tests use Node environment
      ['**', 'jsdom'] // Other tests use jsdom
    ]
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
})

