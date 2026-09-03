import { get, post, put, del, ApiResponse } from '../utils/request'
import type { ReadingCheckResult, ReadingKnowledgePoint, ReadingOption, ReadingPassageDetail, ReadingSubmitResult } from './reading'

export type CustomReadingPassageListItem = {
  id: number
  title: string
  level: string
  summary?: string
  wordCount?: number
  estimatedMinutes?: number
  questionCount?: number
  lastScore?: number
  source?: string
  isCustom?: boolean
}

export type CustomReadingImportPassage = {
  title: string
  level?: string
  summary?: string
  content: string
  estimatedMinutes?: number
  questions: Array<{
    stem: string
    options: ReadingOption[]
    answer: string
    explanation?: string
    sortOrder?: number
  }>
}

export const listCustomReadingPassages = (params?: {
  level?: string
  page?: number
  pageSize?: number
}): Promise<ApiResponse<{ list: CustomReadingPassageListItem[]; total: number }>> => {
  return get('/reading/custom/passages', { params })
}

export const getCustomReadingPassage = (id: number): Promise<ApiResponse<ReadingPassageDetail>> => {
  return get(`/reading/custom/passages/${id}`)
}

export const createCustomReadingPassage = (
  data: CustomReadingImportPassage
): Promise<ApiResponse<{ id: number }>> => {
  return post('/reading/custom/passages', data)
}

export const importCustomReadingPassages = (data: {
  source?: string
  passages: CustomReadingImportPassage[]
}): Promise<ApiResponse<{ ids: number[]; count: number }>> => {
  return post('/reading/custom/passages/import', data)
}

export const importCustomReadingText = (
  text: string
): Promise<ApiResponse<{ ids: number[]; count: number }>> => {
  return post('/reading/custom/passages/import-text', { text })
}

export const deleteCustomReadingPassage = (id: number): Promise<ApiResponse<null>> => {
  return del(`/reading/custom/passages/${id}`)
}

export const submitCustomReadingPassage = (
  id: number,
  data: { answers: Array<{ questionId: number; answer: string }>; durationSec?: number }
): Promise<ApiResponse<ReadingSubmitResult>> => {
  return post(`/reading/custom/passages/${id}/submit`, data)
}

export const checkCustomReadingAnswer = (
  id: number,
  data: { questionId: number; answer: string }
): Promise<ApiResponse<ReadingCheckResult>> => {
  return post(`/reading/custom/passages/${id}/check`, data)
}

export const getCustomReadingKnowledge = (
  id: number
): Promise<ApiResponse<{ items: ReadingKnowledgePoint[] }>> => {
  return get(`/reading/custom/passages/${id}/knowledge`)
}
