import { useCallback, useEffect, useMemo, useState } from 'react'
import { Picker, ScrollView, Text, View } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { ArrowLeft, ArrowRight, Clock, Close, Del, Plus } from '@nutui/icons-react-taro'
import {
  deleteTeacherCoachingAppointment,
  endCoachingAppointment,
  getStudentCoachingWeek,
  getTeacherCoachingWeek,
  listAllTeacherCoachingQuotas,
  startCoachingAppointment,
  type CoachingWeekSchedule,
} from '../../api/coaching'
import { useAuthStore } from '../../stores/authStore'
import { CloudButton } from '../../components/button'
import { AppHeader } from '../../components/app-header/AppHeader'
import { color } from '../../styles/tokens'
import './index.scss'

const pad2 = (n: number) => String(n).padStart(2, '0')
const fmtYMD = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
const fmtMD = (d: Date) => `${pad2(d.getMonth() + 1)}/${pad2(d.getDate())}`
const DAY_HEADER_H = 52
const EVENT_MIN_H = 32
const AXIS_HEIGHT_SCALE = 4 / 3
const WEEKDAY_LABELS = ['一', '二', '三', '四', '五', '六', '日']

const STATUS_LABEL: Record<string, string> = {
  scheduled: '待上课',
  in_progress: '进行中',
  completed: '已完成',
  cancelled: '已取消',
}

const STATUS_CLASS: Record<string, string> = {
  scheduled: 'scheduled',
  in_progress: 'in-progress',
  completed: 'completed',
  cancelled: 'cancelled',
}

