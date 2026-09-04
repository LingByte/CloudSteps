import type { BookId } from './audio-jobs'

export type CoverJob = {
  bookId: BookId
  status: string
  prompt?: string
  size?: string
  previewUrl?: string
  bytes?: number
  saved?: boolean
  error?: string
  revisedPrompt?: string
}

export function isCoverJobActive(status?: string): boolean {
  return status === 'queued' || status === 'running'
}

export function coverJobButtonLabel(job?: CoverJob): string {
  if (!job || !isCoverJobActive(job.status)) {
    return 'AI 封面'
  }
  if (job.status === 'queued') {
    return '排队中…'
  }
  return '生成中…'
}

export function sameCoverJob(a?: CoverJob, b?: CoverJob): boolean {
  if (!a || !b) return a === b
  return (
    a.status === b.status &&
    a.previewUrl === b.previewUrl &&
    a.saved === b.saved &&
    a.error === b.error &&
    a.bytes === b.bytes
  )
}
