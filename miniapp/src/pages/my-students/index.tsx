import { useCallback, useEffect, useRef, useState } from 'react'
import { Image, Input, ScrollView, Text, View } from '@tarojs/components'
import Taro, { getCurrentInstance } from '@tarojs/taro'
import { ArrowLeft, Clock, Plus, Refresh, Search, ShieldCheck } from '@nutui/icons-react-taro'
import { CloudButton } from '../../components/button'
import { AddStudentPanel } from '../../components/add-student-panel/AddStudentPanel'
import {
  getTeacherCoachingQuotas,
  setTeacherStudentPassword,
  type TeacherCoachingQuotaRow,
} from '../../api/coaching'
import { resolveMediaUrl } from '../../utils/mediaUrl'
import { color } from '../../styles/tokens'
import './index.scss'

const DEFAULT_PASSWORD = 'student123'
const PAGE_LIMIT = 20

function studentLabel(row: TeacherCoachingQuotaRow) {
  const s = row.student
  return s?.displayName || s?.username || s?.email || `学员 #${row.studentId}`
}

function studentInitial(row: TeacherCoachingQuotaRow) {
  return (studentLabel(row) || '?').trim().slice(0, 1).toUpperCase() || '?'
}

function studentAvatarUrl(row: TeacherCoachingQuotaRow) {
  return resolveMediaUrl(row.student?.avatar)
}

function loginAccount(row: TeacherCoachingQuotaRow) {
  return row.student?.username || row.student?.email || ''
}

