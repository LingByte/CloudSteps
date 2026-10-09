import { useEffect, useMemo, useState } from 'react'
import { Picker, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { ArrowLeft } from '@nutui/icons-react-taro'
import { CloudButton } from '../../components/button'
import { listStudySessions, updateStudySessionsPracticeTime } from '../../api/study'
import { getTrainingStudent } from '../../utils/trainingStudent'
import { color } from '../../styles/tokens'
import './index.scss'

function toDateInputValue(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function formatHmFromTs(ts: number) {
  const d = new Date(ts)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function addDaysYmd(ymd: string, days: number) {
  const [y, m, d] = ymd.split('-').map(Number)
  const dt = new Date(y, (m || 1) - 1, d || 1)
  dt.setDate(dt.getDate() + days)
  return toDateInputValue(dt)
}

function readLessonDefaults() {
  const now = Date.now()
  const endRaw = Number(Taro.getStorageSync('lb_lesson_practice_end') || now)
  const startRaw = Number(Taro.getStorageSync('lb_lesson_practice_start') || 0)
  const endTs = Number.isFinite(endRaw) && endRaw > 0 ? endRaw : now
  const startTs = Number.isFinite(startRaw) && startRaw > 0 && startRaw <= endTs ? startRaw : endTs
  return { date: toDateInputValue(new Date(startTs)), startTime: formatHmFromTs(startTs) }
}

export default function CreateAntiForgetting() {
  const trainingStudent = useMemo(() => getTrainingStudent(), [])
  const defaults = useMemo(() => readLessonDefaults(), [])
  const [lessonDate, setLessonDate] = useState(defaults.date)
  const [startTime, setStartTime] = useState(defaults.startTime)
  const [sessionIds, setSessionIds] = useState<Array<string | number>>([])
  const [loadingSessions, setLoadingSessions] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoadingSessions(true)
      try {
        const studentId = trainingStudent?.id
        const res = await listStudySessions({
          page: 1,
          pageSize: 50,
          sessionType: 'study',
          status: 'completed',
          date: defaults.date,
          ...(studentId ? { studentId } : {}),
        })
        if (cancelled) return
        const list = Array.isArray(res.data?.list) ? res.data.list : []
        setSessionIds(list.map((r) => r.id).filter((id): id is number => typeof id === 'number' && id > 0))
        const latest = list.find((r) => r.startedAt) || list[0]
        if (latest?.startedAt) {
          const start = new Date(latest.startedAt)
          if (!Number.isNaN(start.getTime())) {
            setLessonDate(toDateInputValue(start))
            setStartTime(formatHmFromTs(start.getTime()))
          }
        }
      } catch {
        if (!cancelled) setSessionIds([])
      } finally {
        if (!cancelled) setLoadingSessions(false)
      }
    })()
    return () => { cancelled = true }
  }, [defaults.date, trainingStudent?.id])

  const goAntiForgetting = (date: string) => {
    Taro.setStorageSync('lb_anti_date', date)
    Taro.switchTab({ url: '/pages/anti-forgetting/index' })
  }

  const handleConfirm = async () => {
    if (!startTime) {
      Taro.showToast({ title: '请选择开始时间', icon: 'none' })
      return
    }
    if (sessionIds.length === 0) {
      Taro.showToast({ title: '当日暂无已完成的学习记录', icon: 'none' })
      return
    }
    setSaving(true)
    try {
      const studentId = trainingStudent?.id
      const res = await updateStudySessionsPracticeTime({
        date: lessonDate,
        startTime,
        ...(studentId ? { studentId } : {}),
        sessionIds,
      })
      if (res.code !== 200) {
        Taro.showToast({ title: res.msg || '保存失败', icon: 'none' })
        return
      }
      Taro.removeStorageSync('lb_lesson_practice_start')
      Taro.removeStorageSync('lb_lesson_practice_end')
      Taro.showToast({ title: '已保存，抗遗忘从明天开始', icon: 'success' })
      setTimeout(() => goAntiForgetting(addDaysYmd(lessonDate, 1)), 600)
    } catch (e: any) {
      Taro.showToast({ title: e?.msg || '保存失败', icon: 'none' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <View className="create-anti">
      <View className="create-anti__nav">
        <View className="create-anti__nav-row">
          <View className="create-anti__back" onClick={() => Taro.navigateBack()}>
            <ArrowLeft size={22} color={color.charcoal} />
          </View>
          <Text className="create-anti__title">创建抗遗忘</Text>
        </View>
      </View>

      <View className="create-anti__content">
        <View className="create-anti__student">
          {trainingStudent?.name ? <Text className="create-anti__student-text">学员：{trainingStudent.name}</Text> : null}
        </View>

        <View className="create-anti__form">
          <View className="create-anti__field">
            <Text className="create-anti__label">识记练习开始时间</Text>
            <Picker mode="time" value={startTime} onChange={(e) => setStartTime(String(e.detail.value))}>
              <View className="create-anti__time"><Text>{startTime || '请选择时间'}</Text></View>
            </Picker>
          </View>
          {loadingSessions ? <Text className="create-anti__status">正在查询当日学习记录…</Text> : sessionIds.length === 0 ? <Text className="create-anti__status create-anti__status--warn">当日暂无已完成的学习记录，可跳过</Text> : null}
        </View>

        <Text className="create-anti__desc">保存后将从次日开始生成抗遗忘复习计划。</Text>
        <CloudButton variant="brand" className="create-anti__submit" loading={saving} disabled={!loadingSessions && sessionIds.length === 0} onClick={() => void handleConfirm()}>保存并查看抗遗忘</CloudButton>
        {!loadingSessions && sessionIds.length === 0 ? <CloudButton variant="outline" className="create-anti__submit" onClick={() => goAntiForgetting(addDaysYmd(toDateInputValue(new Date()), 1))}>跳过，直接查看</CloudButton> : null}
      </View>
    </View>
  )
}
