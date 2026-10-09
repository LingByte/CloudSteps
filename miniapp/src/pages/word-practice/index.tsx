import { useEffect, useMemo, useRef, useState } from 'react'
import { View, Text, ScrollView } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { ArrowLeft, ArrowRight, VolumeMax } from '@nutui/icons-react-taro'
import type { StudyWordItem } from '../../api/study'
import { resolveMediaUrl } from '../../utils/mediaUrl'
import { buildWordPracticeSequence } from '../../utils/wordPracticeSequence'
import { getPracticeTapState } from '../../utils/wordReveal'
import { WordDetailPanel } from '../../components/word-detail-panel/WordDetailPanel'
import { PracticeFontSettingsButton } from '../../components/practice-font-settings/PracticeFontSettings'
import { PracticePauseMenu } from '../../components/practice-pause-menu/PracticePauseMenu'
import { StudyNoteLauncher, StudyNotePanel } from '../../components/study-note-panel/StudyNotePanel'
import { AnnotationLayer } from '../../components/annotation-layer/AnnotationLayer'
import { color } from '../../styles/tokens'
import './index.scss'

type PracticeWord = StudyWordItem & {
  phonetic?: string
  translation?: string
  translationShort?: string
  audioUrl?: string
  count: number
  showTranslation: boolean
  heard: boolean
}

type ViewMode = 'list' | 'card'
const BATCH_SIZE = 5

function formatTranslation(raw?: string | null): string {
  if (!raw) return ''
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) return parsed.map((item) => String(item ?? '').trim()).filter(Boolean).join('；')
    return String(parsed)
  } catch {
    return raw
  }
}

function formatTranslationShort(raw?: string | null): string {
  const full = formatTranslation(raw)
  if (!full) return ''
  return full
    .split(/[；;\n]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => item.split(/[；;，,]/)[0]?.trim() || item)
    .join('；')
}

