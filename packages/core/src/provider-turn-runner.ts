import type { AppSettings, Message, ProviderReasoningDelta, Run } from '@nano-harness/shared'
import { getProviderDefinition } from '@nano-harness/shared'

import type { ActionExecutor } from './actions'
import type { Provider, ProviderCredentialResolver, ProviderGenerateResult, SkillResolver } from './provider'
import { filterActionsForRole } from './role-actions'
import type { Store } from './store'

export type ProviderTurnResult = {
  providerResult: ProviderGenerateResult
  streamedMessage: string
}

export interface ProviderTurnRunnerDependencies {
  store: Store
  provider: Provider
  providerCredentialResolver: ProviderCredentialResolver
  skillResolver: SkillResolver
  actionExecutor: ActionExecutor
  onDelta: (input: { run: Run; delta: string }) => Promise<void>
  onReasoningDelta: (input: { run: Run; delta: ProviderReasoningDelta }) => Promise<void>
}

export class ProviderTurnRunner {
  constructor(private readonly dependencies: ProviderTurnRunnerDependencies) {}

  async run(input: {
    run: Run
    messages: Message[]
    settings: AppSettings
    signal: AbortSignal
  }): Promise<ProviderTurnResult> {
    let streamedMessage = ''
    const actions = filterActionsForRole(await this.dependencies.actionExecutor.listDefinitions(), input.run.role)
    const skills = await this.dependencies.skillResolver.resolveForRun({
      settings: input.settings,
      run: input.run,
      messages: input.messages,
    })
    const memory = await this.dependencies.store.recallMemory({
      query: input.messages.map((message) => message.content).join('\n'),
      settings: input.settings,
    })
    const providerDefinition = getProviderDefinition(input.settings.provider.provider)
    const providerAuth = await this.dependencies.providerCredentialResolver.getProviderAuth({
      provider: input.settings.provider.provider,
    })

    if (providerDefinition.requiresApiKey && providerAuth.authMethod !== 'api-key') {
      throw new Error(`Missing API key for ${providerDefinition.label}`)
    }

    const providerResult = await this.dependencies.provider.generate({
      run: input.run,
      messages: input.messages,
      actions,
      settings: input.settings,
      providerAuth,
      skills,
      memory,
      signal: input.signal,
      onDelta: async (delta) => {
        streamedMessage += delta
        await this.dependencies.onDelta({ run: input.run, delta })
      },
      onReasoningDelta: async (delta) => {
        await this.dependencies.onReasoningDelta({ run: input.run, delta })
      },
    })

    return { providerResult, streamedMessage }
  }
}
