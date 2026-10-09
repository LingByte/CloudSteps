import { useEffect, useRef, useState } from 'react'
import { View, Text, ScrollView } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { ArrowLeft, Check, Close, List, VolumeMax } from '@nutui/icons-react-taro'
import { resolveMediaUrl } from '../../utils/mediaUrl'
import { PracticePauseMenu } from '../../components/practice-pause-menu/PracticePauseMenu'
import {
  clearStudyRetryFlash,
  getStudyRetryWords,
  getTotalBatches,
  resolveCheckPhase,
  setStudyRecheckWords,
  shouldEnterPostTrainingCheck,
} from '../../utils/studyBatchFlow'
import { color } from '../../styles/tokens'
import './index.scss'

type FlashWord = {
  id: number
  word: string
  phonetic?: string
  translation?: string
  audioUrl?: string
  revealed: boolean
  heard: boolean
  scissorCount: 0 | 1 | 2
}

function getMode() {
  return Taro.getStorageSync('lb_mode') === 'review' ? 'review' : 'study'
}

function wordsKey(mode = getMode()) {
  return mode === 'review' ? 'lb_review_words' : 'lb_study_words'
}

function batchKey(mode = getMode()) {
  return mode === 'review' ? 'lb_review_batch_idx' : 'lb_study_batch_idx'
}

function toFlashWord(w: Record<string, unknown>): FlashWord {
  return {
    id: Number(w.id),
    word: String(w.word || ''),
    phonetic: String(w.phonetic || w.phoneticUs || w.phoneticUk || ''),
    translation: String(w.translation || ''),
    audioUrl: String(w.audioUrl || ''),
    revealed: false,
    heard: false,
    scissorCount: 0,
  }
}

function parseWords(): FlashWord[] {
  const retryWords = getStudyRetryWords()
  if (retryWords) return retryWords.map((word) => toFlashWord(word as Record<string, unknown>))
  const mode = getMode()
  const raw = Taro.getStorageSync(wordsKey(mode)) || '[]'
  try {
    const arr = JSON.parse(raw) as Array<Record<string, unknown>>
    const batch = Number(Taro.getStorageSync(batchKey(mode)) || 0)
    return arr.slice(batch * 5, batch * 5 + 5).map(toFlashWord)
  } catch {
    return []
  }
}