function startOfDay(d: Date) {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

function weekMonday(d: Date) {
  const x = startOfDay(d)
  const fromMon = (x.getDay() + 6) % 7
  x.setDate(x.getDate() - fromMon)
  return x
}

function addDays(d: Date, n: number) {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

function hmFromIso(iso?: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

function scheduleVisualRange(schedule: CoachingWeekSchedule): { start: string; end: string } {
  const plannedStart = schedule.startTime?.slice(0, 5) || ''
  const plannedEnd = schedule.endTime?.slice(0, 5) || ''
  const actualStart = hmFromIso(schedule.session?.startedAt)
  const actualEnd = hmFromIso(schedule.session?.endedAt)
  if (schedule.status === 'completed' && actualStart) return { start: actualStart, end: actualEnd || plannedEnd || actualStart }
  if (schedule.status === 'in_progress' && actualStart) return { start: actualStart, end: plannedEnd || actualStart }
  return { start: plannedStart, end: plannedEnd }
}

function parseHmToMinutes(t: string): number {
  const raw = (t || '').trim().slice(0, 5)
  const m = /^(\d{1,2}):(\d{2})$/.exec(raw)
  if (!m) return 0
  return Number(m[1]) * 60 + Number(m[2])
}

function parseEndMinutes(t: string): number {
  const raw = (t || '').trim().slice(0, 5)
  if (raw === '00:00' || raw === '0:00') return 24 * 60
  return parseHmToMinutes(t)
}

function fmtMinutes(mins: number): string {
  if (mins >= 24 * 60) return '24:00'
  const clamped = ((mins % (24 * 60)) + 24 * 60) % (24 * 60)
  return `${pad2(Math.floor(clamped / 60))}:${pad2(clamped % 60)}`
}

function parseCoachingSlotEnd(date: string, endTime: string): Date | null {
  const d = new Date(`${(date || '').slice(0, 10)}T00:00:00`)
  if (Number.isNaN(d.getTime())) return null
  const end = parseEndMinutes(endTime)
  d.setMinutes(end)
  return d
}

function isSchedulePast(schedule: CoachingWeekSchedule, nowTs: number): boolean {
  if (schedule.status === 'in_progress') return false
  const end = parseCoachingSlotEnd(schedule.scheduledDate, schedule.endTime)
  return !!end && end.getTime() <= nowTs
}

function minutesUntilCoachingEnd(date: string, endTime: string, nowTs: number): number | null {
  const end = parseCoachingSlotEnd(date, endTime)
  return end ? Math.ceil((end.getTime() - nowTs) / 60000) : null
}

function lessonDisplay(s: CoachingWeekSchedule): { title: string; subtitle?: string } {
  const student = s.students?.[0]?.trim() || ''
  let title = s.title?.trim() || ''
  title = title.replace(/\s*[·•]\s*陪练\s*$/u, '').trim()
  if (title && student && title !== student) return { title, subtitle: student }
  if (student) return { title: student }
  if (title) return { title }
  return { title: '陪练课程' }
}

function buildAxisMarks(axisStart: number, axisEnd: number): number[] {
  const span = axisEnd - axisStart
  const step = span <= 180 ? 30 : span <= 480 ? 60 : 120
  const first = Math.ceil(axisStart / step) * step
  const marks: number[] = []
  for (let m = first; m < axisEnd; m += step) marks.push(m)
  if (marks.length === 0 || marks[0] !== axisStart) marks.unshift(axisStart)
  return marks
}

type LaidOutEvent = {
  schedule: CoachingWeekSchedule
  topPx: number
  heightPx: number
  showDetail: boolean
  overlapGroupKey: string
  overlapIndex: number
  overlapCount: number
  zIndex: number
}

function layoutDayEvents(
  items: CoachingWeekSchedule[],
  axisStart: number,
  axisEnd: number,
  axisHeightPx: number,
  expandedGroupKey: string | null,
  raisedId: number | null,
): LaidOutEvent[] {
  const span = Math.max(1, axisEnd - axisStart)
  const STACK_OFFSET_PX = 8
  const raw = items.map((schedule) => {
    const range = scheduleVisualRange(schedule)
    let s = parseHmToMinutes(range.start)
    let e = parseEndMinutes(range.end)
    if (e <= s) e = s + 30
    s = Math.max(axisStart, Math.min(s, axisEnd - 5))
    e = Math.max(s + 15, Math.min(e, axisEnd))
    return { schedule, start: s, end: e }
  })
  const sorted = [...raw].sort((a, b) => a.start - b.start || b.end - a.end)
  const groups: Array<typeof sorted> = []

  for (const event of sorted) {
    const matching = groups.filter((group) => group.some((other) => other.end > event.start && other.start < event.end))
    if (matching.length === 0) {
      groups.push([event])
    } else {
      const target = matching[0]
      target.push(event)
      for (const group of matching.slice(1)) {
        target.push(...group)
        groups.splice(groups.indexOf(group), 1)
      }
    }
  }

  const groupById = new Map<number, { key: string; index: number; count: number }>()
  const groupStartByKey = new Map<string, number>()
  for (const group of groups) {
    const ordered = [...group].sort((a, b) => a.start - b.start || b.end - a.end)
    const key = ordered.map((event) => event.schedule.id).sort((a, b) => a - b).join('-')
    groupStartByKey.set(key, ordered[0].start)
    ordered.forEach((event, index) => groupById.set(event.schedule.id, { key, index, count: ordered.length }))
  }

  return sorted.map((ev) => {
    const topPx = ((ev.start - axisStart) / span) * axisHeightPx
    const normalHeightPx = Math.max(EVENT_MIN_H, ((ev.end - ev.start) / span) * axisHeightPx)
    const group = groupById.get(ev.schedule.id) || { key: String(ev.schedule.id), index: 0, count: 1 }
    const expanded = group.count > 1 && group.key === expandedGroupKey
    const collapsedHeightPx = Math.max(EVENT_MIN_H, Math.min(normalHeightPx, 48))
    const heightPx = group.count === 1 ? normalHeightPx : expanded ? Math.max(56, Math.min(normalHeightPx, 64)) : collapsedHeightPx
    const offsetPx = group.count === 1 ? 0 : expanded ? group.index * 44 : group.index * STACK_OFFSET_PX
    const collapsedTopPx = ((groupStartByKey.get(group.key) ?? ev.start) - axisStart) / span * axisHeightPx
    return {
      schedule: ev.schedule,
      topPx: (group.count > 1 ? collapsedTopPx : topPx) + offsetPx,
      heightPx,
      showDetail: group.count === 1 ? normalHeightPx >= 40 : expanded || group.index === group.count - 1,
      overlapGroupKey: group.key,
      overlapIndex: group.index,
      overlapCount: group.count,
      zIndex: raisedId === ev.schedule.id ? 30 : 10 + group.index,
    }
  })
}

function TimetableBlock({ ev, nowTs, onClick }: { ev: LaidOutEvent; nowTs: number; onClick: () => void }) {
  const past = isSchedulePast(ev.schedule, nowTs)
  const status = past ? 'completed' : ev.schedule.status
  const statusClass = STATUS_CLASS[status] || STATUS_CLASS.scheduled
  const { title, subtitle } = lessonDisplay(ev.schedule)
  const studentName = subtitle || ev.schedule.students?.[0]?.trim() || ''
  const range = scheduleVisualRange(ev.schedule)

  return (
    <View
      className={`lp__event lp__event--${statusClass} ${past ? 'lp__event--past' : ''}`}
      style={{ top: `${ev.topPx}px`, height: `${ev.heightPx}px`, zIndex: ev.zIndex }}
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
    >
      <View className="lp__event-inner">
        {ev.showDetail ? (
          <>
            <Text className="lp__event-title">{studentName && title && studentName !== title ? `${studentName}（${title}）` : studentName || title}</Text>
            <Text className={`lp__event-time ${past ? 'lp__event-time--past' : ''}`}>{range.start}–{range.end}</Text>
          </>
        ) : (
          <Text className={`lp__event-time ${past ? 'lp__event-time--past' : ''}`}>{range.start}</Text>
        )}
      </View>
      {ev.overlapCount > 1 && ev.overlapIndex === 0 ? <Text className="lp__event-more">+{ev.overlapCount - 1}</Text> : null}
    </View>
  )
}

export default function LessonPrep() {
  const user = useAuthStore((s) => s.user)
  const role = (user as { role?: string } | null)?.role || 'user'
  const isCoach = role === 'teacher' || role === 'user' || role === 'admin'
  const [nowTs, setNowTs] = useState(() => Date.now())
  const [weekAnchor, setWeekAnchor] = useState(() => new Date())
  const [schedules, setSchedules] = useState<CoachingWeekSchedule[]>([])
  const [loadingSchedules, setLoadingSchedules] = useState(true)
  const [pendingActionById, setPendingActionById] = useState<Record<number, 'start' | 'end' | null>>({})
  const [selected, setSelected] = useState<CoachingWeekSchedule | null>(null)
  const [expandedOverlapGroup, setExpandedOverlapGroup] = useState<string | null>(null)
  const [raisedOverlapId, setRaisedOverlapId] = useState<number | null>(null)
  const [axisHeightPx, setAxisHeightPx] = useState(420)

  const weekMon = useMemo(() => weekMonday(weekAnchor), [weekAnchor])
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekMon, i)), [weekMon])
  const todayYMD = fmtYMD(new Date())
  const weekShortLabel = `${fmtMD(weekMon)}–${fmtMD(addDays(weekMon, 6))}`

  const byDay = useMemo(() => {
    const map: Record<string, CoachingWeekSchedule[]> = {}
    for (const d of weekDays) map[fmtYMD(d)] = []
    for (const s of schedules) {
      const key = s.scheduledDate?.slice?.(0, 10) || s.scheduledDate
      if (!key || !map[key]) continue
      map[key].push(s)
    }
    for (const key of Object.keys(map)) map[key].sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''))
    return map
  }, [schedules, weekDays])

  const axisRange = useMemo(() => {
    if (schedules.length === 0) return null
    let minM = Infinity
    let maxM = -Infinity
    for (const s of schedules) {
      const a = parseHmToMinutes(s.startTime)
      let b = parseEndMinutes(s.endTime)
      if (b <= a) b = a + 30
      minM = Math.min(minM, a)
      maxM = Math.max(maxM, b)
    }
    if (!Number.isFinite(minM) || !Number.isFinite(maxM)) return null
    const pad = 20
    minM = Math.max(0, minM - pad)
    maxM = Math.min(24 * 60, maxM + pad)
    if (maxM - minM < 120) {
      const mid = (minM + maxM) / 2
      minM = Math.max(0, Math.floor(mid - 60))
      maxM = Math.min(24 * 60, Math.ceil(mid + 60))
    }
    return { startMin: minM, endMin: maxM }
  }, [schedules])

  const axisMarks = useMemo(() => (axisRange ? buildAxisMarks(axisRange.startMin, axisRange.endMin) : []), [axisRange])
  const axisSpan = axisRange ? Math.max(1, axisRange.endMin - axisRange.startMin) : 1
  const activeCount = useMemo(() => schedules.filter((s) => s.status === 'scheduled' || s.status === 'in_progress').length, [schedules])

  const loadWeek = useCallback(async (refDate?: string) => {
    const ref = refDate || fmtYMD(weekAnchor)
    setLoadingSchedules(true)
    try {
      const res = isCoach ? await getTeacherCoachingWeek(ref) : await getStudentCoachingWeek(ref)
      setSchedules(Array.isArray(res.data?.schedules) ? res.data.schedules : [])
    } catch (e: any) {
      if (e?.msg) Taro.showToast({ title: e.msg, icon: 'none' })
      setSchedules([])
    } finally {
      setLoadingSchedules(false)
    }
  }, [isCoach, weekAnchor])

  useEffect(() => {
    void loadWeek()
  }, [loadWeek])

  useDidShow(() => {
    void loadWeek()
  })

  useEffect(() => {
    const timer = setInterval(() => setNowTs(Date.now()), 60000)
    return () => clearInterval(timer)
  }, [])

  const measureAxis = useCallback(() => {
    Taro.nextTick(() => {
      Taro.createSelectorQuery()
        .select('.lp__host')
        .boundingClientRect()
        .exec((res) => {
          const rect = Array.isArray(res) ? res[0] : null
          const h = Number(rect?.height || 0)
          if (h > DAY_HEADER_H + 120) setAxisHeightPx(Math.round((h - DAY_HEADER_H) * AXIS_HEIGHT_SCALE))
        })
    })
  }, [])

  useEffect(() => {
    measureAxis()
  }, [measureAxis, loadingSchedules, axisRange])

  const jumpToWeekOf = (dateString: string) => {
    if (!dateString) return
    const d = new Date(`${dateString}T12:00:00`)
    if (!Number.isNaN(d.getTime())) setWeekAnchor(weekMonday(d))
  }

  const openScheduleForDay = async (day: Date) => {
    if (!isCoach) return
    const dayYmd = fmtYMD(day)
    if (dayYmd < todayYMD) {
      Taro.showToast({ title: '不能给过去日期排课', icon: 'none' })
      return
    }
    try {
      const quotas = await listAllTeacherCoachingQuotas()
      if (quotas.length === 0) {
        Taro.showToast({ title: '请先添加学员', icon: 'none' })
        Taro.navigateTo({ url: '/pages/my-students/index' })
        return
      }
    } catch {}
    Taro.navigateTo({ url: `/pages/create-coaching-appointment/index?date=${dayYmd}` })
  }

  const onDeleteAppt = (id: number) => {
    Taro.showModal({
      title: '删除排课',
      content: '确定删除该排课？删除后不可恢复。',
      confirmText: '确定删除',
      confirmColor: color.destructive,
      success: async (r) => {
        if (!r.confirm) return
        try {
          const res = await deleteTeacherCoachingAppointment(id)
          if (res.code !== 200) {
            Taro.showToast({ title: res.msg || '删除失败', icon: 'none' })
            return
          }
          Taro.showToast({ title: '已删除', icon: 'success' })
          setSelected(null)
          void loadWeek()
        } catch (e: any) {
          Taro.showToast({ title: e?.msg || '删除失败', icon: 'none' })
        }
      },
    })
  }

  const onStart = async (id: number) => {
    setPendingActionById((prev) => ({ ...prev, [id]: 'start' }))
    try {
      const res = await startCoachingAppointment(id)
      if (res.code !== 200) {
        Taro.showToast({ title: res.msg || '无法开始', icon: 'none' })
        return
      }
      Taro.showToast({ title: '已开始上课', icon: 'success' })
      setSelected(null)
      void loadWeek()
      Taro.navigateTo({ url: '/pages/material-selection/index' })
    } catch (e: any) {
      Taro.showToast({ title: e?.msg || '开始失败', icon: 'none' })
    } finally {
      setPendingActionById((prev) => ({ ...prev, [id]: null }))
    }
  }

  const onEnd = async (id: number) => {
    setPendingActionById((prev) => ({ ...prev, [id]: 'end' }))
    try {
      const res = await endCoachingAppointment(id)
      if (res.code !== 200) {
        Taro.showToast({ title: res.msg || '无法下课', icon: 'none' })
        return
      }
      Taro.showToast({ title: '已下课', icon: 'success' })
      setSelected(null)
      void loadWeek()
    } catch (e: any) {
      Taro.showToast({ title: e?.msg || '下课失败', icon: 'none' })
    } finally {
      setPendingActionById((prev) => ({ ...prev, [id]: null }))
    }
  }

  const selectedPending = selected ? pendingActionById[selected.id] ?? null : null
  const selectedRange = selected ? scheduleVisualRange(selected) : null
  const selectedMinsLeft = selected?.status === 'in_progress' ? minutesUntilCoachingEnd(selected.scheduledDate, selected.endTime, nowTs) : null
  const selectedPast = selected?.status === 'scheduled' && !!parseCoachingSlotEnd(selected.scheduledDate, selected.endTime) && parseCoachingSlotEnd(selected.scheduledDate, selected.endTime)!.getTime() < nowTs
  const selectedTitle = selected ? lessonDisplay(selected).title : ''

  return (
    <View className="lp-wrap">
      <AppHeader />
      <View className="lp">
        <View className="lp__topbar">
          <Text className="lp__title">{isCoach ? '学生课表' : '我的课表'}</Text>
          <Text className="lp__count">待上 {activeCount}</Text>
          <View className="lp__spacer" />
          <View className="lp__week-btn" onClick={() => setWeekAnchor(addDays(weekAnchor, -7))}>
            <ArrowLeft size={16} color={color.charcoal} />
          </View>
          <Picker mode="date" value={fmtYMD(weekMon)} onChange={(e) => jumpToWeekOf(String(e.detail.value))}>
            <View className="lp__week-picker">
              <Clock size={14} color={color.mutedForeground} />
              <Text>{weekShortLabel}</Text>
            </View>
          </Picker>
          <View className="lp__week-btn" onClick={() => setWeekAnchor(addDays(weekAnchor, 7))}>
            <ArrowRight size={16} color={color.charcoal} />
          </View>
        </View>

        <View className="lp__host">
          {loadingSchedules ? (
            <View className="lp__loading"><Text>加载课表中…</Text></View>
          ) : (
            <ScrollView className="lp__schedule-scroll" scrollY enableFlex>
              {!axisRange ? (
                <View className="lp__empty-grid" style={{ gridTemplateRows: `${DAY_HEADER_H}px minmax(0, 1fr)` }}>
                  {weekDays.map((d, i) => {
                    const ymd = fmtYMD(d)
                    const isToday = ymd === todayYMD
                    return (
                      <View key={`h-${ymd}`} className={`lp__day-head ${isToday ? 'lp__day-head--today' : ''} ${i < 6 ? 'lp__day-head--border' : ''}`} onClick={() => openScheduleForDay(d)}>
                        <Text className={`lp__day-name ${isToday ? 'lp__day-name--today' : ''}`}>周{WEEKDAY_LABELS[i]}</Text>
                        <Text className={`lp__day-date ${isToday ? 'lp__day-date--today' : ''}`}>{fmtMD(d)}</Text>
                      </View>
                    )
                  })}
                  {weekDays.map((d, i) => {
                    const ymd = fmtYMD(d)
                    const isToday = ymd === todayYMD
                    return (
                      <View key={`b-${ymd}`} className={`lp__empty-day ${isToday ? 'lp__empty-day--today' : ''} ${i < 6 ? 'lp__empty-day--border' : ''}`} onClick={() => openScheduleForDay(d)}>
                        {isCoach ? (
                          <>
                            <View className="lp__empty-plus"><Plus size={18} color={color.primary} /></View>
                            <Text className="lp__empty-text">排课</Text>
                          </>
                        ) : (
                          <Text className="lp__empty-text">本周暂无课程</Text>
                        )}
                      </View>
                    )
                  })}
                </View>
              ) : (
                <View
                  className="lp__week-grid"
                  style={{
                    gridTemplateColumns: `32px repeat(7, minmax(0, 1fr))`,
                    gridTemplateRows: `${DAY_HEADER_H}px ${axisHeightPx}px`,
                  }}
                >
                  <View className="lp__axis-corner" />
                  {weekDays.map((d, i) => {
                    const ymd = fmtYMD(d)
                    const isToday = ymd === todayYMD
                    return (
                      <View key={ymd} className={`lp__day-head ${isToday ? 'lp__day-head--today' : ''} ${i < 6 ? 'lp__day-head--border' : ''}`} onClick={() => openScheduleForDay(d)}>
                        <Text className={`lp__day-name ${isToday ? 'lp__day-name--today' : ''}`}>周{WEEKDAY_LABELS[i]}</Text>
                        <Text className={`lp__day-date ${isToday ? 'lp__day-date--today' : ''}`}>
                          {fmtMD(d)}{isCoach ? ' +' : ''}
                        </Text>
                      </View>
                    )
                  })}

                  <View className="lp__axis" style={{ height: `${axisHeightPx}px` }}>
                    {axisMarks.map((m) => (
                      <View key={m} className="lp__axis-mark" style={{ top: `${((m - axisRange.startMin) / axisSpan) * axisHeightPx}px` }}>
                        <Text>{fmtMinutes(m).slice(0, 5)}</Text>
                      </View>
                    ))}
                  </View>

                  {weekDays.map((d, dIdx) => {
                    const ymd = fmtYMD(d)
                    const isToday = ymd === todayYMD
                    const isPastDay = ymd < todayYMD
                    const laidOut = layoutDayEvents(byDay[ymd] || [], axisRange.startMin, axisRange.endMin, axisHeightPx, expandedOverlapGroup, raisedOverlapId)
                    const nowLocalM = new Date(nowTs).getHours() * 60 + new Date(nowTs).getMinutes()
                    const todayPastHeightPx = isToday && nowLocalM > axisRange.startMin
                      ? Math.min(axisHeightPx, ((Math.min(nowLocalM, axisRange.endMin) - axisRange.startMin) / axisSpan) * axisHeightPx)
                      : 0
                    return (
                      <View
                        key={ymd}
                        className={`lp__day-col ${isToday ? 'lp__day-col--today' : ''} ${dIdx < 6 ? 'lp__day-col--border' : ''}`}
                        style={{ height: `${axisHeightPx}px` }}
                        onClick={() => {
                          if (expandedOverlapGroup) {
                            setExpandedOverlapGroup(null)
                            setRaisedOverlapId(null)
                          }
                        }}
                      >
                        {isPastDay ? <View className="lp__past-day" /> : null}
                        {todayPastHeightPx > 0 ? <View className="lp__past-time" style={{ height: `${todayPastHeightPx}px` }} /> : null}
                        {axisMarks.map((m) => <View key={m} className="lp__grid-line" style={{ top: `${((m - axisRange.startMin) / axisSpan) * axisHeightPx}px` }} />)}
                        {isCoach ? <View className="lp__day-hit" onClick={() => openScheduleForDay(d)} /> : null}
                        {laidOut.map((ev) => (
                          <TimetableBlock
                            key={ev.schedule.id}
                            ev={ev}
                            nowTs={nowTs}
                            onClick={() => {
                              if (ev.overlapCount > 1 && expandedOverlapGroup !== ev.overlapGroupKey) {
                                setExpandedOverlapGroup(ev.overlapGroupKey)
                                setRaisedOverlapId(ev.schedule.id)
                                return
                              }
                              if (ev.overlapCount > 1) setRaisedOverlapId(ev.schedule.id)
                              setSelected(ev.schedule)
                            }}
                          />
                        ))}
                      </View>
                    )
                  })}
                </View>
              )}
            </ScrollView>
          )}
        </View>

        {selected ? (
          <View className="lp__modal-mask" onClick={() => setSelected(null)}>
            <View className="lp__modal" onClick={(e) => e.stopPropagation()}>
              <View className="lp__modal-body">
                <View className="lp__modal-head">
                  <View className="lp__modal-title-wrap">
                    <Text className="lp__modal-title">{selectedTitle || `课程 #${selected.id}`}</Text>
                    <Text className="lp__modal-sub">
                      {selected.scheduledDate?.slice?.(0, 10) || selected.scheduledDate} · {selectedRange?.start}–{selectedRange?.end}
                      {selected.source === 'practice' ? ' · 自主练习' : ''}
                    </Text>
                  </View>
                  <View className="lp__modal-close" onClick={() => setSelected(null)}><Close size={18} color={color.mutedForeground} /></View>
                </View>
                {selected.students?.length ? <Text className="lp__modal-students">学员：{selected.students.join('、')}</Text> : null}
                <View className="lp__modal-status">
                  <Clock size={14} color={color.mutedForeground} />
                  <Text className={`lp__modal-status-text lp__modal-status-text--${STATUS_CLASS[selected.status] || 'scheduled'}`}>{STATUS_LABEL[selected.status] || selected.status}</Text>
                  {selected.status === 'in_progress' && selectedMinsLeft != null ? <Text className="lp__modal-status-sub">距下课 {Math.max(0, selectedMinsLeft)} 分钟</Text> : null}
                  {selectedPast ? <Text className="lp__modal-status-sub">该时段已过</Text> : null}
                </View>
              </View>
              <View className="lp__modal-footer">
                {isCoach ? (
                  <View className="lp__modal-actions">
                    {selected.status === 'scheduled' ? (
                      <>
                        <CloudButton variant="outline" size="sm" className="lp__delete-btn" onClick={() => onDeleteAppt(selected.id)}>
                          <Del size={14} color={color.destructive} /> 删除
                        </CloudButton>
                        <CloudButton variant="brand" size="sm" className="lp__action-grow" loading={selectedPending === 'start'} disabled={selectedPending !== null} onClick={() => void onStart(selected.id)}>
                          开始上课
                        </CloudButton>
                      </>
                    ) : null}
                    {selected.status === 'in_progress' ? (
                      <>
                        <CloudButton variant="brandOutline" size="sm" className="lp__action-grow" onClick={() => { setSelected(null); Taro.navigateTo({ url: '/pages/material-selection/index' }) }}>
                          进入训练
                        </CloudButton>
                        <CloudButton variant="destructive" size="sm" loading={selectedPending === 'end'} disabled={selectedPending !== null} onClick={() => void onEnd(selected.id)}>
                          下课
                        </CloudButton>
                      </>
                    ) : null}
                  </View>
                ) : (
                  <CloudButton variant="outline" size="sm" className="lp__action-full" onClick={() => setSelected(null)}>关闭</CloudButton>
                )}
              </View>
            </View>
          </View>
        ) : null}
      </View>
    </View>
  )
}
