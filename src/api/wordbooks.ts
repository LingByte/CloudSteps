import { get, ApiResponse } from '@/utils/request'

export interface WordBookItem {
  id: number
  name: string
  level?: string
  wordCount?: number
}

export const listWordBooks = async (): Promise<ApiResponse<WordBookItem[]>> => {
  return get<WordBookItem[]>('/wordbooks')
}

export interface WordBookDetail extends WordBookItem {
  description?: string
  category?: string
}

export const getWordBook = async (id: number): Promise<ApiResponse<WordBookDetail>> => {
  return get<WordBookDetail>(`/wordbooks/${id}`)
}

export interface WordBookWord {
  id: number
  wordBookId: number
  word: string
  phonetic?: string
  phoneticUs?: string
  phoneticUk?: string
  translation?: string
  definition?: string
  partOfSpeech?: string
  exampleSentence?: string
  audioUrl?: string
}

export const listWordBookWords = async (
  wordBookId: number,
  params: { page: number; pageSize: number; keyword?: string }
): Promise<ApiResponse<{ list: WordBookWord[]; total: number; page: number; pageSize: number }>> => {
  return get<{ list: WordBookWord[]; total: number; page: number; pageSize: number }>(
    `/wordbooks/${wordBookId}/words`,
    { params: { page: params.page, pageSize: params.pageSize, keyword: params.keyword || undefined } }
  )
}
