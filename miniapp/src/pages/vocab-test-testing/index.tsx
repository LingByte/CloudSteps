import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ScrollView, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { Close, VolumeMax } from '@nutui/icons-react-taro'
import { CloudButton } from '../../components/button'
import { TopBar } from '../../components/top-bar/TopBar'
import { submitVocabTest } from '../../api/vocab'
import { getTrainingStudent } from '../../utils/trainingStudent'
import { clearVocabTestQuestionsCache, ensureVocabTestQuestions, type VocabTestQuestion } from '../../utils/vocabTestCache'
import { resolveMediaUrl } from '../../utils/mediaUrl'
import { color } from '../../styles/tokens'
import './index.scss'

type OptionItem = { label: string; value: string }
type ApiQuestion = VocabTestQuestion

const TOTAL_QUESTIONS = 40
const LEVEL_ORDER = ['A1', 'A2', 'B1', 'B2', 'C1'] as const
const REVEAL_DELAY_MS = 900
const UNKNOWN_LABEL = '不认识'

function parseOptions(options: string): string[] {
  try {
    const arr = JSON.parse(options)
    return Array.isArray(arr) ? arr.map((s) => String(s)) : []
  } catch {
    return []
  }
}

export default function VocabTestTesting() {
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null)
  const [revealed, setRevealed] = useState(false)
  const [correctCount, setCorrectCount] = useState(0)
  const [wrongCount, setWrongCount] = useState(0)
  const [timer, setTimer] = useState(8)
  const [showWarning, setShowWarning] = useState(false)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [poolByLevel, setPoolByLevel] = useState<Record<string, ApiQuestion[]>>({})
  const [currentQuestion, setCurrentQuestion] = useState<ApiQuestion | null>(null)
  const usedIdsRef = useRef<Set<number | string>>(new Set())
  const levelIndexRef = useRef(2)
  const answeredCountRef = useRef(0)
  const answersRef = useRef<Array<{ questionId: number | string; answer: string }>>([])
  const [, setAnswersTick] = useState(0)
  const audioCtxRef = useRef<Taro.InnerAudioContext | null>(null)

  const busy = loading || submitting
  const answeredCount = answeredCountRef.current
  const progress = answeredCount > 0 ? Math.round((answeredCount / TOTAL_QUESTIONS) * 100) : 0

  const wordClass = useMemo(() => {
    const len = currentQuestion?.word?.length || 0
    if (len <= 8) return 'vtt__word--xl'
    if (len <= 14) return 'vtt__word--lg'
    if (len <= 22) return 'vtt__word--md'
    return 'vtt__word--sm'
  }, [currentQuestion?.word])

  const options: OptionItem[] = useMemo(() => {
    if (!currentQuestion) return []
    const shuffled = [...parseOptions(currentQuestion.options)]
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
    }
    return shuffled.map((label) => ({ label, value: label })).concat([{ label: UNKNOWN_LABEL, value: UNKNOWN_LABEL }])
  }, [currentQuestion?.id, currentQuestion])

  const destroyAudio = useCallback(() => {
    if (!audioCtxRef.current) return
    try {
      audioCtxRef.current.stop()
      audioCtxRef.current.destroy()
    } catch {
      /* noop */
    }
    audioCtxRef.current = null
  }, [])

  const playAudio = useCallback(() => {
    const src = resolveMediaUrl(currentQuestion?.audioUrl?.split(';')[0]?.trim())
    if (!src) return
    destroyAudio()
    const ctx = Taro.createInnerAudioContext()
    ctx.src = src
    ctx.autoplay = true
    ctx.onError(() => {})
    audioCtxRef.current = ctx
  }, [currentQuestion?.audioUrl, destroyAudio])

  useEffect(() => {
    if (currentQuestion?.audioUrl && !loading && !submitting && !revealed) playAudio()
    return destroyAudio
  }, [currentQuestion?.id, currentQuestion?.audioUrl, loading, submitting, revealed, playAudio, destroyAudio])

  useEffect(() => {
    if (timer > 0 && !submitting && !revealed) {
      const interval = setInterval(() => setTimer((prev) => prev - 1), 1000)
      return () => clearInterval(interval)
    }
    if (timer === 0) setShowWarning(true)
    return undefined
  }, [timer, submitting, revealed])

  const submitAndGoResult = useCallback(async (payloadAnswers: Array<{ questionId: number | string; answer: string }>) => {
    if (!payloadAnswers.length) throw new Error('答案不能为空')
    const studentId = getTrainingStudent()?.id
    const res = await submitVocabTest({ answers: payloadAnswers, ...(studentId ? { studentId } : {}) })
    if (res.code !== 200) throw new Error(res.msg || '提交失败')
    clearVocabTestQuestionsCache()
    Taro.setStorageSync('vocabulary_test_result', JSON.stringify(res.data))
    Taro.redirectTo({ url: '/pages/vocab-test-result/index' })
  }, [])

  const pickQuestionFromLevel = useCallback((level: string): ApiQuestion | null => {
    const pool = poolByLevel[level]
    if (!pool?.length) return null
    for (const q of pool) {
      if (!usedIdsRef.current.has(q.id)) {
        usedIdsRef.current.add(q.id)
        return q
      }
    }
    return null
  }, [poolByLevel])

  const pickNextQuestion = useCallback((wasCorrect: boolean | null): ApiQuestion | null => {
    if (wasCorrect !== null) {
      levelIndexRef.current = wasCorrect
        ? Math.min(levelIndexRef.current + 1, LEVEL_ORDER.length - 1)
        : Math.max(levelIndexRef.current - 1, 0)
    }
    const tried = new Set<string>()
    const idx = levelIndexRef.current
    for (let i = idx; i < LEVEL_ORDER.length; i++) {
      const lv = LEVEL_ORDER[i]
      if (tried.has(lv)) continue
      tried.add(lv)
      const q = pickQuestionFromLevel(lv)
      if (q) {
        levelIndexRef.current = i
        return q
      }
    }
    for (let i = idx - 1; i >= 0; i--) {
      const lv = LEVEL_ORDER[i]
      if (tried.has(lv)) continue
      tried.add(lv)
      const q = pickQuestionFromLevel(lv)
      if (q) {
        levelIndexRef.current = i
        return q
      }
    }
    return null
  }, [pickQuestionFromLevel])

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        setLoading(true)
        const list = await ensureVocabTestQuestions()
        if (!mounted) return
        const byLevel: Record<string, ApiQuestion[]> = {}
        for (const q of list) {
          const lv = q.level || 'A1'
          if (!byLevel[lv]) byLevel[lv] = []
          byLevel[lv].push(q)
        }
        setPoolByLevel(byLevel)
        levelIndexRef.current = 2
        const pickFirst = (lv: string): ApiQuestion | null => {
          const q = byLevel[lv]?.find((item) => !usedIdsRef.current.has(item.id))
          if (!q) return null
          usedIdsRef.current.add(q.id)
          return q
        }
        const first = pickFirst('B1') || pickFirst('A2') || pickFirst('B2') || pickFirst('A1') || pickFirst('C1')
        if (!first) throw new Error('题库暂无题目')
        setCurrentQuestion(first)
      } catch (e: any) {
        Taro.showToast({ title: e?.message || e?.msg || '加载题目失败', icon: 'none' })
        Taro.redirectTo({ url: '/pages/vocab-test/index' })
      } finally {
        if (mounted) setLoading(false)
      }
    })()
    return () => { mounted = false }
  }, [])

  const finishTest = useCallback(async (nextAnswers: Array<{ questionId: number | string; answer: string }>) => {
    try {
      setSubmitting(true)
      await submitAndGoResult(nextAnswers)
    } catch (e: any) {
      Taro.showToast({ title: e?.message || '提交失败', icon: 'none' })
    } finally {
      setSubmitting(false)
    }
  }, [submitAndGoResult])

  const handleAnswerSelect = async (value: string) => {
    if (!currentQuestion || loading || submitting || revealed) return
    setSelectedAnswer(value)
    setRevealed(true)

    const isUnknown = value === UNKNOWN_LABEL
    const isCorrect = !isUnknown && value === currentQuestion.correctAnswer
    if (isCorrect) setCorrectCount((prev) => prev + 1)
    else setWrongCount((prev) => prev + 1)

    const nextAnswers = [...answersRef.current, { questionId: currentQuestion.id, answer: value }]
    answersRef.current = nextAnswers
    answeredCountRef.current += 1
    setAnswersTick((n) => n + 1)

    if (answeredCountRef.current >= TOTAL_QUESTIONS) {
      await new Promise((resolve) => setTimeout(resolve, REVEAL_DELAY_MS))
      await finishTest(nextAnswers)
      return
    }

    setTimeout(() => {
      const next = pickNextQuestion(isCorrect)
      if (!next) {
        void finishTest(nextAnswers)
        return
      }
      setCurrentQuestion(next)
      setSelectedAnswer(null)
      setRevealed(false)
      setTimer(8)
      setShowWarning(false)
    }, REVEAL_DELAY_MS)
  }

  const handleBack = () => {
    Taro.navigateBack({ delta: 1 }).catch(() => Taro.redirectTo({ url: '/pages/vocab-test/index' }))
  }

  return (
    <View className="vtt">
      <TopBar title="词汇测试" onBack={handleBack} />
      <ScrollView className="vtt__main" scrollY enableFlex>
        <View className="vtt__progress">
          <Text className="vtt__progress-num">{answeredCount > 0 ? `${String(answeredCount).padStart(2, '0')}/${TOTAL_QUESTIONS}` : '--'}</Text>
          <View className="vtt__progress-bar"><View className="vtt__progress-fill" style={{ width: `${progress}%` }} /></View>
          <View className="vtt__progress-close" onClick={handleBack}><Close size={20} color="#718096" /></View>
        </View>

        {showWarning && !busy ? <Text className="vtt__warning">超过 8 秒，建议选「不认识」</Text> : null}

        <View className="vtt__question-card">
          <View className="vtt__question-inner">
            {busy || !currentQuestion ? <Text className="vtt__loading-text">加载中…</Text> : (
              <>
                <Text className={`vtt__word ${wordClass}`}>{currentQuestion.word}</Text>
                {currentQuestion.audioUrl ? <View className="vtt__audio-btn" onClick={playAudio}><VolumeMax size={20} color={color.secondaryBrand} /></View> : null}
              </>
            )}
          </View>
        </View>

        <View className="vtt__options">
          {options.map((option, index) => {
            const isCorrectOpt = option.value === currentQuestion?.correctAnswer
            const isSelected = selectedAnswer === option.value
            const cls = revealed && isCorrectOpt
              ? 'vtt__option--correct'
              : revealed && isSelected && !isCorrectOpt
                ? 'vtt__option--wrong'
                : revealed
                  ? 'vtt__option--faded'
                  : isSelected
                    ? 'vtt__option--selected'
                    : ''
            return (
              <CloudButton
                key={`${currentQuestion?.id}-${index}`}
                variant={option.label === UNKNOWN_LABEL ? 'secondary' : 'outline'}
                className={`vtt__option ${cls}`}
                disabled={busy || !currentQuestion || revealed}
                onClick={() => void handleAnswerSelect(option.value)}
              >
                <Text className="vtt__option-text">{option.label}</Text>
              </CloudButton>
            )
          })}
        </View>
      </ScrollView>

      <View className="vtt__footer">
        <View className="vtt__stat"><Text className="vtt__stat-value">{correctCount}</Text><Text className="vtt__stat-label">正确</Text></View>
        <View className="vtt__stat-divider" />
        <View className="vtt__stat"><Text className="vtt__stat-value">{wrongCount}</Text><Text className="vtt__stat-label">错误</Text></View>
        <View className="vtt__stat-divider" />
        <View className="vtt__stat"><Text className="vtt__stat-value vtt__stat-value--accent">{timer}s</Text><Text className="vtt__stat-label">倒计时</Text></View>
      </View>
    </View>
  )
}
