import { describe, expect, it } from 'vitest'

import { appSettingsSchema, getProviderDefinition } from '../src'

describe('shared test foundation', () => {
  it('parses the default provider settings shape', () => {
    expect(
      appSettingsSchema.parse({
        provider: {
          provider: 'openrouter',
          model: getProviderDefinition('openrouter').defaultModel,
        },
        workspace: {
          rootPath: '/tmp/nano-harness',
          approvalPolicy: 'on-request',
        },
      }),
    ).toMatchObject({
      provider: {
        provider: 'openrouter',
      },
      workspace: {
        approvalPolicy: 'on-request',
      },
    })
  })
})
