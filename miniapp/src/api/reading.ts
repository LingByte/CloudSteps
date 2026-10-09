/**
 * 阅读理解 API — 对齐 web/src/api/reading.ts + customReading.ts
 */
import { get, post } from '../utils/request'
import type { ApiResponse } from '../types/api'

export type ReadingOption = { key: string; text: string }

export type ReadingPassageListItem = {
  id: number
  title: string
  level: string
  tags?: string
  summary?: string
  wordCount?: number
  estimatedMinutes?: number
  questionCount?: number
  lastScore?: number
  lastCorrectCount?: number
  lastQuestionCount?: number
  lastCompletedAt?: string
}

export type ReadingQuestionView = {
  id: number
  stem: string
  options: ReadingOption[]
  sortOrder?: number
}

export type ReadingPassageDetail = {
  id: number
  title: string
  level: string
  content: string
  summary?: string
  wordCount?: number
  estimatedMinutes?: number
  questions: ReadingQuestionView[]
}

export type ReadingAnswerDetail = {
  questionId: number
  answer: string
  correct: boolean
  rightAnswer?: string
  stem?: string
  explanation?: string
}

export type ReadingSubmitResult = {
  recordId: number
  passageId: number
  title: string
  level: string
  questionCount: number
  correctCount: number
  score: number
  durationSec: number
  completedAt?: string
  details: ReadingAnswerDetail[]
}

export function listReadingPassages(params?: {
  level?: string
  tag?: string
  keyword?: string
  page?: number
  pageSize?: number
}): Promise<ApiResponse<{ list: ReadingPassageListItem[]; total: number }>> {
  return get('/reading/passages', params as any)
}

export function listReadingTags(): Promise<ApiResponse<{ tags: string[] }>> {
  return get('/reading/tags')
}

export function getReadingPassage(id: number): Promise<ApiResponse<ReadingPassageDetail>> {
  return get(`/reading/passages/${id}`)
}

export function checkReadingAnswer(id: number, data: { questionId: number; answer: string }): Promise<ApiResponse<{ correct: boolean; rightAnswer: string; explanation?: string }>> {
  return post(`/reading/passages/${id}/check`, data)
}

export function getReadingAnalysis(id: number): Promise<ApiResponse<{ items: any[] }>> {
  return get(`/reading/passages/${id}/analysis`, { timeout: 120000 } as any)
}

export function getReadingKnowledge(id: number): Promise<ApiResponse<{ items: any[] }>> {
  return get(`/reading/passages/${id}/knowledge`, { timeout: 120000 } as any)
}

export function submitReadingPassage(
  id: number,
  data: { answers: Array<{ questionId: number; answer: string }>; durationSec?: number }
): Promise<ApiResponse<ReadingSubmitResult>> {
  return post(`/reading/passages/${id}/submit`, data)
}

/* ============ 自定义阅读 ============ */

export function listCustomReadingPassages(params?: {
  level?: string
  page?: number
  pageSize?: number
}): Promise<ApiResponse<{ list: ReadingPassageListItem[]; total: number }>> {
  return get('/reading/custom/passages', params as any)
}

export function getCustomReadingPassage(id: number): Promise<ApiResponse<ReadingPassageDetail>> {
  return get(`/reading/custom/passages/${id}`)
}

export function submitCustomReadingPassage(
  id: number,
  data: { answers: Array<{ questionId: number; answer: string }>; durationSec?: number }
): Promise<ApiResponse<ReadingSubmitResult>> {
  return post(`/reading/custom/passages/${id}/submit`, data)
}

export function checkCustomReadingAnswer(
  id: number,
  data: { questionId: number; answer: string }
): Promise<ApiResponse<{ correct: boolean; rightAnswer: string; explanation?: string }>> {
  return post(`/reading/custom/passages/${id}/check`, data)
}

export function getCustomReadingAnalysis(id: number): Promise<ApiResponse<{ items: any[] }>> {
  return get(`/reading/custom/passages/${id}/analysis`, { timeout: 120000 } as any)
}

export function getCustomReadingKnowledge(id: number): Promise<ApiResponse<{ items: any[] }>> {
  return get(`/reading/custom/passages/${id}/knowledge`, { timeout: 120000 } as any)
}

export type CustomReadingPayload = {
  title: string
  level?: string
  summary?: string
  content: string
  estimatedMinutes?: number
  questions: Array<{ stem: string; options: ReadingOption[]; answer: string; explanation?: string; sortOrder?: number }>
}

export function createCustomReadingPassage(payload: CustomReadingPayload): Promise<ApiResponse<{ id: number }>> {
  return post('/reading/custom/passages', payload)
}
