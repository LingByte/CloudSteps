export function buildWordPracticeSequence(wordCount: number): number[] {
  if (wordCount <= 0) return []
  if (wordCount === 1) return [0]
  const sequence: number[] = []
  for (let end = 1; end < wordCount; end += 1) {
    for (let i = 0; i <= end; i += 1) sequence.push(i)
    const floor = end === wordCount - 1 ? 0 : 1
    for (let i = end - 1; i >= floor; i -= 1) sequence.push(i)
  }
  return sequence
}
