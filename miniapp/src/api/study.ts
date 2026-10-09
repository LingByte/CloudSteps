/**
 * 学习 API — 对齐 web/src/api/study.ts
 */
import { get, post, put } from '../utils/request'
import type { ApiResponse } from '../types/api'

export interface StudyWordItem {
  id: number
  word: string
  translation?: string
  translationShort?: string
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
  todayNewLearned?: number
}

export interface StartStudySessionRequest {
  wordBookId: number
  knownIds: number[]
  unknownIds: number[]
}

export interface StartStudySessionResponse {
  sessionId?: number | string
  words: any[]
  finished?: boolean
}

export interface CompleteSessionResult {
  wordId: number
  remembered: boolean
}

export function getStudyWords(
  wordBookId: number,
  page: number = 1,
  pageSize: number = 20,
  opts?: { shuffle?: boolean; seed?: number; studentId?: number }
): Promise<ApiResponse<StudyWordsResponse>> {
  return get<StudyWordsResponse>('/study/words', {
    wordBookId,
    page,
    pageSize,
    ...(opts?.shuffle ? { shuffle: 1, seed: opts.seed ?? 0 } : {}),
    ...(opts?.studentId ? { studentId: opts.studentId } : {}),
  } as any)
}

export function getStudyLighthouse(
  wordBookId: number,
  opts?: { studentId?: number }
): Promise<ApiResponse<StudyLighthouseResponse>> {
  return get<StudyLighthouseResponse>('/study/lighthouse', {
    wordBookId,
    ...(opts?.studentId ? { studentId: opts.studentId } : {}),
  } as any)
}

export function startStudySession(
  data: StartStudySessionRequest & { studentId?: number }
): Promise<ApiResponse<StartStudySessionResponse>> {
  return post<StartStudySessionResponse>('/study/session/start', data)
}

export interface LighthouseWordsResponse {
  words: StudyWordItem[]
  total: number
}

export function getLighthouseWords(
  wordBookId: number,
  step: string,
  page: number = 1,
  pageSize: number = 50,
  opts?: { studentId?: number }
): Promise<ApiResponse<LighthouseWordsResponse>> {
  return get<LighthouseWordsResponse>('/study/lighthouse/words', {
    wordBookId, step, page, pageSize,
    ...(opts?.studentId ? { studentId: opts.studentId } : {}),
  } as any)
}

export function completeStudySession(
  sessionId: number | string,
  results: CompleteSessionResult[]
): Promise<ApiResponse<null>> {
  return post<null>(`/study/session/${sessionId}/complete`, { results })
}

export interface StudySessionListItem {
  id?: number
  sessionType: string
  status: string
  startedAt?: string
  completedAt?: string | null
  wordCount: number
  correctCount: number
  wordBookId?: number
  wordBookName?: string
  userId?: number
  day?: string
  latestAt?: string
  sessionCount?: number
  sessionIds?: number[]
}

export interface StudySessionsListResponse {
  list: StudySessionListItem[]
  total: number
  page: number
  pageSize: number
  grouped?: boolean
}

export function listStudySessions(params?: {
  page?: number
  pageSize?: number
  sessionType?: string
  studentId?: number
  date?: string
  dateFrom?: string
  dateTo?: string
  wordBookId?: number
  status?: string
  groupBy?: 'bookDay'
}): Promise<ApiResponse<StudySessionsListResponse>> {
  return get<StudySessionsListResponse>('/study/sessions', params as any)
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

export function getStudySessionDetail(sessionId: number | string): Promise<ApiResponse<StudySessionDetail>> {
  return get<StudySessionDetail>(`/study/session/${sessionId}`)
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

export function exportStudySessionWords(params?: {
  sessionType?: string
  studentId?: number
  date?: string
  dateFrom?: string
  dateTo?: string
  wordBookId?: number
  status?: string
}): Promise<ApiResponse<{ words: StudyExportWord[]; total: number }>> {
  return get<{ words: StudyExportWord[]; total: number }>('/study/sessions/export-words', params as any)
}

export interface UpdatePracticeTimeRequest {
  date: string
  startTime: string
  endTime?: string
  studentId?: string | number
  sessionIds?: Array<string | number>
}

/** 课后设置识记练习时段（抗遗忘列表展示用） */
export function updateStudySessionsPracticeTime(
  data: UpdatePracticeTimeRequest
): Promise<ApiResponse<{ updated: number; sessionIds?: Array<string | number> }>> {
  return put<{ updated: number; sessionIds?: Array<string | number> }>('/study/sessions/practice-time', data)
}

/* ============ 灯塔复习 ============ */

export function getLighthouseReviewWords(
  wordBookId: number,
  opts?: { page?: number; pageSize?: number; studentId?: number }
): Promise<ApiResponse<LighthouseWordsResponse>> {
  return get<LighthouseWordsResponse>('/study/lighthouse/review-words', {
    wordBookId,
    page: opts?.page ?? 1,
    pageSize: opts?.pageSize ?? 200,
    ...(opts?.studentId ? { studentId: opts.studentId } : {}),
  } as any)
}

export type LighthouseReviewSubmitResult = {
  wordId: number
  remembered: boolean
}

export function submitLighthouseReview(
  wordBookId: number,
  results: LighthouseReviewSubmitResult[],
  opts?: { studentId?: number }
): Promise<ApiResponse<{ advanced: number; unchanged: number }>> {
  return post<{ advanced: number; unchanged: number }>('/study/lighthouse/review-submit', {
    wordBookId,
    results,
    ...(opts?.studentId ? { studentId: opts.studentId } : {}),
  })
}

/* ============ 会话报告 ============ */

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
  remainingLessons?: number
  forgotWords?: string[]
  studiedWords?: string[]
  reportSummary?: string
  aiAvailable: boolean
}

export function getStudySessionReport(
  sessionId: number | string,
  opts?: { sessionIds?: Array<number | string> }
): Promise<ApiResponse<StudySessionReport>> {
  const extras = (opts?.sessionIds || []).map((x) => String(x).trim()).filter(Boolean)
  const params = extras.length > 0 ? { sessionIds: extras.join(',') } : undefined
  return get<StudySessionReport>(`/study/session/${sessionId}/report`, params as any)
}
