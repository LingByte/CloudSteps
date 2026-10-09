import { useEffect, useMemo, useState } from 'react'
import { Picker, ScrollView, Text, View } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { ArrowLeft, ArrowRight, Clock, Right } from '@nutui/icons-react-taro'
import { useAuthStore } from '../../stores/authStore'
import { listReviewBooksByDate, type ReviewBookStatRow } from '../../api/review'
import { CloudButton } from '../../components/button'
import { AppHeader } from '../../components/app-header/AppHeader'
import { color } from '../../styles/tokens'
import './index.scss'

type ReviewTask = {
  id: string
  studentId: string
  student: string
  vocabularyPack: string
  level: string
  wordBookId: string
  sessionId: string
  count: number
  timeSlot: string
  timeSort: number
  trainingAt: string
}

type TimeSlotGroup = {
  timeSlot: string
  timeSort: number
  tasks: ReviewTask[]
}

function toDateInputValue(d: Date) {
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function parseYMDLocal(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map((x) => Number(x))
  if (!y || !m || !d) return new Date()
  return new Date(y, m - 1, d)
}

function normalizeId(value: unknown): string {
  if (value == null) return ''
  const s = String(value).trim()
  return s && s !== '0' ? s : ''
}

function clockParts(iso: string | null | undefined, endIso: string | null | undefined, tz: string) {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  const timeFmt = new Intl.DateTimeFormat('zh-CN', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false })
  const dateFmt = new Intl.DateTimeFormat('zh-CN', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' })
  const parts = dateFmt.formatToParts(d)
  const y = parts.find((p) => p.type === 'year')?.value ?? ''
  const mo = parts.find((p) => p.type === 'month')?.value ?? ''
  const day = parts.find((p) => p.type === 'day')?.value ?? ''
  const slot = timeFmt.format(d)
  const [hh, mm] = slot.split(':').map((x) => Number(x))
  let endSlot = slot
  if (endIso) {
    const endD = new Date(endIso)
    if (!Number.isNaN(endD.getTime())) endSlot = timeFmt.format(endD)
  }
  return {
    slot,
    sort: (Number.isFinite(hh) ? hh : 0) * 60 + (Number.isFinite(mm) ? mm : 0),
    trainingAt: `${y}-${mo}-${day} ${slot}~${endSlot}`,
  }
}

export default function AntiForgetting() {
  const user = useAuthStore((s) => s.user)
  const [selectedDate, setSelectedDate] = useState(() => {
    const param = Taro.getCurrentInstance().router?.params?.date
    return typeof param === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(param) ? param : toDateInputValue(new Date())
  })
  const [bookStats, setBookStats] = useState<ReviewBookStatRow[]>([])
  const [loadingBooks, setLoadingBooks] = useState(true)

  useDidShow(() => {
    const pending = Taro.getStorageSync('lb_anti_date')
    if (typeof pending === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(pending)) {
      Taro.removeStorageSync('lb_anti_date')
      setSelectedDate(pending)
    }
  })

  useEffect(() => {
    let mounted = true
    ;(async () => {
      setLoadingBooks(true)
      try {
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai'
        const res = await listReviewBooksByDate(selectedDate, tz)
        if (mounted) setBookStats(Array.isArray(res.data) ? res.data : [])
      } catch {
        if (mounted) setBookStats([])
      } finally {
        if (mounted) setLoadingBooks(false)
      }
    })()
    return () => { mounted = false }
  }, [selectedDate])

  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai'
  const fallbackStudent = user?.displayName || user?.email?.split('@')[0] || '当前用户'

  const reviewTasks = useMemo<ReviewTask[]>(() => bookStats.map((b) => {
    const studentId = normalizeId((b as any).studentId) || 'self'
    const wordBookId = normalizeId(b.wordBookId)
    const sessionId = normalizeId(b.sessionId)
    const clock = clockParts(b.practiceStartedAt, b.practiceEndedAt, timeZone)
    return {
      id: `${studentId}-${wordBookId}-${sessionId || '0'}`,
      studentId,
      student: String((b as any).studentName || '').trim() || fallbackStudent,
      vocabularyPack: b.name,
      level: String(b.level || '').trim(),
      wordBookId,
      sessionId,
      count: b.cnt,
      timeSlot: clock?.slot || '—',
      timeSort: clock?.sort ?? 9999,
      trainingAt: clock?.trainingAt || '—',
    }
  }), [bookStats, fallbackStudent, timeZone])

  const timelineGroups = useMemo<TimeSlotGroup[]>(() => {
    const map = new Map<string, TimeSlotGroup>()
    for (const task of reviewTasks) {
      const group = map.get(task.timeSlot)
      if (group) group.tasks.push(task)
      else map.set(task.timeSlot, { timeSlot: task.timeSlot, timeSort: task.timeSort, tasks: [task] })
    }
    return Array.from(map.values())
      .sort((a, b) => a.timeSort - b.timeSort || a.timeSlot.localeCompare(b.timeSlot))
      .map((group) => ({ ...group, tasks: [...group.tasks].sort((x, y) => x.student.localeCompare(y.student, 'zh-CN')) }))
  }, [reviewTasks])

  const shiftDate = (deltaDays: number) => {
    const d = parseYMDLocal(selectedDate)
    d.setDate(d.getDate() + deltaDays)
    setSelectedDate(toDateInputValue(d))
  }

  const isToday = selectedDate === toDateInputValue(new Date())

  const handleOpenTask = (task: ReviewTask) => {
    if (task.count <= 0 || !task.wordBookId) return
    Taro.setStorageSync('lb_review_wordbook_id', task.wordBookId)
    Taro.setStorageSync('lb_review_wordbook_name', task.vocabularyPack)
    Taro.setStorageSync('lb_review_date', selectedDate)
    Taro.setStorageSync('lb_review_return', '/pages/anti-forgetting/index')
    if (task.studentId && task.studentId !== 'self') Taro.setStorageSync('lb_review_student_id', task.studentId)
    else Taro.removeStorageSync('lb_review_student_id')
    if (task.sessionId) Taro.setStorageSync('lb_review_study_session_id', task.sessionId)
    else Taro.removeStorageSync('lb_review_study_session_id')
    if (isToday) Taro.setStorageSync('lb_mode', 'review')
    else Taro.removeStorageSync('lb_mode')

    const studentQ = task.studentId && task.studentId !== 'self' ? `&studentId=${encodeURIComponent(task.studentId)}` : ''
    const sessionQ = task.sessionId ? `&studySessionId=${encodeURIComponent(task.sessionId)}` : ''
    Taro.navigateTo({ url: `/pages/review-word-list/index?wordBookId=${task.wordBookId}&date=${encodeURIComponent(selectedDate)}${sessionQ}${studentQ}${isToday ? '' : '&view=1'}` })
  }

  return (
    <View className="anti-wrap">
      <AppHeader />
      <ScrollView className="anti" scrollY enableFlex>
        <View className="anti__date-card">
          <View className="anti__date-arrow" onClick={() => shiftDate(-1)}>
            <ArrowLeft size={20} color={color.charcoal} />
          </View>
          <View className="anti__date-center-wrap">
            <Text className="anti__date-label">选择日期</Text>
            <Picker mode="date" value={selectedDate} onChange={(e) => setSelectedDate(String(e.detail.value))}>
              <View className="anti__date-picker"><Text>{selectedDate}</Text></View>
            </Picker>
          </View>
          <View className="anti__date-arrow" onClick={() => shiftDate(1)}>
            <ArrowRight size={20} color={color.charcoal} />
          </View>
        </View>

        {loadingBooks ? (
          <View className="anti__state"><Text>加载中…</Text></View>
        ) : reviewTasks.length === 0 ? (
          <View className="anti__empty">
            <Clock size={40} color={color.mutedSoft} />
            <Text className="anti__empty-text">该日暂无待复习词库任务</Text>
          </View>
        ) : (
          <View className="anti__timeline-card">
            <View className="anti__timeline-header">
              <Text className="anti__timeline-date">{selectedDate}</Text>
              <Right className="anti__timeline-down" size={14} color={color.mutedForeground} />
            </View>
            <View className="anti__timeline-body">
              <View className="anti__timeline-line" />
              {timelineGroups.map((group, groupIdx) => (
                <View key={group.timeSlot} className="anti__group">
                  {group.tasks.map((task, idx) => {
                    const hasNextTask = idx < group.tasks.length - 1 || groupIdx < timelineGroups.length - 1
                    return (
                      <View key={task.id} className={`anti__task ${hasNextTask ? 'anti__task--border' : ''}`}>
                        <View className="anti__task-time-col">
                          {idx === 0 ? <View className="anti__time-badge"><Text>{group.timeSlot}</Text></View> : <View className="anti__time-spacer" />}
                        </View>
                        <View className="anti__task-content">
                          <View className="anti__task-tick" />
                          <Text className="anti__student">{task.student}</Text>
                          <View className="anti__task-text" onClick={() => handleOpenTask(task)}>
                            <Text className="anti__bullet">•</Text>
                            <Text className="anti__pack">
                              {task.level ? `【${task.level}】` : ''}
                              {task.count > 0 ? `【待复习 ${task.count} 词】` : ''}
                              {task.vocabularyPack}
                            </Text>
                          </View>
                          <Text className="anti__trained-at">训练时间：{task.trainingAt}</Text>
                          <View className="anti__review-btn">
                            <CloudButton variant="brand" size="pill" disabled={task.count <= 0} onClick={() => handleOpenTask(task)}>
                              {isToday ? '开始复习' : '查看'}
                            </CloudButton>
                          </View>
                        </View>
                      </View>
                    )
                  })}
                </View>
              ))}
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  )
}
