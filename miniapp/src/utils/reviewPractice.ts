import Taro from '@tarojs/taro'

export type ReviewPracticeWord = {
  id: string | number
  word: string
  phonetic?: string
  phoneticUk?: string
  phoneticUs?: string
  translation?: string
  audioUrl?: string
  [key: string]: unknown
}

export function beginReviewPractice(opts: {
  sessionId: string | number
  wordBookId: string | number
  words: ReviewPracticeWord[]
  returnPath: string
}) {
  const { sessionId, wordBookId, words, returnPath } = opts
  if (words.length === 0) throw new Error('没有需要复习的单词')
  Taro.setStorageSync('lb_mode', 'review')
  Taro.setStorageSync('lb_review_session_id', String(sessionId || 0))
  Taro.setStorageSync('lb_review_wordbook_id', String(wordBookId))
  Taro.setStorageSync('lb_review_words', JSON.stringify(words))
  Taro.setStorageSync('lb_review_batch_idx', '0')
  Taro.setStorageSync('lb_review_return', returnPath)
  Taro.removeStorageSync('lb_review_results')
  Taro.removeStorageSync('lb_study_check_phase')
  Taro.removeStorageSync('lb_study_retry_words')
  Taro.removeStorageSync('lb_study_pending_action')
  Taro.removeStorageSync('lb_study_recheck_words')
  Taro.removeStorageSync('lb_study_recheck_from')
}

export function getReviewReturnPath(fallback = '/pages/word-training/index') {
  return Taro.getStorageSync('lb_review_return') || fallback
}

export function clearReviewPracticeSession() {
  Taro.removeStorageSync('lb_review_batch_idx')
  Taro.removeStorageSync('lb_review_results')
  Taro.removeStorageSync('lb_review_words')
  Taro.removeStorageSync('lb_review_session_id')
  Taro.removeStorageSync('lb_review_return')
  if (Taro.getStorageSync('lb_mode') === 'review') Taro.removeStorageSync('lb_mode')
}
