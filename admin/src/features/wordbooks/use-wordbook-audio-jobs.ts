import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { get, post } from '@/lib/api'
import {
  type AudioJob,
  type BookId,
  bookKey,
  eligibleBooksForPageBatch,
  isBatchAudioActive,
  isPurgeAudioActive,
  sameAudioJob,
} from './audio-jobs'

type BookRef = { id: BookId; name: string }

type BatchJobSnap = {
  bookId?: BookId
  status?: string
  processed?: number
  total?: number
  success?: number
  error?: string
  queuePosition?: number
}

function bookName(books: BookRef[], id: BookId): string {
  const key = bookKey(id)
  return books.find((b) => bookKey(b.id) === key)?.name || `词库 #${key}`
}

export function useWordBookAudioJobs(books: BookRef[]) {
  const [jobs, setJobs] = useState<Record<string, AudioJob>>({})
  const [pageBatching, setPageBatching] = useState(false)
  const booksRef = useRef(books)
  booksRef.current = books

  const setBookJob = (bookId: BookId, job: AudioJob | null) => {
    const key = bookKey(bookId)
    setJobs((prev) => {
      if (!job) {
        if (!(key in prev)) return prev
        const next = { ...prev }
        delete next[key]
        return next
      }
      if (sameAudioJob(prev[key], job)) return prev
      return { ...prev, [key]: job }
    })
  }

  useEffect(() => {
    let stopped = false
    let knownActive = new Set<string>()
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
      let nextMs: number
      try {
        const res = await get<{ jobs?: BatchJobSnap[] }>(
          '/wordbooks/batch-audio/jobs',
          { timeout: JOBS_TIMEOUT_MS }
        )
        if (stopped) return
        const remote = res.data?.jobs || []
        const nextActive = new Set<string>()
        const finished: string[] = []

        setJobs((prev) => {
          let changed = false
          const next: Record<string, AudioJob> = { ...prev }

          for (const [id, job] of Object.entries(next)) {
            if (job.kind !== 'batch') continue
            const still = remote.some(
              (j) =>
                j.bookId != null &&
                bookKey(j.bookId) === id &&
                isBatchAudioActive(j.status)
            )
            if (!still) {
              if (knownActive.has(id)) {
                finished.push(id)
                delete next[id]
                changed = true
              }
            }
          }

          for (const j of remote) {
            if (j.bookId == null || !isBatchAudioActive(j.status)) continue
            const id = bookKey(j.bookId)
            nextActive.add(id)
            const job: AudioJob = {
              kind: 'batch',
              status: j.status || 'running',
              processed: j.processed ?? 0,
              total: j.total ?? 0,
              success: j.success,
              queuePosition: j.queuePosition,
            }
            if (!sameAudioJob(next[id], job)) {
              next[id] = job
              changed = true
            }
          }

          return changed ? next : prev
        })

        for (const id of finished) {
          const name = bookName(booksRef.current, id)
          try {
            const one = await get<{
              status?: string
              processed?: number
              total?: number
              success?: number
              error?: string
            }>(`/wordbooks/${id}/words/batch-audio`, {
              timeout: JOBS_TIMEOUT_MS,
            })
            if (stopped) return
            const status = one.data?.status || 'idle'
            if (status === 'failed') {
              toast.error(`${name}：${one.data?.error || '批量生成失败'}`)
            } else if (status === 'stopped') {
              toast.info(
                `${name}：已停止，成功 ${one.data?.success ?? 0}/${one.data?.processed ?? 0}`
              )
            } else if (status === 'done') {
              const totalN = one.data?.total ?? 0
              const success = one.data?.success ?? 0
              toast.success(
                totalN === 0
                  ? `${name}：所有单词已有音频`
                  : `${name}：生成完成 ${success}/${totalN}`
              )
            }
          } catch {
            // ignore
          }
        }

        knownActive = nextActive
        nextMs = nextActive.size > 0 ? POLL_FAST_MS : POLL_IDLE_MS
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

  const purgeJobKey = Object.entries(jobs)
    .filter(([, job]) => job.kind === 'purge' && isPurgeAudioActive(job.status))
    .map(([id]) => id)
    .sort()
    .join(',')

  useEffect(() => {
    if (!purgeJobKey) return
    const purgeIds = purgeJobKey.split(',').filter(Boolean)
    let stopped = false

    const tick = async () => {
      for (const bookId of purgeIds) {
        if (stopped) return
        try {
          const res = await get<{
            status?: string
            processed?: number
            total?: number
            cleared?: number
            objectsFailed?: number
            error?: string
            queuePosition?: number
          }>(`/wordbooks/${bookId}/words/purge-all-audio`)
          const status = res.data?.status || 'idle'
          if (isPurgeAudioActive(status)) {
            setBookJob(bookId, {
              kind: 'purge',
              status,
              processed: res.data?.processed ?? 0,
              total: res.data?.total ?? 0,
              queuePosition: res.data?.queuePosition,
            })
            continue
          }
          setBookJob(bookId, null)
          const name = bookName(booksRef.current, bookId)
          if (status === 'failed') {
            toast.error(`${name}：${res.data?.error || '清除失败'}`)
          } else if (status === 'done') {
            const cleared = res.data?.cleared ?? 0
            const failed = res.data?.objectsFailed ?? 0
            toast.success(
              cleared > 0
                ? `${name}：已清除 ${cleared} 条音频`
                : `${name}：没有需要清除的音频`
            )
            if (failed > 0) toast.warning(`${name}：${failed} 个文件删除失败`)
          }
        } catch {
          // keep polling
        }
      }
    }

    void tick()
    const timer = window.setInterval(() => {
      void tick()
    }, 2000)
    return () => {
      stopped = true
      window.clearInterval(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [purgeJobKey])

  const startBatchAudio = async (book: BookRef, quiet = false) => {
    const job = jobs[bookKey(book.id)]
    if (job?.kind === 'purge' && isPurgeAudioActive(job.status)) {
      return 'busy'
    }
    if (job?.kind === 'batch' && isBatchAudioActive(job.status)) {
      return 'busy'
    }

    const res = await post<{
      status?: string
      started?: boolean
      total?: number
      processed?: number
      success?: number
      queuePosition?: number
    }>(`/wordbooks/${book.id}/words/batch-audio`)
    if (res.data?.started === false && (res.data?.total ?? 0) === 0) {
      if (!quiet) toast.success(`「${book.name}」所有单词已有音频`)
      return 'already-has-audio'
    }
    const status = res.data?.status || 'queued'
    setBookJob(book.id, {
      kind: 'batch',
      status: isBatchAudioActive(status) ? status : 'queued',
      processed: res.data?.processed ?? 0,
      total: res.data?.total ?? 0,
      success: res.data?.success,
      queuePosition: res.data?.queuePosition,
    })
    if (!quiet) toast.info(res.msg || `「${book.name}」已加入生成队列`)
    return 'started'
  }

  const toggleBatchAudio = async (book: BookRef) => {
    const job = jobs[bookKey(book.id)]
    if (job?.kind === 'purge' && isPurgeAudioActive(job.status)) return
    if (job?.kind === 'batch' && isBatchAudioActive(job.status)) {
      try {
        await post(`/wordbooks/${book.id}/words/batch-audio/stop`)
        toast.info(`「${book.name}」已请求停止`)
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : '停止失败')
      }
      return
    }

    try {
      await startBatchAudio(book)
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : '启动失败')
    }
  }

  const startPageBatchAudio = async (pageBooks: BookRef[]) => {
    if (pageBatching) return
    const targets = eligibleBooksForPageBatch(pageBooks, jobs)
    if (targets.length === 0) {
      toast.info(
        pageBooks.length === 0 ? '当前页没有词库' : '当前页没有可生成音频的词库'
      )
      return
    }

    setPageBatching(true)
    let started = 0
    let already = 0
    let failed = 0
    try {
      for (const book of targets) {
        try {
          const result = await startBatchAudio(book, true)
          if (result === 'started') started += 1
          else if (result === 'already-has-audio') already += 1
        } catch {
          failed += 1
        }
      }
      const parts: string[] = []
      if (started > 0) parts.push(`${started} 本已加入队列`)
      if (already > 0) parts.push(`${already} 本已有音频`)
      if (failed > 0) parts.push(`${failed} 本失败`)
      if (failed > 0 && started === 0) {
        toast.error(parts.join('，') || '批量启动失败')
      } else {
        toast.success(parts.join('，') || '已处理当前页词库')
      }
    } finally {
      setPageBatching(false)
    }
  }

  const startPurgeAudio = async (book: BookRef) => {
    const job = jobs[bookKey(book.id)]
    if (job?.kind === 'purge' && isPurgeAudioActive(job.status)) return
    try {
      const res = await post<{
        status?: string
        total?: number
        processed?: number
        queuePosition?: number
      }>(`/wordbooks/${book.id}/words/purge-all-audio`)
      if (res.data?.status === 'done' && (res.data?.total ?? 0) === 0) {
        toast.info(`「${book.name}」没有需要清除的音频`)
        return
      }
      const status = res.data?.status || 'queued'
      setBookJob(book.id, {
        kind: 'purge',
        status: isPurgeAudioActive(status) ? status : 'queued',
        processed: res.data?.processed ?? 0,
        total: res.data?.total ?? 0,
        queuePosition: res.data?.queuePosition,
      })
      toast.info(res.msg || `「${book.name}」已加入清除队列`)
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : '启动清除失败')
    }
  }

  return {
    jobs,
    pageBatching,
    toggleBatchAudio,
    startPageBatchAudio,
    startPurgeAudio,
  }
}
