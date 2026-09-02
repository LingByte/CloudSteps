/// <reference types="vitest/config" />
import path from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import { playwright } from '@vitest/browser-playwright'

// https://vite.dev/config/
export default defineConfig({
  // GitHub Pages 部署时通过 VITE_BASE_PATH 注入子路径（如 /CloudSteps/），
  // 本地 dev 不设置则默认相对路径 './'，不影响开发。
  base: process.env.VITE_BASE_PATH || './',
  plugins: [
    tanstackRouter({
      target: 'react',
      autoCodeSplitting: false,
    }),
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  optimizeDeps: {
    include: [
      '@tanstack/react-table',
      '@tanstack/react-router',
      '@tanstack/react-query',
      '@tanstack/react-query-devtools',
      '@tanstack/react-router-devtools',
    ],
  },
  server: {
    port: 5175,
    strictPort: true,
    host: '127.0.0.1',
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:7080',
        changeOrigin: true,
        ws: true,
        timeout: 300_000,
        proxyTimeout: 300_000,
      },
      '/uploads': {
        target: 'http://127.0.0.1:7080',
        changeOrigin: true,
      },
    },
  },
  test: {
    silent: 'passed-only',
    unstubEnvs: true,
    browser: {
      enabled: true,
      provider: playwright(),
      instances: [{ browser: 'chromium' }],
    },
    coverage: {
      // include: ['src/**/*.{js,jsx,ts,tsx}'], // Uncomment to expand the report to all src/**/* so untested modules appear as 0% coverage.
      exclude: [
        'src/components/ui/**',
        'src/assets/**',
        'src/tanstack-table.d.ts',
        'src/routeTree.gen.ts',
        'src/test-utils/**',
        'src/routes/**',
      ],
    },
  },
})
