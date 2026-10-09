import Taro from '@tarojs/taro'
import { getVocabPoolRevision, getVocabStart } from '../api/vocab'

export type VocabTestQuestion = {
  id: number | string
  word: string
  options: string
  correctAnswer: string
  level: string
  difficultyScore: number
  audioUrl?: string
}

const VOCAB_TEST_CACHE_KEY = 'vocabulary_test_questions'
const VOCAB_TEST_RESULT_KEY = 'vocabulary_test_result'
const CACHE_TTL_MS = 30 * 60 * 1000

type CachedVocabPayload = {
  questions?: VocabTestQuestion[]
  savedAt?: number
  poolRevision?: number
}

let prefetchPromise: Promise<VocabTestQuestion[] | null> | null = null

function readCachedPayload(): CachedVocabPayload | null {
  try {
    const raw = Taro.getStorageSync(VOCAB_TEST_CACHE_KEY)
    if (!raw || typeof raw !== 'string') return null
    return JSON.parse(raw) as CachedVocabPayload
  } catch {
    return null
  }
}

async function fetchPoolRevision(): Promise<number> {
  try {
    const res = await getVocabPoolRevision()
    if (res.code !== 200) return 0
    return Number(res.data?.poolRevision || 0)
  } catch {
    return 0
  }
}

async function isCachedVocabStale(cached: CachedVocabPayload): Promise<boolean> {
  if (!cached.questions?.length) return true
  if (cached.savedAt && Date.now() - cached.savedAt > CACHE_TTL_MS) return true
  const serverRevision = await fetchPoolRevision()
  if (serverRevision > 0 && cached.poolRevision !== serverRevision) return true
  return false
}

export function loadCachedVocabQuestions(): VocabTestQuestion[] | null {
  const parsed = readCachedPayload()
  if (!parsed?.questions?.length) return null
  if (parsed.savedAt && Date.now() - parsed.savedAt > CACHE_TTL_MS) {
    Taro.removeStorageSync(VOCAB_TEST_CACHE_KEY)
    return null
  }
  return parsed.questions
}

export function saveCachedVocabQuestions(questions: VocabTestQuestion[], poolRevision?: number) {
  Taro.setStorageSync(VOCAB_TEST_CACHE_KEY, JSON.stringify({ questions, savedAt: Date.now(), poolRevision: poolRevision ?? 0 }))
}

export function clearVocabTestQuestionsCache() {
  Taro.removeStorageSync(VOCAB_TEST_CACHE_KEY)
  prefetchPromise = null
}

export function clearVocabTestResultCache() {
  Taro.removeStorageSync(VOCAB_TEST_RESULT_KEY)
}

export function prefetchVocabTestQuestions(options?: { force?: boolean }): Promise<VocabTestQuestion[] | null> {
  if (!options?.force) {
    const cached = readCachedPayload()
    if (cached?.questions?.length) {
      return isCachedVocabStale(cached).then((stale) => {
        if (!stale) return cached.questions!
        clearVocabTestQuestionsCache()
        return prefetchVocabTestQuestions({ force: true })
      })
    }
  }

  if (prefetchPromise) return prefetchPromise

  prefetchPromise = (async () => {
    try {
      const res = await getVocabStart()
      if (res.code !== 200) throw new Error(res.msg || '加载题目失败')
      const list: VocabTestQuestion[] = res.data?.questions || []
      const poolRevision = Number(res.data?.poolRevision || 0)
      if (!list.length) throw new Error('题库暂无题目')
      const valid = list.filter((q) => q && q.id != null && q.word)
      if (!valid.length) throw new Error('题目格式不正确')
      saveCachedVocabQuestions(valid, poolRevision)
      return valid
    } catch (err) {
      prefetchPromise = null
      throw err
    }
  })()

  return prefetchPromise
}

export async function ensureVocabTestQuestions(): Promise<VocabTestQuestion[]> {
  const cached = readCachedPayload()
  if (cached?.questions?.length && !(await isCachedVocabStale(cached))) return cached.questions
  if (cached?.questions?.length) clearVocabTestQuestionsCache()
  const list = await prefetchVocabTestQuestions()
  if (!list?.length) throw new Error('题库暂无题目')
  return list
}

export function refreshVocabTestQuestions(): Promise<VocabTestQuestion[] | null> {
  clearVocabTestQuestionsCache()
  return prefetchVocabTestQuestions({ force: true })
}
