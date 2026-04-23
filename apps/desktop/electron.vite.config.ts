import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

export default defineConfig({
  main: {
    plugins: [
      externalizeDepsPlugin({
        exclude: ['@nano-harness/core', '@nano-harness/infra', '@nano-harness/shared']
      })
    ],
    build: {
      rollupOptions: {
        external: ['@libsql/client', '@libsql/client/node', 'drizzle-orm', 'drizzle-orm/libsql']
      }
    },
    resolve: {
      alias: {
        '@shared': resolve(__dirname, '../../packages/shared/src'),
        '@core': resolve(__dirname, '../../packages/core/src'),
        '@infra': resolve(__dirname, '../../packages/infra/src')
      }
    }
  },
  preload: {
    plugins: [
      externalizeDepsPlugin({
        exclude: ['@nano-harness/core', '@nano-harness/infra', '@nano-harness/shared']
      })
    ],
    resolve: {
      alias: {
        '@shared': resolve(__dirname, '../../packages/shared/src')
      }
    }
  },
  renderer: {
    plugins: [react()],
    resolve: {
      alias: {
        '@shared': resolve(__dirname, '../../packages/shared/src'),
        '@core': resolve(__dirname, '../../packages/core/src'),
        '@infra': resolve(__dirname, '../../packages/infra/src')
      }
    }
  }
})
