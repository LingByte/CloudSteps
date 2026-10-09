/**
 * 完形填空 API — 对齐 web/src/api/cloze.ts + customCloze.ts
 */
import { get, post } from '../utils/request'
import type { ApiResponse } from '../types/api'

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

export function listClozePassages(params?: {
  level?: string
  tag?: string
  keyword?: string
  cursor?: string
  limit?: number
}): Promise<ApiResponse<{ list: ClozePassageListItem[]; nextCursor?: string; hasMore: boolean; limit: number }>> {
  return get('/cloze/passages', params as any)
}

export function listClozeTags(): Promise<ApiResponse<{ tags: string[] }>> {
  return get('/cloze/tags')
}

export function getClozePassage(id: number): Promise<ApiResponse<ClozePassageDetail>> {
  return get(`/cloze/passages/${id}`)
}

export function submitClozePassage(
  id: number,
  data: { answers: Array<{ blankId: number; answer: string }>; durationSec?: number }
): Promise<ApiResponse<ClozeSubmitResult>> {
  return post(`/cloze/passages/${id}/submit`, data)
}

/* ============ 自定义完形填空 ============ */

export function listCustomClozePassages(params?: {
  level?: string
  keyword?: string
  cursor?: string
  limit?: number
}): Promise<ApiResponse<{ list: ClozePassageListItem[]; nextCursor?: string; hasMore: boolean; limit: number }>> {
  return get('/cloze/custom/passages', params as any)
}

export function getCustomClozePassage(id: number): Promise<ApiResponse<ClozePassageDetail>> {
  return get(`/cloze/custom/passages/${id}`)
}

export function submitCustomClozePassage(
  id: number,
  data: { answers: Array<{ blankId: number; answer: string }>; durationSec?: number }
): Promise<ApiResponse<ClozeSubmitResult>> {
  return post(`/cloze/custom/passages/${id}/submit`, data)
}

export type CustomClozeBlankInput = {
  blankNo: number
  options: ClozeOption[]
  answer: string
  explanation?: string
}

export type CustomClozePayload = {
  title: string
  level?: string
  content: string
  summary?: string
  estimatedMinutes?: number
  blanks: CustomClozeBlankInput[]
}

export function createCustomClozePassage(payload: CustomClozePayload): Promise<ApiResponse<{ id: number }>> {
  return post('/cloze/custom/passages', payload)
}
