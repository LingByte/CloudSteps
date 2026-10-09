/**
 * 语法练习页 — 对齐 web/src/pages/GrammarAnalysis.tsx。
 * 三阶段:列表 → 学习(讲解+例句) → 练习(选择题) → 结果
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { View, Text, ScrollView, RichText } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { ArrowLeft, ArrowRight } from '@nutui/icons-react-taro'
import {
  listGrammarLessons,
  getGrammarLesson,
  submitGrammarLesson,
  type GrammarLessonDetail,
  type GrammarLessonListItem,
  type GrammarSubmitResult,
} from '../../api/grammar'
import { color } from '../../styles/tokens'
import './index.scss'

type Phase = 'list' | 'learn' | 'practice' | 'result'

export default function GrammarAnalysis() {
  const [phase, setPhase] = useState<Phase>('list')
  const [loadingList, setLoadingList] = useState(true)
  const [loadingLesson, setLoadingLesson] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const [lessons, setLessons] = useState<GrammarLessonListItem[]>([])
  const [lesson, setLesson] = useState<GrammarLessonDetail | null>(null)
  const [answers, setAnswers] = useState<Record<number, string>>({})
  const [result, setResult] = useState<GrammarSubmitResult | null>(null)
  const startedAtRef = useRef<number>(Date.now())
  const GRAMMAR_SNAPSHOT_KEY = 'grammar_session_snapshot'

  const loadList = async () => {
    setLoadingList(true)
    setErr(null)
    try {
      const res = await listGrammarLessons({ page: 1, pageSize: 50 })
      if (res.code !== 200) {
        setErr(res.msg || '加载失败')
        setLessons([])
        return
      }
      setLessons(Array.isArray(res.data?.list) ? res.data.list : [])
    } catch (e: unknown) {
      const apiMsg = e && typeof e === 'object' && 'msg' in e ? String((e as { msg: string }).msg) : undefined
      setErr(apiMsg || '加载失败')
      setLessons([])
    } finally {
      setLoadingList(false)
    }
  }

  useEffect(() => {
    void loadList()
  }, [])

  useEffect(() => {
    if (!lesson || phase !== 'practice') return
    Taro.setStorageSync(GRAMMAR_SNAPSHOT_KEY, { lessonId: lesson.id, answers, phase })
  }, [lesson, answers, phase])

  const answeredCount = useMemo(
    () => Object.keys(answers).filter((k) => answers[Number(k)]).length,
    [answers],
  )
  const totalQuestions = lesson?.questions?.length ?? 0
  const allAnswered = totalQuestions > 0 && answeredCount === totalQuestions
  const percent = totalQuestions > 0 ? Math.round((answeredCount / totalQuestions) * 100) : 0

  const openLesson = async (id: number) => {
    setLoadingLesson(true)
    setErr(null)
    try {
      const res = await getGrammarLesson(id)
      if (res.code !== 200 || !res.data) {
        setErr(res.msg || '加载失败')
        return
      }
      setLesson(res.data)
      const snapshot = Taro.getStorageSync(GRAMMAR_SNAPSHOT_KEY)
      setAnswers(snapshot && snapshot.lessonId === res.data.id ? snapshot.answers || {} : {})
      setResult(null)
      startedAtRef.current = Date.now()
      setPhase('learn')
    } catch (e: unknown) {
      const apiMsg = e && typeof e === 'object' && 'msg' in e ? String((e as { msg: string }).msg) : undefined
      setErr(apiMsg || '加载失败')
    } finally {
      setLoadingLesson(false)
    }
  }

  const onSubmit = async () => {
    if (!lesson || !allAnswered) return
    setSubmitting(true)
    setErr(null)
    try {
      const durationSec = Math.max(1, Math.round((Date.now() - startedAtRef.current) / 1000))
      const res = await submitGrammarLesson(lesson.id, {
        answers: lesson.questions.map((q) => ({
          questionId: q.id,
          answer: answers[q.id] || '',
        })),
        durationSec,
      })
      if (res.code !== 200 || !res.data) {
        setErr(res.msg || '提交失败')
        return
      }
      setResult(res.data)
      Taro.removeStorageSync(GRAMMAR_SNAPSHOT_KEY)
      setPhase('result')
      void loadList()
    } catch (e: unknown) {
      const apiMsg = e && typeof e === 'object' && 'msg' in e ? String((e as { msg: string }).msg) : undefined
      setErr(apiMsg || '提交失败')
    } finally {
      setSubmitting(false)
    }
  }

  const backToList = () => {
    Taro.removeStorageSync(GRAMMAR_SNAPSHOT_KEY)
    setPhase('list')
    setLesson(null)
    setAnswers({})
    setResult(null)
    setErr(null)
  }

  const headerBack = () => {
    if (phase === 'list') Taro.navigateBack()
    else if (phase === 'practice') setPhase('learn')
    else backToList()
  }

  return (
    <View className="grammar">
      {/* 顶部导航栏 */}
      <View className="grammar__navbar">
        <View className="grammar__nav-btn" onClick={headerBack}>
          <ArrowLeft size={22} color={color.charcoal} />
        </View>
        <View className="grammar__nav-center">
          <Text className="grammar__nav-title">解析语法</Text>
          {(phase === 'learn' || phase === 'practice') && lesson && (
            <Text className="grammar__nav-sub">{lesson.title} · {lesson.level}</Text>
          )}
          {phase === 'list' && (
            <Text className="grammar__nav-sub">选择语法专题</Text>
          )}
        </View>
        <View className="grammar__nav-right">
          {phase === 'practice' && (
            <Text className="grammar__nav-count">{answeredCount}/{totalQuestions}</Text>
          )}
        </View>
      </View>

      {/* 进度条 */}
      {phase === 'practice' && (
        <View className="grammar__progress-bar">
          <View className="grammar__progress-fill" style={{ width: `${percent}%` }} />
        </View>
      )}

      {/* 错误提示 */}
      {err && (
        <View className="grammar__err">
          <Text className="grammar__err-text">{err}</Text>
        </View>
      )}

      {/* 列表阶段 */}
      {phase === 'list' && (
        <ScrollView className="grammar__body" scrollY enableFlex>
          {loadingList || loadingLesson ? (
            <View className="grammar__state">
              <Text className="grammar__state-text">加载中...</Text>
            </View>
          ) : lessons.length === 0 ? (
            <View className="grammar__state">
              <Text className="grammar__state-text">暂无语法专题</Text>
            </View>
          ) : (
            <View className="grammar__list">
              {lessons.map((l) => (
                <View
                  key={l.id}
                  className="grammar__lesson-card"
                  onClick={() => void openLesson(l.id)}
                >
                  <View className="grammar__lesson-top">
                    <Text className="grammar__lesson-title">{l.title}</Text>
                    <View className="grammar__lesson-tags">
                      <View className="grammar__tag grammar__tag--blue">
                        <Text className="grammar__tag-text">{l.level}</Text>
                      </View>
                      {l.topic && (
                        <View className="grammar__tag grammar__tag--cyan">
                          <Text className="grammar__tag-text">{l.topic}</Text>
                        </View>
                      )}
                    </View>
                  </View>
                  {l.summary ? (
                    <Text className="grammar__lesson-summary">{l.summary}</Text>
                  ) : null}
                  <Text className="grammar__lesson-meta">
                    {l.questionCount ?? 0} 题 · 约 {l.estimatedMinutes ?? 5} 分钟
                  </Text>
                  {typeof l.lastScore === 'number' && (
                    <View
                      className={`grammar__score-tag ${l.lastScore >= 80 ? 'grammar__score-tag--green' : 'grammar__score-tag--red'}`}
                    >
                      <Text className="grammar__score-tag-text">上次 {l.lastScore} 分</Text>
                    </View>
                  )}
                </View>
              ))}
            </View>
          )}
          <View style={{ height: '48rpx' }} />
        </ScrollView>
      )}

      {/* 学习阶段 */}
      {phase === 'learn' && lesson && (
        <View className="grammar__learn-wrap">
          <ScrollView className="grammar__body" scrollY enableFlex>
            <View className="grammar__card">
              <Text className="grammar__card-title">语法讲解</Text>
              <RichText className="grammar__card-content grammar__html" nodes={lesson.explanation} />
            </View>
            {(lesson.examples?.length ?? 0) > 0 && (
              <View className="grammar__card">
                <Text className="grammar__card-title">例句</Text>
                <View className="grammar__examples">
                  {lesson.examples.map((ex, i) => (
                    <View key={i} className="grammar__example">
                      <Text className="grammar__example-en">{ex.en}</Text>
                      {ex.zh ? <Text className="grammar__example-zh">{ex.zh}</Text> : null}
                    </View>
                  ))}
                </View>
              </View>
            )}
            <View className="grammar__action-spacer" />
          </ScrollView>
          <View className="grammar__bottom-bar">
            <View
              className={`grammar__btn ${!lesson.questions?.length ? 'grammar__btn--disabled' : 'grammar__btn--primary'}`}
              onClick={() => {
                if (!lesson.questions?.length) return
                startedAtRef.current = Date.now()
                setPhase('practice')
              }}
            >
              <Text className="grammar__btn-text">
                {lesson.questions?.length ? '开始练习' : '暂无题目'}
              </Text>
            </View>
          </View>
          <View
            className={`grammar__mobile-submit ${!lesson.questions?.length ? 'grammar__mobile-submit--disabled' : ''}`}
            onClick={() => {
              if (!lesson.questions?.length) return
              startedAtRef.current = Date.now()
              setPhase('practice')
            }}
          >
            <ArrowRight size={20} color="#fff" />
          </View>
        </View>
      )}

      {/* 练习阶段 */}
      {phase === 'practice' && lesson && (
        <View className="grammar__practice-wrap">
          <ScrollView className="grammar__body" scrollY enableFlex>
            <View className="grammar__question-list">
              {lesson.questions.map((q, idx) => (
                <View key={q.id} className="grammar__card">
                  <Text className="grammar__question-stem">
                    {idx + 1}. {q.stem}
                  </Text>
                  <View className="grammar__options">
                    {(q.options || []).map((opt) => {
                      const selected = answers[q.id] === opt.key
                      return (
                        <View
                          key={opt.key}
                          className={`grammar__option ${selected ? 'grammar__option--selected' : ''}`}
                          onClick={() =>
                            setAnswers((prev) => ({ ...prev, [q.id]: opt.key }))
                          }
                        >
                          <View className={`grammar__option-radio ${selected ? 'grammar__option-radio--checked' : ''}`}>
                            {selected && <View className="grammar__option-radio-dot" />}
                          </View>
                          <Text className="grammar__option-text">
                            {opt.key}. {opt.text}
                          </Text>
                        </View>
                      )
                    })}
                  </View>
                </View>
              ))}
            </View>
            <View className="grammar__action-spacer" />
          </ScrollView>
          <View className="grammar__bottom-bar">
            <View
              className={`grammar__btn ${!allAnswered ? 'grammar__btn--disabled' : 'grammar__btn--primary'}`}
              onClick={() => void onSubmit()}
            >
              <Text className="grammar__btn-text">
                {submitting
                  ? '提交中...'
                  : allAnswered
                    ? '提交'
                    : `还需答 ${totalQuestions - answeredCount} 题`}
              </Text>
            </View>
          </View>
          <View
            className={`grammar__mobile-submit ${!allAnswered || submitting ? 'grammar__mobile-submit--disabled' : ''}`}
            onClick={() => void onSubmit()}
          >
            <ArrowRight size={20} color="#fff" />
          </View>
        </View>
      )}

      {/* 结果阶段 */}
      {phase === 'result' && result && (
        <ScrollView className="grammar__body" scrollY enableFlex>
          <View className="grammar__result-card">
            <Text className="grammar__result-score">{result.correctCount} / {result.questionCount}</Text>
            <Text className="grammar__result-meta">
              得分 {result.score} 分 · 用时 {result.durationSec} 秒
            </Text>
          </View>
          <View className="grammar__detail-list">
            {(result.details || []).map((d, idx) => (
              <View
                key={d.questionId}
                className={`grammar__detail ${d.correct ? 'grammar__detail--correct' : 'grammar__detail--wrong'}`}
              >
                <Text className="grammar__detail-stem">{idx + 1}. {d.stem}</Text>
                <Text className="grammar__detail-answer">
                  你的答案: {d.answer || '未作答'}
                </Text>
                {!d.correct && (
                  <Text className="grammar__detail-right">正确答案: {d.rightAnswer}</Text>
                )}
                {d.explanation && (
                  <Text className="grammar__detail-explain">解析: {d.explanation}</Text>
                )}
              </View>
            ))}
          </View>
          <View className="grammar__result-actions">
            <View className="grammar__btn grammar__btn--outline" onClick={backToList}>
              <Text className="grammar__btn-text">返回列表</Text>
            </View>
            <View
              className="grammar__btn grammar__btn--primary"
              onClick={() => {
                if (result.lessonId) void openLesson(result.lessonId)
              }}
            >
              <Text className="grammar__btn-text">再学一次</Text>
            </View>
          </View>
          <View style={{ height: '48rpx' }} />
        </ScrollView>
      )}
    </View>
  )
}
