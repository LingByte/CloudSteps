/**
 * 训练前筛查 — 对齐 web/src/pages/PreTrainingCheck.tsx。
 *
 * 接收参数:wordBookId(词库ID)、wordBookName(词库名)
 * 功能:加载词库单词，逐个标记认识/不认识，开始学习会话。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { View, Text, ScrollView } from '@tarojs/components'
import Taro, { getCurrentInstance } from '@tarojs/taro'
import { ArrowLeft, Check, Close, List, VolumeMax } from '@nutui/icons-react-taro'
import {
  getStudyWords,
  startStudySession,
  type StudyWordItem,
} from '../../api/study'
import { getTrainingStudent } from '../../utils/trainingStudent'
import { clearStudyRetry } from '../../utils/studyBatchFlow'
import { ensurePracticeBillingActive } from '../../utils/practiceBilling'
import { PracticePauseMenu } from '../../components/practice-pause-menu/PracticePauseMenu'
import { resolveMediaUrl } from '../../utils/mediaUrl'
import { color } from '../../styles/tokens'
import './index.scss'

type WordItem = StudyWordItem & {
  status: null | 'correct' | 'wrong'
  showTranslation: boolean
}

const PAGE_SIZE = 30

function formatTranslation(raw?: string): string {
  if (!raw) return ''
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) return parsed.filter(Boolean).join('；')
    if (typeof parsed === 'string') return parsed
  } catch {
    /* not JSON */
  }
  return raw
}

function pickPhonetic(w: StudyWordItem): string {
  const parts = [w.phonetic, w.phoneticUs, w.phoneticUk].filter((x) => x && String(x).trim())
  if (parts.length === 0) return ''
  return Array.from(new Set(parts.map((p) => String(p).trim()))).join(' · ')
}