function pickPhonetic(w: StudyWordItem): string {
  const value = w.phoneticUk || w.phoneticUs || w.phonetic || ''
  return value ? `/${String(value).replace(/^\[|\]$/g, '').replace(/^\//, '').replace(/\/$/, '')}/` : ''
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

function readAllWords(mode = getMode()): StudyWordItem[] {
  try {
    const parsed = JSON.parse(Taro.getStorageSync(wordsKey(mode)) || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function toPracticeWord(word: StudyWordItem): PracticeWord {
  const translation = formatTranslation(word.translation)
  return {
    ...word,
    translation,
    translationShort: formatTranslationShort(word.translationShort || word.translation),
    phonetic: pickPhonetic(word),
    count: 0,
    showTranslation: false,
    heard: false,
  }
}

function shuffleWords<T>(items: T[]): T[] {
  const next = [...items]
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[next[i], next[j]] = [next[j], next[i]]
  }
  return next
}

function readWords(): PracticeWord[] {
  const mode = getMode()
  const batchIdx = Number(Taro.getStorageSync(batchKey(mode)) || 0)
  const all = readAllWords(mode)
  return shuffleWords(all.slice(batchIdx * BATCH_SIZE, batchIdx * BATCH_SIZE + BATCH_SIZE)).map(toPracticeWord)
}

function parseAudioUrls(raw?: string): string[] {
  return String(raw || '').split(/[;\n]/).map((item) => item.trim()).filter(Boolean).slice(0, 2)
}

export default function WordPractice() {
  const mode = getMode()
  const batchIdx = Number(Taro.getStorageSync(batchKey(mode)) || 0)
  const allWords = useMemo(() => readAllWords(mode), [mode])
  const totalBatches = mode === 'review'
    ? Math.max(1, Math.ceil(allWords.length / BATCH_SIZE))
    : Number(Taro.getStorageSync('lb_study_total_batches') || 0) || Math.max(1, Math.ceil(allWords.length / BATCH_SIZE))

  const [words, setWords] = useState<PracticeWord[]>(readWords)
  const [manualReadMode, setManualReadMode] = useState(false)
  const [annotationOpen, setAnnotationOpen] = useState(false)
  const [frameIdx, setFrameIdx] = useState(0)
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
  const [playingId, setPlayingId] = useState<number | null>(null)
  const [detailMode, setDetailMode] = useState(false)
  const [detailWord, setDetailWord] = useState<PracticeWord | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [cardIndex, setCardIndex] = useState(0)
  const [fullMeaning, setFullMeaning] = useState(false)
  const [paused, setPaused] = useState(false)
  const [noteOpen, setNoteOpen] = useState(false)
  const [noteKey, setNoteKey] = useState('study-note:global')
  const [noteTitle, setNoteTitle] = useState('学习笔记')
  const [audioIndexMap, setAudioIndexMap] = useState<Map<number, number>>(new Map())
  const lastTappedIndexRef = useRef<number | null>(null)
  const audioRef = useRef<Taro.InnerAudioContext | null>(null)

  const sequence = useMemo(() => buildWordPracticeSequence(words.length), [words.length])
  const activeIndex = sequence.length > 0 ? sequence[Math.min(frameIdx, sequence.length - 1)] : -1
  const cardWord = words[Math.min(Math.max(0, cardIndex), Math.max(0, words.length - 1))]
  const progress = sequence.length ? Math.min(100, (frameIdx / sequence.length) * 100) : 0

  useEffect(() => () => { audioRef.current?.destroy() }, [])
  useEffect(() => {
    if (mode !== 'study') return
    Taro.setStorageSync('lb_study_all_words', JSON.stringify(allWords))
  }, [allWords, mode])

  const playAudioAt = (word: PracticeWord, index: number) => {
    const urls = parseAudioUrls(word.audioUrl)
    const src = resolveMediaUrl(urls[index] || urls[0] || '')
    if (!src) {
      Taro.showToast({ title: '暂无发音', icon: 'none' })
      return
    }
    audioRef.current?.stop()
    const audio = Taro.createInnerAudioContext()
    audio.src = src
    audio.autoplay = true
    audio.onEnded(() => { setPlayingId(null); audio.destroy() })
    audio.onError(() => { setPlayingId(null); audio.destroy() })
    audioRef.current = audio
    setPlayingId(word.id)
  }

  const handlePlayNextAudio = (word: PracticeWord) => {
    const urls = parseAudioUrls(word.audioUrl)
    if (!urls.length) return
    const prev = audioIndexMap.get(word.id) ?? 0
    const index = prev % urls.length
    playAudioAt(word, index)
    const next = prev >= urls.length ? 1 : prev + 1
    setAudioIndexMap(new Map(audioIndexMap).set(word.id, next))
  }

  const handleWordTap = (index: number) => {
    const word = words[index]
    if (!word) return
    if (manualReadMode) {
      setSelectedIndex(index)
      return
    }
    const followsGuide = index === activeIndex
    const isContinuation = lastTappedIndexRef.current === index
    const next = getPracticeTapState(index, lastTappedIndexRef.current, word)
    lastTappedIndexRef.current = index
    if (next.shouldPlay) playAudioAt(word, 0)
    setSelectedIndex(index)
    setWords((prev) => prev.map((item, itemIndex) => {
      if (itemIndex === index) {
        return {
          ...item,
          heard: next.heard,
          showTranslation: next.showTranslation,
          count: followsGuide ? (item.count + 1) % 4 : item.count,
        }
      }
      if (!isContinuation) return { ...item, heard: false, showTranslation: false }
      return next.showTranslation ? { ...item, showTranslation: false } : item
    }))
    setDetailWord(detailMode && next.showTranslation ? { ...word, showTranslation: true, heard: next.heard } : null)
    if (followsGuide && frameIdx < sequence.length - 1) setFrameIdx((value) => value + 1)
  }

  const handleShuffle = () => {
    setWords((prev) => shuffleWords(prev))
    setSelectedIndex(null)
    lastTappedIndexRef.current = null
    setCardIndex(0)
    setFrameIdx(0)
    setDetailWord(null)
  }

  const toggleManualRead = () => {
    setManualReadMode((enabled) => !enabled)
    setSelectedIndex(null)
    lastTappedIndexRef.current = null
    setDetailWord(null)
    setWords((prev) => prev.map((word) => ({ ...word, showTranslation: false, heard: false })))
  }

  const toggleDetailMode = () => {
    setDetailMode((enabled) => {
      const next = !enabled
      if (!next) {
        setDetailWord(null)
        return next
      }
      const targetIndex = viewMode === 'card' ? cardIndex : (selectedIndex ?? activeIndex)
      if (targetIndex >= 0 && words[targetIndex]) {
        setWords((prev) => prev.map((word, index) => index === targetIndex ? { ...word, showTranslation: true } : word))
        setDetailWord(words[targetIndex])
      }
      return next
    })
  }

  const openGlobalNote = () => {
    setNoteKey('study-note:global')
    setNoteTitle('学习笔记')
    setNoteOpen(true)
  }

  const openWordNote = (word: PracticeWord) => {
    const wordBookId = Taro.getStorageSync(mode === 'review' ? 'lb_review_wordbook_id' : 'lb_wordbook_id') || '0'
    setNoteKey(`study-note:word:${wordBookId}:${word.id}`)
    setNoteTitle(`${word.word} 的笔记`)
    setNoteOpen(true)
  }

  const meaningText = (word: PracticeWord) => fullMeaning ? word.translation || word.translationShort || '' : word.translationShort || word.translation || ''

  const renderReveal = (word: PracticeWord) => {
    if (!word.showTranslation) return null
    return (
      <View className="wp__word-detail">
        {word.phonetic ? <Text className="wp__word-phonetic">{word.phonetic}</Text> : null}
        {meaningText(word) ? <Text className="wp__word-trans">{meaningText(word)}</Text> : null}
        {(word.translation || word.translationShort) ? (
          <View className="wp__meaning-toggle" onClick={(event) => { event.stopPropagation(); setFullMeaning((value) => !value) }}>
            <Text>{fullMeaning ? '简译' : '全部意思'}</Text>
          </View>
        ) : null}
      </View>
    )
  }

  const renderWordCard = (word: PracticeWord, index: number) => {
    const selected = selectedIndex === index
    const audioUrls = parseAudioUrls(word.audioUrl)
    return (
      <View key={word.id} className={`wp__word-card ${selected ? 'wp__word-card--selected' : ''}`}>
        {!manualReadMode && activeIndex === index ? <Text className="wp__next-mark">→</Text> : null}
        <View className="wp__word-header" onClick={() => handleWordTap(index)}>
          <Text className="wp__word-seq">{batchIdx * BATCH_SIZE + index + 1}</Text>
          <Text className="wp__word-text">{word.word}</Text>
          {!manualReadMode && audioUrls.length ? (
            <View className="wp__audio" onClick={(event) => { event.stopPropagation(); handlePlayNextAudio(word) }}>
              <VolumeMax size={18} color={playingId === word.id ? color.primary : color.mutedForeground} />
              <Text className="wp__audio-index">{audioIndexMap.get(word.id) ?? 0}</Text>
            </View>
          ) : null}
        </View>
        {renderReveal(word) || <Text className="wp__flip-hint">{manualReadMode ? '人工带读模式' : '点击单词听音，再点查看释义'}</Text>}
        <View className="wp__word-actions">
          <View className="wp__detail-btn" onClick={() => openWordNote(word)}><Text>笔记</Text></View>
          {detailMode ? <View className="wp__detail-btn" onClick={() => setDetailWord(word)}><Text>拓展</Text></View> : null}
        </View>
      </View>
    )
  }

  const handleBack = () => setPaused(true)
  const handleNext = () => Taro.navigateTo({ url: '/pages/listen-identify/index' })

  if (!words.length) {
    return <View className="wp"><View className="wp__navbar"><View className="wp__nav-btn" onClick={handleBack}><ArrowLeft size={22} color={color.charcoal} /></View><Text className="wp__nav-title">{mode === 'review' ? '复习练习' : '单词练习'}</Text><View className="wp__nav-btn" /></View><View className="wp__empty"><Text className="wp__empty-text">没有需要练习的单词</Text></View></View>
  }

  return (
    <View className="wp">
      <View className="wp__navbar">
        <View className="wp__nav-btn" onClick={handleBack}><ArrowLeft size={22} color={color.charcoal} /></View>
        <View className="wp__nav-center"><Text className="wp__nav-title">{mode === 'review' ? '复习练习' : '单词练习'}</Text><Text className="wp__nav-sub">第 {batchIdx + 1} / {totalBatches} 批</Text></View>
        <View className="wp__nav-tools"><StudyNoteLauncher onClick={openGlobalNote} /><View className="wp__annotation-trigger" onClick={() => setAnnotationOpen(true)}><Text>标注</Text></View><PracticeFontSettingsButton /></View>
      </View>
      <View className="wp__progress-bar"><View className="wp__progress-fill" style={{ width: `${progress}%` }} /></View>
      <ScrollView className="wp__body" scrollY enableFlex>
        {viewMode === 'card' && cardWord ? (
          <View className="wp__card-mode">
            <View className={`wp__big-card ${selectedIndex === cardIndex ? 'wp__big-card--selected' : ''}`}>
              <Text className="wp__card-count">{cardIndex + 1} / {words.length}</Text>
              <View className="wp__card-main" onClick={() => handleWordTap(cardIndex)}>
                <Text className="wp__card-word">{cardWord.word}</Text>
                {renderReveal(cardWord)}
              </View>
              <View className="wp__card-actions">
                <View className="wp__card-nav" onClick={() => setCardIndex((value) => Math.max(0, value - 1))}><Text>上一张</Text></View>
                <View className="wp__detail-btn" onClick={() => openWordNote(cardWord)}><Text>笔记</Text></View>
                {!manualReadMode && parseAudioUrls(cardWord.audioUrl).length ? <View className="wp__detail-btn" onClick={() => handlePlayNextAudio(cardWord)}><Text>{`音频 ${audioIndexMap.get(cardWord.id) ?? 0}`}</Text></View> : null}
                <View className="wp__card-nav" onClick={() => setCardIndex((value) => Math.min(words.length - 1, value + 1))}><Text>下一张</Text></View>
              </View>
            </View>
          </View>
        ) : (
          <View className="wp__word-list">{words.map(renderWordCard)}</View>
        )}
        <View style={{ height: '140rpx' }} />
      </ScrollView>
      <View className="wp__bottom-bar">
        <View className="wp__tool-row">
          <View className={`wp__tool ${viewMode === 'list' ? 'wp__tool--active' : ''}`} onClick={() => setViewMode('list')}><Text>列表</Text></View>
          <View className={`wp__tool ${viewMode === 'card' ? 'wp__tool--active' : ''}`} onClick={() => setViewMode('card')}><Text>卡片</Text></View>
          <View className="wp__tool" onClick={handleShuffle}><Text>洗牌</Text></View>
          <View className={`wp__tool ${manualReadMode ? 'wp__tool--active' : ''}`} onClick={toggleManualRead}><Text>带读</Text></View>
          <View className={`wp__tool ${detailMode ? 'wp__tool--active' : ''}`} onClick={toggleDetailMode}><Text>拓展</Text></View>
          <View className="wp__next-btn" onClick={handleNext}><ArrowRight size={20} color="#ffffff" /></View>
        </View>
      </View>
      {detailWord ? <WordDetailPanel wordId={detailWord.id} wordText={detailWord.word} fallbackTranslation={meaningText(detailWord)} onClose={() => setDetailWord(null)} /> : null}
      <PracticePauseMenu open={paused} onResume={() => setPaused(false)} onClose={() => setPaused(false)} />
      <StudyNotePanel open={noteOpen} storageKey={noteKey} title={noteTitle} onClose={() => setNoteOpen(false)} />
      <AnnotationLayer open={annotationOpen} storageKey="annotation:word-practice" onClose={() => setAnnotationOpen(false)} />
    </View>
  )
}
