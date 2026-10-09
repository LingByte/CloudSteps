/**
 * 听音辨义 — 对齐 web/src/pages/ListenIdentify.tsx。
 * 点击卡片播放发音，再次点击显示释义，第三次可重新作答。
 */
import { useEffect, useMemo, useState } from 'react'
import { View, Text, ScrollView } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { ArrowLeft, Notice, Check } from '@nutui/icons-react-taro'
import { resolveMediaUrl } from '../../utils/mediaUrl'
import { PracticePauseMenu } from '../../components/practice-pause-menu/PracticePauseMenu'
import { color } from '../../styles/tokens'
import './index.scss'

type ListenWord = { id: number; word: string; phonetic?: string; translation?: string; audioUrl?: string; state: 'idle' | 'played' | 'revealed' }

function getMode() {
  return Taro.getStorageSync('lb_mode') === 'review' ? 'review' : 'study'
}

function wordsKey(mode = getMode()) {
  return mode === 'review' ? 'lb_review_words' : 'lb_study_words'
}

function batchKey(mode = getMode()) {
  return mode === 'review' ? 'lb_review_batch_idx' : 'lb_study_batch_idx'
}

function readWords(): ListenWord[] {
  const mode = getMode()
  const raw = Taro.getStorageSync(wordsKey(mode)) || '[]'
  try {
    const all = JSON.parse(raw) as Array<Record<string, unknown>>
    const batch = Number(Taro.getStorageSync(batchKey(mode)) || 0)
    return all.slice(batch * 5, batch * 5 + 5).map((w) => ({
      id: Number(w.id),
      word: String(w.word || ''),
      phonetic: String(w.phonetic || w.phoneticUs || w.phoneticUk || ''),
      translation: String(w.translation || ''),
      audioUrl: String(w.audioUrl || ''),
      state: 'idle',
    }))
  } catch { return [] }
}

export default function ListenIdentify() {
  const mode = getMode()
  const [words, setWords] = useState<ListenWord[]>(readWords)
  const [playingId, setPlayingId] = useState<number | null>(null)
  const [paused, setPaused] = useState(false)
  const batchIdx = useMemo(() => Number(Taro.getStorageSync(batchKey(mode)) || 0), [mode])
  const allRevealed = words.length > 0 && words.every((word) => word.state === 'revealed')

  useEffect(() => () => {}, [])

  const play = (word: ListenWord) => {
    const url = resolveMediaUrl(String(word.audioUrl || '').split(';')[0])
    if (!url) { Taro.showToast({ title: '暂无发音', icon: 'none' }); return }
    const audio = Taro.createInnerAudioContext()
    setPlayingId(word.id)
    audio.src = url
    audio.autoplay = true
    audio.onEnded(() => { setPlayingId(null); audio.destroy() })
    audio.onError(() => { setPlayingId(null); audio.destroy() })
  }

  const tap = (word: ListenWord) => {
    if (word.state === 'idle') play(word)
    setWords((prev) => prev.map((w) => w.id === word.id ? { ...w, state: w.state === 'idle' ? 'played' : w.state === 'played' ? 'revealed' : 'idle' } : w))
  }

  const handleBack = () => setPaused(true)

  return (
    <View className="listen">
      <View className="listen__navbar"><View className="listen__nav-btn" onClick={handleBack}><ArrowLeft size={22} color={color.charcoal} /></View><View className="listen__nav-center"><Text className="listen__nav-title">听音辨义</Text><Text className="listen__nav-sub">第 {batchIdx + 1} 批 · 播放后点击卡片查看答案</Text></View><View className="listen__nav-btn" /></View>
      <ScrollView className="listen__body" scrollY enableFlex>
        {words.length === 0 ? <View className="listen__state"><Text>暂无练习单词</Text></View> : <View className="listen__list">{words.map((w, i) => <View key={w.id} className="listen__card" onClick={() => tap(w)}><View className={`listen__icon ${w.state !== 'idle' ? 'listen__icon--active' : ''}`}>{w.state === 'revealed' ? <Check size={22} color="#fff" /> : <Notice size={22} color={w.state === 'played' ? '#fff' : color.mutedForeground} />}</View><View className="listen__info"><Text className="listen__index">第 {i + 1} 题</Text>{w.state === 'revealed' ? <><Text className="listen__word">{w.word}</Text><Text className="listen__phonetic">{w.phonetic}</Text><Text className="listen__translation">{w.translation || '暂无释义'}</Text></> : <Text className="listen__hint">{w.state === 'idle' ? '点击播放发音' : '再次点击显示答案'}</Text>}</View></View>)}</View>}
        <View style={{ height: '48rpx' }} />
      </ScrollView>
      {playingId !== null && <View className="listen__playing"><Text>播放中...</Text></View>}
      <View className="listen__bottom"><View className={`listen__next ${allRevealed ? 'listen__next--active' : ''}`} onClick={() => allRevealed && Taro.navigateTo({ url: '/pages/flash-review/index' })}><Text>{allRevealed ? '进入快闪复习' : `请完成 ${words.filter((word) => word.state === 'revealed').length}/${words.length} 题`}</Text></View></View>
      <PracticePauseMenu open={paused} onResume={() => setPaused(false)} onClose={() => setPaused(false)} />
    </View>
  )
}
