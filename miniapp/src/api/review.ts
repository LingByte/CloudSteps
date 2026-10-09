/**
 * 复习 API — 对齐 web/src/api/review.ts
 */
import { get, post } from '../utils/request'
import type { ApiResponse } from '../types/api'

export interface ReviewWordItem {
  id: number
  word: string
}

export interface ReviewTodayResponse {
  words: ReviewWordItem[]
}

export interface StartReviewSessionRequest {
  wordBookId: number
  wordIds?: number[]
}

export interface StartReviewSessionResponse {
  sessionId?: number
  words?: any[]
  finished?: boolean
}

export interface CompleteReviewResult {
  wordId: number
  remembered: boolean
}

export type ReviewBookStatRow = {
  studentId?: string | number
  studentName?: string
  wordBookId: string | number
  cnt: number
  name: string
  level: string
  sessionId?: string | number
  practiceStartedAt?: string
  practiceEndedAt?: string | null
}

export function getReviewToday(
  wordBookId: number,
  opts?: { date?: string; timeZone?: string; limit?: number; studySessionId?: number; all?: boolean; studentId?: number }
): Promise<ApiResponse<ReviewTodayResponse>> {
  const tz = opts?.timeZone || 'Asia/Shanghai'
  return get<ReviewTodayResponse>('/review/today', {
    wordBookId,
    ...(opts?.date ? { date: opts.date } : {}),
    timeZone: tz,
    ...(opts?.limit ? { limit: opts.limit } : {}),
    ...(opts?.studySessionId ? { studySessionId: opts.studySessionId } : {}),
    ...(opts?.all ? { all: 1 } : {}),
    ...(opts?.studentId ? { studentId: opts.studentId } : {}),
  } as any)
}

export function listReviewBooks(): Promise<ApiResponse<ReviewBookStatRow[]>> {
  return get<ReviewBookStatRow[]>('/review/books')
}

export function listReviewBooksByDate(date: string, timeZone?: string): Promise<ApiResponse<ReviewBookStatRow[]>> {
  const tz = timeZone || 'Asia/Shanghai'
  return get<ReviewBookStatRow[]>('/review/books-by-date', { date, timeZone: tz } as any)
}

export function startReviewSession(data: StartReviewSessionRequest): Promise<ApiResponse<StartReviewSessionResponse>> {
  return post<StartReviewSessionResponse>('/review/session/start', data)
}

export function completeReviewSession(sessionId: number | string, results: CompleteReviewResult[]): Promise<ApiResponse<null>> {
  return post<null>(`/review/session/${sessionId}/complete`, { results })
}
