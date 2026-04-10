import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import * as XLSX from 'xlsx'
import AdminLayout from '@/components/Layout/AdminLayout'
import { get, post, put, del } from '@/utils/request'
import { getApiBaseURL } from '@/config/apiConfig'
import { showAlert } from '@/utils/notification'
import { Plus, Pencil, Trash2, Search, ChevronLeft, ChevronRight, ArrowLeft, Upload, Download, AlertTriangle, Wand2 } from 'lucide-react'
import LingechoTTS from '@/components/UI/LingechoTTS'
import VoicePlayer from '@/components/VoicePlayer'

const LINGECHO_URL = 'https://soulmy.top/api/open/tts'
const API_KEY = import.meta.env.VITE_LINGECHO_API_KEY as string
const API_SECRET = import.meta.env.VITE_LINGECHO_API_SECRET as string

async function fetchTTS(text: string): Promise<string> {
  const res = await fetch(LINGECHO_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY, 'x-api-secret': API_SECRET },
    body: JSON.stringify({ text }),
  })
  const data = await res.json()
  if (data.code !== 200 || !data.data?.url) throw new Error(data.msg || 'TTS 失败')
  return data.data.url as string
}

interface Word {
  id: number
  wordBookId: number
  word: string
  phonetic: string
  phoneticUs?: string
  phoneticUk?: string
  lemma?: string
  translation: string
  exampleSentence: string
  exampleSentences?: string
  audioUrl: string
  imageUrl?: string
  videoUrl?: string
  difficulty: number
  sortOrder: number
  partOfSpeech?: string
  definition?: string
  synonyms?: string
  antonyms?: string
  wordFamily?: string
  collocations?: string
  frequency?: number
  importance?: number
  tags?: string
  notes?: string
  syllables?: string
  stressPattern?: string
  cefrLevel?: string
  register?: string
  etymology?: string
  morphology?: string
  derivations?: string
  mnemonic?: string
  homophones?: string
  usageNotes?: string
  grammarPatterns?: string
}
interface WordBook { id: number; name: string; wordCount: number; level: string }

interface ImportRow {
  word: string; phonetic: string; translation: string; exampleSentence: string
  audioUrl: string; difficulty: number; sortOrder: number
  isDuplicate: boolean; selected: boolean
}

const emptyForm = (): Record<string, string | number> => ({
  word: '', phonetic: '', phoneticUs: '', phoneticUk: '', lemma: '',
  translation: '', exampleSentence: '', exampleSentences: '', audioUrl: '',
  imageUrl: '', videoUrl: '', difficulty: 1, sortOrder: 0,
  partOfSpeech: '', definition: '', synonyms: '', antonyms: '', wordFamily: '', collocations: '',
  frequency: 1, importance: 1, tags: '', notes: '',
  syllables: '', stressPattern: '', cefrLevel: '', register: '',
  etymology: '', morphology: '', derivations: '', mnemonic: '', homophones: '',
  usageNotes: '', grammarPatterns: '',
})

const splitAudioUrls = (audioUrl: string): [string, string, string] => {
  const parts = (audioUrl || '')
    .split(';')
    .map(s => s.trim())
    .filter(Boolean)
  const p0 = parts[0] || ''
  const p1 = parts[1] || ''
  const p2 = parts[2] || ''
  return [p0, p1, p2]
}

const joinAudioUrls = (parts: [string, string, string]): string => {
  const normalized = parts.map(p => (p || '').trim())
  return normalized.join(';').replace(/;+$/g, '')
}

