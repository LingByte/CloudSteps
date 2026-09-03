import { get, post, ApiResponse } from '../utils/request'

export type ReadingOption = { key: string; text: string }

export type ReadingPassageListItem = {
  id: number
  title: string
  level: string
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

export type ReadingRecordListItem = {
  id: number
  passageId: number
  title: string
  level: string
  questionCount: number
  correctCount: number
  score: number
  durationSec: number
  isLatest: boolean
  completedAt?: string
}

export const listReadingPassages = (params?: {
  level?: string
  page?: number
  pageSize?: number
}): Promise<ApiResponse<{ list: ReadingPassageListItem[]; total: number }>> => {
  return get('/reading/passages', { params })
}

export const getReadingPassage = (id: number): Promise<ApiResponse<ReadingPassageDetail>> => {
  return get(`/reading/passages/${id}`)
}

export type ReadingCheckResult = {
  questionId: number
  answer: string
  correct: boolean
  rightAnswer: string
  explanation?: string
  stem?: string
}

export const checkReadingAnswer = (
  id: number,
  data: { questionId: number; answer: string }
): Promise<ApiResponse<ReadingCheckResult>> => {
  return post(`/reading/passages/${id}/check`, data)
}

export type ReadingKnowledgePoint = {
  title: string
  body: string
}

export const getReadingKnowledge = (
  id: number
): Promise<ApiResponse<{ items: ReadingKnowledgePoint[] }>> => {
  return get(`/reading/passages/${id}/knowledge`)
}

export const submitReadingPassage = (
  id: number,
  data: { answers: Array<{ questionId: number; answer: string }>; durationSec?: number }
): Promise<ApiResponse<ReadingSubmitResult>> => {
  return post(`/reading/passages/${id}/submit`, data)
}

export const listReadingRecords = (params?: {
  page?: number
  pageSize?: number
}): Promise<ApiResponse<{ list: ReadingRecordListItem[]; total: number }>> => {
  return get('/reading/records', { params })
}

export const getReadingRecord = (id: number): Promise<ApiResponse<ReadingSubmitResult & { content?: string }>> => {
  return get(`/reading/records/${id}`)
}
