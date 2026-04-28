import type { ReasoningDetail } from '../../../../../../packages/shared/src'

export type ReasoningDisplay = {
  text: string
  summaries: string[]
  encryptedCount: number
}

export function dedupeStrings(values: string[]): string[] {
  const seen = new Set<string>()

  return values.filter((value) => {
    const normalizedValue = value.trim()

    if (!normalizedValue || seen.has(normalizedValue)) {
      return false
    }

    seen.add(normalizedValue)
    return true
  })
}

export function normalizeReasoningText(text: string): string {
  const trimmedText = text.trim()

  if (!trimmedText) {
    return ''
  }

  const lines = trimmedText.split('\n')
  const meaningfulLines = lines.map((line) => line.trim()).filter(Boolean)
  const shortLineCount = meaningfulLines.filter((line) => line.length <= 24 && !/[.!?:;]$/.test(line)).length

  const normalizedText = meaningfulLines.length >= 6 && shortLineCount / meaningfulLines.length > 0.7
    ? meaningfulLines.join(' ').replace(/\s+([,.;:!?])/g, '$1')
    : lines
    .map((line) => line.trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')

  const paragraphs = normalizedText.split(/\n{2,}/).map((paragraph) => paragraph.trim()).filter(Boolean)
  const uniqueParagraphs: string[] = []

  for (const paragraph of paragraphs) {
    const compactParagraph = getComparableReasoningText(paragraph)

    if (uniqueParagraphs.some((existingParagraph) => {
      const compactExistingParagraph = getComparableReasoningText(existingParagraph)
      return isSimilarReasoningText(compactExistingParagraph, compactParagraph)
    })) {
      continue
    }

    uniqueParagraphs.push(paragraph)
  }

  return uniqueParagraphs.join('\n\n')
}

function getComparableReasoningText(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '')
}

function getBigrams(text: string): Set<string> {
  const bigrams = new Set<string>()

  for (let index = 0; index < text.length - 1; index += 1) {
    bigrams.add(text.slice(index, index + 2))
  }

  return bigrams
}

function isSimilarReasoningText(left: string, right: string): boolean {
  if (!left || !right) {
    return false
  }

  if (left === right || left.includes(right) || right.includes(left)) {
    return true
  }

  const leftBigrams = getBigrams(left)
  const rightBigrams = getBigrams(right)

  if (leftBigrams.size === 0 || rightBigrams.size === 0) {
    return false
  }

  const intersectionSize = [...leftBigrams].filter((bigram) => rightBigrams.has(bigram)).length
  const diceCoefficient = (2 * intersectionSize) / (leftBigrams.size + rightBigrams.size)

  return diceCoefficient > 0.82
}

export function normalizeReasoningChunks(values: string[]): string[] {
  const normalizedValues = dedupeStrings(values).map(normalizeReasoningText).filter(Boolean)
  const shortChunkCount = normalizedValues.filter((value) => value.length <= 24 && !/[.!?:;]$/.test(value)).length

  if (normalizedValues.length >= 6 && shortChunkCount / normalizedValues.length > 0.7) {
    return [normalizeReasoningText(normalizedValues.join('\n'))]
  }

  return normalizedValues
}

export function getReasoningDisplay(reasoning?: string, details?: ReasoningDetail[]): ReasoningDisplay | null {
  const summaries = normalizeReasoningChunks(details?.flatMap((detail) => detail.type === 'reasoning.summary' ? [detail.summary] : []) ?? [])
  const textDetails = normalizeReasoningChunks(details?.flatMap((detail) => detail.type === 'reasoning.text' ? [detail.text] : []) ?? [])
  const encryptedCount = details?.filter((detail) => detail.type === 'reasoning.encrypted' || detail.type === 'reasoning.unknown').length ?? 0
  const text = normalizeReasoningText(dedupeStrings([reasoning ?? '', ...textDetails, ...summaries]).join('\n\n'))

  if (!text) {
    return null
  }

  return { text, summaries: [], encryptedCount }
}
