import { post } from '../utils/request'
import type { ApiResponse } from '../types/api'

export type TtsResult = { url: string }

export function synthesizeTts(text: string, opts?: { lang?: string }): Promise<ApiResponse<TtsResult>> {
  return post<TtsResult>('/tts', { text, ...(opts?.lang ? { lang: opts.lang } : {}) })
}
