import { describe, expect, it } from 'vitest'

import {
  appSettingsSchema,
  benchmarkRunArtifactSchema,
  clearProviderAuthInputSchema,
  getProviderDefinition,
  harnessChangeManifestSchema,
  harnessComponentRegistrySchema,
  harnessPatchPreviewArtifactSchema,
  harnessPromotionArtifactSchema,
  implementationSpecSchema,
  createSpecWorkflowPrompt,
  messageSchema,
  mcpInventorySchema,
  mcpServerSettingsSchema,
  providerAdapterIdSchema,
  providerDefaultModels,
  openExternalUrlInputSchema,
  providerOptions,
  resolveApprovalInputSchema,
  saveProviderAuthInputSchema,
  startProviderOauthResultSchema,
  runEventSchema,
  exportRunEvidenceResultSchema,
  runCreateInputSchema,
  sessionCompactionResultSchema,
  skillImprovementArtifactSchema,
  startProviderOauthInputSchema,
} from '../src'

describe('shared contracts', () => {
  it('keeps the default provider definition stable', () => {
    expect(getProviderDefinition('openrouter')).toMatchObject({
      key: 'openrouter',
      label: 'OpenRouter',
      adapterId: 'openai-compatible',
      baseUrl: 'https://openrouter.ai/api/v1',
      defaultModel: providerDefaultModels.openrouter,
      requiresApiKey: true,
      authMethods: ['api-key'],
      defaultAuthMethod: 'api-key',
      authLabels: { 'api-key': 'API key' },
      apiKeyLabel: 'Stored securely on this device',
      endpoint: {
        editable: true,
        hint: 'OpenAI-compatible API root.',
      },
    })

    expect(getProviderDefinition('llama-cpp')).toMatchObject({
      key: 'llama-cpp',
      label: 'llama.cpp',
      adapterId: 'openai-compatible',
      baseUrl: 'http://127.0.0.1:8080/v1',
      defaultModel: providerDefaultModels['llama-cpp'],
      requiresApiKey: false,
      authMethods: ['none'],
      defaultAuthMethod: 'none',
      apiKeyLabel: 'Optional for this local provider',
      statusHints: ['Start llama-server before running a local model. The API endpoint should expose /v1/chat/completions.'],
      endpoint: {
        editable: true,
      },
    })

    expect(getProviderDefinition('openai')).toMatchObject({
      key: 'openai',
      label: 'OpenAI',
      adapterId: 'chatgpt-subscription',
      baseUrl: 'https://chatgpt.com/backend-api/codex',
      defaultModel: providerDefaultModels.openai,
      requiresApiKey: false,
      authMethods: ['oauth'],
      defaultAuthMethod: 'oauth',
      authLabels: { oauth: 'ChatGPT account' },
      apiKeyLabel: 'Not used for ChatGPT subscription auth',
      missingAuthIssue: 'Sign in with ChatGPT before starting an OpenAI run.',
      endpoint: {
        editable: false,
        hint: 'Managed by the ChatGPT subscription provider.',
      },
    })

    expect(getProviderDefinition('google')).toMatchObject({
      key: 'google',
      label: 'Google',
      adapterId: 'google-gemini',
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
      defaultModel: providerDefaultModels.google,
      requiresApiKey: true,
      authMethods: ['api-key'],
      defaultAuthMethod: 'api-key',
      authLabels: { 'api-key': 'Google AI Studio API key' },
      apiKeyLabel: 'Google AI Studio API key',
      apiKeyMissingIssue: 'Add your Google AI Studio API key before starting a Google run.',
      endpoint: {
        editable: true,
        hint: 'Gemini API root.',
      },
    })
  })

  it('includes hosted providers in provider options', () => {
    expect(providerOptions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'openai',
          label: 'OpenAI',
          defaultModel: providerDefaultModels.openai,
        }),
        expect.objectContaining({
          key: 'google',
          label: 'Google',
          defaultModel: providerDefaultModels.google,
        }),
      ]),
    )
  })

  it('keeps provider adapter ids explicit', () => {
    expect(providerAdapterIdSchema.options).toEqual(['openai-compatible', 'chatgpt-subscription', 'google-gemini'])
  })

  it('validates harness component registry and change manifests', () => {
    expect(harnessComponentRegistrySchema.parse({
      components: [{
        id: 'core.instructions',
        kind: 'prompt',
        title: 'Provider Instructions',
        version: '1.0.0',
        path: 'packages/core/src/instructions.ts',
        mutable: true,
      }],
    })).toMatchObject({ components: [{ id: 'core.instructions' }] })

    expect(harnessChangeManifestSchema.parse({
      id: 'change-1',
      title: 'Improve validation reminder',
      rootCause: 'Benchmark runs completed edits without validation.',
      proposedFix: 'Update build instructions to require targeted validation after edits.',
      predictedEffect: 'Higher benchmark validation pass rate.',
      affectedComponents: ['core.instructions'],
      evidence: ['run evidence export: validation missing'],
      benchmarkSuites: ['benchmarks/cases/local-edit.json'],
      tests: ['pnpm test'],
      rollbackPlan: 'Revert the instruction text change.',
      patchPreview: 'diff --git a/packages/core/src/instructions.ts b/packages/core/src/instructions.ts',
      createdAt: '2026-04-29T10:00:00.000Z',
    })).toMatchObject({ id: 'change-1' })
  })

  it('validates harness promotion artifacts as benchmark-gated and non-mutating', () => {
    expect(harnessPromotionArtifactSchema.parse({
      manifest: {
        id: 'change-1',
        title: 'Improve validation reminder',
        rootCause: 'Benchmark runs completed edits without validation.',
        proposedFix: 'Update build instructions to require targeted validation after edits.',
        predictedEffect: 'Higher benchmark validation pass rate.',
        affectedComponents: ['core.instructions'],
        evidence: ['run evidence export: validation missing'],
        benchmarkSuites: ['local'],
        tests: ['pnpm test'],
        rollbackPlan: 'Revert the instruction text change.',
        patchPreview: 'diff --git a/packages/core/src/instructions.ts b/packages/core/src/instructions.ts',
        createdAt: '2026-04-29T10:00:00.000Z',
      },
      benchmarkComparison: {
        before: { suite: 'local', passed: 2, failed: 1, score: 0.66 },
        after: { suite: 'local', passed: 3, failed: 0, score: 1 },
        passedDelta: 1,
        failedDelta: -1,
        scoreDelta: 0.34,
        improved: true,
      },
      promotionReady: true,
      blockers: [],
      approvalRequiredForPromotion: true,
      liveMutationApplied: false,
      createdAt: '2026-04-29T10:00:00.000Z',
    })).toMatchObject({ promotionReady: true, liveMutationApplied: false })
  })

  it('validates harness patch preview artifacts as non-mutating apply gates', () => {
    expect(harnessPatchPreviewArtifactSchema.parse({
      id: 'harness-patch-preview-change-1',
      manifest: {
        id: 'change-1',
        title: 'Improve validation reminder',
        rootCause: 'Benchmark runs completed edits without validation.',
        proposedFix: 'Update build instructions to require targeted validation after edits.',
        predictedEffect: 'Higher benchmark validation pass rate.',
        affectedComponents: ['core.instructions'],
        evidence: ['run evidence export: validation missing'],
        benchmarkSuites: ['local'],
        tests: ['pnpm test'],
        rollbackPlan: 'Revert the instruction text change.',
        patchPreview: 'diff --git a/packages/core/src/instructions.ts b/packages/core/src/instructions.ts',
        createdAt: '2026-04-29T10:00:00.000Z',
      },
      affectedFiles: [{ componentId: 'core.instructions', path: 'packages/core/src/instructions.ts', mutable: true }],
      patchPaths: ['packages/core/src/instructions.ts'],
      unknownPatchPaths: [],
      applyReady: true,
      blockers: [],
      approvalRequiredForApply: true,
      liveMutationApplied: false,
      createdAt: '2026-04-29T10:00:00.000Z',
    })).toMatchObject({ applyReady: true, liveMutationApplied: false })
  })

  it('validates benchmark run artifacts as draft-only results', () => {
    expect(benchmarkRunArtifactSchema.parse({
      id: 'benchmark-local-1',
      suite: 'local',
      cases: [{ id: 'edit-and-test', title: 'Edit And Test', path: 'benchmarks/cases/edit-and-test.md' }],
      results: [{ caseId: 'edit-and-test', status: 'passed', evidence: ['run:run-1'] }],
      summary: { suite: 'local', passed: 1, failed: 0, score: 1 },
      unknownCaseIds: [],
      missingCaseIds: [],
      evidence: ['export:run-1'],
      outputPath: 'benchmarks/results/local.json',
      approvalRequiredForWrite: true,
      liveMutationApplied: false,
      createdAt: '2026-04-29T10:00:00.000Z',
    })).toMatchObject({ summary: { score: 1 }, liveMutationApplied: false })
  })

  it('validates spec artifacts and creates spec workflow prompts', () => {
    expect(createSpecWorkflowPrompt('fix the settings crash')).toContain('fix the settings crash')
    expect(createSpecWorkflowPrompt('fix the settings crash')).toContain('Create a durable Spec Workbench change')
    expect(createSpecWorkflowPrompt('fix the settings crash')).toContain('.nano/specs/changes/<changeId>/')
    expect(createSpecWorkflowPrompt('fix the settings crash')).toContain('create_spec_artifact')
    expect(createSpecWorkflowPrompt('fix the settings crash')).toContain('non-mutating and not durable')
    expect(createSpecWorkflowPrompt('fix the settings crash')).toContain('write_spec_artifact')
    expect(implementationSpecSchema.parse({
      id: 'spec-1',
      source: { type: 'local_text', value: 'fix bug' },
      problem: 'fix bug',
      constraints: ['Keep scope bounded.'],
      implementationPlan: ['Plan', 'Build', 'Review'],
      validationPlan: ['pnpm test'],
      risks: ['Missing coverage.'],
      acceptanceCriteria: ['Bug is fixed.'],
      requiredRoles: ['plan', 'build', 'review'],
      branchName: 'spec/fix-bug',
      createdAt: '2026-04-29T10:00:00.000Z',
    })).toMatchObject({ id: 'spec-1' })
  })

  it('validates skill improvement artifacts as draft-only proposals', () => {
    expect(skillImprovementArtifactSchema.parse({
      id: 'skill-improvement-1',
      mode: 'create',
      title: 'Add Release Notes skill',
      rationale: 'Repeated release note requests need a focused workflow.',
      evidence: ['run:run-1', 'event:event-1'],
      proposedFiles: [{
        relativePath: '.nano/skills/release-notes/SKILL.md',
        content: '# Release Notes\nUse git diff evidence.',
      }],
      patchPreview: 'diff --git a/.nano/skills/release-notes/SKILL.md b/.nano/skills/release-notes/SKILL.md',
      approvalRequiredForWrite: true,
      createdAt: '2026-04-29T10:00:00.000Z',
    })).toMatchObject({ approvalRequiredForWrite: true })
  })

  it('validates session compaction records', () => {
    expect(sessionCompactionResultSchema.parse({
      compaction: {
        id: 'session-1-compaction-1',
        sessionId: 'session-1',
        conversationId: 'conversation-1',
        summary: 'Compacted 2 messages across 1 run.',
        sourceMessageCount: 2,
        sourceRunIds: ['run-1'],
        createdAt: '2026-04-29T10:00:00.000Z',
      },
    })).toMatchObject({ compaction: { sessionId: 'session-1' } })
  })

  it('parses assistant and tool messages with tool metadata', () => {
    expect(
      messageSchema.parse({
        id: 'assistant-1',
        conversationId: 'conversation-1',
        runId: 'run-1',
        role: 'assistant',
        content: 'I will read the file first.',
        toolCalls: [
          {
            id: 'tool-call-1',
            actionId: 'read_file',
            input: { path: 'notes.txt' },
          },
        ],
        reasoning: 'Need file contents before answering.',
        reasoningDetails: [
          {
            type: 'reasoning.summary',
            summary: 'Checking local workspace context.',
          },
        ],
        createdAt: '2026-04-29T10:00:00.000Z',
      }),
    ).toMatchObject({
      role: 'assistant',
      toolCalls: [{ actionId: 'read_file' }],
    })

    expect(
      messageSchema.parse({
        id: 'tool-1',
        conversationId: 'conversation-1',
        runId: 'run-1',
        role: 'tool',
        content: '{"path":"notes.txt"}',
        toolCallId: 'tool-call-1',
        toolName: 'read_file',
        createdAt: '2026-04-29T10:00:01.000Z',
      }),
    ).toMatchObject({
      role: 'tool',
      toolCallId: 'tool-call-1',
      toolName: 'read_file',
    })
  })

  it('rejects approval event payloads whose resolution type does not match the event', () => {
    expect(() =>
      runEventSchema.parse({
        id: 'event-1',
        runId: 'run-1',
        timestamp: '2026-04-29T10:00:00.000Z',
        type: 'approval.granted',
        payload: {
          resolution: {
            approvalRequestId: 'approval-1',
            decision: 'rejected',
            decidedAt: '2026-04-29T10:00:00.000Z',
          },
        },
      }),
    ).toThrow('approval.granted must carry a granted resolution')
  })

  it('validates dry-run preview events and run evidence export output', () => {
    expect(
      runEventSchema.parse({
        id: 'event-1',
        runId: 'run-1',
        timestamp: '2026-04-29T10:00:00.000Z',
        type: 'run.dry_run_preview',
        payload: {
          provider: { provider: 'openrouter', model: providerDefaultModels.openrouter, baseUrl: 'https://openrouter.ai/api/v1' },
          workspace: { rootPath: '/workspace', approvalPolicy: 'on-request' },
          actions: [{ id: 'read_file', title: 'Read File', requiresApproval: false }],
          permissions: {
            denied: [],
            risky: [],
            activeRules: ['workspace_boundary.reads_and_writes'],
            activeHooks: ['personal_rules.pre_tool_use'],
          },
          skills: {
            available: [{
              id: 'repo-onboarding',
              name: 'Repo Onboarding',
              description: 'Survey repositories.',
              triggers: ['repo'],
              tools: ['grep'],
              safetyNotes: ['Read first.'],
              source: 'bundled',
              enabled: true,
            }],
            selected: [],
          },
          mcp: { servers: [], tools: [], resources: [] },
          memory: { selected: [], excludedCategories: [] },
        },
      }),
    ).toMatchObject({ type: 'run.dry_run_preview' })

    expect(
      exportRunEvidenceResultSchema.parse({
        exportedFilePath: '/tmp/run-evidence.json',
        changedFiles: ['README.md'],
        validationOutputs: 1,
      }),
    ).toMatchObject({ validationOutputs: 1 })
  })

  it('validates bridge payloads for approval resolution and external urls', () => {
    expect(runCreateInputSchema.parse({ conversationId: 'conversation-1', prompt: 'plan the test', role: 'plan' })).toMatchObject({ role: 'plan' })

    expect(
      resolveApprovalInputSchema.parse({
        runId: 'run-1',
        approvalRequestId: 'approval-1',
        decision: 'granted',
      }),
    ).toMatchObject({ decision: 'granted' })

    expect(openExternalUrlInputSchema.parse({ url: 'https://example.com/docs' })).toMatchObject({
      url: 'https://example.com/docs',
    })

    expect(() => openExternalUrlInputSchema.parse({ url: 'not a url' })).toThrow()
  })

  it('validates transport-specific MCP server settings', () => {
    expect(mcpInventorySchema.parse({
      servers: [{
        id: 'docs',
        label: 'Docs Server',
        enabled: true,
        transport: 'stdio',
        status: 'unavailable',
        statusMessage: 'MCP request tools/list timed out',
        allowedTools: [],
        allowedResources: [],
      }],
      tools: [],
      resources: [],
    }).servers[0]).toMatchObject({ status: 'unavailable' })

    expect(
      mcpServerSettingsSchema.parse({
        id: 'docs',
        label: 'Docs Server',
        enabled: true,
        transport: 'stdio',
        command: 'docs-mcp',
      }),
    ).toMatchObject({ transport: 'stdio', command: 'docs-mcp', args: [] })

    expect(
      mcpServerSettingsSchema.parse({
        id: 'remote-docs',
        label: 'Remote Docs Server',
        enabled: true,
        transport: 'http',
        url: 'https://example.com/mcp',
      }),
    ).toMatchObject({ transport: 'http', url: 'https://example.com/mcp' })

    expect(() => mcpServerSettingsSchema.parse({ id: 'docs', label: 'Docs Server', transport: 'stdio', url: 'https://example.com/mcp' })).toThrow()
    expect(() => mcpServerSettingsSchema.parse({ id: 'remote-docs', label: 'Remote Docs Server', transport: 'http', command: 'docs-mcp' })).toThrow()
  })

  it('validates OAuth bridge payloads', () => {
    expect(startProviderOauthInputSchema.parse({ provider: 'openai' })).toEqual({ provider: 'openai' })
    expect(startProviderOauthInputSchema.parse({ provider: 'openai', authMethod: 'oauth' })).toEqual({ provider: 'openai', authMethod: 'oauth' })
    expect(startProviderOauthResultSchema.parse({ provider: 'openai', accountId: 'account-1' })).toEqual({ provider: 'openai', accountId: 'account-1' })
    expect(saveProviderAuthInputSchema.parse({ provider: 'openrouter', authMethod: 'api-key', apiKey: 'key' })).toEqual({
      provider: 'openrouter',
      authMethod: 'api-key',
      apiKey: 'key',
    })
    expect(clearProviderAuthInputSchema.parse({ provider: 'openai', authMethod: 'oauth' })).toEqual({ provider: 'openai', authMethod: 'oauth' })
    expect(() => startProviderOauthInputSchema.parse({ provider: 'not-a-provider' })).toThrow()
    expect(() => saveProviderAuthInputSchema.parse({ provider: 'openai', authMethod: 'oauth', apiKey: 'key' })).toThrow()
  })

  it('rejects invalid app settings payloads', () => {
    expect(() =>
      appSettingsSchema.parse({
        provider: {
          provider: 'openrouter',
          model: '',
        },
        workspace: {
          rootPath: '',
          approvalPolicy: 'sometimes',
        },
      }),
    ).toThrow()
  })
})
