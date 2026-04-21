import { get, post, ApiResponse } from '@/utils/request'

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
  /** 无到期复习词时为 true */
  finished?: boolean
}

export interface CompleteReviewResult {
  wordId: number
  remembered: boolean
}

export const getReviewToday = async (wordBookId: number): Promise<ApiResponse<ReviewTodayResponse>> => {
  return get<ReviewTodayResponse>('/review/today', { params: { wordBookId } })
}

export type ReviewBookStatRow = { wordBookId: number; cnt: number; name: string; level: string }

export const listReviewBooks = async (): Promise<ApiResponse<ReviewBookStatRow[]>> => {
  return get<ReviewBookStatRow[]>('/review/books')
}

/** 按本地自然日统计各词库待复习词数（与抗遗忘页日期联动） */
export const listReviewBooksByDate = async (
  date: string,
  timeZone?: string
): Promise<ApiResponse<ReviewBookStatRow[]>> => {
  const tz = timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai'
  return get<ReviewBookStatRow[]>('/review/books-by-date', { params: { date, timeZone: tz } })
}

export const startReviewSession = async (
  data: StartReviewSessionRequest
): Promise<ApiResponse<StartReviewSessionResponse>> => {
  return post<StartReviewSessionResponse>('/review/session/start', data)
}

export const completeReviewSession = async (
  sessionId: number,
  results: CompleteReviewResult[]
): Promise<ApiResponse<null>> => {
  return post<null>(`/review/session/${sessionId}/complete`, { results })
}
