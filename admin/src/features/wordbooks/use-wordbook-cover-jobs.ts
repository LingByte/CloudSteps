import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { get, post } from '@/lib/api'
import { type BookId, bookKey } from './audio-jobs'
import { type CoverJob, isCoverJobActive, sameCoverJob } from './cover-jobs'

type BookRef = { id: BookId; name: string }

function bookName(books: BookRef[], id: BookId): string {
  const key = bookKey(id)
  return books.find((b) => bookKey(b.id) === key)?.name || `词库 #${key}`
}

export function useWordbookCoverJobs(books: BookRef[]) {
  const [jobs, setJobs] = useState<Record<string, CoverJob>>({})
  const booksRef = useRef(books)
  booksRef.current = books
  const prevStatusRef = useRef<Record<string, string>>({})

  const setBookJob = (bookId: BookId, job: CoverJob | null) => {
    const key = bookKey(bookId)
    setJobs((prev) => {
      if (!job) {
        if (!(key in prev)) return prev
        const next = { ...prev }
        delete next[key]
        return next
      }
      if (sameCoverJob(prev[key], job)) return prev
      return { ...prev, [key]: job }
    })
    if (job) {
      prevStatusRef.current[key] = job.status
    } else {
      delete prevStatusRef.current[key]
    }
  }

  useEffect(() => {
    let stopped = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const POLL_FAST_MS = 2000
    const POLL_SLOW_MS = 8000
    const POLL_IDLE_MS = 30000
    const JOBS_TIMEOUT_MS = 8000

    const schedule = (ms: number) => {
      if (timer) window.clearTimeout(timer)
      timer = window.setTimeout(() => void tick(), ms)
    }

    const tick = async () => {
      if (stopped) return
      let nextMs = POLL_IDLE_MS
      try {
        const res = await get<{ jobs?: CoverJob[] }>(
          '/wordbooks/cover-ai/jobs',
          { timeout: JOBS_TIMEOUT_MS }
        )
        if (stopped) return
        const remote = res.data?.jobs || []

        setJobs((prev) => {
          const next = { ...prev }
          let changed = false

          for (const j of remote) {
            if (j.bookId == null || j.bookId === '') continue
            const key = bookKey(j.bookId)

            const job: CoverJob = {
              bookId: j.bookId,
              status: j.status || 'idle',
              prompt: j.prompt,
              size: j.size,
              previewUrl: j.previewUrl,
              bytes: j.bytes,
              saved: j.saved,
              error: j.error,
              revisedPrompt: j.revisedPrompt,
            }

            const prevStatus = prevStatusRef.current[key]
            if (
              prevStatus &&
              isCoverJobActive(prevStatus) &&
              job.status === 'done'
            ) {
              const name = bookName(booksRef.current, key)
              toast.success(`${name}：封面预览已生成，可保存为正式封面`)
            }
            if (
              prevStatus &&
              isCoverJobActive(prevStatus) &&
              job.status === 'failed'
            ) {
              const name = bookName(booksRef.current, key)
              toast.error(`${name}：${job.error || '封面生成失败'}`)
            }
            prevStatusRef.current[key] = job.status

            if (!sameCoverJob(next[key], job)) {
              next[key] = job
              changed = true
            }
          }

          const remoteIds = new Set(
            remote
              .filter((j) => j.bookId != null && j.bookId !== '')
              .map((j) => bookKey(j.bookId))
          )
          for (const id of Object.keys(next)) {
            if (!remoteIds.has(id) && isCoverJobActive(next[id]?.status)) {
              delete next[id]
              delete prevStatusRef.current[id]
              changed = true
            }
          }

          return changed ? next : prev
        })

        const hasActive = remote.some((j) => isCoverJobActive(j.status))
        const hasPreview = remote.some((j) => j.status === 'done' && !j.saved)
        if (hasActive) nextMs = POLL_FAST_MS
        else if (hasPreview) nextMs = POLL_SLOW_MS
      } catch {
        nextMs = POLL_SLOW_MS
      }
      if (!stopped) schedule(nextMs)
    }

    void tick()
    return () => {
      stopped = true
      if (timer) window.clearTimeout(timer)
    }
  }, [])

  const refreshBookJob = async (bookId: BookId) => {
    try {
      const res = await get<CoverJob>(`/wordbooks/${bookId}/generate-cover`)
      const data = res.data
      if (!data) return undefined
      const job: CoverJob = {
        bookId,
        status: data.status || 'idle',
        prompt: data.prompt,
        size: data.size,
        previewUrl: data.previewUrl,
        bytes: data.bytes,
        saved: data.saved,
        error: data.error,
        revisedPrompt: data.revisedPrompt,
      }
      setBookJob(bookId, job)
      return job
    } catch {
      return undefined
    }
  }

  const startCoverJob = async (
    book: BookRef,
    opts: {
      prompt: string
      size: string
      referenceFile?: File | null
      referenceBookId?: BookId | null
    }
  ) => {
    const existing = jobs[bookKey(book.id)]
    if (existing && isCoverJobActive(existing.status)) {
      toast.info(`「${book.name}」封面生成任务进行中`)
      return 'busy'
    }

    const form = new FormData()
    form.append('prompt', opts.prompt.trim())
    form.append('size', opts.size.trim() || '1792x1024')
    if (opts.referenceFile) {
      form.append('referenceImage', opts.referenceFile)
    } else if (
      opts.referenceBookId != null &&
      opts.referenceBookId !== '' &&
      opts.referenceBookId !== 0
    ) {
      form.append('referenceBookId', String(opts.referenceBookId))
    }

    const res = await post<{ status?: string }>(
      `/wordbooks/${book.id}/generate-cover`,
      form
    )
    const status = res.data?.status || 'queued'
    setBookJob(book.id, {
      bookId: book.id,
      status: isCoverJobActive(status) ? status : 'queued',
      prompt: opts.prompt,
      size: opts.size,
    })
    toast.info(res.msg || `「${book.name}」已加入封面生成任务`)
    return 'started'
  }

  const saveCover = async (book: BookRef) => {
    const key = bookKey(book.id)
    const res = await post<{ coverUrl?: string }>(
      `/wordbooks/${book.id}/generate-cover/save`
    )
    const coverUrl = res.data?.coverUrl
    setBookJob(book.id, {
      ...jobs[key],
      bookId: book.id,
      status: 'done',
      previewUrl: coverUrl,
      saved: true,
    })
    toast.success(res.msg || `「${book.name}」封面已保存`)
    return coverUrl
  }

  const clearCover = async (book: BookRef) => {
    const res = await post<{ coverUrl?: string }>(
      `/wordbooks/${book.id}/generate-cover/clear`
    )
    setBookJob(book.id, null)
    toast.success(res.msg || `「${book.name}」封面已清除`)
    return res.data?.coverUrl ?? ''
  }

  return {
    jobs,
    startCoverJob,
    saveCover,
    clearCover,
    refreshBookJob,
  }
}
