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
  sessionId: number
  words: any[]
}

export interface CompleteReviewResult {
  wordId: number
  remembered: boolean
}

export const getReviewToday = async (wordBookId: number): Promise<ApiResponse<ReviewTodayResponse>> => {
  return get<ReviewTodayResponse>('/review/today', { params: { wordBookId } })
}

export const listReviewBooks = async (): Promise<ApiResponse<Array<{ wordBookId: number; cnt: number; name: string; level: string }>>> => {
  return get<Array<{ wordBookId: number; cnt: number; name: string; level: string }>>('/review/books')
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
