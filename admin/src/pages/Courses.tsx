import { useState, useEffect, useCallback, useRef } from 'react'
import { Plus, Pencil, Trash2, BookOpen, Search, X, Users } from 'lucide-react'
import AdminLayout from '@/components/Layout/AdminLayout'
import Card from '@/components/UI/Card'
import Button from '@/components/UI/Button'
import { get, post, put, del } from '@/utils/request'
import { getApiBaseURL } from '@/config/apiConfig'

const BASE = getApiBaseURL()

interface UserOption { id: number; email: string; displayName: string; role: string }
interface WordBook { id: number; name: string }
interface Course {
  id: number; name: string; description: string
  wordBookId: number; teacherId: number
  teacher?: UserOption; wordBook?: WordBook
}

const COLORS = ['bg-blue-400','bg-purple-400','bg-emerald-400','bg-amber-400','bg-rose-400','bg-cyan-400','bg-indigo-400']

const UserSearch = ({ role, placeholder, value, onChange }: {
  role: string; placeholder: string; value: UserOption | null; onChange: (u: UserOption | null) => void
}) => {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<UserOption[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  // 点击外部关闭
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => {
    const t = setTimeout(async () => {
      setLoading(true)
      try {
        const res = await get<UserOption[]>(`${BASE}/courses/users/search`, { params: { q, role } })
        setResults(Array.isArray(res.data) ? res.data : [])
      } finally { setLoading(false) }
    }, 250)
    return () => clearTimeout(t)
  }, [q, role])

  const select = (u: UserOption) => { onChange(u); setQ(''); setOpen(false) }
  const clear = () => { onChange(null); setQ(''); setResults([]) }

  return (
    <div ref={wrapRef} className="relative">
      <div className={`flex items-center gap-2 px-3 py-2 border rounded-lg bg-white dark:bg-slate-800 transition-colors ${
        open ? 'border-blue-500 ring-2 ring-blue-500/20' : 'border-slate-300 dark:border-slate-600'
      }`}>
        {/* 搜索图标 */}
        {loading
          ? <div className="w-4 h-4 border-2 border-slate-300 border-t-blue-500 rounded-full animate-spin flex-shrink-0" />
          : <Search className="w-4 h-4 text-slate-400 flex-shrink-0" />
        }
        {value ? (
          <>
            <span className="flex-1 text-sm text-slate-900 dark:text-white truncate">
              {value.displayName || value.email}
              {value.displayName && <span className="ml-1.5 text-xs text-slate-400">{value.email}</span>}
            </span>
            <button onClick={clear} className="flex-shrink-0 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </>
        ) : (
          <input
            value={q}
            onChange={e => { setQ(e.target.value); setOpen(true) }}
            onFocus={() => setOpen(true)}
            placeholder={placeholder}
            className="flex-1 bg-transparent text-sm text-slate-900 dark:text-white placeholder-slate-400 outline-none min-w-0"
          />
        )}
      </div>

      {/* 下拉列表 */}
      {open && !value && (
        <div className="absolute z-50 w-full mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg overflow-hidden">
          {results.length === 0 ? (
            <p className="px-3 py-3 text-sm text-slate-400 text-center">
              {q ? '未找到匹配用户' : '输入关键词搜索...'}
            </p>
          ) : (
            <ul className="max-h-48 overflow-y-auto">
              {results.map(u => (
                <li key={u.id}>
                  <button
                    onMouseDown={e => { e.preventDefault(); select(u) }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors text-left"
                  >
                    <div className="w-7 h-7 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center flex-shrink-0">
                      <span className="text-xs font-bold text-blue-600 dark:text-blue-400">
                        {(u.displayName || u.email)[0].toUpperCase()}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{u.displayName || u.email}</p>
                      {u.displayName && <p className="text-xs text-slate-400 truncate">{u.email}</p>}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

const CourseModal = ({ course, onClose, onSaved }: { course: Course | null; onClose: () => void; onSaved: () => void }) => {
  const [name, setName] = useState(course?.name ?? '')
  const [desc, setDesc] = useState(course?.description ?? '')
  const [teacher, setTeacher] = useState<UserOption | null>(course?.teacher ?? null)
  const [wordBookId, setWordBookId] = useState(course?.wordBookId ?? 0)
  const [wordBooks, setWordBooks] = useState<WordBook[]>([])
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    get<any>(`${BASE}/wordbooks`).then(r => {
      const list = r.data?.list
      setWordBooks(Array.isArray(list) ? list : [])
    })
  }, [])
  const save = async () => {
    if (!name || !teacher) return; setSaving(true)
    try {
      const body = { name, description: desc, teacherId: teacher.id, wordBookId: wordBookId || undefined }
      course ? await put(`${BASE}/courses/${course.id}`, body) : await post(`${BASE}/courses`, body)
      onSaved()
    } finally { setSaving(false) }
  }
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-xl w-full max-w-md shadow-xl">
        <div className="flex items-center justify-between p-5 border-b border-slate-200 dark:border-slate-700">
          <h2 className="font-semibold text-slate-900 dark:text-white">{course ? '编辑课程' : '新建课程'}</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-slate-400" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div><label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">课程名称 *</label>
            <input value={name} onChange={e => setName(e.target.value)} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white" /></div>
          <div><label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">描述</label>
            <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={2} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white resize-none" /></div>
          <div><label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">老师 *</label>
            <UserSearch role="user" placeholder="搜索老师" value={teacher} onChange={setTeacher} /></div>
          <div><label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">关联词库</label>
            <select value={wordBookId} onChange={e => setWordBookId(Number(e.target.value))} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white">
              <option value={0}>不关联</option>
              {wordBooks.map(wb => <option key={wb.id} value={wb.id}>{wb.name}</option>)}
            </select></div>
        </div>
        <div className="flex justify-end gap-2 p-5 border-t border-slate-200 dark:border-slate-700">
          <Button variant="ghost" size="sm" onClick={onClose}>取消</Button>
          <Button variant="primary" size="sm" onClick={save} disabled={saving || !name || !teacher}>{saving ? '保存中...' : '保存'}</Button>
        </div>
      </div>
    </div>
  )
}

const CoursesPage = () => {
  const [courses, setCourses] = useState<Course[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [modal, setModal] = useState<Course | null | 'new'>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try { const res = await get<Course[]>(`${BASE}/courses`); setCourses(Array.isArray(res.data) ? res.data : []) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const deleteCourse = async (id: number) => {
    if (!confirm('确认删除此课程？')) return
    await del(`${BASE}/courses/${id}`); load()
  }

  const filtered = courses.filter(c => !search || c.name.includes(search) || c.teacher?.email?.includes(search) || c.teacher?.displayName?.includes(search))

  return (
    <AdminLayout title="课程管理" description="创建和管理课程">
      <Card className="p-4">
        <div className="flex items-center gap-3 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="搜索课程名称或老师..."
              className="w-full pl-9 pr-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white" />
          </div>
          <Button variant="primary" size="sm" leftIcon={<Plus className="w-4 h-4" />} onClick={() => setModal('new')}>新建课程</Button>
        </div>
        {loading ? <p className="text-sm text-slate-400 text-center py-8">加载中...</p> : filtered.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-8">暂无课程</p>
        ) : (
          <div className="space-y-2">
            {filtered.map((c, i) => (
              <div key={c.id} className="flex items-center gap-3 px-4 py-3 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
                <div className={`w-3 h-3 rounded-full flex-shrink-0 ${COLORS[i % COLORS.length]}`} />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-slate-900 dark:text-white">{c.name}</p>
                  <div className="flex items-center gap-3 mt-0.5">
                    {c.teacher && <span className="text-xs text-slate-500 flex items-center gap-1"><Users className="w-3 h-3" />{c.teacher.displayName || c.teacher.email}</span>}
                    {c.wordBook && <span className="text-xs text-slate-500 flex items-center gap-1"><BookOpen className="w-3 h-3" />{c.wordBook.name}</span>}
                    {c.description && <span className="text-xs text-slate-400 truncate max-w-xs">{c.description}</span>}
                  </div>
                </div>
                <button onClick={() => setModal(c)} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors"><Pencil className="w-4 h-4" /></button>
                <button onClick={() => deleteCourse(c.id)} className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"><Trash2 className="w-4 h-4" /></button>
              </div>
            ))}
          </div>
        )}
      </Card>
      {modal && <CourseModal course={modal === 'new' ? null : modal} onClose={() => setModal(null)} onSaved={() => { setModal(null); load() }} />}
    </AdminLayout>
  )
}

export default CoursesPage
