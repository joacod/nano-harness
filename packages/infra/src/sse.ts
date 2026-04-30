export function splitSseEvents(buffer: string): { events: string[]; remainder: string } {
  const normalized = buffer.replace(/\r\n/g, '\n')
  const parts = normalized.split('\n\n')
  const remainder = parts.pop() ?? ''

  return {
    events: parts,
    remainder,
  }
}

export function parseSseData(eventText: string): string | null {
  const dataLines = eventText
    .split('\n')
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trimStart())

  return dataLines.length > 0 ? dataLines.join('\n') : null
}
