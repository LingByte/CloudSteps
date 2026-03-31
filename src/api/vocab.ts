import { get, post, ApiResponse } from '@/utils/request'

export interface VocabNextRequest {
  lastQuestionId: number
  correct: boolean
  currentDifficultyScore: number
  answeredIds: number[]
}

export interface VocabSubmitRequest {
  answers: Array<{ questionId: number; answer: string }>
}

export const getVocabNext = async (data: VocabNextRequest): Promise<ApiResponse<any>> => {
  return post<any>('/vocab/next', data)
}

export const submitVocabTest = async (data: VocabSubmitRequest): Promise<ApiResponse<any>> => {
  return post<any>('/vocab/submit', data)
}

export const getVocabResult = async (): Promise<ApiResponse<any>> => {
  return get<any>('/vocab/result')
}

export const listVocabRecords = async (params: {
  page: number
  pageSize: number
}): Promise<ApiResponse<any>> => {
  return get<any>('/vocab/records', { params })
}

export const getVocabRecordDetail = async (id: number): Promise<ApiResponse<any>> => {
  return get<any>(`/vocab/records/${id}`)
}
