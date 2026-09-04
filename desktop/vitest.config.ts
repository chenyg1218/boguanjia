import path from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.join(__dirname, 'src'),
      shared: path.join(__dirname, 'shared'),
      '#': path.join(__dirname, 'electron/main'),
    },
  },
  test: {
    environment: 'happy-dom',
    include: [
      'src/**/*.{test,spec}.{ts,tsx}',
      'electron/**/*.{test,spec}.{ts,tsx}',
      'shared/**/*.{test,spec}.{ts,tsx}',
    ],
    // 黑盒单测不需要完整 vite electron 构建
    passWithNoTests: false,
  },
})
