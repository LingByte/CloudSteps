import { get, post, ApiResponse } from '../utils/request'

export type ClozeOption = { key: string; text: string }

export type ClozePassageListItem = {
  id: number
  title: string
  level: string
  tags?: string
  summary?: string
  blankCount?: number
  estimatedMinutes?: number
  lastScore?: number
  lastCorrectCount?: number
  lastBlankCount?: number
  lastCompletedAt?: string
}

export type ClozeBlankView = {
  id: number
  blankNo: number
  options: ClozeOption[]
}

export type ClozePassageDetail = {
  id: number
  title: string
  level: string
  content: string
  summary?: string
  blankCount?: number
  estimatedMinutes?: number
  blanks: ClozeBlankView[]
}

export type ClozeAnswerDetail = {
  blankId: number
  blankNo: number
  answer: string
  correct: boolean
  rightAnswer?: string
  explanation?: string
}

export type ClozeSubmitResult = {
  recordId: number
  passageId: number
  title: string
  level: string
  blankCount: number
  correctCount: number
  score: number
  durationSec: number
  completedAt?: string
  details: ClozeAnswerDetail[]
}

export const listClozePassages = (params?: {
  level?: string
  tag?: string
  keyword?: string
  cursor?: string
  limit?: number
}): Promise<ApiResponse<{ list: ClozePassageListItem[]; nextCursor?: string; hasMore: boolean; limit: number }>> => {
  return get('/cloze/passages', { params })
}

export const listClozeTags = (): Promise<ApiResponse<{ tags: string[] }>> => {
  return get('/cloze/tags')
}

export const getClozePassage = (id: number): Promise<ApiResponse<ClozePassageDetail>> => {
  return get(`/cloze/passages/${id}`)
}

export const submitClozePassage = (
  id: number,
  data: { answers: Array<{ blankId: number; answer: string }>; durationSec?: number }
): Promise<ApiResponse<ClozeSubmitResult>> => {
  return post(`/cloze/passages/${id}/submit`, data)
}
