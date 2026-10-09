/**
 * 复习单词列表页 — 对齐 web/src/pages/ReviewWordList.tsx。
 *
 * 布局:
 *  1. 顶部导航栏(返回 + 标题)
 *  2. 单词计数描述
 *  3. 统计栏(认识/不认识/待标记)
 *  4. 单词列表:每行 = 序号 + 单词(点击翻面看释义) + 音频按钮 + ✓/✗ 按钮
 *  5. 底部固定操作栏:全部认识 / 清空 + 提交复习(带进度 x/total)
 */
import { useEffect, useMemo, useState, useRef } from 'react'
import { View, Text, ScrollView } from '@tarojs/components'
import Taro, { useRouter } from '@tarojs/taro'
import { ArrowLeft, ArrowRight, Check, Close, VolumeMax } from '@nutui/icons-react-taro'
import {
  getReviewToday,
  startReviewSession,
  completeReviewSession,
} from '@/api/review'
import { getLighthouseReviewWords } from '@/api/study'
import { resolveMediaUrl } from '@/utils/mediaUrl'
import { CloudButton } from '@/components/button'
import { color } from '../../styles/tokens'
import './index.scss'

interface ReviewWordItem {
  id: number
  word: string
  translation?: string
  audioUrl?: string
  status: null | 'correct' | 'wrong'
  showTranslation: boolean
  heard: boolean
}

function formatTranslation(raw?: string): string {
  if (!raw) return ''
  try {
    const arr = JSON.parse(raw)
    if (Array.isArray(arr)) return arr.join('；')
    return String(arr)
  } catch {
    return raw
  }
}