export default function WordBookWords() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [book, setBook] = useState<WordBook | null>(null)
  const [words, setWords] = useState<Word[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [keyword, setKeyword] = useState('')
  const [loading, setLoading] = useState(false)

  // 新建/编辑弹窗
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<Word | null>(null)
  const [form, setForm] = useState(emptyForm())
  const [audioUrlParts, setAudioUrlParts] = useState<[string, string, string]>(['', '', ''])
  const [saving, setSaving] = useState(false)

  // 导入预览弹窗
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [showImportModal, setShowImportModal] = useState(false)
  const [importRows, setImportRows] = useState<ImportRow[]>([])
  const [importing, setImporting] = useState(false)
  const [parsing, setParsing] = useState(false)

  const pageSize = 30

  const loadBook = useCallback(async () => {
    const res = await get<any>(`${getApiBaseURL()}/wordbooks/${id}`)
    if (res.code === 200) setBook(res.data)
  }, [id])

  const loadWords = useCallback(async () => {
    setLoading(true)
    try {
      const res = await get<any>(`${getApiBaseURL()}/wordbooks/${id}/words?page=${page}&pageSize=${pageSize}&keyword=${keyword}`)
      if (res.code === 200) { setWords(res.data.list || []); setTotal(res.data.total || 0) }
    } finally { setLoading(false) }
  }, [id, page, keyword])

  useEffect(() => { loadBook() }, [loadBook])
  useEffect(() => { loadWords() }, [loadWords])

  const openCreate = () => {
    setEditing(null)
    setForm(emptyForm())
    setAudioUrlParts(['', '', ''])
    setShowModal(true)
  }
  const openEdit = (w: Word) => {
    setEditing(w)
    setForm({
      ...emptyForm(),
      word: w.word,
      phonetic: w.phonetic || '',
      phoneticUs: w.phoneticUs || '',
      phoneticUk: w.phoneticUk || '',
      lemma: w.lemma || '',
      translation: w.translation || '',
      exampleSentence: w.exampleSentence || '',
      exampleSentences: w.exampleSentences || '',
      audioUrl: w.audioUrl || '',
      imageUrl: w.imageUrl || '',
      videoUrl: w.videoUrl || '',
      difficulty: w.difficulty ?? 1,
      sortOrder: w.sortOrder ?? 0,
      partOfSpeech: w.partOfSpeech || '',
      definition: w.definition || '',
      synonyms: w.synonyms || '',
      antonyms: w.antonyms || '',
      wordFamily: w.wordFamily || '',
      collocations: w.collocations || '',
      frequency: w.frequency ?? 1,
      importance: w.importance ?? 1,
      tags: w.tags || '',
      notes: w.notes || '',
      syllables: w.syllables || '',
      stressPattern: w.stressPattern || '',
      cefrLevel: w.cefrLevel || '',
      register: w.register || '',
      etymology: w.etymology || '',
      morphology: w.morphology || '',
      derivations: w.derivations || '',
      mnemonic: w.mnemonic || '',
      homophones: w.homophones || '',
      usageNotes: w.usageNotes || '',
      grammarPatterns: w.grammarPatterns || '',
    })
    setAudioUrlParts(splitAudioUrls(w.audioUrl))
    setShowModal(true)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const payload = {
        ...form,
        difficulty: Number(form.difficulty) || 1,
        sortOrder: Number(form.sortOrder) || 0,
        frequency: Number(form.frequency) || 1,
        importance: Number(form.importance) || 1,
      }
      if (editing) { await put(`${getApiBaseURL()}/wordbooks/${id}/words/${editing.id}`, payload); showAlert('更新成功', 'success') }
      else { await post(`${getApiBaseURL()}/wordbooks/${id}/words`, payload); showAlert('添加成功', 'success') }
      setShowModal(false); loadWords(); loadBook()
    } catch (e: any) { showAlert(e?.message || '操作失败', 'error') }
    finally { setSaving(false) }
  }

  const handleDelete = async (w: Word) => {
    if (!confirm(`确定删除单词「${w.word}」？`)) return
    try {
      await del(`${getApiBaseURL()}/wordbooks/${id}/words/${w.id}`)
      showAlert('删除成功', 'success'); loadWords(); loadBook()
    } catch (e: any) { showAlert(e?.message || '删除失败', 'error') }
  }

  // 批量生成音频
  const [batchRunning, setBatchRunning] = useState(false)
  const [batchProgress, setBatchProgress] = useState<{ done: number; total: number } | null>(null)
  const batchStopRef = useRef(false)

  const handleBatchAudio = async () => {
    // 拉取全部无音频的单词（不受分页限制）
    const res = await get<any>(`${getApiBaseURL()}/wordbooks/${id}/words?page=1&pageSize=9999`)
    const allWords: Word[] = res.data?.list || []
    const targets = allWords.filter(w => !w.audioUrl)
    if (targets.length === 0) { showAlert('所有单词已有音频', 'success'); return }

    setBatchRunning(true)
    batchStopRef.current = false
    setBatchProgress({ done: 0, total: targets.length })

    let done = 0
    for (const w of targets) {
      if (batchStopRef.current) break
      try {
        // 解析中文释义
        let zh = w.word
        if (w.translation) {
          try {
            const arr = JSON.parse(w.translation)
            const first: string = Array.isArray(arr) ? arr[0] : w.translation
            zh = first.replace(/^[a-z]+\.\s*/i, '').trim() || w.word
          } catch {
            zh = w.translation.replace(/^[a-z]+\.\s*/i, '').trim() || w.word
          }
        }
        const texts = [w.word, `${w.word} ${w.word} ${w.word}`, `${w.word} ${w.word} ${zh}`]
        const urls: string[] = []
        for (const text of texts) {
          urls.push(await fetchTTS(text))
          if (urls.length < texts.length) await new Promise(r => setTimeout(r, 100))
        }
        await put(`${getApiBaseURL()}/wordbooks/${id}/words/${w.id}`, { audioUrl: urls.join(';') })
      } catch {
        // 单个失败跳过，继续下一个
      }
      done++
      setBatchProgress({ done, total: targets.length })
      await new Promise(r => setTimeout(r, 200))
    }

    setBatchRunning(false)
    setBatchProgress(null)
    showAlert(`完成，已处理 ${done} 个单词`, 'success')
    loadWords()
  }

  const downloadTemplate = () => {
    const a = document.createElement('a'); a.href = '/words_demo.xlsx'; a.download = 'words_template.xlsx'; a.click()
  }

  // 解析 Excel → 调 check 接口 → 打开预览弹窗
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setParsing(true)
    try {
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 })
      if (rows.length < 2) { showAlert('Excel 数据为空', 'error'); return }

      const parsed: Omit<ImportRow, 'isDuplicate' | 'selected'>[] = []
      for (const row of rows.slice(1)) {
        const word = String(row[0] ?? '').trim()
        if (!word) continue
        const diff = Number(row[5])
        parsed.push({
          word,
          phonetic: String(row[1] ?? '').trim(),
          translation: String(row[2] ?? '').trim(),
          exampleSentence: String(row[3] ?? '').trim(),
          audioUrl: String(row[4] ?? '').trim(),
          difficulty: diff >= 1 && diff <= 5 ? diff : 1,
          sortOrder: Number(row[6] ?? 0),
        })
      }
      if (parsed.length === 0) { showAlert('没有可解析的数据', 'error'); return }

      // 查重
      const checkRes = await post<any>(`${getApiBaseURL()}/wordbooks/${id}/words/check`, { words: parsed.map(r => r.word) })
      const dupSet = new Set<string>((checkRes.data?.duplicates || []).map((s: string) => s.toLowerCase()))

      setImportRows(parsed.map(r => ({
        ...r,
        isDuplicate: dupSet.has(r.word.toLowerCase()),
        selected: !dupSet.has(r.word.toLowerCase()), // 默认不选重复项
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
      // 构造 FormData，把选中行序列化后发送
      // 后端已有 import 接口接收 xlsx，这里改为直接 POST JSON 批量创建
      const token = localStorage.getItem('auth_token')
      const res = await fetch(`${getApiBaseURL()}/wordbooks/${id}/words/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ words: selected }),
      })
      const data = await res.json()
      if (data.code === 200) {
        showAlert(`导入成功：${data.data.imported} 条`, 'success')
        setShowImportModal(false); loadWords(); loadBook()
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
      <div className="p-6 space-y-5">
        {/* 面包屑 */}
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/wordbooks')} className="flex items-center gap-1 text-sm text-slate-500 hover:text-blue-600 transition-colors">
            <ArrowLeft className="w-4 h-4" /> 词库列表
          </button>
          <span className="text-slate-300 dark:text-slate-600">/</span>
          <span className="text-sm font-medium text-slate-800 dark:text-slate-100">
            {book?.name || '词库详情'}
            {book && <span className="ml-2 text-xs text-slate-400">共 {book.wordCount} 词</span>}
          </span>
        </div>

        {/* 操作栏 */}
        <div className="flex items-center justify-between gap-4">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input value={keyword} onChange={e => { setKeyword(e.target.value); setPage(1) }} placeholder="搜索单词或释义..."
              className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="flex items-center gap-2">
            <button onClick={downloadTemplate} className="flex items-center gap-2 px-3 py-2 border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 rounded-lg text-sm hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
              <Download className="w-4 h-4" /> 下载模板
            </button>
            <button onClick={() => fileInputRef.current?.click()} disabled={parsing} className="flex items-center gap-2 px-3 py-2 border border-green-500 text-green-600 dark:text-green-400 rounded-lg text-sm hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors disabled:opacity-50">
              <Upload className="w-4 h-4" /> {parsing ? '解析中...' : 'Excel 导入'}
            </button>
            <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFileChange} />
            <button
              onClick={batchRunning ? () => { batchStopRef.current = true } : handleBatchAudio}
              disabled={loading}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors disabled:opacity-50 ${
                batchRunning
                  ? 'border border-red-400 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20'
                  : 'border border-indigo-400 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20'
              }`}
            >
              <Wand2 className="w-4 h-4" />
              {batchRunning
                ? `停止 (${batchProgress?.done}/${batchProgress?.total})`
                : '批量生成音频'}
            </button>
            <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition-colors">
              <Plus className="w-4 h-4" /> 添加单词
            </button>
          </div>
        </div>

        {/* 单词表格 */}
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">
                <th className="text-left px-4 py-3 font-medium text-slate-600 dark:text-slate-400 w-8">#</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600 dark:text-slate-400">单词</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600 dark:text-slate-400">音标</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600 dark:text-slate-400 max-w-xs">释义</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600 dark:text-slate-400 w-14">CEFR</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600 dark:text-slate-400">难度</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600 dark:text-slate-400">操作</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="text-center py-12 text-slate-400">加载中...</td></tr>
              ) : words.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-12 text-slate-400">暂无单词</td></tr>
              ) : words.map((w, i) => (
                <tr key={w.id} className="border-b border-slate-100 dark:border-slate-700/50 hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                  <td className="px-4 py-3 text-slate-400 text-xs">{(page - 1) * pageSize + i + 1}</td>
                  <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-100">{w.word}</td>
                  <td className="px-4 py-3 text-slate-500 dark:text-slate-400 font-mono text-xs">{w.phonetic || '-'}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300 max-w-xs truncate">{w.translation || '-'}</td>
                  <td className="px-4 py-3 text-slate-500 text-xs font-medium">{w.cefrLevel || '—'}</td>
                  <td className="px-4 py-3">
                    <span className="flex gap-0.5">
                      {[1,2,3,4,5].map(n => <span key={n} className={`w-2 h-2 rounded-full ${n <= w.difficulty ? 'bg-blue-500' : 'bg-slate-200 dark:bg-slate-600'}`} />)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => openEdit(w)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 transition-colors"><Pencil className="w-3.5 h-3.5" /></button>
                      <button onClick={() => handleDelete(w)} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-slate-500 hover:text-red-500 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between text-sm text-slate-500">
            <span>共 {total} 条</span>
            <div className="flex items-center gap-2">
              <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-800"><ChevronLeft className="w-4 h-4" /></button>
              <span>{page} / {totalPages}</span>
              <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-800"><ChevronRight className="w-4 h-4" /></button>
            </div>
          </div>
        )}
      </div>

      {/* 导入预览弹窗 */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-5 border-b border-slate-200 dark:border-slate-700">
              <div>
                <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">导入预览</h2>
                <p className="text-xs text-slate-500 mt-0.5">共 {importRows.length} 条，{dupCount > 0 && <span className="text-amber-500">{dupCount} 条重复（已默认取消勾选）</span>}，已选 {selectedCount} 条</p>
              </div>
              <button onClick={() => setShowImportModal(false)} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
            </div>

            {/* 全选/反选 */}
            <div className="flex items-center gap-4 px-5 py-3 border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/30 text-sm">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={importRows.every(r => r.selected)} onChange={e => toggleAll(e.target.checked)} className="rounded" />
                全选
              </label>
              <button onClick={() => toggleAll(false)} className="text-slate-500 hover:text-slate-700">全不选</button>
              <button onClick={() => setImportRows(rows => rows.map(r => ({ ...r, selected: !r.isDuplicate })))} className="text-slate-500 hover:text-slate-700">仅选非重复</button>
              {dupCount > 0 && (
                <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                  <AlertTriangle className="w-3.5 h-3.5" /> {dupCount} 条已存在于词库中
                </span>
              )}
            </div>

            {/* 预览表格 */}
            <div className="overflow-auto flex-1">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
                  <tr>
                    <th className="px-4 py-2 w-10"></th>
                    <th className="text-left px-4 py-2 font-medium text-slate-600 dark:text-slate-400">单词</th>
                    <th className="text-left px-4 py-2 font-medium text-slate-600 dark:text-slate-400">音标</th>
                    <th className="text-left px-4 py-2 font-medium text-slate-600 dark:text-slate-400">释义</th>
                    <th className="text-left px-4 py-2 font-medium text-slate-600 dark:text-slate-400">例句</th>
                    <th className="text-left px-4 py-2 font-medium text-slate-600 dark:text-slate-400 w-16">难度</th>
                    <th className="text-left px-4 py-2 font-medium text-slate-600 dark:text-slate-400 w-16">状态</th>
                  </tr>
                </thead>
                <tbody>
                  {importRows.map((row, i) => (
                    <tr key={i} onClick={() => toggleRow(i)} className={`border-b border-slate-100 dark:border-slate-700/50 cursor-pointer transition-colors ${row.selected ? 'bg-white dark:bg-slate-800' : 'bg-slate-50/50 dark:bg-slate-900/30 opacity-60'} hover:bg-blue-50/30 dark:hover:bg-blue-900/10`}>
                      <td className="px-4 py-2 text-center">
                        <input type="checkbox" checked={row.selected} onChange={() => toggleRow(i)} onClick={e => e.stopPropagation()} className="rounded" />
                      </td>
                      <td className="px-4 py-2 font-medium text-slate-800 dark:text-slate-100">{row.word}</td>
                      <td className="px-4 py-2 text-slate-500 font-mono text-xs">{row.phonetic || '-'}</td>
                      <td className="px-4 py-2 text-slate-600 dark:text-slate-300 max-w-[180px] truncate">{row.translation || '-'}</td>
                      <td className="px-4 py-2 text-slate-500 max-w-[200px] truncate">{row.exampleSentence || '-'}</td>
                      <td className="px-4 py-2 text-slate-500">{row.difficulty}</td>
                      <td className="px-4 py-2">
                        {row.isDuplicate
                          ? <span className="px-1.5 py-0.5 text-xs bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded">重复</span>
                          : <span className="px-1.5 py-0.5 text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded">新增</span>
                        }
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end gap-3 p-5 border-t border-slate-200 dark:border-slate-700">
              <button onClick={() => setShowImportModal(false)} className="px-4 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700">取消</button>
              <button onClick={confirmImport} disabled={importing || selectedCount === 0} className="px-5 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                {importing ? '导入中...' : `确认导入 ${selectedCount} 条`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 新建/编辑弹窗 */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-5xl h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shrink-0">
              <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">{editing ? '编辑单词' : '添加单词'}</h2>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">单词 *</label>
                      <input value={String(form.word)} onChange={e => setForm(f => ({ ...f, word: e.target.value }))} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm dark:bg-slate-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">词元 (lemma)</label>
                      <input value={String(form.lemma)} onChange={e => setForm(f => ({ ...f, lemma: e.target.value }))} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm dark:bg-slate-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">音标（通用）</label>
                      <input value={String(form.phonetic)} onChange={e => setForm(f => ({ ...f, phonetic: e.target.value }))} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm dark:bg-slate-700 dark:text-white font-mono focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">美音 IPA</label>
                      <input value={String(form.phoneticUs)} onChange={e => setForm(f => ({ ...f, phoneticUs: e.target.value }))} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm dark:bg-slate-700 dark:text-white font-mono focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">英音 IPA</label>
                      <input value={String(form.phoneticUk)} onChange={e => setForm(f => ({ ...f, phoneticUk: e.target.value }))} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm dark:bg-slate-700 dark:text-white font-mono focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">词性</label>
                      <input value={String(form.partOfSpeech)} onChange={e => setForm(f => ({ ...f, partOfSpeech: e.target.value }))} placeholder="noun / verb …" className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm dark:bg-slate-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">CEFR</label>
                      <input value={String(form.cefrLevel)} onChange={e => setForm(f => ({ ...f, cefrLevel: e.target.value }))} placeholder="A1–C2" className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm dark:bg-slate-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">音节 / 重音</label>
                      <div className="flex gap-2">
                        <input value={String(form.syllables)} onChange={e => setForm(f => ({ ...f, syllables: e.target.value }))} placeholder="音节" className="flex-1 px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm dark:bg-slate-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
                        <input value={String(form.stressPattern)} onChange={e => setForm(f => ({ ...f, stressPattern: e.target.value }))} placeholder="重音" className="flex-1 px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm dark:bg-slate-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      </div>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">释义（JSON 数组或文本）</label>
                    <textarea value={String(form.translation)} onChange={e => setForm(f => ({ ...f, translation: e.target.value }))} rows={6} placeholder='如: ["n. 苹果"]' className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm dark:bg-slate-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none font-mono" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">英文释义</label>
                    <textarea value={String(form.definition)} onChange={e => setForm(f => ({ ...f, definition: e.target.value }))} rows={3} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm dark:bg-slate-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">例句</label>
                    <textarea value={String(form.exampleSentence)} onChange={e => setForm(f => ({ ...f, exampleSentence: e.target.value }))} rows={4} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm dark:bg-slate-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">多例句（JSON 数组）</label>
                    <textarea value={String(form.exampleSentences)} onChange={e => setForm(f => ({ ...f, exampleSentences: e.target.value }))} rows={3} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm dark:bg-slate-700 dark:text-white font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">难度 (1-5)</label>
                      <input type="number" min={1} max={5} value={form.difficulty as number} onChange={e => setForm(f => ({ ...f, difficulty: Number(e.target.value) }))} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm dark:bg-slate-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">排序权重</label>
                      <input type="number" value={form.sortOrder as number} onChange={e => setForm(f => ({ ...f, sortOrder: Number(e.target.value) }))} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm dark:bg-slate-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">频率 1–5</label>
                      <input type="number" min={1} max={5} value={form.frequency as number} onChange={e => setForm(f => ({ ...f, frequency: Number(e.target.value) }))} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm dark:bg-slate-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">重要度 1–5</label>
                      <input type="number" min={1} max={5} value={form.importance as number} onChange={e => setForm(f => ({ ...f, importance: Number(e.target.value) }))} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm dark:bg-slate-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                  </div>

                  <details className="rounded-lg border border-slate-200 dark:border-slate-600 p-3">
                    <summary className="text-sm font-medium text-slate-700 dark:text-slate-300 cursor-pointer">更多词典字段（语体、词源、搭配、JSON 列表）</summary>
                    <div className="mt-4 space-y-3">
                      <div>
                        <label className="block text-xs text-slate-500 mb-1">语体 register（JSON 数组）</label>
                        <input value={String(form.register)} onChange={e => setForm(f => ({ ...f, register: e.target.value }))} placeholder='如 ["neutral","informal"]' className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm dark:bg-slate-700 dark:text-white font-mono" />
                      </div>
                      <div>
                        <label className="block text-xs text-slate-500 mb-1">词源</label>
                        <textarea value={String(form.etymology)} onChange={e => setForm(f => ({ ...f, etymology: e.target.value }))} rows={2} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm dark:bg-slate-700 dark:text-white resize-none" />
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs text-slate-500 mb-1">形态 morphology（JSON）</label>
                          <textarea value={String(form.morphology)} onChange={e => setForm(f => ({ ...f, morphology: e.target.value }))} rows={2} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm dark:bg-slate-700 dark:text-white font-mono resize-none" />
                        </div>
                        <div>
                          <label className="block text-xs text-slate-500 mb-1">派生 derivations（JSON 数组）</label>
                          <textarea value={String(form.derivations)} onChange={e => setForm(f => ({ ...f, derivations: e.target.value }))} rows={2} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm dark:bg-slate-700 dark:text-white font-mono resize-none" />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs text-slate-500 mb-1">联想记忆</label>
                        <textarea value={String(form.mnemonic)} onChange={e => setForm(f => ({ ...f, mnemonic: e.target.value }))} rows={2} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm dark:bg-slate-700 dark:text-white resize-none" />
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs text-slate-500 mb-1">同义词 synonyms（JSON）</label>
                          <textarea value={String(form.synonyms)} onChange={e => setForm(f => ({ ...f, synonyms: e.target.value }))} rows={2} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm dark:bg-slate-700 dark:text-white font-mono resize-none" />
                        </div>
                        <div>
                          <label className="block text-xs text-slate-500 mb-1">反义词 antonyms（JSON）</label>
                          <textarea value={String(form.antonyms)} onChange={e => setForm(f => ({ ...f, antonyms: e.target.value }))} rows={2} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm dark:bg-slate-700 dark:text-white font-mono resize-none" />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs text-slate-500 mb-1">搭配 collocations（JSON）</label>
                        <textarea value={String(form.collocations)} onChange={e => setForm(f => ({ ...f, collocations: e.target.value }))} rows={2} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm dark:bg-slate-700 dark:text-white font-mono resize-none" />
                      </div>
                      <div>
                        <label className="block text-xs text-slate-500 mb-1">词族 wordFamily（JSON）</label>
                        <textarea value={String(form.wordFamily)} onChange={e => setForm(f => ({ ...f, wordFamily: e.target.value }))} rows={2} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm dark:bg-slate-700 dark:text-white font-mono resize-none" />
                      </div>
                      <div>
                        <label className="block text-xs text-slate-500 mb-1">同音词 homophones（JSON）</label>
                        <textarea value={String(form.homophones)} onChange={e => setForm(f => ({ ...f, homophones: e.target.value }))} rows={2} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm dark:bg-slate-700 dark:text-white font-mono resize-none" />
                      </div>
                      <div>
                        <label className="block text-xs text-slate-500 mb-1">用法辨析</label>
                        <textarea value={String(form.usageNotes)} onChange={e => setForm(f => ({ ...f, usageNotes: e.target.value }))} rows={2} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm dark:bg-slate-700 dark:text-white resize-none" />
                      </div>
                      <div>
                        <label className="block text-xs text-slate-500 mb-1">常用结构 grammarPatterns（JSON 数组）</label>
                        <textarea value={String(form.grammarPatterns)} onChange={e => setForm(f => ({ ...f, grammarPatterns: e.target.value }))} rows={2} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm dark:bg-slate-700 dark:text-white font-mono resize-none" />
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs text-slate-500 mb-1">标签 tags（JSON）</label>
                          <textarea value={String(form.tags)} onChange={e => setForm(f => ({ ...f, tags: e.target.value }))} rows={2} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm dark:bg-slate-700 dark:text-white font-mono resize-none" />
                        </div>
                        <div>
                          <label className="block text-xs text-slate-500 mb-1">备注 notes</label>
                          <textarea value={String(form.notes)} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm dark:bg-slate-700 dark:text-white resize-none" />
                        </div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs text-slate-500 mb-1">配图 imageUrl</label>
                          <input value={String(form.imageUrl)} onChange={e => setForm(f => ({ ...f, imageUrl: e.target.value }))} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm dark:bg-slate-700 dark:text-white" />
                        </div>
                        <div>
                          <label className="block text-xs text-slate-500 mb-1">视频 videoUrl</label>
                          <input value={String(form.videoUrl)} onChange={e => setForm(f => ({ ...f, videoUrl: e.target.value }))} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm dark:bg-slate-700 dark:text-white" />
                        </div>
                      </div>
                    </div>
                  </details>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">音频 URL</label>
                    <div className="space-y-3">
                      {([0, 1, 2] as const).map((idx) => (
                        <div key={idx} className="space-y-2">
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-slate-500 dark:text-slate-400 w-20 shrink-0">URL {idx + 1}</span>
                            <input
                              value={audioUrlParts[idx]}
                              onChange={e => {
                                const next: [string, string, string] = [...audioUrlParts] as [string, string, string]
                                next[idx] = e.target.value
                                setAudioUrlParts(next)
                                setForm(f => ({ ...f, audioUrl: joinAudioUrls(next) }))
                              }}
                              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm dark:bg-slate-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                          </div>
                          {audioUrlParts[idx]?.trim() ? (
                            <VoicePlayer
                              audioUrl={audioUrlParts[idx].trim()}
                              title={`音频 ${idx + 1}`}
                              className="w-full"
                            />
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <LingechoTTS
                      word={String(form.word)}
                      translation={String(form.translation)}
                      onGenerated={url => {
                        setForm(f => ({ ...f, audioUrl: url }))
                        setAudioUrlParts(splitAudioUrls(url))
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3 p-6 border-t border-slate-200 dark:border-slate-700 shrink-0 bg-white dark:bg-slate-800">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700">取消</button>
              <button onClick={handleSave} disabled={saving} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">{saving ? '保存中...' : '保存'}</button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  )
}