export default function FlashReview() {
  const mode = getMode()
  const batchIdx = Number(Taro.getStorageSync(batchKey(mode)) || 0)
  const isRetryMode = getStudyRetryWords() !== null
  const [words, setWords] = useState<FlashWord[]>(parseWords)
  const [playingId, setPlayingId] = useState<number | null>(null)
  const [paused, setPaused] = useState(false)
  const [round, setRound] = useState(1)
  const audioRef = useRef<Taro.InnerAudioContext | null>(null)
  const allCut = words.length > 0 && words.every((word) => word.scissorCount > 0)
  const allMastered = words.length > 0 && words.every((word) => word.scissorCount === 2)
  const answered = words.filter((word) => word.scissorCount > 0).length

  useEffect(() => () => { audioRef.current?.destroy() }, [])

  const play = (word: FlashWord) => {
    const src = resolveMediaUrl(String(word.audioUrl || '').split(';')[0]?.trim())
    if (!src) {
      Taro.showToast({ title: '暂无发音', icon: 'none' })
      return
    }
    audioRef.current?.stop()
    const audio = Taro.createInnerAudioContext()
    audio.src = src
    audio.autoplay = true
    audio.onEnded(() => setPlayingId(null))
    audio.onError(() => setPlayingId(null))
    audioRef.current = audio
    setPlayingId(word.id)
  }

  const mark = (id: number, value: 1 | 2) => {
    setWords((prev) => prev.map((word) => word.id === id ? { ...word, scissorCount: word.scissorCount === value ? 0 : value } : word))
  }

  useEffect(() => {
    if (!allCut || allMastered) return
    const timer = setTimeout(() => {
      setWords((prev) => prev.map((word) => word.scissorCount === 1 ? { ...word, scissorCount: 0, revealed: false, heard: false } : word))
      setRound((value) => value + 1)
    }, 500)
    return () => clearTimeout(timer)
  }, [allCut, allMastered])

  const handleBack = () => {
    if (isRetryMode) {
      clearStudyRetryFlash()
      Taro.redirectTo({ url: '/pages/post-training-check/index' })
      return
    }
    setPaused(true)
  }

  const complete = () => {
    if (!allMastered) return
    if (isRetryMode) {
      const retried = getStudyRetryWords()
      clearStudyRetryFlash()
      if (retried) setStudyRecheckWords(retried)
      Taro.redirectTo({ url: '/pages/post-training-check/index' })
      return
    }
    const key = wordsKey(mode)
    const rawWords = Taro.getStorageSync(key) || '[]'
    let allWords: unknown[] = []
    try { allWords = JSON.parse(rawWords) } catch { /* ignore */ }
    const totalBatches = mode === 'review'
      ? getTotalBatches(Array.isArray(allWords) ? allWords.length : 0)
      : Number(Taro.getStorageSync('lb_study_total_batches') || 0) || getTotalBatches(Array.isArray(allWords) ? allWords.length : 0)

    if (mode === 'review') {
      if (batchIdx + 1 < totalBatches) {
        Taro.setStorageSync('lb_review_batch_idx', String(batchIdx + 1))
        Taro.redirectTo({ url: '/pages/word-practice/index' })
        return
      }
      Taro.navigateTo({ url: '/pages/post-training-check/index' })
      return
    }

    if (!shouldEnterPostTrainingCheck(batchIdx, totalBatches)) {
      const nextIdx = batchIdx + 1
      if (nextIdx >= totalBatches) {
        Taro.setStorageSync('lb_study_check_phase', 'final')
        Taro.redirectTo({ url: '/pages/post-training-check/index' })
        return
      }
      Taro.setStorageSync('lb_study_batch_idx', String(nextIdx))
      Taro.redirectTo({ url: '/pages/word-practice/index' })
      return
    }
    Taro.setStorageSync('lb_study_check_phase', resolveCheckPhase(batchIdx, totalBatches))
    Taro.navigateTo({ url: '/pages/post-training-check/index' })
  }

  const shuffle = () => setWords((prev) => [...prev].sort(() => Math.random() - .5))

  return (
    <View className="flash">
      <View className="flash__navbar">
        <View className="flash__nav-btn" onClick={handleBack}><ArrowLeft size={22} color={color.charcoal} /></View>
        <View className="flash__nav-center"><Text className="flash__nav-title">{isRetryMode ? '错词重练' : '快闪复习'}</Text><Text className="flash__nav-sub">第 {round} 轮 · {answered}/{words.length}</Text></View>
        <View className="flash__nav-btn" onClick={shuffle}><List size={20} color={color.primary} /></View>
      </View>
      <ScrollView className="flash__body" scrollY enableFlex>
        {!words.length ? <View className="flash__state"><Text>暂无复习单词</Text></View> : <View className="flash__list">
          {words.map((word, index) => (
            <View key={word.id} className={`flash__card ${word.scissorCount === 1 ? 'flash__card--retry' : ''} ${word.scissorCount === 2 ? 'flash__card--mastered' : ''}`}>
              <View className="flash__card-head" onClick={() => { setWords((prev) => prev.map((item) => item.id === word.id ? { ...item, revealed: !item.revealed, heard: true } : { ...item, revealed: false, heard: false })); if (!word.revealed) play(word) }}>
                <Text className="flash__index">{index + 1}</Text><Text className="flash__word">{word.word}</Text>
                {word.audioUrl ? <View className="flash__audio" onClick={(event) => { event.stopPropagation(); play(word) }}><VolumeMax size={18} color={playingId === word.id ? color.primary : color.mutedForeground} /></View> : null}
              </View>
              <View className="flash__meaning">{word.revealed ? <><Text className="flash__phonetic">{word.phonetic}</Text><Text className="flash__translation">{word.translation || '暂无释义'}</Text></> : <Text className="flash__hint">点击查看释义</Text>}</View>
              <View className="flash__actions"><View className={`flash__action flash__action--retry ${word.scissorCount === 1 ? 'flash__action--active' : ''}`} onClick={() => mark(word.id, 1)}><Close size={18} color={word.scissorCount === 1 ? '#fff' : color.wrong} /><Text>不熟</Text></View><View className={`flash__action flash__action--mastered ${word.scissorCount === 2 ? 'flash__action--active' : ''}`} onClick={() => mark(word.id, 2)}><Check size={18} color={word.scissorCount === 2 ? '#fff' : color.success} /><Text>掌握</Text></View></View>
              {playingId === word.id ? <Text className="flash__playing">播放中...</Text> : null}
            </View>
          ))}
        </View>}
        <View style={{ height: '140rpx' }} />
      </ScrollView>
      <View className="flash__bottom"><View className={`flash__btn ${allMastered ? 'flash__btn--primary' : 'flash__btn--disabled'}`} onClick={complete}><Text>{allMastered ? (isRetryMode ? '返回检测' : '完成复习') : allCut ? '正在重新复习不熟单词…' : `还需标记 ${words.length - answered} 个`}</Text></View></View>
      <PracticePauseMenu open={paused} onResume={() => setPaused(false)} onClose={() => setPaused(false)} />
    </View>
  )
}
