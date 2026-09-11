import type { ClozeBlankOption, ClozeBlankRow } from './types'

const OPTION_KEYS = ['A', 'B', 'C', 'D'] as const

export type BlankForm = {
  clientId: string
  blankNo: number
  options: Record<(typeof OPTION_KEYS)[number], string>
  answer: (typeof OPTION_KEYS)[number]
  explanation: string
}

let blankSeq = 0
export function emptyBlank(blankNo = 1): BlankForm {
  blankSeq += 1
  return {
    clientId: `b-${Date.now()}-${blankSeq}`,
    blankNo,
    options: { A: '', B: '', C: '', D: '' },
    answer: 'A',
    explanation: '',
  }
}

export function fromApiBlank(b: ClozeBlankRow): BlankForm {
  const opts: BlankForm['options'] = { A: '', B: '', C: '', D: '' }
  for (const o of b.options || []) {
    const key = String(o.key || '').toUpperCase()
    if (key === 'A' || key === 'B' || key === 'C' || key === 'D') {
      opts[key] = o.text || ''
    }
  }
  const answerRaw = String(b.answer || 'A').toUpperCase()
  const answer =
    answerRaw === 'B' || answerRaw === 'C' || answerRaw === 'D' ? answerRaw : 'A'
  blankSeq += 1
  return {
    clientId: `b-${b.id ?? Date.now()}-${blankSeq}`,
    blankNo: b.blankNo || 1,
    options: opts,
    answer,
    explanation: b.explanation || '',
  }
}

export function toApiBlanks(forms: BlankForm[]): Array<{
  blankNo: number
  options: ClozeBlankOption[]
  answer: string
  explanation: string
}> {
  return forms
    .map((f, i) => {
      const options: ClozeBlankOption[] = OPTION_KEYS.map((key) => ({
        key,
        text: f.options[key].trim(),
      })).filter((o) => o.text.length > 0)
      return {
        blankNo: f.blankNo > 0 ? f.blankNo : i + 1,
        options,
        answer: f.answer,
        explanation: f.explanation.trim(),
      }
    })
    .filter((b) => b.options.length >= 2 && b.answer)
}

export { OPTION_KEYS }
