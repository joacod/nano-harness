import { createActionResult, type BuiltInActionCommand } from './types'

function parseFetchUrlInput(value: Record<string, unknown>): { url: string } {
  if (typeof value.url !== 'string' || !value.url.trim()) {
    throw new Error('fetch_url requires a non-empty string url')
  }

  try {
    const url = new URL(value.url)

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Error('fetch_url only supports http and https URLs')
    }

    return { url: url.toString() }
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : 'fetch_url requires a valid URL', {
      cause: error,
    })
  }
}

export const networkActionCommands: BuiltInActionCommand[] = [
  {
    definition: {
      id: 'fetch_url',
      title: 'Fetch URL',
      description: 'Fetch a URL over HTTP or HTTPS',
      requiresApproval: false,
      inputSchema: {
        type: 'object',
        properties: {
          url: {
            type: 'string',
          },
        },
        required: ['url'],
        additionalProperties: false,
      },
    },
    async execute(input) {
      const parsedInput = parseFetchUrlInput(input.call.input)
      const response = await fetch(parsedInput.url, {
        signal: input.signal,
      })
      const body = await response.text()

      if (!response.ok) {
        return createActionResult({
          actionCallId: input.call.id,
          status: 'failed',
          errorMessage: `Fetch failed with ${response.status} ${response.statusText}`,
          output: {
            url: parsedInput.url,
            status: response.status,
            body: body.slice(0, 12000),
          },
        })
      }

      return createActionResult({
        actionCallId: input.call.id,
        status: 'completed',
        output: {
          url: parsedInput.url,
          status: response.status,
          contentType: response.headers.get('content-type') ?? '',
          body: body.slice(0, 12000),
        },
      })
    },
  },
]