export default function PreTrainingCheck() {
  const params = getCurrentInstance().router?.params || {}
  const wordBookId = Number(params.wordBookId)
  const wordBookName = decodeURIComponent(params.wordBookName || '')

  const [words, setWords] = useState<WordItem[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [page, setPage] = useState(1)
  const [shuffleMode, setShuffleMode] = useState(false)
  const [shuffleSeed, setShuffleSeed] = useState(0)
  const [starting, setStarting] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [paused, setPaused] = useState(false)
  const [playingId, setPlayingId] = useState<number | null>(null)
  const audioRef = useRef<Taro.InnerAudioContext | null>(null)

  const playAudio = useCallback((word: WordItem) => {
    const src = resolveMediaUrl(word.audioUrl)
    if (!src) return
    audioRef.current?.stop()
    const audio = Taro.createInnerAudioContext()
    audio.src = src
    audio.autoplay = true
    audio.onEnded(() => setPlayingId(null))
    audio.onError(() => setPlayingId(null))
    audioRef.current = audio
    setPlayingId(word.id)
  }, [])

  useEffect(() => () => {
    audioRef.current?.destroy()
  }, [])

  const loadWords = useCallback(
    async (p: number, isInitial: boolean) => {
      if (!wordBookId) return
      if (isInitial) setLoading(true)
      else setLoadingMore(true)
      setErr(null)
      try {
        const studentId = getTrainingStudent()?.id
        const res = await getStudyWords(wordBookId, p, PAGE_SIZE, {
          shuffle: shuffleMode,
          seed: shuffleSeed,
          ...(studentId ? { studentId } : {}),
        })
        if (res.code !== 200) {
          setErr(res.msg || '加载失败')
          if (isInitial) setWords([])
          return
        }
        const list = res.data?.words || []
        if (res.data?.seed && shuffleMode) setShuffleSeed(Number(res.data.seed))
        const newWords: WordItem[] = list.map((w) => ({
          ...w,
          translation: formatTranslation(w.translation),
          phonetic: pickPhonetic(w),
          status: null,
          showTranslation: false,
        }))
        setWords((prev) => (p === 1 ? newWords : [...prev, ...newWords]))
        const total = res.data?.total || 0
        setHasMore(list.length >= PAGE_SIZE && (p === 1 ? list.length : words.length + list.length) < total)
        setPage(p)
      } catch (e: unknown) {
        const msg = e && typeof e === 'object' && 'msg' in e ? String((e as { msg: string }).msg) : '加载失败'
        setErr(msg)
        if (isInitial) setWords([])
      } finally {
        setLoading(false)
        setLoadingMore(false)
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [wordBookId, shuffleMode, shuffleSeed],
  )

  useEffect(() => {
    void ensurePracticeBillingActive(180, { silent: true })
  }, [])

  useEffect(() => {
    void loadWords(1, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wordBookId])

  const onScrollToLower = () => {
    if (loadingMore || loading || !hasMore) return
    void loadWords(page + 1, false)
  }

  const handleShuffle = () => {
    setShuffleMode(true)
    setShuffleSeed(Date.now())
    setWords([])
    setHasMore(true)
    setPage(1)
    setTimeout(() => void loadWords(1, true), 0)
  }

  const handleStatusClick = (id: number, newStatus: 'correct' | 'wrong') => {
    setWords((prev) =>
      prev.map((w) => {
        if (w.id === id) {
          return { ...w, status: w.status === newStatus ? null : newStatus }
        }
        return w
      }),
    )
  }

  const handleWordClick = (word: WordItem) => {
    setWords((prev) =>
      prev.map((w) =>
        w.id === word.id
          ? { ...w, showTranslation: !w.showTranslation }
          : { ...w, showTranslation: false },
      ),
    )
  }

  const handleSelect5 = (status: 'correct' | 'wrong') => {
    setWords((prev) => {
      const unselected = prev.filter((w) => w.status === null)
      const toSelect = unselected.slice(0, 5)
      return prev.map((w) => {
        if (toSelect.find((x) => x.id === w.id)) return { ...w, status }
        return w
      })
    })
  }

  const selectedCount = useMemo(
    () => words.filter((w) => w.status !== null).length,
    [words],
  )
  const knownCount = useMemo(() => words.filter((w) => w.status === 'correct').length, [words])
  const unknownCount = useMemo(() => words.filter((w) => w.status === 'wrong').length, [words])

  const handleStartLearning = async () => {
    const selected = words.filter((w) => w.status !== null)
    if (selected.length === 0 || starting) return
    setStarting(true)
    setErr(null)
    try {
      const knownIds = selected.filter((w) => w.status === 'correct').map((w) => w.id)
      const unknownIds = selected.filter((w) => w.status === 'wrong').map((w) => w.id)
      const studentId = getTrainingStudent()?.id
      const res = await startStudySession({
        wordBookId,
        knownIds,
        unknownIds,
        ...(studentId ? { studentId } : {}),
      })
      if (res.code !== 200) {
        setErr(res.msg || '开始失败')
        setStarting(false)
        return
      }
      const sessionId = res.data?.sessionId
      const sessionWords = res.data?.words
      if (res.data?.finished || !Array.isArray(sessionWords) || sessionWords.length === 0) {
        setErr('没有需要学习的单词')
        setStarting(false)
        return
      }
      // 保存会话数据到 storage，供后续页面使用
      if (sessionId) Taro.setStorageSync('lb_study_session_id', String(sessionId))
      if (Array.isArray(sessionWords)) {
        Taro.setStorageSync('lb_study_words', JSON.stringify(sessionWords))
        Taro.setStorageSync('lb_study_total_batches', String(Math.max(1, Math.ceil(sessionWords.length / 5))))
      }
      Taro.setStorageSync('lb_wordbook_id', String(wordBookId))
      Taro.setStorageSync('lb_wordbook_name', wordBookName)
      Taro.setStorageSync('lb_mode', 'study')
      Taro.setStorageSync('lb_study_batch_idx', '0')
      Taro.removeStorageSync('lb_study_batch_results')
      Taro.removeStorageSync('lb_study_check_phase')
      Taro.removeStorageSync('lb_study_results')
      Taro.removeStorageSync('lb_study_all_words')
      clearStudyRetry()
      Taro.removeStorageSync('lb_review_session_id')
      Taro.removeStorageSync('lb_review_words')
      Taro.removeStorageSync('lb_review_batch_idx')
      Taro.navigateTo({ url: '/pages/word-practice/index' })
    } catch (e: unknown) {
      const msg = e && typeof e === 'object' && 'msg' in e ? String((e as { msg: string }).msg) : '开始失败'
      setErr(msg)
      setStarting(false)
    }
  }

  const handleBack = () => {
    setPaused(true)
  }

  return (
    <View className="ptc">
      {/* 顶部导航 */}
      <View className="ptc__navbar">
        <View className="ptc__nav-btn" onClick={handleBack}>
          <ArrowLeft size={22} color={color.charcoal} />
        </View>
        <View className="ptc__nav-center">
          <Text className="ptc__nav-title">训练前筛查</Text>
          <Text className="ptc__nav-sub">{wordBookName}</Text>
        </View>
        <View className="ptc__nav-btn" onClick={handleShuffle}>
          <List size={20} color={color.primary} />
        </View>
      </View>

      {/* 统计栏 */}
      <View className="ptc__stats-bar">
        <View className="ptc__stat">
          <Text className="ptc__stat-value">{selectedCount}</Text>
          <Text className="ptc__stat-label">已选</Text>
        </View>
        <View className="ptc__stat ptc__stat--green">
          <Text className="ptc__stat-value">{knownCount}</Text>
          <Text className="ptc__stat-label">认识</Text>
        </View>
        <View className="ptc__stat ptc__stat--red">
          <Text className="ptc__stat-value">{unknownCount}</Text>
          <Text className="ptc__stat-label">不认识</Text>
        </View>
        <View className="ptc__quick-select">
          <View className="ptc__quick-btn ptc__quick-btn--green" onClick={() => handleSelect5('correct')}>
            <Text className="ptc__quick-btn-text">+5认识</Text>
          </View>
          <View className="ptc__quick-btn ptc__quick-btn--red" onClick={() => handleSelect5('wrong')}>
            <Text className="ptc__quick-btn-text">+5不认识</Text>
          </View>
        </View>
      </View>

      {err && (
        <View className="ptc__err">
          <Text className="ptc__err-text">{err}</Text>
        </View>
      )}

      {/* 单词列表 */}
      <ScrollView
        className="ptc__body"
        scrollY
        enableFlex
        lowerThreshold={120}
        onScrollToLower={onScrollToLower}
      >
        {loading ? (
          <View className="ptc__state">
            <Text className="ptc__state-text">加载中...</Text>
          </View>
        ) : words.length === 0 ? (
          <View className="ptc__state">
            <Text className="ptc__state-text">暂无单词</Text>
          </View>
        ) : (
          <View className="ptc__word-list">
            {words.map((w, idx) => (
              <View
                key={w.id}
                className={`ptc__word-card ${w.status === 'correct' ? 'ptc__word-card--correct' : ''} ${w.status === 'wrong' ? 'ptc__word-card--wrong' : ''}`}
                onClick={() => handleWordClick(w)}
              >
                <Text className="ptc__word-seq">{idx + 1}</Text>
                <View className="ptc__word-main">
                  <Text className="ptc__word-text">{w.word}</Text>
                  {w.showTranslation && (
                    <View className="ptc__word-detail">
                      {w.phonetic ? <Text className="ptc__word-phonetic">{w.phonetic}</Text> : null}
                      {w.translation ? <Text className="ptc__word-trans">{w.translation}</Text> : null}
                    </View>
                  )}
                </View>
                <View className="ptc__word-actions">
                  {w.audioUrl ? <View className="ptc__audio-btn" onClick={(e) => { e.stopPropagation(); playAudio(w) }}><VolumeMax size={18} color={playingId === w.id ? color.primary : color.mutedForeground} /></View> : null}
                  <View
                    className={`ptc__action-btn ${w.status === 'correct' ? 'ptc__action-btn--correct-active' : 'ptc__action-btn--correct'}`}
                    onClick={(e) => {
                      e.stopPropagation()
                      handleStatusClick(w.id, 'correct')
                    }}
                  >
                    <Check size={18} color={w.status === 'correct' ? '#ffffff' : color.success} />
                  </View>
                  <View
                    className={`ptc__action-btn ${w.status === 'wrong' ? 'ptc__action-btn--wrong-active' : 'ptc__action-btn--wrong'}`}
                    onClick={(e) => {
                      e.stopPropagation()
                      handleStatusClick(w.id, 'wrong')
                    }}
                  >
                    <Close size={18} color={w.status === 'wrong' ? '#ffffff' : color.wrong} />
                  </View>
                </View>
              </View>
            ))}
          </View>
        )}
        {loadingMore && (
          <View className="ptc__state">
            <Text className="ptc__state-text">加载更多...</Text>
          </View>
        )}
        <View style={{ height: '140rpx' }} />
      </ScrollView>

      {/* 底部按钮 */}
      <View className="ptc__bottom-bar">
        <View
          className={`ptc__btn ${selectedCount === 0 ? 'ptc__btn--disabled' : 'ptc__btn--primary'}`}
          onClick={() => void handleStartLearning()}
        >
          <Text className="ptc__btn-text">
            {starting ? '开始中...' : selectedCount === 0 ? '请先标记单词' : `开始学习 (${selectedCount} 词)`}
          </Text>
        </View>
      </View>
      <PracticePauseMenu open={paused} onResume={() => setPaused(false)} onClose={() => setPaused(false)} />
    </View>
  )
}
