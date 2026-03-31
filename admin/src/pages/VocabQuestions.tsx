import { useState, useEffect, useCallback, useRef } from 'react'
import * as XLSX from 'xlsx'
import AdminLayout from '@/components/Layout/AdminLayout'
import { get, post, put, del } from '@/utils/request'
import { getApiBaseURL } from '@/config/apiConfig'
import { showAlert } from '@/utils/notification'
import { Plus, Pencil, Trash2, Search, X, Upload, Download, AlertTriangle } from 'lucide-react'

interface VocabQuestion {
  id: number
  word: string
  options: string
  correctAnswer: string
  level: string
  difficultyScore: number
}

interface ImportRow {
  word: string
  correctAnswer: string
  options: string[]
  level: string
  difficultyScore: number
  isDuplicate: boolean
  selected: boolean
}

const LEVELS = ['', 'A1', 'A2', 'B1', 'B2', 'C1']

const emptyForm = (): Partial<VocabQuestion> => ({
  word: '', options: '[]', correctAnswer: '', level: 'A1', difficultyScore: 1,
})

export default function VocabQuestions() {
  const [list, setList] = useState<VocabQuestion[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const pageSize = 20
  const [level, setLevel] = useState('')
  const [keyword, setKeyword] = useState('')
  const [loading, setLoading] = useState(false)

  // 新建/编辑弹窗
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<VocabQuestion | null>(null)
  const [form, setForm] = useState<Partial<VocabQuestion>>(emptyForm())
  const [optionsArr, setOptionsArr] = useState<string[]>(['', '', '', ''])
  const [saving, setSaving] = useState(false)

  // 导入
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [showImportModal, setShowImportModal] = useState(false)
  const [importRows, setImportRows] = useState<ImportRow[]>([])
  const [importing, setImporting] = useState(false)
  const [parsing, setParsing] = useState(false)

  const fetchList = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) })
      if (level) params.append('level', level)
      if (keyword) params.append('keyword', keyword)
      const res = await get<any>(`${getApiBaseURL()}/vocab/questions?${params}`)
      const payload = res?.data
      if (res?.code && res.code !== 200) {
        setList([])
        setTotal(0)
        return
      }
      // 兼容后端返回：{ questions, total, size, page } 以及旧结构：{ list, total }
      const questions = payload?.questions || payload?.list || []
      setList(Array.isArray(questions) ? questions : [])
      setTotal(Number(payload?.total || 0))
    } finally { setLoading(false) }
  }, [page, pageSize, level, keyword])

  useEffect(() => { fetchList() }, [fetchList])

  const openCreate = () => { setEditing(null); setForm(emptyForm()); setOptionsArr(['', '', '', '']); setModalOpen(true) }

  const openEdit = (q: VocabQuestion) => {
    setEditing(q)
    let opts: string[] = ['', '', '', '']
    try { opts = JSON.parse(q.options) } catch {}
    while (opts.length < 4) opts.push('')
    setOptionsArr(opts.slice(0, 4))
    setForm({ ...q })
    setModalOpen(true)
  }

  const handleDelete = async (id: number) => {
    if (!confirm('确认删除该题目？')) return
    await del(`${getApiBaseURL()}/vocab/questions/${id}`)
    fetchList()
  }

  const handleSave = async () => {
    if (!form.word?.trim() || !form.correctAnswer?.trim() || !form.level) {
      showAlert('单词、正确答案、等级为必填', 'error'); return
    }
    setSaving(true)
    try {
      const payload = { ...form, options: JSON.stringify(optionsArr.filter(Boolean)) }
      if (editing) {
        await put(`${getApiBaseURL()}/vocab/questions/${editing.id}`, payload)
        showAlert('更新成功', 'success')
      } else {
        await post(`${getApiBaseURL()}/vocab/questions`, payload)
        showAlert('创建成功', 'success')
      }
      setModalOpen(false); fetchList()
    } catch (e: any) { showAlert(e?.message || '操作失败', 'error') }
    finally { setSaving(false) }
  }

  // 下载模板
  const downloadTemplate = () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ['word', 'correctAnswer', 'options(逗号分隔)', 'level', 'difficultyScore'],
      ['apple', '苹果', '苹果,香蕉,橙子,葡萄', 'A1', 1],
      ['beautiful', '美丽的', '美丽的,丑陋的,高兴的,悲伤的', 'B1', 2],
    ])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'vocab_questions')
    XLSX.writeFile(wb, 'vocab_questions_template.xlsx')
  }

  // 解析 Excel → 查重 → 预览
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setParsing(true)
    try {
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array', raw: false })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' })
      if (rows.length < 2) { showAlert('Excel 数据为空', 'error'); return }

      const parsed: Omit<ImportRow, 'isDuplicate' | 'selected'>[] = []
      for (const row of rows.slice(1)) {
        const word = String(row[0] ?? '').trim()
        if (!word) continue
        const correctAnswer = String(row[1] ?? '').trim()
        const optStr = String(row[2] ?? '').trim()
        // 同时兼容中文逗号（，）和英文逗号（,）
        const opts = optStr ? optStr.split(/[,，]/).map(s => s.trim()).filter(Boolean) : []
        const lvl = String(row[3] ?? 'A1').trim()
        const diff = Number(row[4] ?? 1)
        parsed.push({
          word,
          correctAnswer,
          options: opts,
          level: ['A1','A2','B1','B2','C1'].includes(lvl) ? lvl : 'A1',
          difficultyScore: diff >= 1 ? diff : 1,
        })
      }
      if (parsed.length === 0) { showAlert('没有可解析的数据', 'error'); return }

      // 查重：复用 batch 接口前先用 check（若无 check 接口则跳过，直接全选）
      let dupSet = new Set<string>()
      try {
        const checkRes = await post<any>(`${getApiBaseURL()}/vocab/questions/check`, {
          words: parsed.map(r => r.word),
        })
        dupSet = new Set<string>((checkRes.data?.duplicates || []).map((s: string) => s.toLowerCase()))
      } catch {
        // 没有 check 接口时忽略，全部可选
      }

      setImportRows(parsed.map(r => ({
        ...r,
        isDuplicate: dupSet.has(r.word.toLowerCase()),
        selected: !dupSet.has(r.word.toLowerCase()),
      })))
      setShowImportModal(true)
    } catch (e: any) {
      showAlert(e?.message || '解析失败', 'error')
    } finally {
      setParsing(false)
    }
  }

  const toggleRow = (i: number) => setImportRows(rows => rows.map((r, idx) => idx === i ? { ...r, selected: !r.selected } : r))
  const toggleAll = (v: boolean) => setImportRows(rows => rows.map(r => ({ ...r, selected: v })))

  const confirmImport = async () => {
    const selected = importRows.filter(r => r.selected)
    if (selected.length === 0) { showAlert('请至少选择一条', 'error'); return }
    setImporting(true)
    try {
      const token = localStorage.getItem('auth_token')
      const questions = selected.map(r => ({
        word: r.word,
        correctAnswer: r.correctAnswer,
        options: JSON.stringify(r.options),
        level: r.level,
        difficultyScore: r.difficultyScore,
      }))
      const res = await fetch(`${getApiBaseURL()}/vocab/questions/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ questions }),
      })
      const data = await res.json()
      if (data.code === 200) {
        showAlert(`导入成功：${data.data?.created ?? selected.length} 条`, 'success')
        setShowImportModal(false); fetchList()
      } else {
        showAlert(data.msg || '导入失败', 'error')
      }
    } catch (e: any) { showAlert(e?.message || '导入失败', 'error') }
    finally { setImporting(false) }
  }

  const totalPages = Math.ceil(total / pageSize)
  const selectedCount = importRows.filter(r => r.selected).length
  const dupCount = importRows.filter(r => r.isDuplicate).length

  return (
    <AdminLayout>
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">词汇测评题库</h1>
          <div className="flex items-center gap-2">
            <button onClick={downloadTemplate}
              className="flex items-center gap-2 px-3 py-2 border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 rounded-lg text-sm hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
              <Download className="w-4 h-4" /> 下载模板
            </button>
            <button onClick={() => fileInputRef.current?.click()} disabled={parsing}
              className="flex items-center gap-2 px-3 py-2 border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 rounded-lg text-sm hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors disabled:opacity-50">
              <Upload className="w-4 h-4" /> {parsing ? '解析中...' : 'Excel 导入'}
            </button>
            <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFileChange} />
            <button onClick={openCreate}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm transition-colors">
              <Plus className="w-4 h-4" /> 新增题目
            </button>
          </div>
        </div>

        {/* 筛选栏 */}
        <div className="flex gap-3 flex-wrap">
          <select value={level} onChange={e => { setLevel(e.target.value); setPage(1) }}
            className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-700 dark:text-slate-300">
            {LEVELS.map(l => <option key={l} value={l}>{l || '全部等级'}</option>)}
          </select>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input value={keyword} onChange={e => { setKeyword(e.target.value); setPage(1) }} placeholder="搜索单词..."
              className="pl-9 pr-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-700 dark:text-slate-300 w-48" />
          </div>
        </div>

        {/* 表格 */}
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
              <tr>
                <th className="px-4 py-3 text-left">单词</th>
                <th className="px-4 py-3 text-left">正确答案</th>
                <th className="px-4 py-3 text-left">等级</th>
                <th className="px-4 py-3 text-left">难度分</th>
                <th className="px-4 py-3 text-left">选项数</th>
                <th className="px-4 py-3 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">加载中...</td></tr>
              ) : list.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">暂无数据</td></tr>
              ) : list.map(q => {
                let optCount = 0
                try { optCount = JSON.parse(q.options).length } catch {}
                return (
                  <tr key={q.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">{q.word}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400 max-w-xs truncate">{q.correctAnswer}</td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400">{q.level}</span>
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{q.difficultyScore}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{optCount}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => openEdit(q)} className="p-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500">
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleDelete(q.id)} className="p-1.5 rounded-md hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
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

      {/* 新建/编辑弹窗 */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xl w-full max-w-lg">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
              <h2 className="font-semibold text-slate-900 dark:text-slate-100">{editing ? '编辑题目' : '新增题目'}</h2>
              <button onClick={() => setModalOpen(false)}><X className="w-5 h-5 text-slate-400" /></button>
            </div>
            <div className="px-6 py-4 space-y-4 max-h-[70vh] overflow-y-auto">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">单词 *</label>
                <input value={form.word || ''} onChange={e => setForm(f => ({ ...f, word: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">正确答案 *</label>
                <input value={form.correctAnswer || ''} onChange={e => setForm(f => ({ ...f, correctAnswer: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">干扰选项（4个）</label>
                {optionsArr.map((opt, i) => (
                  <input key={i} value={opt} onChange={e => setOptionsArr(arr => arr.map((v, j) => j === i ? e.target.value : v))}
                    placeholder={`选项 ${i + 1}`}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm mb-2" />
                ))}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">等级 *</label>
                  <select value={form.level || 'A1'} onChange={e => setForm(f => ({ ...f, level: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm">
                    {LEVELS.filter(Boolean).map(l => <option key={l} value={l}>{l}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">难度分值</label>
                  <input type="number" min={1} value={form.difficultyScore || 1}
                    onChange={e => setForm(f => ({ ...f, difficultyScore: Number(e.target.value) }))}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm" />
                </div>
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

      {/* 导入预览弹窗 */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xl w-full max-w-3xl flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 shrink-0">
              <div>
                <h2 className="font-semibold text-slate-900 dark:text-slate-100">导入预览</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  共 {importRows.length} 条，已选 {selectedCount} 条
                  {dupCount > 0 && <span className="ml-2 text-amber-500 flex items-center gap-1 inline-flex"><AlertTriangle className="w-3 h-3" />{dupCount} 条重复</span>}
                </p>
              </div>
              <button onClick={() => setShowImportModal(false)}><X className="w-5 h-5 text-slate-400" /></button>
            </div>

            <div className="px-6 py-3 border-b border-slate-100 dark:border-slate-800 shrink-0 flex gap-3">
              <button onClick={() => toggleAll(true)} className="text-xs text-blue-600 hover:underline">全选</button>
              <button onClick={() => toggleAll(false)} className="text-xs text-slate-500 hover:underline">全不选</button>
              <button onClick={() => setImportRows(rows => rows.map(r => ({ ...r, selected: !r.isDuplicate })))}
                className="text-xs text-slate-500 hover:underline">仅选非重复</button>
            </div>

            <div className="overflow-auto flex-1">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 sticky top-0">
                  <tr>
                    <th className="px-4 py-2 text-left w-10"></th>
                    <th className="px-4 py-2 text-left">单词</th>
                    <th className="px-4 py-2 text-left">正确答案</th>
                    <th className="px-4 py-2 text-left">等级</th>
                    <th className="px-4 py-2 text-left">难度</th>
                    <th className="px-4 py-2 text-left">状态</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {importRows.map((r, i) => (
                    <tr key={i} className={r.isDuplicate ? 'bg-amber-50 dark:bg-amber-900/10' : ''}>
                      <td className="px-4 py-2">
                        <input type="checkbox" checked={r.selected} onChange={() => toggleRow(i)}
                          className="rounded border-slate-300" />
                      </td>
                      <td className="px-4 py-2 font-medium text-slate-900 dark:text-slate-100">{r.word}</td>
                      <td className="px-4 py-2 text-slate-600 dark:text-slate-400 max-w-[160px] truncate">{r.correctAnswer}</td>
                      <td className="px-4 py-2">
                        <span className="px-2 py-0.5 rounded-full text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400">{r.level}</span>
                      </td>
                      <td className="px-4 py-2 text-slate-500">{r.difficultyScore}</td>
                      <td className="px-4 py-2">
                        {r.isDuplicate
                          ? <span className="text-xs text-amber-600 flex items-center gap-1"><AlertTriangle className="w-3 h-3" />重复</span>
                          : <span className="text-xs text-green-600">新增</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-200 dark:border-slate-800 shrink-0">
              <button onClick={() => setShowImportModal(false)}
                className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-sm text-slate-600 dark:text-slate-400">取消</button>
              <button onClick={confirmImport} disabled={importing || selectedCount === 0}
                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm disabled:opacity-50">
                {importing ? '导入中...' : `导入 ${selectedCount} 条`}
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  )
}
