import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { ScrollView, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { Close, VolumeMax } from '@nutui/icons-react-taro'
import { getWordDetail, type WordDetail } from '../../api/wordbooks'
import { resolveMediaUrl } from '../../utils/mediaUrl'
import { color } from '../../styles/tokens'
import './word-detail-panel.scss'

type Props = {
  wordId: number
  wordText?: string
  fallbackTranslation?: string
  onClose: () => void
}

function parseList(raw?: string): string[] {
  if (!raw) return []
  try {
    const value = JSON.parse(raw)
    if (Array.isArray(value)) return value.map((item) => typeof item === 'string' ? item : JSON.stringify(item)).filter(Boolean)
  } catch { /* plain text */ }
  return raw.split(/[\n；;]/).map((item) => item.trim()).filter(Boolean)
}

export function WordDetailPanel({ wordId, wordText, fallbackTranslation, onClose }: Props) {
  const [detail, setDetail] = useState<WordDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [playing, setPlaying] = useState(false)

  useEffect(() => {
    let mounted = true
    setLoading(true)
    setError(false)
    getWordDetail(wordId).then((res) => {
      if (!mounted) return
      if (res.code === 200 && res.data) setDetail(res.data)
      else setError(true)
      setLoading(false)
    }, () => {
      if (mounted) { setError(true); setLoading(false) }
    })
    return () => { mounted = false }
  }, [wordId])

  const examples = useMemo(() => parseList(detail?.exampleSentences), [detail?.exampleSentences])
  const phrases = useMemo(() => parseList(detail?.collocations), [detail?.collocations])
  const synonyms = useMemo(() => parseList(detail?.synonyms), [detail?.synonyms])
  const antonyms = useMemo(() => parseList(detail?.antonyms), [detail?.antonyms])

  const play = () => {
    const src = resolveMediaUrl(String(detail?.audioUrl || '').split(';')[0]?.trim())
    if (!src) { Taro.showToast({ title: '暂无发音', icon: 'none' }); return }
    const audio = Taro.createInnerAudioContext()
    audio.src = src
    audio.autoplay = true
    audio.onEnded(() => { setPlaying(false); audio.destroy() })
    audio.onError(() => { setPlaying(false); audio.destroy() })
    setPlaying(true)
  }

  return (
    <View className="word-detail-panel__mask" onClick={onClose}>
      <View className="word-detail-panel" onClick={(event) => event.stopPropagation()}>
        <View className="word-detail-panel__header"><View><Text className="word-detail-panel__word">{detail?.word || wordText || '单词'}</Text><Text className="word-detail-panel__phonetic">{detail?.phoneticUk || detail?.phoneticUs || detail?.phonetic || ''}</Text></View><View className="word-detail-panel__close" onClick={onClose}><Close size={20} color={color.mutedForeground} /></View></View>
        {loading ? <View className="word-detail-panel__state"><Text>加载详情中...</Text></View> : error ? <View className="word-detail-panel__state"><Text>详情加载失败</Text></View> : <ScrollView className="word-detail-panel__body" scrollY>
          <View className="word-detail-panel__toolbar"><Text className="word-detail-panel__pos">{detail?.partOfSpeech || '词汇'}</Text><View className="word-detail-panel__audio" onClick={play}><VolumeMax size={18} color={playing ? color.primary : color.secondaryBrand} /><Text>{playing ? '播放中' : '朗读'}</Text></View></View>
          <DetailSection title="释义"><Text className="word-detail-panel__text">{detail?.translation || fallbackTranslation || '暂无释义'}</Text></DetailSection>
          {detail?.definition ? <DetailSection title="定义"><Text className="word-detail-panel__text">{detail.definition}</Text></DetailSection> : null}
          {examples.length ? <DetailSection title="例句">{examples.map((item, index) => <Text key={index} className="word-detail-panel__line">{item}</Text>)}</DetailSection> : null}
          {phrases.length ? <DetailSection title="搭配">{phrases.map((item, index) => <Text key={index} className="word-detail-panel__line">{item}</Text>)}</DetailSection> : null}
          {synonyms.length ? <DetailSection title="近义词"><Text className="word-detail-panel__text">{synonyms.join('；')}</Text></DetailSection> : null}
          {antonyms.length ? <DetailSection title="反义词"><Text className="word-detail-panel__text">{antonyms.join('；')}</Text></DetailSection> : null}
          {detail?.usageNotes ? <DetailSection title="用法说明"><Text className="word-detail-panel__text">{detail.usageNotes}</Text></DetailSection> : null}
          {detail?.mnemonic ? <DetailSection title="记忆提示"><Text className="word-detail-panel__text">{detail.mnemonic}</Text></DetailSection> : null}
        </ScrollView>}
      </View>
    </View>
  )
}

function DetailSection({ title, children }: { title: string; children: ReactNode }) {
  return <View className="word-detail-panel__section"><Text className="word-detail-panel__section-title">{title}</Text>{children}</View>
}
