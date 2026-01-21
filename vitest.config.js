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
    environment: 'node', // Use Node environment for all tests
    pool: 'forks', // Use forks pool for better isolation
    fileParallelism: false, // Run tests sequentially to avoid conflicts
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
})

