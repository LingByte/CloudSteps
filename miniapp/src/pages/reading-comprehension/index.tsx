/**
 * 阅读理解页 — 对齐 web/src/pages/ReadingComprehension.tsx。
 * 阶段:列表 → 听读 → 初答 → 选词 → 细学 → 再答 → 知识点 → 完成。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Input, ScrollView, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { ArrowLeft, Plus, Search } from '@nutui/icons-react-taro'
import {
  checkCustomReadingAnswer,
  checkReadingAnswer,
  getCustomReadingAnalysis,
  getCustomReadingKnowledge,
  getCustomReadingPassage,
  getReadingAnalysis,
  getReadingKnowledge,
  getReadingPassage,
  listCustomReadingPassages,
  listReadingPassages,
  listReadingTags,
  submitCustomReadingPassage,
  submitReadingPassage,
  type ReadingOption,
  type ReadingPassageDetail,
  type ReadingPassageListItem,
  type ReadingSubmitResult,
} from '../../api/reading'
import { synthesizeTts } from '../../api/tts'
import { enrichCustomWordBookWords, type CustomParsedWord } from '../../api/wordbooks'
import { resolveMediaUrl } from '../../utils/mediaUrl'
import { beginReviewPractice } from '../../utils/reviewPractice'
import { AnnotationLayer } from '../../components/annotation-layer/AnnotationLayer'
import { PracticeFontSettingsButton } from '../../components/practice-font-settings/PracticeFontSettings'
import { color } from '../../styles/tokens'
import './index.scss'

type Phase = 'list' | 'listen' | 'practice' | 'words' | 'study' | 'reanswer' | 'knowledge'
type SourceTab = 'system' | 'custom'
type LevelFilter = '' | '初阶' | '中阶' | '高阶'
type ReadingStageId = 'listen' | 'answer' | 'words' | 'study' | 'reanswer' | 'knowledge' | 'done' | 'analysis'
type PassageItem = ReadingPassageListItem & { isCustom?: boolean }
type QuestionFeedback = { correct: boolean; rightAnswer: string; explanation?: string }
type ReadingWordPreview = { word: string; key: string; phonetic?: string; translation?: string }
type ReadingStudyItem = {
  id: string
  sentence: string
  translation: string
  components: Array<{ label: string; text: string }>
  keyPhrases: Array<{ text: string; explanation: string }>
}
type ReadingKnowledgeItem = { kind: 'point'; id: string; title: string; body: string; tag?: string }
type ReadingToken = { type: 'word' | 'other'; value: string }
type ReadingSnapshot = {
  phase: Phase | 'analysis'
  sourceTab: SourceTab
  isCustomPassage: boolean
  passage: ReadingPassageDetail
  answers: Record<number, string>
  optionOrder: Record<number, string[]>
  firstResult: ReadingSubmitResult | null
  secondResult: ReadingSubmitResult | null
  questionIndex: number
  maxStageIdx: number
  pickedWords: ReadingWordPreview[]
  startedAt: number
}

const LEVELS: LevelFilter[] = ['', '初阶', '中阶', '高阶']
const LIST_PAGE_SIZE = 10
const READING_SNAPSHOT_KEY = 'lb_reading_session'
const READING_STAGE_ORDER: ReadingStageId[] = ['listen', 'answer', 'words', 'study', 'reanswer', 'knowledge', 'done']
const STAGE_DEFS: Array<{ id: ReadingStageId; label: string; mark: string }> = [
  { id: 'listen', label: '听读', mark: '听' },
  { id: 'answer', label: '初答', mark: '答' },
  { id: 'words', label: '选词', mark: '词' },
  { id: 'study', label: '细学', mark: '学' },
  { id: 'reanswer', label: '再答', mark: '再' },
  { id: 'knowledge', label: '知识点', mark: '知' },
  { id: 'done', label: '完成', mark: '完' },
]

function phaseToStage(phase: Phase): ReadingStageId {
  if (phase === 'practice') return 'answer'
  if (phase === 'words') return 'words'
  if (phase === 'study') return 'study'
  if (phase === 'reanswer') return 'reanswer'
  if (phase === 'knowledge') return 'knowledge'
  return 'listen'
}

function splitReadingParagraphs(content: string): string[] {
  const normalized = String(content || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim()
  if (!normalized) return []
  if (/\n\s*\n/.test(normalized)) return normalized.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)
  return normalized.split(/\n/).map((p) => p.trim()).filter(Boolean)
}

function tokenizeReadingText(text: string): ReadingToken[] {
  const tokens: ReadingToken[] = []
  const re = /[A-Za-z]+(?:['’-][A-Za-z]+)*|[^A-Za-z]+/g
  let match: RegExpExecArray | null
  while ((match = re.exec(String(text || ''))) !== null) {
    tokens.push({ type: /^[A-Za-z]/.test(match[0]) ? 'word' : 'other', value: match[0] })
  }
  return tokens
}

function normalizeReadingWord(word: string): string {
  return String(word || '').trim().toLowerCase().replace(/^[^\p{L}]+|[^\p{L}]+$/gu, '')
}

function shuffleKeys(keys: string[]): string[] {
  const next = [...keys]
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    const tmp = next[i]
    next[i] = next[j]
    next[j] = tmp
  }
  return next
}

function stableReadingWordId(word: string): number {
  let h = 2166136261
  for (let i = 0; i < word.length; i += 1) {
    h ^= word.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0) % 1000000000 + 1
}

function orderedOptions(options: ReadingOption[] | undefined, order?: string[]): ReadingOption[] {
  const list = options || []
  if (!order?.length) return list
  const byKey = new Map(list.map((option) => [option.key, option]))
  const ordered = order.map((key) => byKey.get(key)).filter(Boolean) as ReadingOption[]
  return [...ordered, ...list.filter((option) => !order.includes(option.key))]
}

export default function ReadingComprehension() {
  const [phase, setPhase] = useState<Phase>('list')
  const [sourceTab, setSourceTab] = useState<SourceTab>('system')
  const [levelFilter, setLevelFilter] = useState<LevelFilter>('')
  const [tagFilter, setTagFilter] = useState('')
  const [availableTags, setAvailableTags] = useState<string[]>([])
  const [searchInput, setSearchInput] = useState('')
  const [keyword, setKeyword] = useState('')
  const [loadingList, setLoadingList] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [listTotal, setListTotal] = useState(0)
  const [loadingPassage, setLoadingPassage] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [sessionReady, setSessionReady] = useState(false)

  const [passages, setPassages] = useState<PassageItem[]>([])
  const [passage, setPassage] = useState<ReadingPassageDetail | null>(null)
  const [isCustomPassage, setIsCustomPassage] = useState(false)
  const [answers, setAnswers] = useState<Record<number, string>>({})
  const [feedback, setFeedback] = useState<Record<number, QuestionFeedback>>({})
  const [optionOrder, setOptionOrder] = useState<Record<number, string[]>>({})
  const [firstResult, setFirstResult] = useState<ReadingSubmitResult | null>(null)
  const [secondResult, setSecondResult] = useState<ReadingSubmitResult | null>(null)
  const [questionIndex, setQuestionIndex] = useState(0)
  const [maxStageIdx, setMaxStageIdx] = useState(0)
  const [panelCollapsed, setPanelCollapsed] = useState(false)
  const [annotationOpen, setAnnotationOpen] = useState(false)

  const [activePara, setActivePara] = useState<number | null>(null)
  const [ttsKey, setTtsKey] = useState<string | null>(null)
  const [preview, setPreview] = useState<ReadingWordPreview | null>(null)
  const [pickedWords, setPickedWords] = useState<ReadingWordPreview[]>([])
  const [previewLoading, setPreviewLoading] = useState(false)
  const [drillLoading, setDrillLoading] = useState(false)
  const [studyItems, setStudyItems] = useState<ReadingStudyItem[]>([])
  const [studyLoading, setStudyLoading] = useState(false)
  const [openStudyId, setOpenStudyId] = useState<string | null>(null)
  const [knowledgeItems, setKnowledgeItems] = useState<ReadingKnowledgeItem[]>([])
  const [knowledgeLoading, setKnowledgeLoading] = useState(false)

  const audioRef = useRef<Taro.InnerAudioContext | null>(null)
  const startedAtRef = useRef(Date.now())
  const pageRef = useRef(1)
  const loadingListRef = useRef(false)
  const glossCacheRef = useRef<Record<string, CustomParsedWord>>({})
  const advanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearAdvanceTimer = useCallback(() => {
    if (advanceTimerRef.current) {
      clearTimeout(advanceTimerRef.current)
      advanceTimerRef.current = null
    }
  }, [])

  const stopPlayback = useCallback(() => {
    audioRef.current?.stop()
    audioRef.current?.destroy()
    audioRef.current = null
    setTtsKey(null)
    setActivePara(null)
  }, [])

  useEffect(() => () => {
    clearAdvanceTimer()
    audioRef.current?.destroy()
  }, [clearAdvanceTimer])

  useEffect(() => {
    const timer = setTimeout(() => setKeyword(searchInput.trim()), 350)
    return () => clearTimeout(timer)
  }, [searchInput])

  useEffect(() => {
    try {
      const snap = Taro.getStorageSync(READING_SNAPSHOT_KEY) as ReadingSnapshot | ''
      if (snap && typeof snap === 'object' && snap.passage) {
        const nextPhase = snap.phase === 'list' ? 'words' : snap.phase === 'analysis' ? 'reanswer' : snap.phase
        setPassage(snap.passage)
        setIsCustomPassage(Boolean(snap.isCustomPassage))
        setSourceTab(snap.sourceTab || 'system')
        setAnswers(snap.answers || {})
        setOptionOrder(snap.optionOrder || {})
        setFirstResult(snap.firstResult || null)
        setSecondResult(snap.secondResult || null)
        setQuestionIndex(snap.questionIndex || 0)
        setMaxStageIdx(snap.maxStageIdx || 0)
        setPickedWords(snap.pickedWords || [])
        startedAtRef.current = snap.startedAt || Date.now()
        setPhase(nextPhase)
      }
    } catch {
      // ignore invalid snapshot
    } finally {
      setSessionReady(true)
    }
  }, [])

  useEffect(() => {
    if (!sessionReady || !passage || phase === 'list') return
    const snap: ReadingSnapshot = {
      phase,
      sourceTab,
      isCustomPassage,
      passage,
      answers,
      optionOrder,
      firstResult,
      secondResult,
      questionIndex,
      maxStageIdx,
      pickedWords,
      startedAt: startedAtRef.current,
    }
    Taro.setStorageSync(READING_SNAPSHOT_KEY, snap)
  }, [sessionReady, phase, sourceTab, isCustomPassage, passage, answers, optionOrder, firstResult, secondResult, questionIndex, maxStageIdx, pickedWords])

  const loadList = useCallback(async (page = 1, reset = true) => {
    if (loadingListRef.current) return
    loadingListRef.current = true
    if (reset) {
      setLoadingList(true)
      setErr(null)
    } else {
      setLoadingMore(true)
    }
    try {
      const params = {
        page,
        pageSize: LIST_PAGE_SIZE,
        ...(levelFilter ? { level: levelFilter } : {}),
        ...(sourceTab === 'system' && tagFilter ? { tag: tagFilter } : {}),
        ...(keyword ? { keyword } : {}),
      }
      const res = sourceTab === 'custom'
        ? await listCustomReadingPassages(params)
        : await listReadingPassages(params)
      if (res.code !== 200) {
        setErr(res.msg || '加载失败')
        if (reset) setPassages([])
        return
      }
      const list = Array.isArray(res.data?.list) ? res.data.list : []
      const items = list.map((item) => ({ ...item, isCustom: sourceTab === 'custom' }))
      setPassages((prev) => (reset ? items : [...prev, ...items]))
      setListTotal(Number(res.data?.total || items.length))
      pageRef.current = page
    } catch (e: unknown) {
      const apiMsg = e && typeof e === 'object' && 'msg' in e ? String((e as { msg: string }).msg) : undefined
      setErr(apiMsg || '加载失败')
      if (reset) setPassages([])
    } finally {
      setLoadingList(false)
      setLoadingMore(false)
      loadingListRef.current = false
    }
  }, [keyword, levelFilter, sourceTab, tagFilter])

  useEffect(() => {
    if (!sessionReady || phase !== 'list') return
    pageRef.current = 1
    void loadList(1, true)
  }, [sessionReady, phase, loadList])

  useEffect(() => {
    if (sourceTab !== 'system') {
      setAvailableTags([])
      return
    }
    void listReadingTags()
      .then((res) => {
        if (res.code === 200 && res.data?.tags) setAvailableTags(res.data.tags)
      })
      .catch(() => {})
  }, [sourceTab])

  const paragraphs = useMemo(() => (passage ? splitReadingParagraphs(passage.content) : []), [passage])
  const answeredCount = useMemo(() => Object.keys(answers).filter((key) => answers[Number(key)]).length, [answers])
  const totalQuestions = passage?.questions?.length ?? 0
  const allAnswered = totalQuestions > 0 && answeredCount === totalQuestions
  const percent = totalQuestions > 0 ? Math.round((answeredCount / totalQuestions) * 100) : 0
  const hasMore = passages.length < listTotal
  const currentStage = phaseToStage(phase)
  const currentStageIdx = READING_STAGE_ORDER.indexOf(currentStage)
  const unlockedStages = READING_STAGE_ORDER.slice(0, maxStageIdx + 1)
  const completedStages = READING_STAGE_ORDER.filter((_, index) => index < currentStageIdx && index <= maxStageIdx)
  const currentQuestion = passage?.questions?.[questionIndex] || null
  const selectedWordKey = preview?.key || ''
  const pickedWordKeys = pickedWords.map((word) => word.key)

  const advanceMaxStage = useCallback((stage: ReadingStageId) => {
    const index = READING_STAGE_ORDER.indexOf(stage)
    if (index >= 0) setMaxStageIdx((prev) => Math.max(prev, index))
  }, [])

  const openPassage = async (id: number, isCustom: boolean) => {
    setLoadingPassage(true)
    setErr(null)
    try {
      const res = isCustom ? await getCustomReadingPassage(id) : await getReadingPassage(id)
      if (res.code !== 200 || !res.data) {
        setErr(res.msg || '加载失败')
        return
      }
      Taro.removeStorageSync(READING_SNAPSHOT_KEY)
      setPassage(res.data)
      setIsCustomPassage(isCustom)
      setAnswers({})
      setFeedback({})
      setOptionOrder({})
      setFirstResult(null)
      setSecondResult(null)
      setPreview(null)
      setPickedWords([])
      setQuestionIndex(0)
      setPanelCollapsed(false)
      setKnowledgeItems([])
      setStudyItems([])
      setOpenStudyId(null)
      setMaxStageIdx(0)
      startedAtRef.current = Date.now()
      setPhase('listen')
      advanceMaxStage('listen')
      advanceMaxStage('answer')
    } catch (e: unknown) {
      const apiMsg = e && typeof e === 'object' && 'msg' in e ? String((e as { msg: string }).msg) : undefined
      setErr(apiMsg || '加载失败')
    } finally {
      setLoadingPassage(false)
    }
  }

  const playTts = async (text: string, key: string, paraIndex?: number) => {
    if (!text.trim()) return
    try {
      setTtsKey(key)
      if (typeof paraIndex === 'number') setActivePara(paraIndex)
      const res = await synthesizeTts(text, { lang: 'en-US' })
      const url = resolveMediaUrl(res.data?.url)
      if (res.code !== 200 || !url) {
        setErr(res.msg || '语音合成失败')
        setTtsKey(null)
        setActivePara(null)
        return
      }
      audioRef.current?.stop()
      audioRef.current?.destroy()
      const audio = Taro.createInnerAudioContext()
      audio.src = url
      audio.autoplay = true
      audio.onEnded(() => {
        setTtsKey(null)
        setActivePara(null)
        audio.destroy()
        if (audioRef.current === audio) audioRef.current = null
      })
      audio.onError(() => {
        setTtsKey(null)
        setActivePara(null)
        audio.destroy()
        if (audioRef.current === audio) audioRef.current = null
      })
      audioRef.current = audio
    } catch {
      setErr('语音合成失败')
      setTtsKey(null)
      setActivePara(null)
    }
  }

  const goToPractice = () => {
    stopPlayback()
    startedAtRef.current = Date.now()
    setPanelCollapsed(false)
    setPhase('practice')
    advanceMaxStage('answer')
  }

  const goToWords = () => {
    stopPlayback()
    setPreview(null)
    setPanelCollapsed(false)
    setPhase('words')
    advanceMaxStage('words')
  }

  const goToReanswer = () => {
    stopPlayback()
    setAnswers({})
    setFeedback({})
    setQuestionIndex(0)
    setSecondResult(null)
    if (passage?.questions?.length) {
      const next: Record<number, string[]> = {}
      for (const question of passage.questions) next[question.id] = shuffleKeys((question.options || []).map((option) => option.key))
      setOptionOrder(next)
    } else {
      setOptionOrder({})
    }
    setPanelCollapsed(false)
    setPhase('reanswer')
    advanceMaxStage('reanswer')
  }

  const buildStudy = async () => {
    if (!passage) return
    setStudyLoading(true)
    setStudyItems([])
    setErr(null)
    const loadOnce = async () => {
      const res = isCustomPassage ? await getCustomReadingAnalysis(passage.id) : await getReadingAnalysis(passage.id)
      if (res.code !== 200 || !res.data) throw { code: res.code, msg: res.msg }
      return (res.data.items || [])
        .filter((item) => String(item.sentence || '').trim())
        .map((item, index) => ({
          id: `s-${index}`,
          sentence: String(item.sentence || '').trim(),
          translation: String(item.translation || '').trim(),
          components: (item.components || [])
            .filter((component) => String(component.label || '').trim() && String(component.text || '').trim())
            .map((component) => ({ label: String(component.label).trim(), text: String(component.text).trim() })),
          keyPhrases: (item.keyPhrases || [])
            .filter((phrase) => String(phrase.text || '').trim())
            .map((phrase) => ({ text: String(phrase.text).trim(), explanation: String(phrase.explanation || '').trim() })),
        }))
    }
    try {
      let items: ReadingStudyItem[]
      try {
        items = await loadOnce()
      } catch (first: unknown) {
        const msg = first && typeof first === 'object' && 'msg' in first ? String((first as { msg: string }).msg) : ''
        const code = first && typeof first === 'object' && 'code' in first ? Number((first as { code: number }).code) : 0
        if (!(code === 408 || /timeout|超时/i.test(msg))) throw first
        items = await loadOnce()
      }
      setStudyItems(items)
      setOpenStudyId(items[0]?.id || null)
    } catch (e: unknown) {
      const apiMsg = e && typeof e === 'object' && 'msg' in e ? String((e as { msg: string }).msg) : undefined
      setErr(apiMsg || '逐句解析加载失败')
    } finally {
      setStudyLoading(false)
    }
  }

  const goToStudy = () => {
    setPanelCollapsed(false)
    setPhase('study')
    advanceMaxStage('study')
    void buildStudy()
  }

  const buildKnowledge = async () => {
    if (!passage) return
    setKnowledgeLoading(true)
    setKnowledgeItems([])
    setErr(null)
    try {
      const res = isCustomPassage ? await getCustomReadingKnowledge(passage.id) : await getReadingKnowledge(passage.id)
      if (res.code !== 200 || !res.data) {
        setErr(res.msg || '知识点加载失败')
        return
      }
      const items = (res.data.items || [])
        .filter((item) => String(item.title || item.body || '').trim())
        .map((item, index) => ({
          kind: 'point' as const,
          id: `p-${index}`,
          title: String(item.title || '').trim() || `知识点 ${index + 1}`,
          body: String(item.body || '').trim(),
          tag: item.tag ? String(item.tag) : undefined,
        }))
      setKnowledgeItems(items)
    } catch (e: unknown) {
      const apiMsg = e && typeof e === 'object' && 'msg' in e ? String((e as { msg: string }).msg) : undefined
      setErr(apiMsg || '知识点加载失败')
    } finally {
      setKnowledgeLoading(false)
    }
  }

  const goToKnowledge = () => {
    setPanelCollapsed(false)
    setPhase('knowledge')
    advanceMaxStage('knowledge')
    advanceMaxStage('done')
    void buildKnowledge()
  }

  const submitAnswers = async (attempt: 'first' | 'second'): Promise<ReadingSubmitResult | null> => {
    if (!passage || !allAnswered) return null
    setSubmitting(true)
    setErr(null)
    try {
      const durationSec = Math.max(1, Math.round((Date.now() - startedAtRef.current) / 1000))
      const payload = {
        answers: passage.questions.map((question) => ({ questionId: question.id, answer: answers[question.id] || '' })),
        durationSec,
      }
      const res = isCustomPassage
        ? await submitCustomReadingPassage(passage.id, payload)
        : await submitReadingPassage(passage.id, payload)
      if (res.code !== 200 || !res.data) {
        setErr(res.msg || '提交失败')
        return null
      }
      if (attempt === 'first') setFirstResult(res.data)
      else setSecondResult(res.data)
      pageRef.current = 1
      void loadList(1, true)
      return res.data
    } catch (e: unknown) {
      const apiMsg = e && typeof e === 'object' && 'msg' in e ? String((e as { msg: string }).msg) : undefined
      setErr(apiMsg || '提交失败')
      return null
    } finally {
      setSubmitting(false)
    }
  }

  const finishFirstAnswer = async () => {
    if (!allAnswered) {
      setErr(`还需答 ${totalQuestions - answeredCount} 题`)
      return
    }
    if (!firstResult) {
      const submitted = await submitAnswers('first')
      if (!submitted) return
    }
    goToWords()
  }

  const finishReanswer = async () => {
    if (!allAnswered) {
      setErr(`还需答 ${totalQuestions - answeredCount} 题`)
      return
    }
    if (!secondResult) {
      const submitted = await submitAnswers('second')
      if (!submitted) return
    }
    goToKnowledge()
  }

  const backToList = () => {
    stopPlayback()
    clearAdvanceTimer()
    Taro.removeStorageSync(READING_SNAPSHOT_KEY)
    setPhase('list')
    setPassage(null)
    setIsCustomPassage(false)
    setAnswers({})
    setFeedback({})
    setOptionOrder({})
    setFirstResult(null)
    setSecondResult(null)
    setQuestionIndex(0)
    setPreview(null)
    setPickedWords([])
    setKnowledgeItems([])
    setStudyItems([])
    setOpenStudyId(null)
    setMaxStageIdx(0)
    setErr(null)
  }

  const finishSession = () => {
    advanceMaxStage('done')
    backToList()
  }

  const headerBack = () => {
    if (phase === 'list') {
      Taro.navigateBack()
      return
    }
    if (phase === 'practice') setPhase('listen')
    else if (phase === 'words') setPhase('practice')
    else if (phase === 'study') setPhase('words')
    else if (phase === 'reanswer') setPhase('study')
    else if (phase === 'knowledge') setPhase('reanswer')
    else backToList()
  }

  const onStageSelect = (id: ReadingStageId) => {
    if (id === 'done') {
      if (unlockedStages.includes('done') || secondResult) finishSession()
      return
    }
    if (id === 'listen') setPhase('listen')
    else if (id === 'answer') goToPractice()
    else if (id === 'words' && firstResult) goToWords()
    else if (id === 'study' && firstResult) goToStudy()
    else if (id === 'reanswer' && firstResult) goToReanswer()
    else if (id === 'knowledge' && secondResult) goToKnowledge()
  }

  const scheduleAdvanceToQuestion = (nextIndex: number, delayMs: number) => {
    clearAdvanceTimer()
    advanceTimerRef.current = setTimeout(() => {
      advanceTimerRef.current = null
      setQuestionIndex(nextIndex)
    }, delayMs)
  }

  const answerQuestion = async (questionId: number, key: string) => {
    clearAdvanceTimer()
    setAnswers((prev) => ({ ...prev, [questionId]: key }))
    setErr(null)
    if (phase === 'practice') {
      setFirstResult(null)
      if (!passage) return
      const index = passage.questions.findIndex((question) => question.id === questionId)
      if (index >= 0 && index < passage.questions.length - 1) scheduleAdvanceToQuestion(index + 1, 450)
      return
    }
    if (phase !== 'reanswer' || !passage) return
    setSecondResult(null)
    try {
      const res = isCustomPassage
        ? await checkCustomReadingAnswer(passage.id, { questionId, answer: key })
        : await checkReadingAnswer(passage.id, { questionId, answer: key })
      if (res.code !== 200 || !res.data) {
        setErr(res.msg || '答案核对失败')
        return
      }
      setFeedback((prev) => ({
        ...prev,
        [questionId]: {
          correct: res.data.correct,
          rightAnswer: res.data.rightAnswer,
          explanation: res.data.explanation,
        },
      }))
    } catch (e: unknown) {
      const apiMsg = e && typeof e === 'object' && 'msg' in e ? String((e as { msg: string }).msg) : undefined
      setErr(apiMsg || '答案核对失败')
    }
  }

  const selectWord = async (raw: string) => {
    const key = normalizeReadingWord(raw)
    if (!key) return
    const surface = raw.trim()
    setErr(null)
    if (pickedWords.some((word) => word.key === key)) {
      setPickedWords((prev) => prev.filter((word) => word.key !== key))
      setPreview((current) => (current?.key === key ? null : current))
      return
    }
    const applyPick = (item: ReadingWordPreview) => {
      setPreview(item)
      setPickedWords((prev) => (prev.some((word) => word.key === item.key) ? prev : [...prev, item]))
    }
    const cached = glossCacheRef.current[key]
    if (cached) {
      applyPick({ word: surface, key, phonetic: cached.phonetic, translation: cached.translationShort || cached.translation })
      return
    }
    setPreviewLoading(true)
    setPreview({ word: surface, key })
    try {
      const res = await enrichCustomWordBookWords([{ word: key }])
      const hit = res.data?.list?.[0]
      if (res.code === 200 && hit) {
        glossCacheRef.current[key] = hit
        applyPick({ word: surface, key, phonetic: hit.phonetic, translation: hit.translationShort || hit.translation })
      } else {
        applyPick({ word: surface, key, translation: '暂无释义' })
      }
    } catch {
      applyPick({ word: surface, key, translation: '暂无释义' })
    } finally {
      setPreviewLoading(false)
    }
  }

  const startWordDrill = () => {
    if (!passage || pickedWords.length === 0 || drillLoading) return
    Taro.setStorageSync(READING_SNAPSHOT_KEY, {
      phase: 'words',
      sourceTab,
      isCustomPassage,
      passage,
      answers,
      optionOrder,
      firstResult,
      secondResult,
      questionIndex,
      maxStageIdx,
      pickedWords,
      startedAt: startedAtRef.current,
    } satisfies ReadingSnapshot)
    const words = pickedWords.map((word) => ({
      id: stableReadingWordId(word.key),
      word: word.word,
      phonetic: word.phonetic,
      translation: word.translation,
    }))
    setDrillLoading(true)
    try {
      beginReviewPractice({
        sessionId: 0,
        wordBookId: 0,
        words,
        returnPath: '/pages/reading-comprehension/index',
      })
      Taro.navigateTo({ url: '/pages/word-practice/index' })
    } catch {
      Taro.removeStorageSync(READING_SNAPSHOT_KEY)
      setErr('无法开始选词练习')
    } finally {
      setDrillLoading(false)
    }
  }

  const speakPreview = () => {
    if (preview?.word) void playTts(preview.word, 'preview')
  }

  const copyPreview = () => {
    if (!preview) return
    void Taro.setClipboardData({ data: [preview.word, preview.phonetic, preview.translation].filter(Boolean).join(' ') })
  }

  const copyText = (text: string) => {
    void Taro.setClipboardData({ data: text })
  }

  const passageCard = passage ? (
    <View className="reading__card">
      <View className="reading__article-head">
        <View className="reading__article-title-wrap">
          <Text className="reading__card-title">{passage.title}</Text>
          <Text className="reading__article-hint">
            {phase === 'practice' ? '在下方答题卡作答' : phase === 'reanswer' ? '再答并查看逐题解析' : phase === 'words' ? '点击文章中的单词加入练习' : phase === 'study' ? '逐句学习解析' : phase === 'knowledge' ? '复习本篇知识点' : '听读文章后开始初答'}
          </Text>
        </View>
        <View className="reading__paragraph-count"><Text>{paragraphs.length} 段</Text></View>
      </View>
      <View className="reading__paragraphs">
        {paragraphs.map((paragraph, index) => {
          const isActive = activePara === index || ttsKey === `p-${index}`
          return (
            <View key={index} className={`reading__paragraph-block ${isActive ? 'reading__paragraph-block--active' : ''}`}>
              <View className="reading__paragraph-side">
                <View className={`reading__paragraph-no ${isActive ? 'reading__paragraph-no--active' : ''}`}><Text>{index + 1}</Text></View>
                <View className="reading__paragraph-play" onClick={() => void playTts(paragraph, `p-${index}`, index)}>
                  <Text>{ttsKey === `p-${index}` ? '…' : '▶'}</Text>
                </View>
              </View>
              {phase === 'words' ? (
                <View className="reading__word-flow">
                  {tokenizeReadingText(paragraph).map((token, tokenIndex) => {
                    if (token.type !== 'word') return <Text key={`${index}-${tokenIndex}`} className="reading__other-token">{token.value}</Text>
                    const key = normalizeReadingWord(token.value)
                    const isPreview = key === selectedWordKey
                    const isPicked = pickedWordKeys.includes(key)
                    return (
                      <View
                        key={`${index}-${tokenIndex}`}
                        className={`reading__word-token ${isPreview ? 'reading__word-token--preview' : ''} ${isPicked ? 'reading__word-token--picked' : ''}`}
                        onClick={() => void selectWord(token.value)}
                      >
                        <Text>{token.value}</Text>
                      </View>
                    )
                  })}
                </View>
              ) : (
                <Text className="reading__paragraph-text">{paragraph}</Text>
              )}
            </View>
          )
        })}
      </View>
    </View>
  ) : null

  const answerPanel = currentQuestion ? (
    <View className="reading__sheet">
      <ScrollView className="reading__question-dots" scrollX enableFlex>
        <Text className="reading__answered-label">已答 {answeredCount}/{totalQuestions}</Text>
        {passage!.questions.map((question, index) => {
          const itemFeedback = phase === 'reanswer' ? feedback[question.id] : undefined
          const answered = Boolean(answers[question.id])
          const className = `reading__question-dot ${index === questionIndex ? 'reading__question-dot--active' : ''} ${itemFeedback ? itemFeedback.correct ? 'reading__question-dot--correct' : 'reading__question-dot--wrong' : answered ? 'reading__question-dot--answered' : ''}`
          return <View key={question.id} className={className} onClick={() => { clearAdvanceTimer(); setQuestionIndex(index) }}><Text>{index + 1}</Text></View>
        })}
      </ScrollView>
      <Text className="reading__question-stem">{questionIndex + 1}. {currentQuestion.stem}</Text>
      <View className="reading__options">
        {orderedOptions(currentQuestion.options, phase === 'reanswer' ? optionOrder[currentQuestion.id] : undefined).map((option) => {
          const selected = answers[currentQuestion.id] === option.key
          const itemFeedback = phase === 'reanswer' ? feedback[currentQuestion.id] : undefined
          const showRightMark = Boolean(itemFeedback && option.key === itemFeedback.rightAnswer)
          const isWrongPick = Boolean(itemFeedback && selected && !itemFeedback.correct)
          const isRightPick = Boolean(itemFeedback && selected && itemFeedback.correct)
          const locked = Boolean(itemFeedback)
          return (
            <View
              key={option.key}
              className={`reading__option ${selected ? 'reading__option--selected' : ''} ${showRightMark || isRightPick ? 'reading__option--correct' : ''} ${isWrongPick ? 'reading__option--wrong' : ''}`}
              onClick={() => { if (!locked) void answerQuestion(currentQuestion.id, option.key) }}
            >
              <Text className="reading__option-text"><Text className="reading__option-key">{option.key}.</Text> {option.text}</Text>
              {showRightMark ? <Text className="reading__correct-tag">正确</Text> : null}
            </View>
          )
        })}
      </View>
      {phase === 'reanswer' && feedback[currentQuestion.id] ? (
        <View className={`reading__question-feedback ${feedback[currentQuestion.id].correct ? 'reading__question-feedback--correct' : 'reading__question-feedback--wrong'}`}>
          <Text>你的答案：{answers[currentQuestion.id] || '—'} {feedback[currentQuestion.id].correct ? '✓' : '✗'}</Text>
          {!feedback[currentQuestion.id].correct ? <Text>正确答案：{feedback[currentQuestion.id].rightAnswer}</Text> : null}
          {feedback[currentQuestion.id].explanation ? (
            <View className="reading__idea-box">
              <Text className="reading__idea-title">解题思路</Text>
              <Text className="reading__idea-text">{feedback[currentQuestion.id].explanation}</Text>
            </View>
          ) : null}
        </View>
      ) : null}
      <View className="reading__panel-actions">
        <View className="reading__panel-btn" onClick={() => {
          if (questionIndex > 0) setQuestionIndex(questionIndex - 1)
          else if (phase === 'practice') setPhase('listen')
          else setPhase('study')
        }}><Text>{questionIndex > 0 ? '上一题' : '上一步'}</Text></View>
        <View className={`reading__panel-btn reading__panel-btn--primary ${questionIndex === totalQuestions - 1 && !allAnswered ? 'reading__panel-btn--disabled' : ''}`} onClick={() => {
          if (questionIndex < totalQuestions - 1) setQuestionIndex(questionIndex + 1)
          else void (phase === 'practice' ? finishFirstAnswer() : finishReanswer())
        }}><Text>{questionIndex < totalQuestions - 1 ? '下一题' : submitting ? '提交中...' : '下一步'}</Text></View>
      </View>
    </View>
  ) : null

  const wordsPanel = (
    <View className="reading__sheet">
      <View className="reading__word-panel-card">
        {previewLoading ? <Text className="reading__empty-panel-text">查询中...</Text> : preview ? (
          <>
            <View className="reading__preview-head"><Text className="reading__preview-word">{preview.word}</Text><Text className="reading__preview-tag">预览</Text></View>
            {preview.phonetic ? <Text className="reading__preview-phonetic">{preview.phonetic}</Text> : null}
            <Text className="reading__preview-translation">{preview.translation || '—'}</Text>
            <View className="reading__preview-actions">
              <View className="reading__preview-action" onClick={speakPreview}><Text>朗读</Text></View>
              <View className="reading__preview-action" onClick={copyPreview}><Text>复制</Text></View>
            </View>
          </>
        ) : <Text className="reading__empty-panel-text">点击文章中的单词加入练习</Text>}
      </View>
      {pickedWords.length > 0 ? (
        <View className="reading__picked-card">
          <Text className="reading__picked-label">已选 {pickedWords.length} 个单词</Text>
          <View className="reading__picked-list">
            {pickedWords.map((word) => <View key={word.key} className="reading__picked-chip" onClick={() => void selectWord(word.word)}><Text>{word.word} ×</Text></View>)}
          </View>
          <View className="reading__panel-btn reading__panel-btn--primary" onClick={startWordDrill}><Text>{drillLoading ? '准备中...' : '练习这些单词'}</Text></View>
        </View>
      ) : null}
      <View className="reading__panel-actions">
        <View className="reading__panel-btn" onClick={() => setPhase('practice')}><Text>上一步</Text></View>
        <View className="reading__panel-btn reading__panel-btn--primary" onClick={goToStudy}><Text>下一步</Text></View>
      </View>
    </View>
  )

  const studyPanel = (
    <View className="reading__sheet">
      {studyLoading ? <Text className="reading__empty-panel-text">逐句解析生成中...</Text> : studyItems.length === 0 ? <Text className="reading__empty-panel-text">暂无逐句解析</Text> : studyItems.map((item, index) => {
        const open = openStudyId === item.id
        return (
          <View key={item.id} className="reading__study-item">
            <View className="reading__study-item-head" onClick={() => setOpenStudyId(open ? null : item.id)}>
              <Text className="reading__study-no">第 {index + 1} 句</Text>
              <Text className="reading__study-sentence-text">{item.sentence}</Text>
              <Text className={`reading__study-chevron ${open ? 'reading__study-chevron--open' : ''}`}>⌄</Text>
            </View>
            {open ? (
              <View className="reading__study-detail">
                <View className="reading__study-row-head"><Text className="reading__study-label">翻译</Text><Text className="reading__study-copy" onClick={() => copyText([item.sentence, item.translation].filter(Boolean).join('\n'))}>复制</Text></View>
                <Text className="reading__study-translation">{item.translation || '—'}</Text>
                {item.components.length > 0 ? (
                  <View className="reading__study-components">
                    <Text className="reading__study-label">句子成分</Text>
                    <View className="reading__component-list">{item.components.map((component, componentIndex) => <View key={componentIndex} className="reading__component"><Text className="reading__component-label">{component.label}</Text><Text>{component.text}</Text></View>)}</View>
                  </View>
                ) : null}
                {item.keyPhrases.length > 0 ? (
                  <View className="reading__study-phrases">
                    <Text className="reading__study-label">重点短语</Text>
                    {item.keyPhrases.map((phrase, phraseIndex) => <View key={phraseIndex} className="reading__phrase"><Text className="reading__phrase-text">{phrase.text}</Text>{phrase.explanation ? <Text className="reading__phrase-explain">{phrase.explanation}</Text> : null}</View>)}
                  </View>
                ) : null}
              </View>
            ) : null}
          </View>
        )
      })}
      <View className="reading__panel-actions">
        <View className="reading__panel-btn" onClick={() => setPhase('words')}><Text>上一步</Text></View>
        <View className="reading__panel-btn reading__panel-btn--primary" onClick={goToReanswer}><Text>下一步</Text></View>
      </View>
    </View>
  )

  const knowledgePanel = (
    <View className="reading__sheet">
      {knowledgeLoading ? <Text className="reading__empty-panel-text">知识点生成中...</Text> : knowledgeItems.length === 0 ? <Text className="reading__empty-panel-text">暂无知识点</Text> : knowledgeItems.map((item) => (
        <View key={item.id} className="reading__knowledge-item">
          <View className="reading__study-row-head"><Text className="reading__study-label">知识点</Text><Text className="reading__study-copy" onClick={() => copyText(`${item.title}\n${item.body}`)}>复制</Text></View>
          <Text className="reading__knowledge-title">{item.title}</Text>
          <Text className="reading__knowledge-body">{item.body}</Text>
        </View>
      ))}
      <View className="reading__panel-actions">
        <View className="reading__panel-btn" onClick={() => setPhase('reanswer')}><Text>上一步</Text></View>
        <View className="reading__panel-btn reading__panel-btn--primary" onClick={finishSession}><Text>完成本次阅读</Text></View>
      </View>
    </View>
  )

  const sessionPanelTitle = phase === 'practice' ? '答题卡' : phase === 'reanswer' ? '再答与解析' : phase === 'words' ? '选词' : phase === 'study' ? '逐句细学' : `知识点 ${knowledgeItems.length}`
  const sessionPanelSubtitle = phase === 'practice' ? '完成全部题目后进入选词' : phase === 'reanswer' ? '作答后立即查看对错和解析' : phase === 'words' ? '点击正文单词加入练习' : phase === 'study' ? `共 ${studyItems.length} 句` : `共 ${knowledgeItems.length} 条`

  return (
    <View className="reading">
      <View className="reading__navbar">
        <View className="reading__nav-btn" onClick={headerBack}><ArrowLeft size={22} color={color.charcoal} /></View>
        <View className="reading__nav-center">
          <Text className="reading__nav-title">阅读理解</Text>
          {phase !== 'list' && passage ? <Text className="reading__nav-sub">{passage.title} · {passage.level}{isCustomPassage ? ' · 自定义' : ''}</Text> : phase === 'list' ? <Text className="reading__nav-sub">选择文章</Text> : null}
        </View>
        <View className="reading__nav-right">
          {phase === 'list' ? (
            <View className="reading__nav-tools">
              <View className="reading__tab-group">
                {(['system', 'custom'] as SourceTab[]).map((key) => <View key={key} className={`reading__tab ${sourceTab === key ? 'reading__tab--active' : ''}`} onClick={() => { setSourceTab(key); setTagFilter('') }}><Text className="reading__tab-text">{key === 'system' ? '系统' : '自定义'}</Text></View>)}
              </View>
              {sourceTab === 'custom' ? <View className="reading__create-btn" onClick={() => Taro.navigateTo({ url: '/pages/create-custom-reading/index' })}><Plus size={16} color={color.primary} /></View> : null}
            </View>
          ) : (
            <View className="reading__session-tools">
              {phase === 'practice' || phase === 'reanswer' ? <Text className="reading__nav-count">{answeredCount}/{totalQuestions}</Text> : null}
              <View className={`reading__tool-btn ${annotationOpen ? 'reading__tool-btn--active' : ''}`} onClick={() => setAnnotationOpen((value) => !value)}><Text>标注</Text></View>
              <PracticeFontSettingsButton />
            </View>
          )}
        </View>
      </View>

      {phase !== 'list' ? <AnnotationLayer open={annotationOpen} storageKey={`reading:${isCustomPassage ? 'c' : 's'}:${passage?.id ?? 0}`} onClose={() => setAnnotationOpen(false)} /> : null}

      {phase !== 'list' ? (
        <ScrollView className="reading__stage-bar" scrollX enableFlex>
          {STAGE_DEFS.map((stage, index) => {
            const isCurrent = stage.id === currentStage
            const isUnlocked = unlockedStages.includes(stage.id)
            const isDone = completedStages.includes(stage.id) && !isCurrent
            const canClick = isUnlocked && !isCurrent
            return (
              <View key={stage.id} className="reading__stage-item">
                {index > 0 ? <View className={`reading__stage-line ${isDone || isCurrent || unlockedStages.includes(STAGE_DEFS[index - 1].id) ? 'reading__stage-line--active' : ''}`} /> : null}
                <View className={`reading__stage-node ${isCurrent ? 'reading__stage-node--current' : ''} ${isDone ? 'reading__stage-node--done' : ''} ${!isUnlocked ? 'reading__stage-node--locked' : ''}`} onClick={() => { if (canClick) onStageSelect(stage.id) }}>
                  <Text className="reading__stage-mark">{isDone ? '✓' : stage.mark}</Text>
                  <Text className={`reading__stage-label ${isCurrent ? 'reading__stage-label--current' : isDone ? 'reading__stage-label--done' : ''}`}>{stage.label}</Text>
                </View>
              </View>
            )
          })}
        </ScrollView>
      ) : null}

      {(phase === 'practice' || phase === 'reanswer') ? <View className="reading__progress-bar"><View className="reading__progress-fill" style={{ width: `${percent}%` }} /></View> : null}

      {phase === 'list' ? (
        <View className="reading__search-bar">
          <View className="reading__search-input-wrap">
            <Search size={16} color={color.mutedSoft} />
            <Input className="reading__search-input" value={searchInput} onInput={(e) => setSearchInput(e.detail.value)} placeholder="搜索阅读文章" confirmType="search" />
          </View>
        </View>
      ) : null}

      {phase === 'list' ? (
        <ScrollView className="reading__tag-bar" scrollX enableFlex>
          {LEVELS.map((level) => <View key={level || 'all'} className={`reading__tag-chip ${levelFilter === level ? 'reading__tag-chip--active' : ''}`} onClick={() => setLevelFilter(level)}><Text className="reading__tag-chip-text">{level || '全部'}</Text></View>)}
        </ScrollView>
      ) : null}

      {phase === 'list' && sourceTab === 'system' && availableTags.length > 0 ? (
        <ScrollView className="reading__tag-bar" scrollX enableFlex>
          {availableTags.map((tag) => <View key={tag} className={`reading__tag-chip ${tagFilter === tag ? 'reading__tag-chip--active' : ''}`} onClick={() => setTagFilter(tagFilter === tag ? '' : tag)}><Text className="reading__tag-chip-text">{tag}</Text></View>)}
        </ScrollView>
      ) : null}

      {err ? <View className="reading__err"><Text className="reading__err-text">{err}</Text></View> : null}

      {phase === 'list' ? (
        <ScrollView className="reading__body" scrollY enableFlex lowerThreshold={120} onScrollToLower={() => {
          if (!hasMore || loadingListRef.current) return
          void loadList(pageRef.current + 1, false)
        }}>
          {loadingList && passages.length === 0 || loadingPassage ? <View className="reading__state"><Text className="reading__state-text">加载中...</Text></View> : passages.length === 0 ? (
            <View className="reading__state"><Text className="reading__state-text">{keyword ? '未找到匹配内容' : sourceTab === 'custom' ? '暂无自定义阅读' : '暂无阅读文章'}</Text>{sourceTab === 'custom' && !keyword ? <View className="reading__empty-create" onClick={() => Taro.navigateTo({ url: '/pages/create-custom-reading/index' })}><Text>创建自定义阅读</Text></View> : null}</View>
          ) : (
            <View className="reading__list">
              {passages.map((item) => {
                const tags = (item.tags || '').split(',').map((tag) => tag.trim()).filter(Boolean)
                return (
                  <View key={`${item.isCustom ? 'c' : 's'}-${item.id}`} className="reading__passage-card" onClick={() => void openPassage(item.id, Boolean(item.isCustom))}>
                    <View className="reading__passage-top">
                      <View className="reading__passage-main">
                        <View className="reading__passage-title-row"><Text className="reading__passage-title">{item.title}</Text><View className="reading__level-tag"><Text className="reading__level-tag-text">{item.level}</Text></View>{item.isCustom ? <View className="reading__level-tag reading__level-tag--custom"><Text className="reading__level-tag-text">自定义</Text></View> : null}</View>
                        {tags.length > 0 ? <View className="reading__passage-tag-row">{tags.map((tag) => <View key={tag} className="reading__mini-tag"><Text className="reading__mini-tag-text">{tag}</Text></View>)}</View> : null}
                        {item.summary ? <Text className="reading__passage-summary">{item.summary}</Text> : null}
                        <Text className="reading__passage-meta">{item.wordCount ?? 0} 词 · {item.questionCount ?? 0} 题 · 约 {item.estimatedMinutes ?? 5} 分钟</Text>
                      </View>
                      {typeof item.lastScore === 'number' ? <View className={`reading__score-tag ${item.lastScore >= 80 ? 'reading__score-tag--green' : 'reading__score-tag--red'}`}><Text className="reading__score-tag-text">上次 {item.lastScore} 分</Text></View> : null}
                    </View>
                  </View>
                )
              })}
              {hasMore ? <View className="reading__load-more"><Text className="reading__load-more-text">{loadingMore ? '加载中...' : '加载更多'}</Text></View> : <View className="reading__load-more"><Text className="reading__load-more-text">已加载全部</Text></View>}
            </View>
          )}
          <View style={{ height: '24px' }} />
        </ScrollView>
      ) : null}

      {phase === 'listen' && passage ? (
        <View className="reading__listen-wrap">
          <ScrollView className="reading__article-scroll" scrollY enableFlex>{passageCard}</ScrollView>
          <View className="reading__listen-bottom"><View className="reading__btn reading__btn--primary" onClick={goToPractice}><Text className="reading__btn-text">开始答题</Text></View></View>
        </View>
      ) : null}

      {phase !== 'list' && phase !== 'listen' && passage ? (
        <View className="reading__session">
          <ScrollView className="reading__article-scroll" scrollY enableFlex>{passageCard}</ScrollView>
          <View className="reading__session-panel">
            <View className="reading__session-panel-head">
              <View className="reading__session-panel-title-wrap"><Text className="reading__session-panel-title">{sessionPanelTitle}</Text><Text className="reading__session-panel-subtitle">{sessionPanelSubtitle}</Text></View>
              <View className="reading__collapse-btn" onClick={() => setPanelCollapsed((value) => !value)}><Text>{panelCollapsed ? '展开' : '收起'}</Text></View>
            </View>
            {!panelCollapsed ? <ScrollView className="reading__session-panel-body" scrollY enableFlex>{phase === 'practice' || phase === 'reanswer' ? answerPanel : phase === 'words' ? wordsPanel : phase === 'study' ? studyPanel : knowledgePanel}</ScrollView> : null}
          </View>
        </View>
      ) : null}
    </View>
  )
}
