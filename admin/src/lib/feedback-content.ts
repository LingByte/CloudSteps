export type FeedbackPayload = {
  v: 1
  text: string
  images: string[]
}

const IMAGE_MD_RE = /!\[[^\]]*]\(([^)]+)\)/g

export function parseFeedbackContent(raw: string | undefined | null): FeedbackPayload {
  const s = String(raw ?? '').trim()
  if (!s) return { v: 1, text: '', images: [] }

  if (s.startsWith('{')) {
    try {
      const parsed = JSON.parse(s) as Partial<FeedbackPayload>
      const images = Array.isArray(parsed.images)
        ? parsed.images.map((u) => String(u).trim()).filter(Boolean)
        : []
      const text = String(parsed.text ?? '').trim()
      if (parsed.v || text || images.length > 0) {
        return { v: 1, text, images }
      }
    } catch {
      /* fall through */
    }
  }

  const images: string[] = []
  const text = s
    .replace(IMAGE_MD_RE, (_m, url: string) => {
      const u = String(url).trim()
      if (u) images.push(u)
      return ' '
    })
    .replace(/\[[^\]]*]\([^)]+\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()

  return { v: 1, text, images }
}

export function encodeFeedbackContent(text: string, images: string[]): string {
  const payload: FeedbackPayload = {
    v: 1,
    text: text.trim(),
    images: images.map((u) => u.trim()).filter(Boolean),
  }
  return JSON.stringify(payload)
}

export function isFeedbackContentEmpty(text: string, images: string[]): boolean {
  return !text.trim() && images.filter((u) => u.trim()).length === 0
}

export function feedbackPreviewText(raw: string | undefined | null): string {
  const p = parseFeedbackContent(raw)
  if (!p.text && p.images.length > 0) return '[图片]'
  if (p.images.length > 0) return `${p.text} [图片]`
  return p.text
}
