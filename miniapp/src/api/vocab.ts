/**
 * 词汇测试 API — 对齐 web/src/api/vocab.ts
 */
import { get, post } from '../utils/request'
import type { ApiResponse } from '../types/api'

export interface VocabNextRequest {
  lastQuestionId: number
  correct: boolean
  currentDifficultyScore: number
  answeredIds: number[]
}

export interface VocabSubmitRequest {
  answers: Array<{ questionId: number | string; answer: string }>
  studentId?: number | string
}

export function getVocabStart(): Promise<ApiResponse<any>> {
  return get<any>('/vocab/start')
}

export function getVocabPoolRevision(): Promise<ApiResponse<{ poolRevision: number }>> {
  return get<{ poolRevision: number }>('/vocab/pool-revision')
}

export function getVocabNext(data: VocabNextRequest): Promise<ApiResponse<any>> {
  return post<any>('/vocab/next', data)
}

export function submitVocabTest(data: VocabSubmitRequest): Promise<ApiResponse<any>> {
  return post<any>('/vocab/submit', data)
}

export function getVocabResult(): Promise<ApiResponse<any>> {
  return get<any>('/vocab/result')
}

export function listVocabRecords(params: {
  page: number
  pageSize: number
}): Promise<ApiResponse<any>> {
  return get<any>('/vocab/records', params as any)
}

export function getVocabRecordDetail(id: number): Promise<ApiResponse<any>> {
  return get<any>(`/vocab/records/${id}`)
}
