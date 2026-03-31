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
