import js from '@eslint/js'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/out/**', '**/node_modules/**', '**/*.d.ts']
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx,mts,cts}'],
    rules: {
      'no-undef': 'off'
    }
  },
  {
    files: ['packages/*/test/**/*.ts', 'apps/desktop/test/**/*.ts', 'apps/desktop/e2e/**/*.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "TSAsExpression > TSNeverKeyword",
          message: 'Do not use `as never` in tests. Narrow the type or introduce a smaller interface instead.',
        },
        {
          selector: "TSAsExpression > TSAnyKeyword",
          message: 'Do not use `as any` in tests. Prefer precise helper types.',
        },
      ],
    },
  }
)
