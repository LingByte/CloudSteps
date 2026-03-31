import { useState, useEffect, useCallback } from 'react'
import AdminLayout from '@/components/Layout/AdminLayout'
import { get, post, put, del } from '@/utils/request'
import { getApiBaseURL } from '@/config/apiConfig'
import { Plus, Pencil, Trash2, Search, X } from 'lucide-react'

interface SelfTestWord {
  id: number
  word: string
  translation: string
  difficulty: 'easy' | 'hard'
}

const DIFFICULTIES = [
  { value: '', label: '全部难度' },
  { value: 'easy', label: '简单' },
  { value: 'hard', label: '困难' },
]

const emptyForm = (): Partial<SelfTestWord> => ({
  word: '',
  translation: '',
  difficulty: 'easy',
})

export default function SelfTestWords() {
  const [list, setList] = useState<SelfTestWord[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const pageSize = 20
  const [difficulty, setDifficulty] = useState('')
  const [keyword, setKeyword] = useState('')
  const [loading, setLoading] = useState(false)

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<SelfTestWord | null>(null)
  const [form, setForm] = useState<Partial<SelfTestWord>>(emptyForm())
  const [saving, setSaving] = useState(false)

  const fetchList = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) })
      if (difficulty) params.append('difficulty', difficulty)
      if (keyword) params.append('keyword', keyword)
      const res = await get<any>(`${getApiBaseURL()}/vocab/self-test?${params}`)
      setList(res.data?.list || [])
      setTotal(res.data?.total || 0)
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, difficulty, keyword])

  useEffect(() => { fetchList() }, [fetchList])

  const openCreate = () => {
    setEditing(null)
    setForm(emptyForm())
    setModalOpen(true)
  }

  const openEdit = (w: SelfTestWord) => {
    setEditing(w)
    setForm({ ...w })
    setModalOpen(true)
  }

  const handleDelete = async (id: number) => {
    if (!confirm('确认删除该单词？')) return
    await del(`${getApiBaseURL()}/vocab/self-test/${id}`)
    fetchList()
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      if (editing) {
        await put(`${getApiBaseURL()}/vocab/self-test/${editing.id}`, form)
      } else {
        await post(`${getApiBaseURL()}/vocab/self-test`, form)
      }
      setModalOpen(false)
      fetchList()
    } finally {
      setSaving(false)
    }
  }

  const totalPages = Math.ceil(total / pageSize)

  return (
    <AdminLayout>
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">自测题库</h1>
          <button
            onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm transition-colors"
          >
            <Plus className="w-4 h-4" /> 新增单词
          </button>
        </div>

        {/* 筛选栏 */}
        <div className="flex gap-3 flex-wrap">
          <select
            value={difficulty}
            onChange={e => { setDifficulty(e.target.value); setPage(1) }}
            className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-700 dark:text-slate-300"
          >
            {DIFFICULTIES.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
          </select>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              value={keyword}
              onChange={e => { setKeyword(e.target.value); setPage(1) }}
              placeholder="搜索单词或释义..."
              className="pl-9 pr-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-700 dark:text-slate-300 w-52"
            />
          </div>
        </div>

        {/* 表格 */}
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
              <tr>
                <th className="px-4 py-3 text-left">单词</th>
                <th className="px-4 py-3 text-left">中文释义</th>
                <th className="px-4 py-3 text-left">难度</th>
                <th className="px-4 py-3 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading ? (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-400">加载中...</td></tr>
              ) : list.length === 0 ? (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-400">暂无数据</td></tr>
              ) : list.map(w => (
                <tr key={w.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">{w.word}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{w.translation}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      w.difficulty === 'hard'
                        ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                        : 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                    }`}>
                      {w.difficulty === 'hard' ? '困难' : '简单'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => openEdit(w)} className="p-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500">
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleDelete(w.id)} className="p-1.5 rounded-md hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500">
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

      {/* 弹窗 */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
              <h2 className="font-semibold text-slate-900 dark:text-slate-100">{editing ? '编辑单词' : '新增单词'}</h2>
              <button onClick={() => setModalOpen(false)}><X className="w-5 h-5 text-slate-400" /></button>
            </div>
            <div className="px-6 py-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">单词 *</label>
                <input value={form.word || ''} onChange={e => setForm(f => ({ ...f, word: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">中文释义 *</label>
                <input value={form.translation || ''} onChange={e => setForm(f => ({ ...f, translation: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">难度</label>
                <select value={form.difficulty || 'easy'} onChange={e => setForm(f => ({ ...f, difficulty: e.target.value as 'easy' | 'hard' }))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm">
                  <option value="easy">简单</option>
                  <option value="hard">困难</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-200 dark:border-slate-800">
              <button onClick={() => setModalOpen(false)}
                className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-sm text-slate-600 dark:text-slate-400">取消</button>
              <button onClick={handleSave} disabled={saving}
                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm disabled:opacity-50">
                {saving ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  )
}
