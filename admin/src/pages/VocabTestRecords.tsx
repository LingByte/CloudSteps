import { useState, useEffect, useCallback } from 'react'
import AdminLayout from '@/components/Layout/AdminLayout'
import { get, del } from '@/utils/request'
import { getApiBaseURL } from '@/config/apiConfig'
import { Search, Trash2, Eye, X } from 'lucide-react'

interface VocabRecord {
  id: number
  userId: number
  userEmail: string
  userDisplayName: string
  estimatedLevel: string
  estimatedVocab: number
  questionCount: number
  correctCount: number
  isLatest: boolean
  completedAt: string
  answers: string
  createdAt: string
}

const LEVELS = ['', 'A1', 'A2', 'B1', 'B2', 'C1']

const LEVEL_COLORS: Record<string, string> = {
  A1: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400',
  A2: 'bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-400',
  B1: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400',
  B2: 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400',
  C1: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400',
}

export default function VocabTestRecords() {
  const [list, setList] = useState<VocabRecord[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const pageSize = 20
  const [level, setLevel] = useState('')
  const [keyword, setKeyword] = useState('')
  const [loading, setLoading] = useState(false)
  const [detail, setDetail] = useState<VocabRecord | null>(null)

  const fetchList = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) })
      if (level) params.append('level', level)
      if (keyword) params.append('userId', keyword)
      const res = await get<any>(`${getApiBaseURL()}/vocab/records?${params}`)
      setList(res.data?.list || [])
      setTotal(res.data?.total || 0)
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, level, keyword])

  useEffect(() => { fetchList() }, [fetchList])

  const handleDelete = async (id: number) => {
    if (!confirm('确认删除该测试记录？')) return
    await del(`${getApiBaseURL()}/vocab/records/${id}`)
    fetchList()
  }

  const totalPages = Math.ceil(total / pageSize)
  const fmtDate = (s: string) => s ? new Date(s).toLocaleString('zh-CN') : '-'
  const correctRate = (r: VocabRecord) =>
    r.questionCount > 0 ? Math.round((r.correctCount / r.questionCount) * 100) : 0

  return (
    <AdminLayout>
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">自测记录</h1>
          <span className="text-sm text-slate-500">共 {total} 条记录</span>
        </div>

        {/* 筛选栏 */}
        <div className="flex gap-3 flex-wrap">
          <select
            value={level}
            onChange={e => { setLevel(e.target.value); setPage(1) }}
            className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-700 dark:text-slate-300"
          >
            {LEVELS.map(l => <option key={l} value={l}>{l || '全部等级'}</option>)}
          </select>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              value={keyword}
              onChange={e => { setKeyword(e.target.value); setPage(1) }}
              placeholder="按用户ID筛选..."
              className="pl-9 pr-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-700 dark:text-slate-300 w-48"
            />
          </div>
        </div>

        {/* 表格 */}
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
              <tr>
                <th className="px-4 py-3 text-left">用户</th>
                <th className="px-4 py-3 text-left">测评等级</th>
                <th className="px-4 py-3 text-left">估算词汇量</th>
                <th className="px-4 py-3 text-left">正确率</th>
                <th className="px-4 py-3 text-left">最新</th>
                <th className="px-4 py-3 text-left">完成时间</th>
                <th className="px-4 py-3 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">加载中...</td></tr>
              ) : list.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">暂无数据</td></tr>
              ) : list.map(r => (
                <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900 dark:text-slate-100">{r.userDisplayName || r.userEmail}</div>
                    {r.userDisplayName && <div className="text-xs text-slate-400">{r.userEmail}</div>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${LEVEL_COLORS[r.estimatedLevel] || ''}`}>
                      {r.estimatedLevel}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{r.estimatedVocab.toLocaleString()}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-blue-500"
                          style={{ width: `${correctRate(r)}%` }}
                        />
                      </div>
                      <span className="text-slate-600 dark:text-slate-400 text-xs">{correctRate(r)}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {r.isLatest && (
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400">最新</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-500 text-xs">{fmtDate(r.completedAt || r.createdAt)}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => setDetail(r)} className="p-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500">
                        <Eye className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleDelete(r.id)} className="p-1.5 rounded-md hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* 分页 */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between text-sm text-slate-500">
            <span>共 {total} 条</span>
            <div className="flex gap-2">
              <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}
                className="px-3 py-1 rounded border border-slate-200 dark:border-slate-700 disabled:opacity-40">上一页</button>
              <span className="px-3 py-1">{page} / {totalPages}</span>
              <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}
                className="px-3 py-1 rounded border border-slate-200 dark:border-slate-700 disabled:opacity-40">下一页</button>
            </div>
          </div>
        )}
      </div>

      {/* 详情弹窗 */}
      {detail && <RecordDetailModal record={detail} onClose={() => setDetail(null)} />}
    </AdminLayout>
  )
}

function RecordDetailModal({ record, onClose }: { record: VocabRecord; onClose: () => void }) {
  let answers: any[] = []
  try { answers = JSON.parse(record.answers) } catch {}

  const fmtDate = (s: string) => s ? new Date(s).toLocaleString('zh-CN') : '-'
  const correctRate = record.questionCount > 0
    ? Math.round((record.correctCount / record.questionCount) * 100) : 0

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 shrink-0">
          <div>
            <h2 className="font-semibold text-slate-900 dark:text-slate-100">测试记录详情</h2>
            <p className="text-xs text-slate-500 mt-0.5">{record.userDisplayName || record.userEmail}</p>
          </div>
          <button onClick={onClose}><X className="w-5 h-5 text-slate-400" /></button>
        </div>

        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <div className="grid grid-cols-4 gap-4 text-center">
            <div>
              <div className={`inline-block px-3 py-1 rounded-full text-sm font-semibold ${LEVEL_COLORS[record.estimatedLevel] || ''}`}>
                {record.estimatedLevel}
              </div>
              <div className="text-xs text-slate-400 mt-1">测评等级</div>
            </div>
            <div>
              <div className="text-lg font-semibold text-slate-900 dark:text-slate-100">{record.estimatedVocab.toLocaleString()}</div>
              <div className="text-xs text-slate-400">估算词汇量</div>
            </div>
            <div>
              <div className="text-lg font-semibold text-slate-900 dark:text-slate-100">{correctRate}%</div>
              <div className="text-xs text-slate-400">{record.correctCount}/{record.questionCount} 正确</div>
            </div>
            <div>
              <div className="text-sm text-slate-600 dark:text-slate-300">{fmtDate(record.completedAt || record.createdAt)}</div>
              <div className="text-xs text-slate-400">完成时间</div>
            </div>
          </div>
        </div>

        {answers.length > 0 && (
          <div className="overflow-auto flex-1 px-6 py-4">
            <p className="text-xs font-medium text-slate-500 mb-3">答题详情</p>
            <div className="space-y-1.5">
              {answers.map((a: any, i: number) => (
                <div key={i} className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm ${
                  a.correct
                    ? 'bg-green-50 dark:bg-green-900/10'
                    : 'bg-red-50 dark:bg-red-900/10'
                }`}>
                  <span className={`w-4 h-4 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                    a.correct ? 'bg-green-500 text-white' : 'bg-red-500 text-white'
                  }`}>{a.correct ? '✓' : '✗'}</span>
                  <span className="text-slate-500 text-xs w-8 shrink-0">{a.level}</span>
                  <span className="text-slate-700 dark:text-slate-300">题目 #{a.questionId}</span>
                  <span className="text-slate-400 text-xs ml-auto">答: {a.answer}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex justify-end px-6 py-4 border-t border-slate-200 dark:border-slate-800 shrink-0">
          <button onClick={onClose}
            className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-sm text-slate-600 dark:text-slate-400">
            关闭
          </button>
        </div>
      </div>
    </div>
  )
}
