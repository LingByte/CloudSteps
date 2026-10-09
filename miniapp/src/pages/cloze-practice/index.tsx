/**
 * 完形填空页 — 对齐 web/src/pages/ClozePractice.tsx。
 * 三阶段:列表 → 练习(选词填空) → 结果
 * 支持系统题库 / 自定义题库切换。
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { View, Text, ScrollView, Input } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { ArrowLeft, ArrowRight, Search, Plus } from '@nutui/icons-react-taro'
import {
  listClozePassages,
  listClozeTags,
  getClozePassage,
  submitClozePassage,
  listCustomClozePassages,
  getCustomClozePassage,
  submitCustomClozePassage,
  type ClozePassageDetail,
  type ClozePassageListItem,
  type ClozeSubmitResult,
} from '../../api/cloze'
import { color } from '../../styles/tokens'
import './index.scss'

type Phase = 'list' | 'practice' | 'result'
type SourceTab = 'system' | 'custom'

type PassageItem = ClozePassageListItem & { isCustom?: boolean }

/** 把 content 里的 {{n}} 占位符拆成文本片段 + 空位标记 */
function splitContent(content: string): Array<{ text?: string; blankNo?: number }> {
  const parts = content.split(/(\{\{\d+\}\})/g)
  return parts.map((part) => {
    const m = part.match(/^\{\{(\d+)\}\}$/)
    if (m) return { blankNo: Number(m[1]) }
    return { text: part }
  })
}

