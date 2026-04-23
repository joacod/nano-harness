import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

const bundledWorkspacePackages = ['@nano-harness/core', '@nano-harness/infra', '@nano-harness/shared']

export default defineConfig({
  main: {
    build: {
      externalizeDeps: {
        exclude: bundledWorkspacePackages
      },
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
    build: {
      externalizeDeps: {
        exclude: bundledWorkspacePackages
      }
    },
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
