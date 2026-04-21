import { get, post, ApiResponse } from '@/utils/request'

export interface StudyWordItem {
  id: number
  word: string
  translation?: string
  audioUrl?: string
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
  /** 今日首次计入「已学」的单词数 */
  todayNewLearned?: number
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

export interface LighthouseWordsResponse {
  words: StudyWordItem[]
  total: number
}

export const getLighthouseWords = async (
  wordBookId: number,
  step: string,
  page: number = 1,
  pageSize: number = 50
): Promise<ApiResponse<LighthouseWordsResponse>> => {
  return get<LighthouseWordsResponse>('/study/lighthouse/words', {
    params: { wordBookId, step, page, pageSize }
  })
}

export const completeStudySession = async (
  sessionId: number,
  results: CompleteSessionResult[]
): Promise<ApiResponse<null>> => {
  return post<null>(`/study/session/${sessionId}/complete`, { results })
}

