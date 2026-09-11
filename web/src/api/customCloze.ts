import { get, post, put, del, ApiResponse } from '../utils/request'
import type { ClozeOption, ClozePassageDetail, ClozePassageListItem, ClozeSubmitResult } from './cloze'

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

export const listCustomClozePassages = (params?: {
  level?: string
  keyword?: string
  cursor?: string
  limit?: number
}): Promise<ApiResponse<{ list: ClozePassageListItem[]; nextCursor?: string; hasMore: boolean; limit: number }>> => {
  return get('/cloze/custom/passages', { params })
}

export const getCustomClozePassage = (id: number): Promise<ApiResponse<ClozePassageDetail>> => {
  return get(`/cloze/custom/passages/${id}`)
}

export const createCustomClozePassage = (
  payload: CustomClozePayload
): Promise<ApiResponse<{ id: number }>> => {
  return post('/cloze/custom/passages', payload)
}

export const updateCustomClozePassage = (
  id: number,
  payload: CustomClozePayload
): Promise<ApiResponse<{ id: number }>> => {
  return put(`/cloze/custom/passages/${id}`, payload)
}

export const deleteCustomClozePassage = (id: number): Promise<ApiResponse<null>> => {
  return del(`/cloze/custom/passages/${id}`)
}

export const submitCustomClozePassage = (
  id: number,
  data: { answers: Array<{ blankId: number; answer: string }>; durationSec?: number }
): Promise<ApiResponse<ClozeSubmitResult>> => {
  return post(`/cloze/custom/passages/${id}/submit`, data)
}
