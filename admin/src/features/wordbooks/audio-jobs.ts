export type AudioJobKind = 'batch' | 'purge'

/** Wordbook id may be snowflake string from JSON. */
export type BookId = string | number

export function bookKey(id: BookId): string {
  return String(id)
}

export type AudioJob = {
  kind: AudioJobKind
  status: string
  processed: number
  total: number
  success?: number
  queuePosition?: number
}

export function isBatchAudioActive(status?: string): boolean {
  return status === 'running' || status === 'queued'
}

export function isPurgeAudioActive(status?: string): boolean {
  return status === 'running' || status === 'queued'
}

export function queueOrderLabel(position?: number): string {
  return typeof position === 'number' ? ` (#${position + 1})` : ''
}

export function batchAudioButtonLabel(job?: AudioJob): string {
  if (!job || job.kind !== 'batch' || !isBatchAudioActive(job.status)) {
    return '生成音频'
  }
  if (job.status === 'queued') {
    return `取消排队${queueOrderLabel(job.queuePosition)}`
  }
  return job.total > 0 ? `停止 (${job.processed}/${job.total})` : '停止'
}

export function purgeAudioButtonLabel(job?: AudioJob): string {
  if (!job || job.kind !== 'purge' || !isPurgeAudioActive(job.status)) {
    return '清除音频'
  }
  if (job.status === 'queued') {
    return `排队中${queueOrderLabel(job.queuePosition)}`
  }
  return job.total > 0 ? `清除中 (${job.processed}/${job.total})` : '清除中'
}

export function sameAudioJob(a?: AudioJob, b?: AudioJob): boolean {
  if (!a || !b) return a === b
  return (
    a.kind === b.kind &&
    a.status === b.status &&
    a.processed === b.processed &&
    a.total === b.total &&
    a.success === b.success &&
    a.queuePosition === b.queuePosition
  )
}

/** Current-page books that can still start a batch-audio job. */
export function eligibleBooksForPageBatch<T extends { id: BookId }>(
  books: T[],
  jobs: Record<string, AudioJob | undefined>
): T[] {
  return books.filter((book) => {
    const job = jobs[bookKey(book.id)]
    if (job?.kind === 'batch' && isBatchAudioActive(job.status)) return false
    if (job?.kind === 'purge' && isPurgeAudioActive(job.status)) return false
    return true
  })
}
