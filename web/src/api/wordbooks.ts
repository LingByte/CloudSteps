import { get, post, put, del, ApiResponse } from '../utils/request'

export interface WordBookItem {
  id: number
  name: string
  level?: string
  wordCount?: number
  category?: string
  coverUrl?: string
  ownerUserId?: number
}

export interface WordBookListResult {
  list: WordBookItem[]
  total: number
  page: number
  pageSize: number
}

export interface WordBookGroup {
  key: string
  label: string
}

export const listWordBooks = async (params?: {
  page?: number
  pageSize?: number
  keyword?: string
  level?: string
  category?: string
  group?: string
}): Promise<ApiResponse<WordBookListResult & { groups: WordBookGroup[] }>> => {
  return get<WordBookListResult & { groups: WordBookGroup[] }>('/wordbooks', {
    params: {
      page: params?.page ?? 1,
      pageSize: params?.pageSize ?? 20,
      keyword: params?.keyword || undefined,
      level: params?.level || undefined,
      category: params?.category || undefined,
      group: params?.group || undefined,
    },
  })
}

export interface WordBookDetail extends WordBookItem {}

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
  translationShort?: string
  definition?: string
  partOfSpeech?: string
  exampleSentence?: string
  audioUrl?: string
  overridden?: boolean
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

export const updateWordBookWord = async (
  wordBookId: number,
  wordId: number,
  body: {
    word?: string
    phonetic?: string
    translation?: string
    translationShort?: string
  }
): Promise<ApiResponse<WordBookWord>> => {
  return put<WordBookWord>(`/wordbooks/${wordBookId}/words/${wordId}`, body)
}

export const deleteWordBookWord = async (
  wordBookId: number,
  wordId: number
): Promise<ApiResponse<null>> => {
  return del<null>(`/wordbooks/${wordBookId}/words/${wordId}`)
}

// ===== 单词详情（完整词典数据） =====

export interface WordDetail {
  id: number
  word: string
  phonetic?: string
  phoneticUk?: string
  phoneticUs?: string
  translation?: string
  translationShort?: string
  partOfSpeech?: string
  definition?: string
  audioUrl?: string
  imageUrl?: string
  syllables?: string
  etymology?: string
  morphology?: string
  derivations?: string
  synonyms?: string
  antonyms?: string
  wordFamily?: string
  collocations?: string
  exampleSentences?: string
  usageNotes?: string
  grammarPatterns?: string
  homophones?: string
  mnemonic?: string
  tags?: string
  exampleSentence?: string
  overridden?: boolean
}

export const getWordDetail = async (id: number): Promise<ApiResponse<WordDetail>> => {
  return get<WordDetail>(`/words/${id}`)
}

export interface UserWordFields {
  word?: string
  phonetic?: string
  phoneticUs?: string
  phoneticUk?: string
  translation?: string
  translationShort?: string
  partOfSpeech?: string
  definition?: string
  exampleSentence?: string
  notes?: string
}

export interface UserWordView {
  wordId: number
  wordBookId: number
  canonical: UserWordFields
  overlay: UserWordFields | null
  effective: UserWordFields
  status?: string
  hasOverlay: boolean
}

export const getUserWord = async (wordId: number): Promise<ApiResponse<UserWordView>> => {
  return get<UserWordView>(`/words/${wordId}/user-word`)
}

export const saveUserWord = async (
  wordId: number,
  body: UserWordFields
): Promise<ApiResponse<UserWordView>> => {
  return put<UserWordView>(`/words/${wordId}/user-word`, body)
}

export const deleteUserWord = async (wordId: number): Promise<ApiResponse<UserWordView>> => {
  return del<UserWordView>(`/words/${wordId}/user-word`)
}

// ===== 自定义词书 =====

export type CustomParsedWord = {
  word: string
  phonetic?: string
  translation?: string
  translationShort?: string
}

/** 用词库内存缓存回填缺失释义/音标（前端本地解析后调用） */
export const enrichCustomWordBookWords = async (
  words: CustomParsedWord[]
): Promise<ApiResponse<{ list: CustomParsedWord[]; total: number }>> => {
  return post<{ list: CustomParsedWord[]; total: number }>('/wordbooks/custom/enrich', { words })
}

export const createCustomWordBook = async (body: {
  name: string
  words: CustomParsedWord[]
}): Promise<ApiResponse<WordBookItem>> => {
  return post<WordBookItem>('/wordbooks/custom', body)
}
