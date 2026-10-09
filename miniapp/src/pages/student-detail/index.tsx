import { useCallback, useEffect, useMemo, useState } from 'react'
import { Image, Input, ScrollView, Text, View } from '@tarojs/components'
import Taro, { getCurrentInstance } from '@tarojs/taro'
import { ArrowLeft, Clock, Del, Edit, List, Plus, Search, ShieldCheck } from '@nutui/icons-react-taro'
import { CloudButton } from '../../components/button'
import {
  addStudentWordBookAsTeacher,
  addTeacherCoachingStudent,
  listAllTeacherCoachingQuotas,
  listStudentActivityRecordsAsTeacher,
  listStudentWordBooksAsTeacher,
  removeStudentWordBookAsTeacher,
  removeTeacherStudent,
  setTeacherStudentPassword,
  setTeacherStudentReviewCurve,
  type ReviewCurvePreset,
  type StudentActivityListItem,
  type StudentWordBookItem,
  type TeacherCoachingQuotaRow,
} from '../../api/coaching'
import { listWordBooks, type WordBookItem } from '../../api/wordbooks'
import { resolveMediaUrl } from '../../utils/mediaUrl'
import { color } from '../../styles/tokens'
import './index.scss'

const DEFAULT_PASSWORD = 'student123'
type TabKey = 'hours' | 'wordbooks' | 'vocab'

const REVIEW_OPTIONS: Array<{ value: ReviewCurvePreset; label: string; desc: string }> = [
  { value: 'times3', label: '3 次复习', desc: '第 2→3→5 天' },
  { value: 'times5', label: '5 次复习', desc: '第 2→3→5→8→12 天' },
  { value: 'times7', label: '7 次复习', desc: '第 2→3→5→8→12→16→21 天' },
  { value: 'times10', label: '10 次复习', desc: '第 2→3→4→6→8→10→13→15→18→22 天' },
]

function studentLabel(row: TeacherCoachingQuotaRow) {
  const s = row.student
  return s?.displayName || s?.username || s?.email || `学员 #${row.studentId}`
}

function normalizePreset(p?: string | null): ReviewCurvePreset {
  if (p === 'times3' || p === 'interval3') return 'times3'
  if (p === 'times7' || p === 'interval7') return 'times7'
  if (p === 'times10' || p === 'standard' || p === 'interval10') return 'times10'
  return 'times5'
}

function reviewCurveLabel(p?: string | null): string {
  const n = normalizePreset(p)
  return REVIEW_OPTIONS.find((o) => o.value === n)?.label || '5 次复习'
}

