import { useEffect, useState, useRef } from 'react'
import { View, Text, ScrollView } from '@tarojs/components'
import Taro, { getCurrentInstance } from '@tarojs/taro'
import { ArrowLeft, VolumeMax } from '@nutui/icons-react-taro'
import { getLighthouseWords, type StudyWordItem } from '../../api/study'
import { getTrainingStudent } from '../../utils/trainingStudent'
import { resolveMediaUrl } from '../../utils/mediaUrl'
import { color } from '../../styles/tokens'
import './index.scss'

function formatTranslation(raw?: string): string {
  if (!raw) return ''
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) return parsed.filter(Boolean).join('；')
    if (typeof parsed === 'string') return parsed
  } catch { /* not JSON */ }
  return raw
}

const STEP_LABELS: Record<string, string> = { today: '今日', pending: '待复习', mastered: '已掌握', '01': '第 1 阶段', '02': '第 2 阶段', '03': '第 3 阶段', '04': '第 4 阶段', '05': '第 5 阶段', '06': '第 6 阶段', '07': '第 7 阶段' }

export default function LighthouseWords() {
  const params = getCurrentInstance().router?.params || {}
  const wordBookId = Number(params.wordBookId || params.id)
  const step = String(params.step || params.stage || '02')
  const studentId = Number(params.studentId || getTrainingStudent()?.id || 0)
  const [words, setWords] = useState<StudyWordItem[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [revealed, setRevealed] = useState<Set<number>>(new Set())
  const [playingId, setPlayingId] = useState<number | null>(null)
  const audioRef = useRef<Taro.InnerAudioContext | null>(null)

  useEffect(() => {
    let mounted = true
    if (!wordBookId) { setErr('缺少词库信息'); setLoading(false); return () => { mounted = false } }
    ;(async () => {
      try {
        const res = await getLighthouseWords(wordBookId, step, 1, 200, studentId > 0 ? { studentId } : undefined)
        if (!mounted) return
        if (res.code !== 200) { setErr(res.msg || '加载失败'); return }
        setWords(Array.isArray(res.data?.words) ? res.data.words : [])
      } catch (e: any) {
        if (mounted) setErr(e?.msg || '加载失败')
      } finally {
        if (mounted) setLoading(false)
      }
    })()
    return () => { mounted = false; audioRef.current?.destroy() }
  }, [wordBookId, step, studentId])

  const play = (word: StudyWordItem) => {
    const src = resolveMediaUrl(String(word.audioUrl || '').split(';')[0]?.trim())
    if (!src) { Taro.showToast({ title: '暂无发音', icon: 'none' }); return }
    audioRef.current?.stop()
    const audio = Taro.createInnerAudioContext()
    audio.src = src
    audio.autoplay = true
    audio.onEnded(() => setPlayingId(null))
    audio.onError(() => setPlayingId(null))
    audioRef.current = audio
    setPlayingId(word.id)
  }

  const toggle = (word: StudyWordItem) => {
    setRevealed((prev) => { const next = new Set(prev); if (next.has(word.id)) next.delete(word.id); else next.add(word.id); return next })
    if (!revealed.has(word.id) && word.audioUrl) play(word)
  }

  return (
    <View className="lhw">
      <View className="lhw__navbar">
        <View className="lhw__nav-btn" onClick={() => Taro.navigateBack()}><ArrowLeft size={22} color={color.charcoal} /></View>
        <View className="lhw__nav-center"><Text className="lhw__nav-title">灯塔词汇</Text><Text className="lhw__nav-sub">{STEP_LABELS[step] || step} · 共 {words.length} 词</Text></View>
        <View className="lhw__nav-btn" />
      </View>
      <ScrollView className="lhw__body" scrollY enableFlex>
        {loading ? <View className="lhw__state"><Text>加载中...</Text></View> : err ? <View className="lhw__state"><Text>{err}</Text></View> : words.length === 0 ? <View className="lhw__state"><Text>该阶段暂无词汇</Text></View> : (
          <View className="lhw__list">
            {words.map((word, index) => {
              const show = revealed.has(word.id)
              return <View key={word.id} className="lhw__card" onClick={() => toggle(word)}><Text className="lhw__index">{index + 1}</Text><View className="lhw__info"><Text className="lhw__word">{word.word}</Text>{show ? <><Text className="lhw__phonetic">{word.phonetic || word.phoneticUs || word.phoneticUk || ''}</Text><Text className="lhw__translation">{formatTranslation(word.translation) || '暂无释义'}</Text></> : <Text className="lhw__hint">点击查看释义</Text>}</View>{word.audioUrl ? <View className="lhw__audio" onClick={(event) => { event.stopPropagation(); play(word) }}><VolumeMax size={18} color={playingId === word.id ? color.primary : color.secondaryBrand} /></View> : null}</View>
            })}
          </View>
        )}
        <View style={{ height: '48rpx' }} />
      </ScrollView>
    </View>
  )
}
