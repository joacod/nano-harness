import { createActionResult, type BuiltInActionCommand } from './types'

function parseTimeInput(value: Record<string, unknown>): { timeZone?: string; locale: string } {
  const timeZone = typeof value.timeZone === 'string' && value.timeZone.trim() ? value.timeZone.trim() : undefined
  const locale = typeof value.locale === 'string' && value.locale.trim() ? value.locale.trim() : 'en-US'

  return { timeZone, locale }
}

export const timeActionCommands: BuiltInActionCommand[] = [
  {
    definition: {
      id: 'get_current_time',
      title: 'Get Current Time',
      description: 'Return the current local time, optionally formatted for an IANA time zone, without shell or network access',
      requiresApproval: false,
      inputSchema: {
        type: 'object',
        properties: {
          timeZone: { type: 'string' },
          locale: { type: 'string' },
        },
        additionalProperties: false,
      },
    },
    async execute(input) {
      const parsedInput = parseTimeInput(input.call.input)
      const now = new Date()
      const formatter = new Intl.DateTimeFormat(parsedInput.locale, {
        dateStyle: 'full',
        timeStyle: 'long',
        timeZone: parsedInput.timeZone,
      })
      const resolved = formatter.resolvedOptions()

      return createActionResult({
        actionCallId: input.call.id,
        status: 'completed',
        output: {
          nowIso: now.toISOString(),
          timeZone: resolved.timeZone,
          locale: resolved.locale,
          formatted: formatter.format(now),
        },
      })
    },
  },
]
