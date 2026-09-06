import { get, post, put, ApiResponse } from '../utils/request'
import { getApiBaseURL } from '../config/apiConfig'
import { getStoredLocale } from '../i18n'

export interface StudyWordItem {
  id: string | number
  word: string
  translation?: string
  phonetic?: string
  phoneticUk?: string
  phoneticUs?: string
  partOfSpeech?: string
  definition?: string
  audioUrl?: string
}

export interface StudyWordsResponse {
  total: number
  page: number
  pageSize: number
  words: StudyWordItem[]
  shuffle?: boolean
  seed?: number
}

export interface LighthouseDay {
  id: string
  count: number
  label: string
}

export interface StudyLighthouseResponse {
  days: LighthouseDay[]
  pendingCount?: number
  masteredCount?: number
  /** 今日首次计入「已学」的单词数 */
  todayNewLearned?: number
}

export interface StartStudySessionRequest {
  wordBookId: string | number
  knownIds: Array<string | number>
  unknownIds: Array<string | number>
  /** 老师代练时传当前学员 ID */
  studentId?: string
}

export interface StartStudySessionResponse {
  sessionId?: string | number
  words?: any[]
  finished?: boolean
}

export interface CompleteSessionResult {
  wordId: string | number
  remembered: boolean
}

export const getStudyWords = async (
  wordBookId: string | number,
  page: number = 1,
  pageSize: number = 20,
  opts?: { shuffle?: boolean; seed?: number; studentId?: string | number }
): Promise<ApiResponse<StudyWordsResponse>> => {
  return get<StudyWordsResponse>('/study/words', {
    params: {
      wordBookId: String(wordBookId),
      page,
      pageSize,
      ...(opts?.shuffle ? { shuffle: 1, seed: opts.seed ?? 0 } : {}),
      ...(opts?.studentId ? { studentId: String(opts.studentId) } : {}),
    },
  })
}

export const getStudyLighthouse = async (
  wordBookId: string | number,
  opts?: { studentId?: string | number }
): Promise<ApiResponse<StudyLighthouseResponse>> => {
  return get<StudyLighthouseResponse>('/study/lighthouse', {
    params: {
      wordBookId: String(wordBookId),
      ...(opts?.studentId ? { studentId: String(opts.studentId) } : {}),
    },
  })
}

export const startStudySession = async (
  data: StartStudySessionRequest
): Promise<ApiResponse<StartStudySessionResponse>> => {
  return post<StartStudySessionResponse>('/study/session/start', {
    ...data,
    wordBookId: String(data.wordBookId),
    knownIds: data.knownIds.map(String),
    unknownIds: data.unknownIds.map(String),
  })
}

export interface LighthouseWordsResponse {
  words: StudyWordItem[]
  total: number
}

export const getLighthouseWords = async (
  wordBookId: string | number,
  step: string,
  page: number = 1,
  pageSize: number = 50,
  opts?: { studentId?: string | number }
): Promise<ApiResponse<LighthouseWordsResponse>> => {
  return get<LighthouseWordsResponse>('/study/lighthouse/words', {
    params: {
      wordBookId: String(wordBookId),
      step,
      page,
      pageSize,
      ...(opts?.studentId ? { studentId: String(opts.studentId) } : {}),
    }
  })
}

export type LighthouseReviewSubmitResult = {
  wordId: string | number
  remembered: boolean
}

/** 九宫格「开始复习」：拉取所有已学未掌握词 */
export const getLighthouseReviewWords = async (
  wordBookId: string | number,
  opts?: { page?: number; pageSize?: number; studentId?: string | number }
): Promise<ApiResponse<LighthouseWordsResponse>> => {
  const id = String(wordBookId).trim()
  return get<LighthouseWordsResponse>('/study/lighthouse/review-words', {
    params: {
      wordBookId: id,
      page: opts?.page ?? 1,
      pageSize: opts?.pageSize ?? 200,
      ...(opts?.studentId ? { studentId: String(opts.studentId) } : {}),
    },
  })
}

/** 九宫格复习提交：对了推进一格，错了不推进 */
export const submitLighthouseReview = async (
  wordBookId: string | number,
  results: LighthouseReviewSubmitResult[],
  opts?: { studentId?: string | number }
): Promise<ApiResponse<{ advanced: number; unchanged: number }>> => {
  const id = String(wordBookId).trim()
  return post<{ advanced: number; unchanged: number }>('/study/lighthouse/review-submit', {
    wordBookId: id,
    results,
    ...(opts?.studentId ? { studentId: String(opts.studentId) } : {}),
  })
}

export const completeStudySession = async (
  sessionId: string | number,
  results: CompleteSessionResult[]
): Promise<ApiResponse<null>> => {
  const id = String(sessionId).trim()
  return post<null>(`/study/session/${id}/complete`, { results })
}

export interface StudySessionListItem {
  id?: string | number
  sessionType: string
  status: string
  startedAt?: string
  completedAt?: string | null
  wordCount: number
  correctCount: number
  screenedKnownCount?: number
  screenedUnknownCount?: number
  wordBookId?: string | number
  wordBookName?: string
  userId?: string | number
  /** groupBy=bookDay 时返回 */
  day?: string
  latestAt?: string
  sessionCount?: number
  sessionIds?: Array<string | number>
}

