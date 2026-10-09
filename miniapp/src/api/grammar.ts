/**
 * 语法练习 API — 对齐 web/src/api/grammar.ts
 */
import { get, post } from '../utils/request'
import type { ApiResponse } from '../types/api'

export type GrammarOption = { key: string; text: string }
export type GrammarExample = { en: string; zh: string }

export type GrammarLessonListItem = {
  id: number
  title: string
  topic?: string
  level: string
  summary?: string
  estimatedMinutes?: number
  questionCount?: number
  lastScore?: number
  lastCorrectCount?: number
  lastQuestionCount?: number
  lastCompletedAt?: string
}

export type GrammarQuestionView = {
  id: number
  stem: string
  options: GrammarOption[]
  sortOrder?: number
}

export type GrammarLessonDetail = {
  id: number
  title: string
  topic?: string
  level: string
  explanation: string
  examples: GrammarExample[]
  summary?: string
  estimatedMinutes?: number
  questions: GrammarQuestionView[]
}

export type GrammarAnswerDetail = {
  questionId: number
  answer: string
  correct: boolean
  rightAnswer?: string
  stem?: string
  explanation?: string
}

export type GrammarSubmitResult = {
  recordId: number
  lessonId: number
  title: string
  topic?: string
  level: string
  questionCount: number
  correctCount: number
  score: number
  durationSec: number
  completedAt?: string
  details: GrammarAnswerDetail[]
}

export function listGrammarLessons(params?: {
  level?: string
  page?: number
  pageSize?: number
}): Promise<ApiResponse<{ list: GrammarLessonListItem[]; total: number }>> {
  return get('/grammar/lessons', params as any)
}

export function getGrammarLesson(id: number): Promise<ApiResponse<GrammarLessonDetail>> {
  return get(`/grammar/lessons/${id}`)
}

export function submitGrammarLesson(
  id: number,
  data: { answers: Array<{ questionId: number; answer: string }>; durationSec?: number }
): Promise<ApiResponse<GrammarSubmitResult>> {
  return post(`/grammar/lessons/${id}/submit`, data)
}
