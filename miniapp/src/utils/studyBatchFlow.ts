import Taro from '@tarojs/taro'

export const WORDS_PER_BATCH = 5
export const BATCHES_PER_MEGA_GROUP = 3
export type StudyCheckPhase = 'milestone' | 'final'

export function getTotalBatches(wordCount: number): number {
  return Math.max(1, Math.ceil(wordCount / WORDS_PER_BATCH))
}

export function positionInMegaGroup(batchIdx: number): number {
  return batchIdx % BATCHES_PER_MEGA_GROUP
}

export function getMilestoneCheckBatchRange(batchIdx: number, totalBatches?: number): { startBatch: number; endBatch: number } {
  const pos = positionInMegaGroup(batchIdx)
  let startBatch = batchIdx
  let endBatch = batchIdx + 1
  if (pos === 1) {
    startBatch = batchIdx - 1
    endBatch = batchIdx + 1
  } else if (pos === 2) {
    startBatch = batchIdx - 2
    endBatch = batchIdx + 1
  }
  if (totalBatches != null && totalBatches > 0) {
    startBatch = Math.max(0, Math.min(startBatch, totalBatches - 1))
    endBatch = Math.max(startBatch + 1, Math.min(endBatch, totalBatches))
  }
  return { startBatch, endBatch }
}

export function sliceWordsByBatches<T>(all: T[], startBatch: number, endBatch: number): T[] {
  return all.slice(startBatch * WORDS_PER_BATCH, endBatch * WORDS_PER_BATCH)
}

export function shouldEnterPostTrainingCheck(batchIdx: number, totalBatches: number): boolean {
  const pos = positionInMegaGroup(batchIdx)
  const isLast = batchIdx >= totalBatches - 1
  if (isLast) return true
  return pos === 1 || pos === 2
}

export function resolveCheckPhase(batchIdx: number, totalBatches: number): StudyCheckPhase {
  const pos = positionInMegaGroup(batchIdx)
  const isLast = batchIdx >= totalBatches - 1
  if (isLast && pos === 0) return 'final'
  return 'milestone'
}

export function needsFinalCheckAfterMilestone(batchIdx: number, totalBatches: number): boolean {
  return batchIdx >= totalBatches - 1
}

export const STUDY_RETRY_WORDS_KEY = 'lb_study_retry_words'
export const STUDY_PENDING_ACTION_KEY = 'lb_study_pending_action'
export const STUDY_RECHECK_WORDS_KEY = 'lb_study_recheck_words'
export const STUDY_RECHECK_FROM_KEY = 'lb_study_recheck_from'
export type StudyPendingAction = 'next_batch' | 'final_check'
export type StudyRecheckFrom = 'milestone' | 'final'

export function setStudyRetryWords(words: unknown[], action: StudyPendingAction, from: StudyRecheckFrom) {
  Taro.setStorageSync(STUDY_RETRY_WORDS_KEY, JSON.stringify(words))
  Taro.setStorageSync(STUDY_PENDING_ACTION_KEY, action)
  Taro.setStorageSync(STUDY_RECHECK_FROM_KEY, from)
}

export function clearStudyRetryFlash() {
  Taro.removeStorageSync(STUDY_RETRY_WORDS_KEY)
}

export function clearStudyRecheck() {
  Taro.removeStorageSync(STUDY_RECHECK_WORDS_KEY)
  Taro.removeStorageSync(STUDY_PENDING_ACTION_KEY)
  Taro.removeStorageSync(STUDY_RECHECK_FROM_KEY)
}

export function clearStudyRetry() {
  clearStudyRetryFlash()
  clearStudyRecheck()
}

export function getStudyRetryWords(): unknown[] | null {
  try {
    const parsed = JSON.parse(Taro.getStorageSync(STUDY_RETRY_WORDS_KEY) || '[]')
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : null
  } catch {
    return null
  }
}

export function getStudyPendingAction(): StudyPendingAction | null {
  const value = Taro.getStorageSync(STUDY_PENDING_ACTION_KEY)
  return value === 'next_batch' || value === 'final_check' ? value : null
}

export function setStudyRecheckWords(words: unknown[]) {
  Taro.setStorageSync(STUDY_RECHECK_WORDS_KEY, JSON.stringify(words))
}

export function getStudyRecheckWords(): unknown[] | null {
  try {
    const parsed = JSON.parse(Taro.getStorageSync(STUDY_RECHECK_WORDS_KEY) || '[]')
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : null
  } catch {
    return null
  }
}

export function getStudyRecheckFrom(): StudyRecheckFrom | null {
  const value = Taro.getStorageSync(STUDY_RECHECK_FROM_KEY)
  return value === 'milestone' || value === 'final' ? value : null
}
