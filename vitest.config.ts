import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: [
      'packages/shared/test/**/*.test.ts',
      'packages/core/test/**/*.test.ts',
      'packages/infra/test/**/*.test.ts',
      'apps/desktop/test/main/**/*.test.ts',
      'apps/desktop/test/preload/**/*.test.ts',
      'apps/desktop/test/renderer/**/*.test.ts',
    ],
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: [
        'packages/shared/src/**/*.ts',
        'packages/core/src/**/*.ts',
        'packages/infra/src/**/*.ts',
        'apps/desktop/src/main/**/*.ts',
        'apps/desktop/src/preload/**/*.ts',
        'apps/desktop/src/renderer/**/*.ts',
        'apps/desktop/src/renderer/**/*.tsx',
      ],
    },
  },
})