export default function MyStudents() {
  const params = getCurrentInstance().router?.params || {}
  const [rows, setRows] = useState<TeacherCoachingQuotaRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [keyword, setKeyword] = useState('')
  const [debouncedQ, setDebouncedQ] = useState('')
  const [nextCursor, setNextCursor] = useState<string | undefined>()
  const [hasMore, setHasMore] = useState(false)
  const [showAdd, setShowAdd] = useState(() => params.link === '1')
  const [pwdTarget, setPwdTarget] = useState<TeacherCoachingQuotaRow | null>(null)
  const [pwdValue, setPwdValue] = useState(DEFAULT_PASSWORD)
  const [pwdSaving, setPwdSaving] = useState(false)
  const loadingMoreRef = useRef(false)

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQ(keyword.trim()), 300)
    return () => clearTimeout(timer)
  }, [keyword])

  const fetchPage = useCallback(async (opts: { cursor?: string; append: boolean; q: string }) => {
    if (opts.append) {
      if (loadingMoreRef.current) return
      loadingMoreRef.current = true
      setLoadingMore(true)
    } else {
      setLoading(true)
    }
    try {
      const res = await getTeacherCoachingQuotas({ cursor: opts.cursor, limit: PAGE_LIMIT, q: opts.q || undefined })
      if (res.code !== 200) {
        Taro.showToast({ title: res.msg || '查询失败', icon: 'none' })
        if (!opts.append) setRows([])
        return
      }
      const list = Array.isArray(res.data?.list) ? res.data.list : []
      setRows((prev) => (opts.append ? [...prev, ...list] : list))
      setNextCursor(res.data?.nextCursor || undefined)
      setHasMore(Boolean(res.data?.hasMore))
    } catch (e: any) {
      Taro.showToast({ title: e?.msg || '查询失败', icon: 'none' })
      if (!opts.append) setRows([])
    } finally {
      setLoading(false)
      setLoadingMore(false)
      loadingMoreRef.current = false
    }
  }, [])

  useEffect(() => {
    void fetchPage({ append: false, q: debouncedQ })
  }, [debouncedQ, fetchPage])

  const onScrollToLower = () => {
    if (loading || loadingMore || !hasMore || !nextCursor) return
    void fetchPage({ cursor: nextCursor, append: true, q: debouncedQ })
  }

  const openDetail = (r: TeacherCoachingQuotaRow) => {
    Taro.navigateTo({ url: `/pages/student-detail/index?id=${r.studentId}&name=${encodeURIComponent(studentLabel(r))}` })
  }

  const openPwdModal = (r: TeacherCoachingQuotaRow) => {
    setPwdTarget(r)
    setPwdValue(DEFAULT_PASSWORD)
  }

  const closePwdModal = () => {
    if (pwdSaving) return
    setPwdTarget(null)
    setPwdValue(DEFAULT_PASSWORD)
  }

  const savePassword = async (resetDefault: boolean) => {
    if (!pwdTarget) return
    const pwd = resetDefault ? DEFAULT_PASSWORD : pwdValue.trim()
    if (!pwd || pwd.length < 6) {
      Taro.showToast({ title: '密码至少 6 位', icon: 'none' })
      return
    }
    setPwdSaving(true)
    try {
      const res = await setTeacherStudentPassword(pwdTarget.studentId, pwd)
      if (res.code !== 200) {
        Taro.showToast({ title: res.msg || '操作失败', icon: 'none' })
        return
      }
      const account = res.data?.username || loginAccount(pwdTarget) || studentLabel(pwdTarget)
      Taro.showToast({ title: resetDefault ? `已重置：${account}` : '密码已更新', icon: 'success' })
      setPwdTarget(null)
    } catch (e: any) {
      Taro.showToast({ title: e?.msg || '操作失败', icon: 'none' })
    } finally {
      setPwdSaving(false)
    }
  }

  return (
    <View className="my-students">
      <View className="my-students__top">
        <View className="my-students__back" onClick={() => Taro.switchTab({ url: '/pages/home/index' })}>
          <ArrowLeft size={20} color={color.charcoal} />
        </View>
        <View className="my-students__title-wrap"><Text className="my-students__title">我的学生</Text></View>
        <CloudButton variant="outline" size="sm" className="my-students__create" onClick={() => Taro.navigateTo({ url: '/pages/create-student/index' })}>
          <Plus size={14} color={color.charcoal} /> 新建
        </CloudButton>
        <CloudButton variant="ghost" size="sm" onClick={() => setShowAdd((v) => !v)}>关联</CloudButton>
        <CloudButton variant="outline" size="icon" disabled={loading} onClick={() => void fetchPage({ append: false, q: debouncedQ })}>
          <Refresh size={16} color={color.charcoal} />
        </CloudButton>
      </View>

      <AddStudentPanel open={showAdd} onClose={() => setShowAdd(false)} onAdded={() => void fetchPage({ append: false, q: debouncedQ })} />

      <View className="my-students__search">
        <Search size={16} color={color.mutedForeground} />
        <Input
          className="my-students__search-input"
          value={keyword}
          onInput={(e) => setKeyword(e.detail.value)}
          placeholder="搜索学员姓名、账号或手机号…"
          placeholderClass="my-students__search-placeholder"
          confirmType="search"
        />
        {keyword ? <Text className="my-students__clear" onClick={() => setKeyword('')}>×</Text> : null}
      </View>

      <ScrollView className="my-students__list" scrollY enableFlex lowerThreshold={120} onScrollToLower={onScrollToLower}>
        {loading ? (
          <View className="my-students__state"><Text>加载中…</Text></View>
        ) : rows.length === 0 ? (
          <View className="my-students__state"><Text>{debouncedQ ? '没有匹配的学员' : '暂无学员，点击“关联”或“新建”添加'}</Text></View>
        ) : (
          rows.map((r) => {
            const low = (r.remainingLessons || 0) < 1
            const account = loginAccount(r)
            const avatar = studentAvatarUrl(r)
            return (
              <View key={r.id} className="my-students__card">
                <View className="my-students__card-main" onClick={() => openDetail(r)}>
                  <View className="my-students__avatar">
                    {avatar ? <Image className="my-students__avatar-img" src={avatar} mode="aspectFill" /> : <Text className="my-students__avatar-text">{studentInitial(r)}</Text>}
                  </View>
                  <View className="my-students__info">
                    <View className="my-students__name-row">
                      <Text className="my-students__name">{studentLabel(r)}</Text>
                      <View className={`my-students__lessons ${low ? 'my-students__lessons--low' : ''}`}>
                        <Clock size={10} color={low ? color.destructive : color.primary} />
                        <Text>剩 {r.remainingLessons || 0} 节</Text>
                      </View>
                    </View>
                    <Text className="my-students__meta">
                      {account || '—'} <Text className="my-students__stats">测评 {r.vocabTestCount ?? 0} · 陪练 {r.coachingSessionCount ?? 0} · 训练 {r.studySessionCount ?? 0}</Text>
                    </Text>
                  </View>
                </View>
                <View className="my-students__pwd" onClick={() => openPwdModal(r)}>
                  <ShieldCheck size={14} color={color.charcoal} />
                </View>
              </View>
            )
          })
        )}
        {loadingMore ? <View className="my-students__more"><Text>加载中…</Text></View> : null}
        {!loading && !hasMore && rows.length ? <View className="my-students__more my-students__more--end"><Text>没有更多了</Text></View> : null}
      </ScrollView>

      {pwdTarget ? (
        <View className="my-students__mask" onClick={closePwdModal}>
          <View className="my-students__modal" onClick={(e) => e.stopPropagation()}>
            <View className="my-students__modal-head">
              <Text className="my-students__modal-title">设置登录密码</Text>
              <Text className="my-students__modal-desc">{studentLabel(pwdTarget)}{loginAccount(pwdTarget) ? ` · ${loginAccount(pwdTarget)}` : ''}</Text>
            </View>
            <Input className="my-students__modal-input" value={pwdValue} onInput={(e) => setPwdValue(e.detail.value)} placeholder={DEFAULT_PASSWORD} placeholderClass="my-students__modal-placeholder" />
            <View className="my-students__modal-actions">
              <CloudButton variant="outline" className="my-students__modal-btn" disabled={pwdSaving} onClick={() => void savePassword(true)}>重置为 {DEFAULT_PASSWORD}</CloudButton>
              <CloudButton variant="brand" className="my-students__modal-btn" loading={pwdSaving} onClick={() => void savePassword(false)}>保存密码</CloudButton>
            </View>
          </View>
        </View>
      ) : null}
    </View>
  )
}
