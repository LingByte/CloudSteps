import { useEffect, useState, useMemo, useRef } from 'react'
import { motion } from 'framer-motion'
import { Users, UserPlus, Activity } from 'lucide-react'
import AdminLayout from '@/components/Layout/AdminLayout'
import Card from '@/components/UI/Card'
import ReactECharts from 'echarts-for-react'
import { useThemeStore } from '@/stores/themeStore'
import { get } from '@/utils/request'
import { getApiBaseURL } from '@/config/apiConfig'

const BACKEND_BASE = getApiBaseURL()

interface DashboardData {
  totalUsers: number
  newUsersToday: number
  daily: Array<{
    date: string
    pv: number
    uv: number
  }>
}

const StatCard = ({
  title,
  value,
  icon: Icon,
  color,
}: {
  title: string
  value: number | string
  icon: React.ComponentType<{ className?: string }>
  color: string
}) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    className="bg-white dark:bg-slate-900 rounded-xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm"
  >
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-1">{title}</p>
        <p className="text-3xl font-bold text-slate-900 dark:text-white">{value}</p>
      </div>
      <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${color}`}>
        <Icon className="w-6 h-6" />
      </div>
    </div>
  </motion.div>
)

const Dashboard = () => {
  const { isDark } = useThemeStore()
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const chartRef = useRef<any>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const fetchDashboard = async () => {
      try {
        const res = await get<DashboardData>(`${BACKEND_BASE}/dashboard`)
        setData(res.data)
      } catch (e) {
        console.error('获取仪表盘数据失败', e)
      } finally {
        setLoading(false)
      }
    }
    fetchDashboard()
  }, [])

  // 用 ResizeObserver 监听容器尺寸，确保图表始终适配
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const ro = new ResizeObserver(() => {
      chartRef.current?.getEchartsInstance?.()?.resize()
    })
    ro.observe(container)
    return () => ro.disconnect()
  }, [])

  const textColor = isDark ? '#94a3b8' : '#64748b'
  const axisLineColor = isDark ? '#475569' : '#e2e8f0'
  const splitLineColor = isDark ? '#334155' : '#f1f5f9'

  const chartOption = useMemo(() => {
    const daily = data?.daily ?? []
    return {
      tooltip: {
        trigger: 'axis',
        backgroundColor: isDark ? '#1e293b' : '#fff',
        borderColor: isDark ? '#334155' : '#e2e8f0',
        textStyle: { color: isDark ? '#e2e8f0' : '#1e293b' },
      },
      legend: {
        data: ['PV（登录次数）', 'UV（独立用户）'],
        textStyle: { color: textColor },
        top: 10,
        left: 'center',
      },
      grid: { left: '3%', right: '4%', bottom: '8%', top: '20%', containLabel: true },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: daily.map(d => d.date),
        axisLine: { lineStyle: { color: axisLineColor } },
        axisLabel: { color: textColor },
      },
      yAxis: {
        type: 'value',
        axisLine: { lineStyle: { color: axisLineColor } },
        axisLabel: { color: textColor },
        splitLine: { lineStyle: { color: splitLineColor, type: 'dashed' } },
      },
      series: [
        {
          name: 'PV（登录次数）',
          type: 'line',
          smooth: true,
          data: daily.map(d => d.pv),
          lineStyle: { color: '#3b82f6', width: 2 },
          itemStyle: { color: '#3b82f6' },
          areaStyle: {
            color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
              colorStops: [{ offset: 0, color: 'rgba(59,130,246,0.25)' }, { offset: 1, color: 'rgba(59,130,246,0.02)' }] },
          },
        },
        {
          name: 'UV（独立用户）',
          type: 'line',
          smooth: true,
          data: daily.map(d => d.uv),
          lineStyle: { color: '#10b981', width: 2 },
          itemStyle: { color: '#10b981' },
          areaStyle: {
            color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
              colorStops: [{ offset: 0, color: 'rgba(16,185,129,0.2)' }, { offset: 1, color: 'rgba(16,185,129,0.02)' }] },
          },
        },
      ],
    }
  }, [data, isDark, textColor, axisLineColor, splitLineColor])

  return (
    <AdminLayout title="仪表板" description="">
      <div className="space-y-6 animate-in fade-in-0 slide-in-from-bottom-4 duration-500">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <StatCard title="总用户数" value={loading ? '—' : (data?.totalUsers ?? 0).toLocaleString()} icon={Users} color="bg-blue-100 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400" />
          <StatCard title="今日新增用户" value={loading ? '—' : (data?.newUsersToday ?? 0).toLocaleString()} icon={UserPlus} color="bg-green-100 dark:bg-green-900/20 text-green-600 dark:text-green-400" />
          <StatCard title="今日 PV" value={loading ? '—' : (data?.daily?.[data.daily.length - 1]?.pv ?? 0).toLocaleString()} icon={Activity} color="bg-purple-100 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400" />
        </div>

        <Card className="p-6">
          <h3 className="text-base font-semibold text-slate-900 dark:text-white mb-4">最近 7 天趋势</h3>
          <div style={{ width: '100%', overflowX: 'auto' }}>
            <div ref={containerRef} style={{ minWidth: '480px' }}>
              <ReactECharts ref={chartRef} option={chartOption} style={{ height: '360px', width: '100%' }} opts={{ renderer: 'canvas' }} notMerge />
            </div>
          </div>
        </Card>
      </div>
    </AdminLayout>
  )
}

export default Dashboard