export interface StudySessionsListResponse {
  list: StudySessionListItem[]
  total: number
  page: number
  pageSize: number
  grouped?: boolean
}

/** 列出学习/复习会话；老师可传 studentId 做权限校验；groupBy=bookDay 按词库+日聚合 */
export const listStudySessions = async (params?: {
  page?: number
  pageSize?: number
  sessionType?: string
  studentId?: string | number
  date?: string
  dateFrom?: string
  dateTo?: string
  wordBookId?: string | number
  status?: string
  groupBy?: "bookDay"
}): Promise<ApiResponse<StudySessionsListResponse>> => {
  return get<StudySessionsListResponse>('/study/sessions', { params })
}

export interface StudySessionDTO {
  id: number
  userId: number
  wordBookId: number
  sessionType: string
  status: string
  startedAt: string
  completedAt?: string | null
  wordCount: number
  correctCount: number
}

export interface StudySessionDetail {
  session: StudySessionDTO
  words: StudyWordItem[]
}

export const getStudySessionDetail = async (
  sessionId: number
): Promise<ApiResponse<StudySessionDetail>> => {
  return get<StudySessionDetail>(`/study/session/${sessionId}`)
}

export interface StudySessionReport {
  sessionId: string
  wordBookId: number
  wordBookName: string
  studentName: string
  studentAvatar?: string
  coachName?: string
  coachAvatar?: string
  status: string
  startedAt: string
  completedAt?: string
  durationMinutes: number
  screenedKnownCount: number
  screenedUnknownCount: number
  wordCount: number
  correctCount: number
  forgotCount: number
  accuracyPercent: number
  remainPending: number
  wordBookWordCount?: number
  learnedCount?: number
  lessonCount?: number
  remainingMinutes?: number
  forgotWords?: string[]
  studiedWords?: string[]
  reportSummary?: string
  aiAvailable: boolean
}

export const getStudySessionReport = async (
  sessionId: string | number
): Promise<ApiResponse<StudySessionReport>> => {
  const id = String(sessionId).trim()
  return get<StudySessionReport>(`/study/session/${id}/report`)
}

type ReportStreamEvent = {
  type: 'delta' | 'done' | 'error' | 'cached'
  text?: string
}

/** Stream AI classroom report via SSE (fetch + ReadableStream; supports Authorization). */
export async function streamStudySessionReport(
  sessionId: string | number,
  handlers: {
    onDelta?: (delta: string) => void
    onDone?: (full: string) => void
    onError?: (code: string) => void
  },
  signal?: AbortSignal
): Promise<void> {
  const id = String(sessionId).trim()
  const token =
    (typeof localStorage !== 'undefined' && localStorage.getItem('auth_token')) || ''
  const res = await fetch(`${getApiBaseURL()}/study/session/${id}/report/stream`, {
    method: 'GET',
    headers: {
      Accept: 'text/event-stream',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      'Accept-Language': getStoredLocale(),
    },
    signal,
  })
  if (!res.ok || !res.body) {
    handlers.onError?.('http_error')
    return
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let full = ''

  const consumeEvent = (raw: string) => {
    const lines = raw.split('\n')
    for (const line of lines) {
      if (!line.startsWith('data:')) continue
      const payload = line.slice(5).trim()
      if (!payload) continue
      try {
        const evt = JSON.parse(payload) as ReportStreamEvent
        if (evt.type === 'delta' && evt.text) {
          full += evt.text
          handlers.onDelta?.(evt.text)
        } else if (evt.type === 'cached' && evt.text) {
          full = evt.text
          handlers.onDelta?.(evt.text)
        } else if (evt.type === 'done') {
          if (evt.text) full = evt.text
          handlers.onDone?.(full)
        } else if (evt.type === 'error') {
          handlers.onError?.(evt.text || 'ai_generate_failed')
        }
      } catch {
        // ignore malformed chunk
      }
    }
  }

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const parts = buffer.split('\n\n')
    buffer = parts.pop() || ''
    for (const part of parts) consumeEvent(part)
  }
  if (buffer.trim()) consumeEvent(buffer)
}

export type UpdatePracticeTimeRequest = {
  date: string
  startTime: string
  endTime: string
  studentId?: string
  sessionIds?: Array<string | number>
}

/** 课后设置识记练习时段（抗遗忘列表展示用） */
export const updateStudySessionsPracticeTime = async (
  data: UpdatePracticeTimeRequest
): Promise<ApiResponse<{ updated: number; sessionIds?: Array<string | number> }>> => {
  return put<{ updated: number; sessionIds?: Array<string | number> }>('/study/sessions/practice-time', data)
}

export type StudyExportWord = {
  id: number
  word: string
  phonetic?: string
  phoneticUk?: string
  phoneticUs?: string
  translation?: string
  partOfSpeech?: string
  audioUrl?: string
}

/** 一次拉取筛选条件下去重单词（导出用） */
export const exportStudySessionWords = async (params?: {
  sessionType?: string
  studentId?: string | number
  date?: string
  dateFrom?: string
  dateTo?: string
  wordBookId?: string | number
  status?: string
}): Promise<ApiResponse<{ words: StudyExportWord[]; total: number }>> => {
  return get<{ words: StudyExportWord[]; total: number }>('/study/sessions/export-words', { params })
}