export default function ClozePractice() {
  const [phase, setPhase] = useState<Phase>('list')
  const [sourceTab, setSourceTab] = useState<SourceTab>('system')
  const [tagFilter, setTagFilter] = useState<string>('')
  const [availableTags, setAvailableTags] = useState<string[]>([])
  const [searchInput, setSearchInput] = useState('')
  const [keyword, setKeyword] = useState('')
  const [loadingList, setLoadingList] = useState(true)
  const [loadingPassage, setLoadingPassage] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const [passages, setPassages] = useState<PassageItem[]>([])
  const [passage, setPassage] = useState<ClozePassageDetail | null>(null)
  const [isCustomPassage, setIsCustomPassage] = useState(false)
  const [answers, setAnswers] = useState<Record<number, string>>({})
  const [activeBlankId, setActiveBlankId] = useState<number | null>(null)
  const [result, setResult] = useState<ClozeSubmitResult | null>(null)
  const [nextCursor, setNextCursor] = useState<string | undefined>()
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const startedAtRef = useRef<number>(Date.now())
  const loadingMoreRef = useRef(false)
  const CLOZE_SNAPSHOT_KEY = 'cloze_session_snapshot'

  const PAGE_LIMIT = 30

  const blankNoToId = useMemo(() => {
    const map: Record<number, number> = {}
    passage?.blanks?.forEach((b) => {
      map[b.blankNo] = b.id
    })
    return map
  }, [passage])

  // 搜索防抖
  useEffect(() => {
    const timer = setTimeout(() => setKeyword(searchInput.trim()), 350)
    return () => clearTimeout(timer)
  }, [searchInput])

  useEffect(() => {
    if (!passage || phase !== 'practice') return
    Taro.setStorageSync(CLOZE_SNAPSHOT_KEY, { passageId: passage.id, isCustom: isCustomPassage, answers, activeBlankId })
  }, [passage, isCustomPassage, answers, activeBlankId, phase])

  const fetchPage = async (opts: { cursor?: string; append: boolean } = { append: false }) => {
    if (opts.append) {
      if (loadingMoreRef.current) return
      loadingMoreRef.current = true
      setLoadingMore(true)
    } else {
      setLoadingList(true)
    }
    setErr(null)
    try {
      const params: Record<string, unknown> = {
        limit: PAGE_LIMIT,
        ...(opts.cursor ? { cursor: opts.cursor } : {}),
        ...(keyword ? { keyword } : {}),
        ...(sourceTab === 'system' && tagFilter ? { tag: tagFilter } : {}),
      }
      const res =
        sourceTab === 'custom'
          ? await listCustomClozePassages(params as any)
          : await listClozePassages(params as any)
      if (res.code !== 200) {
        setErr(res.msg || '加载失败')
        if (!opts.append) setPassages([])
        return
      }
      const list = Array.isArray(res.data?.list) ? res.data.list : []
      const items = list.map((p) => ({ ...p, isCustom: sourceTab === 'custom' }))
      setPassages((prev) => (opts.append ? [...prev, ...items] : items))
      setNextCursor(res.data?.nextCursor || undefined)
      setHasMore(Boolean(res.data?.hasMore))
    } catch (e: unknown) {
      const apiMsg = e && typeof e === 'object' && 'msg' in e ? String((e as { msg: string }).msg) : undefined
      setErr(apiMsg || '加载失败')
      if (!opts.append) setPassages([])
    } finally {
      setLoadingList(false)
      setLoadingMore(false)
      loadingMoreRef.current = false
    }
  }

  useEffect(() => {
    if (phase === 'list') void fetchPage({ append: false })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, sourceTab, tagFilter, keyword])

  // 加载标签
  useEffect(() => {
    if (sourceTab !== 'system') {
      setAvailableTags([])
      return
    }
    void listClozeTags()
      .then((res) => {
        if (res.code === 200 && res.data?.tags) setAvailableTags(res.data.tags)
      })
      .catch(() => {})
  }, [sourceTab])

  const answeredCount = useMemo(
    () => Object.keys(answers).filter((k) => answers[Number(k)]).length,
    [answers],
  )
  const totalBlanks = passage?.blanks?.length ?? 0
  const allAnswered = totalBlanks > 0 && answeredCount === totalBlanks
  const percent = totalBlanks > 0 ? Math.round((answeredCount / totalBlanks) * 100) : 0

  const activeBlank = useMemo(
    () => passage?.blanks?.find((b) => b.id === activeBlankId) ?? passage?.blanks?.[0] ?? null,
    [passage, activeBlankId],
  )

  const openPassage = async (id: number, isCustom: boolean) => {
    setLoadingPassage(true)
    setErr(null)
    try {
      const res = isCustom ? await getCustomClozePassage(id) : await getClozePassage(id)
      if (res.code !== 200 || !res.data) {
        setErr(res.msg || '加载失败')
        return
      }
      setPassage(res.data)
      setIsCustomPassage(isCustom)
      const snapshot = Taro.getStorageSync(CLOZE_SNAPSHOT_KEY)
      const restored = snapshot && snapshot.passageId === res.data.id && snapshot.isCustom === isCustom ? snapshot : null
      setAnswers(restored?.answers || {})
      setResult(null)
      setActiveBlankId(restored?.activeBlankId || res.data.blanks?.[0]?.id || null)
      startedAtRef.current = Date.now()
      setPhase('practice')
    } catch (e: unknown) {
      const apiMsg = e && typeof e === 'object' && 'msg' in e ? String((e as { msg: string }).msg) : undefined
      setErr(apiMsg || '加载失败')
    } finally {
      setLoadingPassage(false)
    }
  }

  const onPickAnswer = (blankId: number, key: string) => {
    setAnswers((prev) => ({ ...prev, [blankId]: key }))
    if (!passage) return
    const idx = passage.blanks.findIndex((b) => b.id === blankId)
    const next = passage.blanks[idx + 1]
    if (next) setActiveBlankId(next.id)
  }

  const onSubmit = async () => {
    if (!passage || !allAnswered) return
    setSubmitting(true)
    setErr(null)
    try {
      const durationSec = Math.max(1, Math.round((Date.now() - startedAtRef.current) / 1000))
      const payload = {
        answers: passage.blanks.map((b) => ({
          blankId: b.id,
          answer: answers[b.id] || '',
        })),
        durationSec,
      }
      const res = isCustomPassage
        ? await submitCustomClozePassage(passage.id, payload)
        : await submitClozePassage(passage.id, payload)
      if (res.code !== 200 || !res.data) {
        setErr(res.msg || '提交失败')
        return
      }
      setResult(res.data)
      Taro.removeStorageSync(CLOZE_SNAPSHOT_KEY)
      setPhase('result')
      void fetchPage({ append: false })
    } catch (e: unknown) {
      const apiMsg = e && typeof e === 'object' && 'msg' in e ? String((e as { msg: string }).msg) : undefined
      setErr(apiMsg || '提交失败')
    } finally {
      setSubmitting(false)
    }
  }

  const backToList = () => {
    Taro.removeStorageSync(CLOZE_SNAPSHOT_KEY)
    setPhase('list')
    setPassage(null)
    setIsCustomPassage(false)
    setAnswers({})
    setResult(null)
    setActiveBlankId(null)
    setErr(null)
  }

  const headerBack = () => {
    if (phase === 'list') Taro.navigateBack()
    else backToList()
  }

  const contentParts = useMemo(
    () => (passage ? splitContent(passage.content) : []),
    [passage],
  )

  return (
    <View className="cloze">
      {/* 顶部导航栏 */}
      <View className="cloze__navbar">
        <View className="cloze__nav-btn" onClick={headerBack}>
          <ArrowLeft size={22} color={color.charcoal} />
        </View>
        <View className="cloze__nav-center">
          <Text className="cloze__nav-title">完形填空</Text>
          {phase === 'practice' && passage && (
            <Text className="cloze__nav-sub">{passage.title} · {passage.level}</Text>
          )}
        </View>
        <View className="cloze__nav-right">
          {phase === 'list' && (
            <View className="cloze__nav-tools">
            <View className="cloze__tab-group">
              {(['system', 'custom'] as SourceTab[]).map((key) => (
                <View
                  key={key}
                  className={`cloze__tab ${sourceTab === key ? 'cloze__tab--active' : ''}`}
                  onClick={() => {
                    setSourceTab(key)
                    setTagFilter('')
                  }}
                >
                  <Text className="cloze__tab-text">{key === 'system' ? '系统' : '自定义'}</Text>
                </View>
              ))}
            </View>
            {sourceTab === 'custom' && <View className="cloze__create-btn" onClick={() => Taro.navigateTo({ url: '/pages/create-custom-cloze/index' })}><Plus size={16} color={color.primary} /></View>}
            </View>
          )}
          {phase === 'practice' && (
            <Text className="cloze__nav-count">{answeredCount}/{totalBlanks}</Text>
          )}
        </View>
      </View>

      {/* 进度条 */}
      {phase === 'practice' && (
        <View className="cloze__progress-bar">
          <View className="cloze__progress-fill" style={{ width: `${percent}%` }} />
        </View>
      )}

      {/* 搜索栏(列表阶段) */}
      {phase === 'list' && (
        <View className="cloze__search-bar">
          <View className="cloze__search-input-wrap">
            <Search size={16} color={color.mutedSoft} />
            <Input
              className="cloze__search-input"
              value={searchInput}
              onInput={(e) => setSearchInput(e.detail.value)}
              placeholder="搜索完形填空"
              confirmType="search"
            />
          </View>
        </View>
      )}

      {/* 标签栏(系统题库) */}
      {phase === 'list' && sourceTab === 'system' && availableTags.length > 0 && (
        <ScrollView className="cloze__tag-bar" scrollX enableFlex>
          <View
            className={`cloze__tag-chip ${!tagFilter ? 'cloze__tag-chip--active' : ''}`}
            onClick={() => setTagFilter('')}
          >
            <Text className="cloze__tag-chip-text">全部</Text>
          </View>
          {availableTags.map((tag) => (
            <View
              key={tag}
              className={`cloze__tag-chip ${tagFilter === tag ? 'cloze__tag-chip--active' : ''}`}
              onClick={() => setTagFilter(tagFilter === tag ? '' : tag)}
            >
              <Text className="cloze__tag-chip-text">{tag}</Text>
            </View>
          ))}
        </ScrollView>
      )}

      {/* 错误提示 */}
      {err && (
        <View className="cloze__err">
          <Text className="cloze__err-text">{err}</Text>
        </View>
      )}

      {/* 列表阶段 */}
      {phase === 'list' && (
        <ScrollView
          className="cloze__body"
          scrollY
          enableFlex
          lowerThreshold={120}
          onScrollToLower={() => {
            if (!hasMore || loadingList || loadingMoreRef.current || !nextCursor) return
            void fetchPage({ cursor: nextCursor, append: true })
          }}
        >
          {loadingList || loadingPassage ? (
            <View className="cloze__state">
              <Text className="cloze__state-text">加载中...</Text>
            </View>
          ) : passages.length === 0 ? (
            <View className="cloze__state">
              <Text className="cloze__state-text">
                {keyword ? '未找到匹配内容' : sourceTab === 'custom' ? '暂无自定义完形' : '暂无完形填空'}
              </Text>
            </View>
          ) : (
            <View className="cloze__list">
              {passages.map((p) => {
                const tags = (p.tags || '').split(',').map((s) => s.trim()).filter(Boolean)
                return (
                  <View
                    key={`${p.isCustom ? 'c' : 's'}-${p.id}`}
                    className="cloze__passage-card"
                    onClick={() => void openPassage(p.id, !!p.isCustom)}
                  >
                    <View className="cloze__passage-top">
                      <Text className="cloze__passage-title">{p.title}</Text>
                      <View className="cloze__passage-tags">
                        <View className="cloze__level-tag">
                          <Text className="cloze__level-tag-text">{p.level}</Text>
                        </View>
                        {p.isCustom && (
                          <View className="cloze__level-tag cloze__level-tag--custom">
                            <Text className="cloze__level-tag-text">自定义</Text>
                          </View>
                        )}
                      </View>
                    </View>
                    {tags.length > 0 && (
                      <View className="cloze__passage-tag-row">
                        {tags.map((tag) => (
                          <View key={tag} className="cloze__mini-tag">
                            <Text className="cloze__mini-tag-text">{tag}</Text>
                          </View>
                        ))}
                      </View>
                    )}
                    {p.summary ? <Text className="cloze__passage-summary">{p.summary}</Text> : null}
                    <Text className="cloze__passage-meta">
                      {p.blankCount ?? 0} 空 · 约 {p.estimatedMinutes ?? 5} 分钟
                    </Text>
                    {typeof p.lastScore === 'number' && (
                      <View
                        className={`cloze__score-tag ${p.lastScore >= 80 ? 'cloze__score-tag--green' : 'cloze__score-tag--red'}`}
                      >
                        <Text className="cloze__score-tag-text">上次 {p.lastScore} 分</Text>
                      </View>
                    )}
                  </View>
                )
              })}
              {loadingMore && (
                <View className="cloze__load-more">
                  <Text className="cloze__load-more-text">加载中...</Text>
                </View>
              )}
            </View>
          )}
          <View style={{ height: '48rpx' }} />
        </ScrollView>
      )}

      {/* 练习阶段 */}
      {phase === 'practice' && passage && (
        <View className="cloze__practice-wrap">
          <ScrollView className="cloze__body" scrollY enableFlex>
            {/* 文章 + 空位 */}
            <View className="cloze__card">
              <Text className="cloze__card-title">文章</Text>
              <View className="cloze__passage-content">
                {contentParts.map((part, idx) => {
                  if (part.blankNo !== undefined) {
                    const blankId = blankNoToId[part.blankNo]
                    const selected = blankId ? answers[blankId] : ''
                    return (
                      <View
                        key={idx}
                        className={`cloze__blank ${selected ? 'cloze__blank--filled' : ''}`}
                      >
                        <Text className="cloze__blank-text">{selected || part.blankNo}</Text>
                      </View>
                    )
                  }
                  return (
                    <Text key={idx} className="cloze__passage-text">{part.text}</Text>
                  )
                })}
              </View>
            </View>

            {/* 空位快速切换 */}
            <View className="cloze__blank-chips">
              {passage.blanks.map((b) => (
                <View
                  key={b.id}
                  className={`cloze__blank-chip ${activeBlank?.id === b.id ? 'cloze__blank-chip--active' : ''}`}
                  onClick={() => setActiveBlankId(b.id)}
                >
                  <Text className="cloze__blank-chip-text">
                    {b.blankNo}{answers[b.id] ? ` · ${answers[b.id]}` : ''}
                  </Text>
                </View>
              ))}
            </View>

            {/* 当前空位选项 */}
            {activeBlank && (
              <View className="cloze__card">
                <Text className="cloze__card-title">第 {activeBlank.blankNo} 空</Text>
                <View className="cloze__options">
                  {(activeBlank.options || []).map((opt) => {
                    const selected = answers[activeBlank.id] === opt.key
                    return (
                      <View
                        key={opt.key}
                        className={`cloze__option ${selected ? 'cloze__option--selected' : ''}`}
                        onClick={() => onPickAnswer(activeBlank.id, opt.key)}
                      >
                        <View className={`cloze__option-radio ${selected ? 'cloze__option-radio--checked' : ''}`}>
                          {selected && <View className="cloze__option-radio-dot" />}
                        </View>
                        <Text className="cloze__option-text">{opt.key}. {opt.text}</Text>
                      </View>
                    )
                  })}
                </View>
              </View>
            )}
            <View className="cloze__practice-spacer" />
          </ScrollView>
          <View className="cloze__bottom-bar">
            <View
              className={`cloze__btn ${!allAnswered ? 'cloze__btn--disabled' : 'cloze__btn--primary'}`}
              onClick={() => void onSubmit()}
            >
              <Text className="cloze__btn-text">
                {submitting ? '提交中...' : allAnswered ? '提交' : `还需填 ${totalBlanks - answeredCount} 空`}
              </Text>
            </View>
          </View>
          <View
            className={`cloze__mobile-submit ${!allAnswered || submitting ? 'cloze__mobile-submit--disabled' : ''}`}
            onClick={() => void onSubmit()}
          >
            <ArrowRight size={20} color="#fff" />
          </View>
        </View>
      )}

      {/* 结果阶段 */}
      {phase === 'result' && result && (
        <ScrollView className="cloze__body" scrollY enableFlex>
          <View className="cloze__result-card">
            <Text className="cloze__result-score">{result.correctCount} / {result.blankCount}</Text>
            <Text className="cloze__result-meta">
              得分 {result.score} 分 · 用时 {result.durationSec} 秒
            </Text>
          </View>
          <View className="cloze__detail-list">
            {(result.details || []).map((d) => (
              <View
                key={d.blankId}
                className={`cloze__detail ${d.correct ? 'cloze__detail--correct' : 'cloze__detail--wrong'}`}
              >
                <Text className="cloze__detail-stem">第 {d.blankNo} 空</Text>
                <Text className="cloze__detail-answer">你的答案: {d.answer || '未作答'}</Text>
                {!d.correct && <Text className="cloze__detail-right">正确答案: {d.rightAnswer}</Text>}
                {d.explanation && <Text className="cloze__detail-explain">解析: {d.explanation}</Text>}
              </View>
            ))}
          </View>
          <View className="cloze__result-actions">
            <View className="cloze__btn cloze__btn--outline" onClick={backToList}>
              <Text className="cloze__btn-text">返回列表</Text>
            </View>
            <View
              className="cloze__btn cloze__btn--primary"
              onClick={() => {
                if (result.passageId) void openPassage(result.passageId, isCustomPassage)
              }}
            >
              <Text className="cloze__btn-text">再练一次</Text>
            </View>
          </View>
          <View style={{ height: '48rpx' }} />
        </ScrollView>
      )}
    </View>
  )
}
