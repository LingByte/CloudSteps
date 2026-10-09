/**
 * 训练后检测 — 对齐 web/src/pages/PostTrainingCheck.tsx。
 */
import { useMemo, useState } from 'react'
import { View, Text, ScrollView } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { ArrowLeft, Check, Close, ArrowRight } from '@nutui/icons-react-taro'
import { completeReviewSession } from '../../api/review'
import { completeStudySession } from '../../api/study'
import {
  clearStudyRecheck,
  getMilestoneCheckBatchRange,
  getStudyPendingAction,
  getStudyRecheckFrom,
  getStudyRecheckWords,
  getTotalBatches,
  needsFinalCheckAfterMilestone,
  setStudyRetryWords,
  sliceWordsByBatches,
  type StudyCheckPhase,
  type StudyPendingAction,
} from '../../utils/studyBatchFlow'
import { clearReviewPracticeSession, getReviewReturnPath } from '../../utils/reviewPractice'
import {
  consumeScheduledStudentLesson,
  finishPracticeBilling,
  stampLessonPracticeWindow,
} from '../../utils/practiceBilling'
import { PracticePauseMenu } from '../../components/practice-pause-menu/PracticePauseMenu'
import { color } from '../../styles/tokens'
import './index.scss'

type WordInfo = { id: number; word: string; translation?: string; phonetic?: string; audioUrl?: string }
type CheckWord = WordInfo & { status: null | 'remembered' | 'forgotten' }
type StoredResult = { wordId: number; remembered: boolean }

function getMode() {
  return Taro.getStorageSync('lb_mode') === 'review' ? 'review' : 'study'
}

function wordsKey(mode = getMode()) {
  return mode === 'review' ? 'lb_review_words' : 'lb_study_words'
}

function batchKey(mode = getMode()) {
  return mode === 'review' ? 'lb_review_batch_idx' : 'lb_study_batch_idx'
}

function mapWord(word: Record<string, unknown>): WordInfo {
  return {
    id: Number(word.id),
    word: String(word.word || ''),
    translation: String(word.translation || ''),
    phonetic: String(word.phonetic || word.phoneticUs || word.phoneticUk || ''),
    audioUrl: String(word.audioUrl || ''),
  }
}

function readAllWords(mode = getMode()): WordInfo[] {
  try {
    const raw = mode === 'review'
      ? Taro.getStorageSync(wordsKey(mode)) || '[]'
      : Taro.getStorageSync(wordsKey(mode)) || Taro.getStorageSync('lb_study_all_words') || '[]'
    const arr = JSON.parse(raw) as Array<Record<string, unknown>>
    return (Array.isArray(arr) ? arr : []).map(mapWord)
  } catch {
    return []
  }
}

