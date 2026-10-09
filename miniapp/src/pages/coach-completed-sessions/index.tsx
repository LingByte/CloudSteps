import { useCallback, useEffect, useState } from 'react'
import { View, Text, ScrollView } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { ArrowLeft, Refresh } from '@nutui/icons-react-taro'
import { getTeacherCoachingCompleted, type CoachingWeekSchedule } from '../../api/coaching'
import { color } from '../../styles/tokens'
import './index.scss'

const PAGE_SIZE = 10

function formatDateTime(raw?: string | null) {
  if (!raw) return '-'
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) return raw
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const statusLabel: Record<string, string> = {
  completed: '已完成', scheduled: '已排课', in_progress: '进行中', cancelled: '已取消',
}

export default function CoachCompletedSessions() {
  const [schedules, setSchedules] = useState<CoachingWeekSchedule[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [detail, setDetail] = useState<CoachingWeekSchedule | null>(null)

  const load = useCallback(async (nextPage = 1) => {
    setLoading(true)
    try {
      const res = await getTeacherCoachingCompleted({ page: nextPage, pageSize: PAGE_SIZE })
      if (res.code !== 200) { setSchedules([]); setTotal(0); return }
      setSchedules(Array.isArray(res.data?.schedules) ? res.data.schedules : [])
      setTotal(res.data?.total ?? 0)
      setPage(res.data?.page ?? nextPage)
    } catch {
      setSchedules([]); setTotal(0)
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { void load(1) }, [load])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <View className="ccs">
      <View className="ccs__nav">
        <View className="ccs__back" onClick={() => Taro.navigateBack()}><ArrowLeft size={22} color={color.charcoal} /></View>
        <Text className="ccs__title">已完成的陪练课</Text>
        <View className="ccs__refresh" onClick={() => !loading && void load(page)}>
          <Refresh size={20} color={color.charcoal} />
        </View>
      </View>
      <View className="ccs__sub"><Text>仅统计已结算的课程 · 共 {total} 条</Text></View>

      <ScrollView className="ccs__body" scrollY enableFlex>
        {loading ? (
          <View className="ccs__state"><Text>加载中...</Text></View>
        ) : schedules.length === 0 ? (
          <View className="ccs__state"><Text>暂无已完成的陪练课</Text></View>
        ) : (
          <View className="ccs__list">
            {schedules.map((s) => (
              <View key={s.id} className="ccs__item" onClick={() => setDetail(s)}>
                <View className="ccs__item-top">
                  <Text className="ccs__item-title">{s.title || `陪练课 #${s.id}`}</Text>
                  <Text className={`ccs__source ${s.source === 'practice' ? 'ccs__source--practice' : ''}`}>
                    {s.source === 'practice' ? '练习' : '排课'}
                  </Text>
                </View>
                <View className="ccs__item-meta">
                  <Text className="ccs__meta">{String(s.scheduledDate || '').slice(0, 10)}</Text>
                  <Text className="ccs__meta">{s.startTime}–{s.endTime}</Text>
                  {s.students && s.students.length > 0 && <Text className="ccs__meta">{s.students.join('、')}</Text>}
                </View>
                {s.session?.actualMinutes != null && (
                  <Text className="ccs__item-billing">
                    实际 {s.session.actualMinutes} 分钟 · 扣学员 {s.session.studentLessonsBilled ?? 0} 课时 · 计老师 {s.session.teacherCreditedMinutes ?? s.session.billedMinutes ?? '-'} 分钟
                  </Text>
                )}
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      <View className="ccs__pager">
        <Text className="ccs__pager-info">{total > 0 ? `第 ${page} / ${totalPages} 页` : ''}</Text>
        <View className="ccs__pager-btns">
          <View className={`ccs__pager-btn ${page <= 1 || loading ? 'ccs__pager-btn--disabled' : ''}`} onClick={() => void load(page - 1)}><Text>上一页</Text></View>
          <View className={`ccs__pager-btn ${page >= totalPages || loading ? 'ccs__pager-btn--disabled' : ''}`} onClick={() => void load(page + 1)}><Text>下一页</Text></View>
        </View>
      </View>

      {detail && (
        <View className="ccs__mask" onClick={() => setDetail(null)}>
          <View className="ccs__dialog" onClick={(e) => e.stopPropagation()}>
            <Text className="ccs__dialog-title">课程详情</Text>
            <View className="ccs__dialog-head">
              <Text className="ccs__dialog-name">{detail.title || `陪练课 #${detail.id}`}</Text>
              <Text className="ccs__dialog-source">{detail.source === 'practice' ? '无排课练习' : '正式排课'}</Text>
            </View>
            <View className="ccs__grid">
              <View className="ccs__grid-item"><Text className="ccs__grid-label">日期</Text><Text className="ccs__grid-value">{String(detail.scheduledDate || '').slice(0, 10) || '-'}</Text></View>
              <View className="ccs__grid-item"><Text className="ccs__grid-label">时段</Text><Text className="ccs__grid-value">{detail.startTime}–{detail.endTime}</Text></View>
              <View className="ccs__grid-item"><Text className="ccs__grid-label">状态</Text><Text className="ccs__grid-value">{statusLabel[detail.status] || detail.status || '-'}</Text></View>
              <View className="ccs__grid-item"><Text className="ccs__grid-label">学员</Text><Text className="ccs__grid-value">{detail.students?.length ? detail.students.join('、') : '-'}</Text></View>
            </View>
            <View className="ccs__billing">
              <View className="ccs__billing-row"><Text>计划时长</Text><Text>{detail.session?.plannedMinutes ?? '-'} 分钟</Text></View>
              <View className="ccs__billing-row"><Text>实际时长</Text><Text>{detail.session?.actualMinutes ?? '-'} 分钟</Text></View>
              <View className="ccs__billing-row"><Text>学员扣课时</Text><Text>{detail.session?.studentLessonsBilled ?? 0} 课时</Text></View>
              <View className="ccs__billing-row"><Text>老师计课时</Text><Text>{detail.session?.teacherCreditedMinutes ?? detail.session?.billedMinutes ?? '-'} 分钟</Text></View>
              <View className="ccs__billing-row ccs__billing-row--muted"><Text>开始 {formatDateTime(detail.session?.startedAt)}</Text><Text>结束 {formatDateTime(detail.session?.endedAt)}</Text></View>
            </View>
            <View className="ccs__dialog-btns">
              <View className="ccs__dialog-btn ccs__dialog-btn--outline" onClick={() => setDetail(null)}><Text>关闭</Text></View>
              <View className="ccs__dialog-btn ccs__dialog-btn--brand" onClick={() => { setDetail(null); Taro.navigateTo({ url: '/pages/training-records/index' }) }}><Text>查看训练记录</Text></View>
            </View>
          </View>
        </View>
      )}
    </View>
  )
}