function formatDateTime(iso?: string | null) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return String(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function StudentDetail() {
  const params = getCurrentInstance().router?.params || {}
  const studentId = Number(params.id || params.studentId || 0)
  const initialTab: TabKey = params.tab === 'wordbooks' || params.tab === 'vocab' ? params.tab : 'hours'
  const [tab, setTab] = useState<TabKey>(initialTab)
  const [quota, setQuota] = useState<TeacherCoachingQuotaRow | null>(null)
  const [title, setTitle] = useState(decodeURIComponent(params.name || ''))
  const [loadingQuota, setLoadingQuota] = useState(true)

  const [wordBooks, setWordBooks] = useState<StudentWordBookItem[]>([])
  const [loadingBooks, setLoadingBooks] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [catalog, setCatalog] = useState<WordBookItem[]>([])
  const [catalogQ, setCatalogQ] = useState('')
  const [catalogLoading, setCatalogLoading] = useState(false)
  const [addingId, setAddingId] = useState<number | null>(null)
  const [removingId, setRemovingId] = useState<number | null>(null)

  const [vocabItems, setVocabItems] = useState<StudentActivityListItem[]>([])
  const [loadingVocab, setLoadingVocab] = useState(false)
  const [pwdOpen, setPwdOpen] = useState(false)
  const [pwdValue, setPwdValue] = useState(DEFAULT_PASSWORD)
  const [pwdSaving, setPwdSaving] = useState(false)
  const [reviewPreset, setReviewPreset] = useState<ReviewCurvePreset>('times5')
  const [reviewSaving, setReviewSaving] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [quotaEditOpen, setQuotaEditOpen] = useState(false)
  const [quotaMode, setQuotaMode] = useState<'add' | 'set'>('add')
  const [quotaInput, setQuotaInput] = useState('1')
  const [quotaSaving, setQuotaSaving] = useState(false)

  useEffect(() => {
    if (!studentId) {
      setLoadingQuota(false)
      return
    }
    let cancelled = false
    ;(async () => {
      setLoadingQuota(true)
      try {
        const rows = await listAllTeacherCoachingQuotas()
        if (cancelled) return
        const row = rows.find((r) => Number(r.studentId) === studentId) || null
        setQuota(row)
        if (row) setTitle(studentLabel(row))
      } catch {
        if (!cancelled && !title) setTitle(`学员 #${studentId}`)
      } finally {
        if (!cancelled) setLoadingQuota(false)
      }
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId])

  useEffect(() => {
    const p = (quota as any)?.reviewCurvePreset || (quota?.student as any)?.reviewCurvePreset || (quota?.reviewTimes === 3 ? 'times3' : quota?.reviewTimes === 7 ? 'times7' : quota?.reviewTimes === 10 ? 'times10' : 'times5')
    setReviewPreset(normalizePreset(p))
  }, [quota])

  const saveReviewCurve = async (next: ReviewCurvePreset) => {
    setReviewPreset(next)
    setReviewSaving(true)
    try {
      const res = await setTeacherStudentReviewCurve(studentId, next)
      if (res.code !== 200) {
        Taro.showToast({ title: res.msg || '操作失败', icon: 'none' })
        return
      }
      setQuota((prev) => prev ? { ...prev, reviewTimes: res.data?.reviewTimes, reviewCurvePreset: next } as TeacherCoachingQuotaRow : prev)
      Taro.showToast({ title: '复习方案已更新', icon: 'success' })
    } catch (e: any) {
      Taro.showToast({ title: e?.msg || '操作失败', icon: 'none' })
    } finally {
      setReviewSaving(false)
    }
  }

  const displayName = title || `学员 #${studentId}`
  const avatar = resolveMediaUrl(quota?.student?.avatar)
  const remaining = quota?.remainingLessons ?? 0
  const total = quota?.totalAllocatedLessons ?? 0
  const low = remaining < 1

  const loadWordBooks = useCallback(async () => {
    if (!studentId) return
    setLoadingBooks(true)
    try {
      const res = await listStudentWordBooksAsTeacher(studentId)
      if (res.code !== 200) {
        Taro.showToast({ title: res.msg || '查询失败', icon: 'none' })
        setWordBooks([])
        return
      }
      setWordBooks(Array.isArray(res.data?.list) ? res.data.list : [])
    } catch (e: any) {
      Taro.showToast({ title: e?.msg || '查询失败', icon: 'none' })
      setWordBooks([])
    } finally {
      setLoadingBooks(false)
    }
  }, [studentId])

  const loadVocabTests = useCallback(async () => {
    if (!studentId) return
    setLoadingVocab(true)
    try {
      const res = await listStudentActivityRecordsAsTeacher(studentId, { limit: 50, q: 'vocab_test' })
      if (res.code !== 200) {
        Taro.showToast({ title: res.msg || '查询失败', icon: 'none' })
        setVocabItems([])
        return
      }
      const list = Array.isArray(res.data?.list) ? res.data.list : []
      setVocabItems(list.filter((x) => x.kind === 'vocab_test'))
    } catch (e: any) {
      Taro.showToast({ title: e?.msg || '查询失败', icon: 'none' })
      setVocabItems([])
    } finally {
      setLoadingVocab(false)
    }
  }, [studentId])

  useEffect(() => { if (tab === 'wordbooks') void loadWordBooks() }, [tab, loadWordBooks])
  useEffect(() => { if (tab === 'vocab') void loadVocabTests() }, [tab, loadVocabTests])

  const loadCatalog = useCallback(async (keyword: string) => {
    setCatalogLoading(true)
    try {
      const res = await listWordBooks({ page: 1, pageSize: 40, keyword: keyword.trim() || undefined })
      setCatalog(res.code === 200 && Array.isArray(res.data?.list) ? res.data.list : [])
    } catch {
      setCatalog([])
    } finally {
      setCatalogLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!addOpen) return
    const timer = setTimeout(() => void loadCatalog(catalogQ), catalogQ.trim() ? 300 : 0)
    return () => clearTimeout(timer)
  }, [addOpen, catalogQ, loadCatalog])

  const assignedIds = useMemo(() => new Set(wordBooks.map((b) => Number(b.id))), [wordBooks])
  const filteredCatalog = useMemo(() => {
    const q = catalogQ.trim().toLowerCase()
    return catalog.filter((b) => {
      if (assignedIds.has(Number(b.id))) return false
      if (!q) return true
      return b.name.toLowerCase().includes(q) || String(b.id).includes(q) || String(b.level || '').toLowerCase().includes(q) || String(b.category || '').toLowerCase().includes(q)
    })
  }, [catalog, catalogQ, assignedIds])

  const saveStudentQuota = async () => {
    if (!quota) return
    const n = Number(quotaInput)
    if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
      Taro.showToast({ title: '请输入非负整数', icon: 'none' })
      return
    }
    const nextRemaining = quotaMode === 'add' ? Math.max(0, remaining) + n : n
    setQuotaSaving(true)
    try {
      const res = await addTeacherCoachingStudent({ studentId, remainingLessons: nextRemaining })
      if (res.code !== 200 || !res.data) {
        Taro.showToast({ title: res.msg || '操作失败', icon: 'none' })
        return
      }
      setQuota((prev) => prev ? { ...prev, ...res.data, student: res.data.student || prev.student } : res.data)
      Taro.showToast({ title: quotaMode === 'add' ? `已增加 ${n} 节` : `已设为 ${nextRemaining} 节`, icon: 'success' })
      setQuotaInput(quotaMode === 'add' ? '1' : String(nextRemaining))
      setQuotaEditOpen(false)
    } catch (e: any) {
      Taro.showToast({ title: e?.msg || '操作失败', icon: 'none' })
    } finally {
      setQuotaSaving(false)
    }
  }

  const handleAddBook = async (wbId: number) => {
    setAddingId(wbId)
    try {
      const res = await addStudentWordBookAsTeacher(studentId, wbId)
      if (res.code !== 200) {
        Taro.showToast({ title: res.msg || '操作失败', icon: 'none' })
        return
      }
      Taro.showToast({ title: '已添加词库', icon: 'success' })
      await loadWordBooks()
      setAddOpen(false)
    } catch (e: any) {
      Taro.showToast({ title: e?.msg || '操作失败', icon: 'none' })
    } finally {
      setAddingId(null)
    }
  }

  const handleRemoveBook = async (wbId: number) => {
    setRemovingId(wbId)
    try {
      const res = await removeStudentWordBookAsTeacher(studentId, wbId)
      if (res.code !== 200) {
        Taro.showToast({ title: res.msg || '操作失败', icon: 'none' })
        return
      }
      Taro.showToast({ title: '已移除词库', icon: 'success' })
      setWordBooks((prev) => prev.filter((b) => Number(b.id) !== wbId))
    } catch (e: any) {
      Taro.showToast({ title: e?.msg || '操作失败', icon: 'none' })
    } finally {
      setRemovingId(null)
    }
  }

  const savePassword = async (resetDefault: boolean) => {
    const pwd = resetDefault ? DEFAULT_PASSWORD : pwdValue.trim()
    if (!pwd || pwd.length < 6) {
      Taro.showToast({ title: '密码至少 6 位', icon: 'none' })
      return
    }
    setPwdSaving(true)
    try {
      const res = await setTeacherStudentPassword(studentId, pwd)
      if (res.code !== 200) {
        Taro.showToast({ title: res.msg || '操作失败', icon: 'none' })
        return
      }
      const account = res.data?.username || quota?.student?.username || displayName
      Taro.showToast({ title: resetDefault ? `已重置：${account}` : '密码已更新', icon: 'success' })
      setPwdOpen(false)
    } catch (e: any) {
      Taro.showToast({ title: e?.msg || '操作失败', icon: 'none' })
    } finally {
      setPwdSaving(false)
    }
  }

  const handleRemoveStudent = async () => {
    setDeleting(true)
    try {
      const res = await removeTeacherStudent(studentId)
      if (res.code !== 200) {
        Taro.showToast({ title: res.msg || '操作失败', icon: 'none' })
        return
      }
      Taro.showToast({ title: '已移除学员', icon: 'success' })
      setDeleteOpen(false)
      Taro.navigateBack()
    } catch (e: any) {
      Taro.showToast({ title: e?.msg || '操作失败', icon: 'none' })
    } finally {
      setDeleting(false)
    }
  }

  if (!studentId) {
    return <View className="student-detail student-detail--invalid"><Text>无效的学员 ID</Text></View>
  }

  return (
    <View className="student-detail">
      <View className="student-detail__top">
        <View className="student-detail__back" onClick={() => Taro.navigateBack()}>
          <ArrowLeft size={20} color={color.charcoal} />
        </View>
        <View className="student-detail__identity">
          <View className="student-detail__avatar">
            {avatar ? <Image className="student-detail__avatar-img" src={avatar} mode="aspectFill" /> : <Text className="student-detail__avatar-text">{(displayName || '?').trim().slice(0, 1).toUpperCase()}</Text>}
          </View>
          <View className="student-detail__identity-text">
            <Text className="student-detail__name">{displayName}</Text>
            <Text className="student-detail__account">{quota?.student?.username || quota?.student?.email || `ID ${studentId}`}</Text>
          </View>
        </View>
        <CloudButton variant="outline" size="sm" className="student-detail__remove" disabled={!quota || deleting} onClick={() => setDeleteOpen(true)}>
          <Del size={14} color={color.destructive} /> 移除
        </CloudButton>
      </View>

      <View className="student-detail__tabs">
        {([['hours', '课时'], ['wordbooks', '词库'], ['vocab', '测评']] as Array<[TabKey, string]>).map(([key, label]) => (
          <View key={key} className={`student-detail__tab ${tab === key ? 'student-detail__tab--active' : ''}`} onClick={() => setTab(key)}><Text>{label}</Text></View>
        ))}
      </View>

      <ScrollView className="student-detail__body" scrollY enableFlex>
        {tab === 'hours' ? (
          loadingQuota ? <View className="student-detail__state"><Text>加载中…</Text></View> : !quota ? <View className="student-detail__state"><Text>未找到该学员的课时配额</Text></View> : (
            <>
              <View className="student-detail__card">
                <View className="student-detail__quota-head">
                  <View className="student-detail__quota-info">
                    <Text className="student-detail__quota-label">剩余课时</Text>
                    <Text className={`student-detail__quota-num ${low ? 'student-detail__quota-num--low' : ''}`}>剩余 {remaining} 节</Text>
                    <View className="student-detail__quota-meta-row">
                      <Text className="student-detail__quota-meta">已分配 {total} 节，剩余 {remaining} 节</Text>
                      <View className="student-detail__edit" onClick={() => { setQuotaMode('add'); setQuotaInput('1'); setQuotaEditOpen(true) }}><Edit size={14} color={color.mutedForeground} /></View>
                    </View>
                  </View>
                  <View className={`student-detail__quota-icon ${low ? 'student-detail__quota-icon--low' : ''}`}><Clock size={22} color={low ? color.destructive : color.primary} /></View>
                </View>
                {total > 0 ? <View className="student-detail__progress"><View className={`student-detail__progress-fill ${low ? 'student-detail__progress-fill--low' : ''}`} style={{ width: `${Math.min(100, Math.round((remaining / total) * 100))}%` }} /></View> : null}
              </View>

              <View className="student-detail__card">
                <Text className="student-detail__card-title">抗遗忘复习次数</Text>
                <Text className="student-detail__card-desc">当前方案：{reviewCurveLabel(reviewPreset)}</Text>
                <View className="student-detail__review-grid">
                  {REVIEW_OPTIONS.map((opt) => (
                    <CloudButton key={opt.value} variant={reviewPreset === opt.value ? 'brand' : 'outline'} size="sm" disabled={reviewSaving} onClick={() => void saveReviewCurve(opt.value)}>{opt.label}</CloudButton>
                  ))}
                </View>
              </View>

              <View className="student-detail__card">
                <Text className="student-detail__card-title">快捷操作</Text>
                <View className="student-detail__actions">
                  <CloudButton variant="outline" size="sm" onClick={() => { setPwdValue(DEFAULT_PASSWORD); setPwdOpen(true) }}><ShieldCheck size={14} /> 重置密码</CloudButton>
                </View>
                <View className="student-detail__stats">
                  <View><Text>测评 </Text><Text className="student-detail__stat-num">{quota.vocabTestCount ?? 0}</Text></View>
                  <View><Text>陪练 </Text><Text className="student-detail__stat-num">{quota.coachingSessionCount ?? 0}</Text></View>
                  <View><Text>训练 </Text><Text className="student-detail__stat-num">{quota.studySessionCount ?? 0}</Text></View>
                </View>
                {quota.latestVocabLevel ? <Text className="student-detail__latest">最近测评：{quota.latestVocabLevel}{quota.latestEstimatedVocab ? ` · 约 ${quota.latestEstimatedVocab} 词` : ''}{quota.latestVocabTestAt ? ` · ${formatDateTime(quota.latestVocabTestAt)}` : ''}</Text> : null}
              </View>
            </>
          )
        ) : null}

        {tab === 'wordbooks' ? (
          <>
            <View className="student-detail__section-head">
              <Text className="student-detail__section-text">已分配 {loadingBooks ? '…' : wordBooks.length} 本词库</Text>
              <CloudButton variant="brand" size="sm" onClick={() => { setAddOpen(true); setCatalogQ(''); setCatalog([]) }}><Plus size={14} /> 添加词库</CloudButton>
            </View>
            {loadingBooks ? <View className="student-detail__state"><Text>加载词库中…</Text></View> : wordBooks.length === 0 ? <View className="student-detail__state"><Text>暂未分配词库</Text></View> : wordBooks.map((b) => (
              <View key={b.id} className="student-detail__book">
                <View className="student-detail__book-icon"><List size={18} color={color.primary} /></View>
                <View className="student-detail__book-info">
                  <Text className="student-detail__book-name">{b.name}</Text>
                  <Text className="student-detail__book-meta">{b.wordCount > 0 ? `${b.wordCount} 词` : '词数未知'} · ID {b.id}</Text>
                </View>
                <View className="student-detail__book-remove" onClick={() => void handleRemoveBook(Number(b.id))}>{removingId === b.id ? <Text>…</Text> : <Del size={16} color={color.destructive} />}</View>
              </View>
            ))}
          </>
        ) : null}

        {tab === 'vocab' ? (
          loadingVocab ? <View className="student-detail__state"><Text>加载测评中…</Text></View> : vocabItems.length === 0 ? <View className="student-detail__state"><Text>暂无词汇测评记录</Text></View> : vocabItems.map((item) => (
            <View key={`${item.kind}-${item.id}`} className="student-detail__vocab" onClick={() => Taro.navigateTo({ url: `/pages/vocab-test-result/index?studentId=${studentId}&recordId=${item.id}` })}>
              <View className="student-detail__vocab-head">
                <View className="student-detail__vocab-info">
                  <Text className="student-detail__vocab-title">{item.title}</Text>
                  <Text className="student-detail__vocab-summary">{item.summary}</Text>
                  <Text className="student-detail__vocab-time">{formatDateTime(item.time)}</Text>
                </View>
                {item.vocabTest?.estimatedLevel ? <Text className="student-detail__vocab-level">{item.vocabTest.estimatedLevel}</Text> : null}
              </View>
            </View>
          ))
        ) : null}
      </ScrollView>

      {quotaEditOpen ? (
        <View className="student-detail__mask" onClick={() => { if (!quotaSaving) setQuotaEditOpen(false) }}>
          <View className="student-detail__modal" onClick={(e) => e.stopPropagation()}>
            <View className="student-detail__modal-head"><Text className="student-detail__modal-title">调整课时</Text><Text className="student-detail__modal-desc">已分配 {total} 节，剩余 {remaining} 节</Text></View>
            <View className="student-detail__mode-row">
              <CloudButton size="sm" variant={quotaMode === 'add' ? 'brand' : 'outline'} onClick={() => { setQuotaMode('add'); setQuotaInput('1') }}>增加课时</CloudButton>
              <CloudButton size="sm" variant={quotaMode === 'set' ? 'brand' : 'outline'} onClick={() => { setQuotaMode('set'); setQuotaInput(String(Math.max(0, remaining))) }}>设为剩余</CloudButton>
            </View>
            <View className="student-detail__field"><Text className="student-detail__field-label">{quotaMode === 'add' ? '增加的课时' : '剩余课时'}</Text><Input className="student-detail__field-input" type="number" value={quotaInput} onInput={(e) => setQuotaInput(e.detail.value)} /></View>
            <View className="student-detail__quick-row">{(quotaMode === 'add' ? [1, 2, 4, 8] : [0, 2, 4, 8]).map((n) => <CloudButton key={n} size="sm" variant="outline" onClick={() => setQuotaInput(String(n))}>{quotaMode === 'add' ? `+${n}` : `${n} 节`}</CloudButton>)}</View>
            <View className="student-detail__modal-actions"><CloudButton variant="outline" disabled={quotaSaving} onClick={() => setQuotaEditOpen(false)}>取消</CloudButton><CloudButton variant="brand" loading={quotaSaving} onClick={() => void saveStudentQuota()}>保存</CloudButton></View>
          </View>
        </View>
      ) : null}

      {addOpen ? (
        <View className="student-detail__mask" onClick={() => setAddOpen(false)}>
          <View className="student-detail__modal student-detail__modal--books" onClick={(e) => e.stopPropagation()}>
            <View className="student-detail__modal-head"><Text className="student-detail__modal-title">添加词库</Text><Text className="student-detail__modal-desc">搜索并添加到学员词库</Text></View>
            <View className="student-detail__book-search"><Search size={16} color={color.mutedForeground} /><Input className="student-detail__book-search-input" value={catalogQ} onInput={(e) => setCatalogQ(e.detail.value)} placeholder="搜索词库名称…" /></View>
            <ScrollView className="student-detail__catalog" scrollY>
              {catalogLoading ? <View className="student-detail__state"><Text>加载词库中…</Text></View> : filteredCatalog.length === 0 ? <View className="student-detail__state"><Text>{catalogQ.trim() ? '没有可添加的词库' : '输入关键词搜索词库'}</Text></View> : filteredCatalog.map((b) => (
                <View key={b.id} className="student-detail__catalog-item">
                  <View className="student-detail__catalog-info"><Text className="student-detail__catalog-name">{b.name}</Text><Text className="student-detail__catalog-meta">{b.wordCount ? `${b.wordCount} 词` : '—'}{b.level ? ` · ${b.level}` : ''}</Text></View>
                  <CloudButton variant="brand" size="sm" loading={addingId === Number(b.id)} disabled={addingId !== null} onClick={() => void handleAddBook(Number(b.id))}>添加</CloudButton>
                </View>
              ))}
            </ScrollView>
          </View>
        </View>
      ) : null}

      {deleteOpen ? (
        <View className="student-detail__mask" onClick={() => { if (!deleting) setDeleteOpen(false) }}>
          <View className="student-detail__modal" onClick={(e) => e.stopPropagation()}>
            <View className="student-detail__modal-head"><Text className="student-detail__modal-title">移除学员</Text><Text className="student-detail__modal-desc">将 {displayName} 从名下移除，不会删除学员账号。</Text></View>
            <View className="student-detail__modal-actions"><CloudButton variant="outline" disabled={deleting} onClick={() => setDeleteOpen(false)}>取消</CloudButton><CloudButton variant="brand" className="student-detail__danger" loading={deleting} onClick={() => void handleRemoveStudent()}>确认移除</CloudButton></View>
          </View>
        </View>
      ) : null}

      {pwdOpen ? (
        <View className="student-detail__mask" onClick={() => { if (!pwdSaving) setPwdOpen(false) }}>
          <View className="student-detail__modal" onClick={(e) => e.stopPropagation()}>
            <View className="student-detail__modal-head"><Text className="student-detail__modal-title">设置登录密码</Text><Text className="student-detail__modal-desc">{displayName}{quota?.student?.username ? ` · ${quota.student.username}` : ''}</Text></View>
            <Input className="student-detail__field-input" value={pwdValue} onInput={(e) => setPwdValue(e.detail.value)} placeholder={DEFAULT_PASSWORD} />
            <View className="student-detail__modal-actions"><CloudButton variant="outline" disabled={pwdSaving} onClick={() => void savePassword(true)}>重置为 {DEFAULT_PASSWORD}</CloudButton><CloudButton variant="brand" loading={pwdSaving} onClick={() => void savePassword(false)}>保存密码</CloudButton></View>
          </View>
        </View>
      ) : null}
    </View>
  )
}