export default function ReviewWordList() {
  const router = useRouter()
  const wordBookId = Number(router.params.wordBookId || 0)
  const reviewDate = String(router.params.date || '')
  const studySessionId = Number(router.params.studySessionId || 0)
  const reviewStudentId = Number(router.params.studentId || 0)
  const reviewAll = router.params.all === '1' || router.params.all === 'true'
  const lighthouseReview = router.params.lighthouse === '1' || router.params.lighthouse === 'true'
  const viewOnly = router.params.view === '1'

  const [words, setWords] = useState<ReviewWordItem[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [hint, setHint] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<'list' | 'card'>('list')
  const [cardIndex, setCardIndex] = useState(0)
  const [playingId, setPlayingId] = useState<number | null>(null)
  const audioCtxRef = useRef<any>(null)

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const res = lighthouseReview
          ? await getLighthouseReviewWords(wordBookId, { page: 1, pageSize: 200, ...(reviewStudentId > 0 ? { studentId: reviewStudentId } : {}) })
          : await getReviewToday(wordBookId, {
              date: reviewDate || undefined,
              limit: 200,
              studySessionId: studySessionId > 0 ? studySessionId : undefined,
              all: reviewAll || undefined,
              ...(reviewStudentId > 0 ? { studentId: reviewStudentId } : {}),
            })
        const ws = Array.isArray(res.data?.words)
          ? (res.data.words as Array<{
              id: number
              word: string
              translation?: string
              audioUrl?: string
            }>)
          : []
        const mapped: ReviewWordItem[] = ws.map((w) => ({
          id: Number(w.id),
          word: String(w.word || ''),
          translation: w.translation ? formatTranslation(String(w.translation)) : undefined,
          audioUrl: w.audioUrl ? String(w.audioUrl) : undefined,
          status: null,
          showTranslation: false,
          heard: false,
        }))
        if (!mounted) return
        setWords(mapped)
      } catch {
        if (!mounted) return
        setWords([])
      } finally {
        if (mounted) setLoading(false)
      }
    })()
    return () => {
      mounted = false
    }
  }, [wordBookId, reviewDate, studySessionId, reviewStudentId, reviewAll, lighthouseReview])

  const markedWords = useMemo(() => words.filter((w) => w.status !== null), [words])
  const markedCount = markedWords.length
  const unmarkedCount = words.length - markedCount
  const allMarked = words.length > 0 && unmarkedCount === 0
  const correctCount = words.filter((w) => w.status === 'correct').length
  const wrongCount = words.filter((w) => w.status === 'wrong').length

  const playAudio = (item: ReviewWordItem) => {
    if (!item.audioUrl) return
    const url = resolveMediaUrl(item.audioUrl)
    if (!url) return
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = Taro.createInnerAudioContext()
      }
      const ctx = audioCtxRef.current
      ctx.src = url
      ctx.stop()
      ctx.play()
      setPlayingId(item.id)
      ctx.onEnded(() => setPlayingId(null))
      ctx.onError(() => setPlayingId(null))
    } catch {
      setPlayingId(null)
    }
  }

  const handleWordClick = (item: ReviewWordItem) => {
    if (!item.heard && item.audioUrl) {
      playAudio(item)
      setWords((prev) => prev.map((w) => w.id === item.id ? { ...w, heard: true } : w))
      return
    }
    setWords((prev) =>
      prev.map((w) => {
        if (w.id === item.id) return { ...w, showTranslation: !w.showTranslation }
        return { ...w, showTranslation: false }
      }),
    )
  }

  const handleStatusClick = (id: number, newStatus: 'correct' | 'wrong') => {
    setHint(null)
    setWords((prev) =>
      prev.map((w) => {
        if (w.id !== id) return w
        if (w.status === newStatus) return { ...w, status: null }
        return { ...w, status: newStatus }
      }),
    )
  }

  const markAllCorrect = () => {
    setHint(null)
    setWords((prev) => prev.map((w) => ({ ...w, status: 'correct' as const })))
  }

  const clearMarks = () => {
    setHint(null)
    setWords((prev) => prev.map((w) => ({ ...w, status: null })))
  }

  const handleSubmit = async () => {
    if (submitting) return
    if (words.length === 0) {
      setHint('当前没有可复习的单词')
      return
    }
    if (!allMarked) {
      setHint(`还有 ${unmarkedCount} 个单词未勾选，请全部选择 ✓ 或 × 后再提交`)
      return
    }
    setHint(null)
    setSubmitting(true)
    try {
      const wordIds = markedWords.map((w) => w.id)
      const startRes = await startReviewSession({ wordBookId, wordIds })
      const sid = Number(startRes.data?.sessionId || 0)
      if (!sid) {
        setHint('无待复习单词，已返回')
        setSubmitting(false)
        Taro.navigateBack()
        return
      }
      const results = markedWords.map((w) => ({
        wordId: w.id,
        remembered: w.status === 'correct',
      }))
      const res = await completeReviewSession(sid, results)
      if (res.code !== 200) {
        throw new Error(res.msg || '提交失败')
      }
      Taro.removeStorageSync('lb_review_date')
      Taro.removeStorageSync('lb_review_study_session_id')
      Taro.removeStorageSync('lb_review_student_id')
      Taro.removeStorageSync('lb_mode')
      Taro.showToast({ title: '复习完成', icon: 'success' })
      setTimeout(() => Taro.navigateBack(), 800)
    } catch {
      setHint('提交复习结果失败，请稍后重试')
      setSubmitting(false)
    }
  }

  const handleBack = () => {
    Taro.navigateBack()
  }

  return (
    <View className="rwl">
      {/* 顶部导航 */}
      <View className="rwl__navbar">
        <View className="rwl__nav-btn" onClick={handleBack}>
          <ArrowLeft size={22} color={color.charcoal} />
        </View>
        <Text className="rwl__nav-title">{viewOnly ? '查看' : '开始复习'}</Text>
        <View className="rwl__nav-btn" onClick={() => setViewMode((mode) => mode === 'list' ? 'card' : 'list')}><Text className="rwl__mode-text">{viewMode === 'list' ? '卡片' : '列表'}</Text></View>
      </View>

      <ScrollView className="rwl__body" scrollY enableFlex>
        {loading ? (
          <View className="rwl__state">
            <Text className="rwl__state-text">加载中...</Text>
          </View>
        ) : words.length === 0 ? (
          <View className="rwl__state">
            <Text className="rwl__state-text">该日暂无待复习单词</Text>
          </View>
        ) : (
          <>
            {/* 单词计数描述 */}
            <View className="rwl__desc">
              <Text className="rwl__desc-text">
                {viewOnly
                  ? `当前共有 ${words.length} 个单词`
                  : `当前共有 ${words.length} 个可选单词`}
              </Text>
            </View>

            {/* 统计栏 */}
            {!viewOnly && (
              <View className="rwl__stats">
                <View className="rwl__stat rwl__stat--correct">
                  <Text className="rwl__stat-value">{correctCount}</Text>
                  <Text className="rwl__stat-label">认识</Text>
                </View>
                <View className="rwl__stat rwl__stat--wrong">
                  <Text className="rwl__stat-value">{wrongCount}</Text>
                  <Text className="rwl__stat-label">不认识</Text>
                </View>
                <View className="rwl__stat rwl__stat--pending">
                  <Text className="rwl__stat-value">{unmarkedCount}</Text>
                  <Text className="rwl__stat-label">待标记</Text>
                </View>
              </View>
            )}

            {/* 卡片视图 */}
            {viewMode === 'card' && words[cardIndex] ? (() => {
              const item = words[cardIndex]
              return <View className="rwl__card-view">
                <Text className="rwl__card-count">{cardIndex + 1} / {words.length}</Text>
                <View className="rwl__card-word" onClick={() => handleWordClick(item)}><Text className="rwl__word-text">{item.word}</Text>{item.showTranslation && item.translation ? <Text className="rwl__word-translation">{item.translation}</Text> : <Text className="rwl__card-hint">点击查看释义</Text>}</View>
                <View className="rwl__card-actions">{item.audioUrl ? <View className="rwl__icon-btn" onClick={() => playAudio(item)}><VolumeMax size={20} color={color.secondaryBrand} /></View> : null}<View className="rwl__icon-btn rwl__icon-btn--check" onClick={() => handleStatusClick(item.id, 'correct')}><Check size={20} color={item.status === 'correct' ? color.white : color.primary} /></View><View className="rwl__icon-btn rwl__icon-btn--cross" onClick={() => handleStatusClick(item.id, 'wrong')}><Close size={20} color={item.status === 'wrong' ? color.white : color.destructive} /></View></View>
                <View className="rwl__card-nav"><View onClick={() => setCardIndex((index) => Math.max(0, index - 1))}><ArrowLeft size={20} color={color.mutedForeground} /></View><View onClick={() => setCardIndex((index) => Math.min(words.length - 1, index + 1))}><ArrowRight size={20} color={color.mutedForeground} /></View></View>
              </View>
            })() : null}

            {/* 单词列表 */}
            <View className={`rwl__word-list ${viewMode === 'card' ? 'rwl__word-list--hidden' : ''}`}>
              {words.map((item, idx) => (
                <View
                  key={item.id}
                  className={`rwl__word-card ${
                    item.status === 'correct' ? 'rwl__word-card--correct' :
                    item.status === 'wrong' ? 'rwl__word-card--wrong' : ''
                  }`}
                >
                  <View className="rwl__word-left">
                    <Text className="rwl__word-index">{idx + 1}</Text>
                    <View
                      className="rwl__word-content"
                      onClick={() => handleWordClick(item)}
                    >
                      <Text className="rwl__word-text">{item.word}</Text>
                      {item.showTranslation && item.translation && (
                        <Text className="rwl__word-translation">{item.translation}</Text>
                      )}
                    </View>
                  </View>
                  <View className="rwl__word-right">
                    {item.audioUrl && (
                      <View
                        className={`rwl__icon-btn ${playingId === item.id ? 'rwl__icon-btn--playing' : ''}`}
                        onClick={(e) => { e.stopPropagation(); playAudio(item) }}
                      >
                        <VolumeMax size={18} color={playingId === item.id ? color.primary : color.secondaryBrand} />
                      </View>
                    )}
                    {!viewOnly && (
                      <>
                        <View
                          className={`rwl__icon-btn rwl__icon-btn--check ${item.status === 'correct' ? 'rwl__icon-btn--active-mint' : ''}`}
                          onClick={(e) => { e.stopPropagation(); handleStatusClick(item.id, 'correct') }}
                        >
                          <Check size={18} color={item.status === 'correct' ? color.white : color.primary} />
                        </View>
                        <View
                          className={`rwl__icon-btn rwl__icon-btn--cross ${item.status === 'wrong' ? 'rwl__icon-btn--active-red' : ''}`}
                          onClick={(e) => { e.stopPropagation(); handleStatusClick(item.id, 'wrong') }}
                        >
                          <Close size={18} color={item.status === 'wrong' ? color.white : color.destructive} />
                        </View>
                      </>
                    )}
                  </View>
                </View>
              ))}
            </View>

            <View style={{ height: '200rpx' }} />
          </>
        )}
      </ScrollView>

      {/* 底部固定操作栏 */}
      {!viewOnly && !loading && words.length > 0 && (
        <View className="rwl__footer">
          <View className="rwl__footer-top">
            <View className="rwl__footer-btn" onClick={markAllCorrect}>
              <Text className="rwl__footer-btn-text">全部认识</Text>
            </View>
            <View
              className={`rwl__footer-btn ${markedCount === 0 ? 'rwl__footer-btn--disabled' : ''}`}
              onClick={() => markedCount > 0 && clearMarks()}
            >
              <Text className="rwl__footer-btn-text">清空</Text>
            </View>
          </View>
          <CloudButton
            variant="brand"
            loading={submitting}
            disabled={submitting || !allMarked}
            onClick={handleSubmit}
          >
            提交复习 ({markedCount}/{words.length})
          </CloudButton>
          {hint && (
            <Text className="rwl__footer-hint rwl__footer-hint--error">{hint}</Text>
          )}
          {!hint && !allMarked && (
            <Text className="rwl__footer-hint rwl__footer-hint--warn">
              还有 {unmarkedCount} 个单词未勾选，请全部选择 ✓ 或 × 后再提交
            </Text>
          )}
          {!hint && allMarked && (
            <Text className="rwl__footer-hint rwl__footer-hint--ok">
              已全部勾选，可提交复习
            </Text>
          )}
        </View>
      )}
    </View>
  )
}