function readBatchResults(): StoredResult[] {
  try {
    const parsed = JSON.parse(Taro.getStorageSync('lb_study_batch_results') || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export default function PostTrainingCheck() {
  const mode = getMode()
  const batchIdx = Number(Taro.getStorageSync(batchKey(mode)) || 0)
  const allWords = useMemo(() => readAllWords(mode), [mode])
  const recheckWords = useMemo(() => mode === 'study' ? getStudyRecheckWords() : null, [mode])
  const isRecheckMode = recheckWords !== null
  const totalBatches = mode === 'review' ? 1 : Number(Taro.getStorageSync('lb_study_total_batches') || 0) || getTotalBatches(allWords.length)
  const [checkPhase, setCheckPhase] = useState<StudyCheckPhase>(() => {
    if (mode === 'review') return 'milestone'
    return Taro.getStorageSync('lb_study_check_phase') === 'final' ? 'final' : 'milestone'
  })
  const [words, setWords] = useState<CheckWord[]>(() => {
    let slice: WordInfo[]
    if (recheckWords) slice = recheckWords.map((word) => mapWord(word as Record<string, unknown>))
    else if (mode === 'review' || Taro.getStorageSync('lb_study_check_phase') === 'final') slice = allWords
    else {
      const range = getMilestoneCheckBatchRange(batchIdx, totalBatches)
      slice = sliceWordsByBatches(allWords, range.startBatch, range.endBatch)
    }
    return slice.map((word) => ({ ...word, status: null }))
  })
  const [submitting, setSubmitting] = useState(false)
  const [paused, setPaused] = useState(false)

  const rememberedWords = useMemo(() => words.filter((word) => word.status === 'remembered'), [words])
  const forgottenWords = useMemo(() => words.filter((word) => word.status === 'forgotten'), [words])
  const wrongWords = forgottenWords
  const allMarked = words.length > 0 && words.every((word) => word.status !== null)
  const sessionId = Taro.getStorageSync(mode === 'review' ? 'lb_review_session_id' : 'lb_study_session_id')

  const handleStatus = (id: number, status: 'remembered' | 'forgotten') => {
    setWords((prev) => prev.map((word) => word.id === id ? { ...word, status } : word))
  }

  const appendMilestoneResults = (results: StoredResult[]) => {
    const byId = new Map<number, StoredResult>()
    for (const item of readBatchResults()) byId.set(Number(item.wordId), item)
    for (const item of results) byId.set(Number(item.wordId), item)
    Taro.setStorageSync('lb_study_batch_results', JSON.stringify([...byId.values()]))
  }

  const enterFinalCheck = () => {
    Taro.setStorageSync('lb_study_check_phase', 'final')
    setCheckPhase('final')
    setWords(allWords.map((word) => ({ ...word, status: null })))
  }

  const goNextBatch = () => {
    const nextIdx = batchIdx + 1
    if (nextIdx >= totalBatches) {
      enterFinalCheck()
      return
    }
    Taro.setStorageSync('lb_study_batch_idx', String(nextIdx))
    Taro.redirectTo({ url: '/pages/word-practice/index' })
  }

  const sendWrongWordsToFlashRetry = (pending: StudyPendingAction) => {
    const wrongIds = new Set(wrongWords.map((word) => Number(word.id)))
    const retryPayload = allWords.filter((word) => wrongIds.has(Number(word.id)))
    if (retryPayload.length === 0) {
      Taro.showToast({ title: '错词数据异常', icon: 'none' })
      return
    }
    const from = checkPhase === 'final' || getStudyRecheckFrom() === 'final' ? 'final' : 'milestone'
    Taro.removeStorageSync('lb_study_recheck_words')
    setStudyRetryWords(retryPayload, pending, from)
    Taro.redirectTo({ url: '/pages/flash-review/index' })
  }

  const finishStudyAndReport = async () => {
    await consumeScheduledStudentLesson()
    stampLessonPracticeWindow()
    await finishPracticeBilling()
    const studyResults: Record<number, 'remembered' | 'forgotten'> = {}
    for (const word of words) {
      if (word.status) studyResults[word.id] = word.status
    }
    Taro.setStorageSync('lb_study_results', JSON.stringify(studyResults))
    Taro.setStorageSync('lb_study_all_words', JSON.stringify(allWords))
    Taro.navigateTo({ url: '/pages/session-report/index' })
  }

  const finishRecheckAndContinue = async (results: StoredResult[]) => {
    const pending = getStudyPendingAction()
    const from = getStudyRecheckFrom()
    clearStudyRecheck()
    const shouldFinal = pending === 'final_check' || needsFinalCheckAfterMilestone(batchIdx, totalBatches)
    if (shouldFinal && from !== 'final') {
      enterFinalCheck()
      return
    }
    if (pending === 'next_batch' && !shouldFinal) {
      goNextBatch()
      return
    }
    if (shouldFinal && from === 'final') {
      const allResults = readBatchResults()
      if (sessionId && String(sessionId) !== '0') {
        await completeStudySession(sessionId, allResults.length > 0 ? allResults : results)
      }
      await finishStudyAndReport()
      return
    }
    enterFinalCheck()
  }

  const handleContinue = async () => {
    if (!allMarked || submitting) {
      if (!allMarked) Taro.showToast({ title: `还有 ${words.filter((word) => !word.status).length} 个单词未标记`, icon: 'none' })
      return
    }
    const results = words.map((word) => ({ wordId: word.id, remembered: word.status === 'remembered' }))
    setSubmitting(true)
    try {
      if (mode === 'review') {
        if (sessionId && String(sessionId) !== '0') await completeReviewSession(sessionId, results)
        const returnPath = getReviewReturnPath('/pages/word-training/index')
        clearReviewPracticeSession()
        Taro.reLaunch({ url: returnPath })
        return
      }

      if (wrongWords.length > 0) {
        appendMilestoneResults(results)
        if (isRecheckMode) {
          sendWrongWordsToFlashRetry(getStudyPendingAction() ?? 'next_batch')
          return
        }
        const pending = checkPhase === 'final' || needsFinalCheckAfterMilestone(batchIdx, totalBatches)
          ? 'final_check'
          : 'next_batch'
        sendWrongWordsToFlashRetry(pending)
        return
      }

      if (isRecheckMode) {
        appendMilestoneResults(results)
        await finishRecheckAndContinue(results)
        return
      }

      if (checkPhase === 'milestone') {
        appendMilestoneResults(results)
        if (needsFinalCheckAfterMilestone(batchIdx, totalBatches)) {
          enterFinalCheck()
          return
        }
        goNextBatch()
        return
      }

      if (sessionId && String(sessionId) !== '0') await completeStudySession(sessionId, results)
      await finishStudyAndReport()
    } catch {
      Taro.showToast({ title: '提交检测结果失败', icon: 'none' })
    } finally {
      setSubmitting(false)
    }
  }

  const submitLabel = mode === 'review'
    ? '完成复习'
    : wrongWords.length > 0
      ? `重练错词 (${wrongWords.length})`
      : isRecheckMode
        ? '提交复练结果'
        : checkPhase === 'final'
          ? '完成并查看报告'
          : needsFinalCheckAfterMilestone(batchIdx, totalBatches)
            ? '进入总检测'
            : '进入下一批'

  return (
    <View className="ptc2">
      <View className="ptc2__navbar">
        <View className="ptc2__nav-btn" onClick={() => setPaused(true)}>
          <ArrowLeft size={22} color={color.charcoal} />
        </View>
        <Text className="ptc2__nav-title">{mode === 'review' ? '复习检测' : checkPhase === 'final' ? '训后总检测' : '组内检测'}</Text>
        <View className="ptc2__nav-btn" />
      </View>

      <ScrollView className="ptc2__body" scrollY enableFlex>
        <View className="ptc2__summary">
          <View className="ptc2__summary-card ptc2__summary-card--green">
            <Text className="ptc2__summary-value">{rememberedWords.length}</Text>
            <Text className="ptc2__summary-label">记住</Text>
          </View>
          <View className="ptc2__summary-card ptc2__summary-card--red">
            <Text className="ptc2__summary-value">{forgottenWords.length}</Text>
            <Text className="ptc2__summary-label">忘记</Text>
          </View>
        </View>

        <View className="ptc2__section">
          <Text className="ptc2__section-title">本组单词 ({words.length})</Text>
          <View className="ptc2__word-list">
            {words.map((word) => (
              <View key={word.id} className={`ptc2__word-card ${word.status === 'remembered' ? 'ptc2__word-card--correct' : ''} ${word.status === 'forgotten' ? 'ptc2__word-card--wrong' : ''}`}>
                <View className="ptc2__word-info">
                  <Text className="ptc2__word-text">{word.word}</Text>
                  {word.translation ? <Text className="ptc2__word-trans">{word.translation}</Text> : null}
                </View>
                <View className="ptc2__word-actions">
                  <View onClick={() => handleStatus(word.id, 'forgotten')}><Close size={14} color={word.status === 'forgotten' ? '#fff' : color.wrong} /><Text>忘记</Text></View>
                  <View onClick={() => handleStatus(word.id, 'remembered')}><Check size={14} color={word.status === 'remembered' ? '#fff' : color.success} /><Text>记住</Text></View>
                </View>
              </View>
            ))}
          </View>
        </View>
        <View style={{ height: '140rpx' }} />
      </ScrollView>

      <View className="ptc2__bottom-bar">
        <View className={`ptc2__btn ${allMarked && !submitting ? 'ptc2__btn--primary' : 'ptc2__btn--disabled'}`} onClick={() => void handleContinue()}>
          <Text className="ptc2__btn-text">{submitting ? '提交中...' : submitLabel}</Text>
          {allMarked && !submitting ? <ArrowRight size={20} color="#ffffff" /> : null}
        </View>
      </View>
      <PracticePauseMenu open={paused} onResume={() => setPaused(false)} onClose={() => setPaused(false)} />
    </View>
  )
}
