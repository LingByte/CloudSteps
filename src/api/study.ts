import { get, post, ApiResponse } from '@/utils/request'

export interface StudyWordItem {
  id: number
  word: string
  translation?: string
}

export interface StudyWordsResponse {
  total: number
  page: number
  pageSize: number
  words: StudyWordItem[]
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
}

export interface StartStudySessionRequest {
  wordBookId: number
  knownIds: number[]
  unknownIds: number[]
}

export interface StartStudySessionResponse {
  sessionId: number
  words: any[]
}

export interface CompleteSessionResult {
  wordId: number
  remembered: boolean
}

export const getStudyWords = async (
  wordBookId: number, 
  page: number = 1, 
  pageSize: number = 20
): Promise<ApiResponse<StudyWordsResponse>> => {
  return get<StudyWordsResponse>('/study/words', { 
    params: { wordBookId, page, pageSize } 
  })
}

export const getStudyLighthouse = async (wordBookId: number): Promise<ApiResponse<StudyLighthouseResponse>> => {
  return get<StudyLighthouseResponse>('/study/lighthouse', { params: { wordBookId } })
}

export const startStudySession = async (
  data: StartStudySessionRequest
): Promise<ApiResponse<StartStudySessionResponse>> => {
  return post<StartStudySessionResponse>('/study/session/start', data)
}

export const completeStudySession = async (
  sessionId: number,
  results: CompleteSessionResult[]
): Promise<ApiResponse<null>> => {
  return post<null>(`/study/session/${sessionId}/complete`, { results })
}

export interface LearningStats {
  todayLearned: number
  totalLearned: number
  todayReviewed: number
  totalReviewed: number
  consecutiveDays: number
  masteryRate: number
}

export const getLearningStats = async (wordBookId?: number): Promise<ApiResponse<LearningStats>> => {
  const params: any = {};
  if (wordBookId) params.wordBookId = wordBookId;
  return get<LearningStats>('/study/stats', { params });
}
