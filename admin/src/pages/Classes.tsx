import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import AdminLayout from '@/components/Layout/AdminLayout'
import Card from '@/components/UI/Card'
import Button from '@/components/UI/Button'
import { get, post, put, del } from '@/utils/request'
import { getApiBaseURL } from '@/config/apiConfig'
import {
  Plus,
  Pencil,
  Trash2,
  Search,
  X,
  Users,
  BookOpen,
  CalendarDays,
} from 'lucide-react'

const BASE = getApiBaseURL()

interface ClassItem {
  id: number
  name: string
  description?: string
  createdAt: string
}

interface Course {
  id: number
  name: string
}

interface UserOption {
  id: number
  email: string
  displayName: string
  role: string
}

interface ClassStudent {
  id: number
  classId: number
  studentId: number
  student?: UserOption
}

interface ClassCourse {
  id: number
  classId: number
  courseId: number
  course?: Course
}

const UserSearch = ({ role, placeholder, onSelect }: {
  role: string
  placeholder: string
  onSelect: (u: UserOption) => void
}) => {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<UserOption[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => {
    const t = setTimeout(async () => {
      if (!open) return
      setLoading(true)
      try {
        const res = await get<UserOption[]>(`${BASE}/courses/users/search`, { params: { q, role } })
        setResults(Array.isArray(res.data) ? res.data : [])
      } finally {
        setLoading(false)
      }
    }, 250)
    return () => clearTimeout(t)
  }, [q, role, open])

  return (
    <div ref={wrapRef} className="relative">
      <div className={`flex items-center gap-2 px-3 py-2 border rounded-lg bg-white dark:bg-slate-800 transition-colors ${open ? 'border-blue-500 ring-2 ring-blue-500/20' : 'border-slate-300 dark:border-slate-600'}`}>
        {loading
          ? <div className="w-4 h-4 border-2 border-slate-300 border-t-blue-500 rounded-full animate-spin flex-shrink-0" />
          : <Search className="w-4 h-4 text-slate-400 flex-shrink-0" />
        }
        <input
          value={q}
          onChange={e => { setQ(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          className="flex-1 bg-transparent text-sm text-slate-900 dark:text-white placeholder-slate-400 outline-none min-w-0"
        />
        {q && (
          <button onClick={() => { setQ(''); setResults([]) }} className="flex-shrink-0 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {open && (
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
                    onMouseDown={e => { e.preventDefault(); onSelect(u); setQ(''); setOpen(false) }}
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

const ClassModal = ({ cls, onClose, onSaved }: { cls: ClassItem | null, onClose: () => void, onSaved: () => void }) => {
  const [name, setName] = useState(cls?.name ?? '')
  const [desc, setDesc] = useState(cls?.description ?? '')
  const [saving, setSaving] = useState(false)

  const save = async () => {
    if (!name) return
    setSaving(true)
    try {
      const body = { name, description: desc }
      cls ? await put(`${BASE}/classes/${cls.id}`, body) : await post(`${BASE}/classes`, body)
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-xl w-full max-w-md shadow-xl">
        <div className="flex items-center justify-between p-5 border-b border-slate-200 dark:border-slate-700">
          <h2 className="font-semibold text-slate-900 dark:text-white">{cls ? '编辑班级' : '新建班级'}</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-slate-400" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">班级名称 *</label>
            <input value={name} onChange={e => setName(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">描述</label>
            <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={2}
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white resize-none" />
          </div>
        </div>
        <div className="flex justify-end gap-2 p-5 border-t border-slate-200 dark:border-slate-700">
          <Button variant="ghost" size="sm" onClick={onClose}>取消</Button>
          <Button variant="primary" size="sm" onClick={save} disabled={saving || !name}>{saving ? '保存中...' : '保存'}</Button>
        </div>
      </div>
    </div>
  )
}

const ClassDetailModal = ({ cls, onClose }: { cls: ClassItem, onClose: () => void }) => {
  const [tab, setTab] = useState<'students' | 'courses'>('students')
  const [loading, setLoading] = useState(true)
  const [students, setStudents] = useState<ClassStudent[]>([])
  const [courses, setCourses] = useState<ClassCourse[]>([])
  const [allCourses, setAllCourses] = useState<Course[]>([])
  const [addingCourseId, setAddingCourseId] = useState(0)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [sRes, cRes, allC] = await Promise.all([
        get<ClassStudent[]>(`${BASE}/classes/${cls.id}/students`),
        get<ClassCourse[]>(`${BASE}/classes/${cls.id}/courses`),
        get<Course[]>(`${BASE}/courses`),
      ])
      setStudents(Array.isArray(sRes.data) ? sRes.data : [])
      setCourses(Array.isArray(cRes.data) ? cRes.data : [])
      setAllCourses(Array.isArray(allC.data) ? allC.data : [])
    } finally {
      setLoading(false)
    }
  }, [cls.id])

  useEffect(() => { load() }, [load])

  const removeStudent = async (studentId: number) => {
    await del(`${BASE}/classes/${cls.id}/students/${studentId}`)
    load()
  }

  const addStudent = async (u: UserOption) => {
    await post(`${BASE}/classes/${cls.id}/students`, { studentId: u.id })
    load()
  }

  const addCourse = async () => {
    if (!addingCourseId) return
    await post(`${BASE}/classes/${cls.id}/courses`, { courseId: addingCourseId })
    setAddingCourseId(0)
    load()
  }

  const removeCourse = async (ccid: number) => {
    await del(`${BASE}/classes/${cls.id}/courses/${ccid}`)
    load()
  }

  const unusedCourses = useMemo(() => {
    const used = new Set(courses.map(x => x.courseId))
    return allCourses.filter(c => !used.has(c.id))
  }, [allCourses, courses])

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-xl w-full max-w-3xl shadow-xl overflow-hidden">
        <div className="flex items-center justify-between p-5 border-b border-slate-200 dark:border-slate-700">
          <div>
            <h2 className="font-semibold text-slate-900 dark:text-white">班级：{cls.name}</h2>
            {cls.description && <p className="text-xs text-slate-500 mt-1">{cls.description}</p>}
          </div>
          <button onClick={onClose}><X className="w-5 h-5 text-slate-400" /></button>
        </div>

        <div className="px-5 pt-4">
          <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
            <button onClick={() => setTab('students')} className={`px-3 py-2 text-sm ${tab === 'students' ? 'bg-slate-900 text-white' : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200'}`}>学员</button>
            <button onClick={() => setTab('courses')} className={`px-3 py-2 text-sm ${tab === 'courses' ? 'bg-slate-900 text-white' : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200'}`}>课程</button>
          </div>
        </div>

        <div className="p-5">
          {loading ? (
            <div className="text-sm text-slate-400">加载中...</div>
          ) : tab === 'students' ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm text-slate-600 dark:text-slate-300">共 {students.length} 人</div>
                <div className="w-72">
                  <UserSearch role="student" placeholder="搜索学员并添加" onSelect={addStudent} />
                </div>
              </div>
              {students.length === 0 ? (
                <div className="text-sm text-slate-400">暂无学员</div>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
                  {students.map(s => (
                    <div key={s.id} className="flex items-center justify-between px-4 py-3 bg-white dark:bg-slate-900">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{s.student?.displayName || s.student?.email || `#${s.studentId}`}</p>
                        {s.student?.displayName && <p className="text-xs text-slate-400 truncate">{s.student?.email}</p>}
                      </div>
                      <button onClick={() => removeStudent(s.studentId)} className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm text-slate-600 dark:text-slate-300">已绑定 {courses.length} 门课程</div>
                <div className="flex items-center gap-2">
                  <select value={addingCourseId} onChange={e => setAddingCourseId(Number(e.target.value))}
                    className="px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white">
                    <option value={0}>选择课程</option>
                    {unusedCourses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <Button variant="primary" size="sm" leftIcon={<Plus className="w-4 h-4" />} onClick={addCourse} disabled={!addingCourseId}>绑定</Button>
                </div>
              </div>

              {courses.length === 0 ? (
                <div className="text-sm text-slate-400">暂无课程</div>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
                  {courses.map(cc => (
                    <div key={cc.id} className="flex items-center justify-between px-4 py-3 bg-white dark:bg-slate-900">
                      <div className="flex items-center gap-2">
                        <BookOpen className="w-4 h-4 text-slate-400" />
                        <span className="text-sm font-medium text-slate-900 dark:text-white">{cc.course?.name || `course#${cc.courseId}`}</span>
                      </div>
                      <button onClick={() => removeCourse(cc.id)} className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="pt-3 border-t border-slate-200 dark:border-slate-700">
                <div className="text-xs text-slate-500 flex items-center gap-2">
                  <CalendarDays className="w-4 h-4" />
                  班级排课请在“排课管理”页面进行（后续可扩展为班级维度排课页）。
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function ClassesPage() {
  const [list, setList] = useState<ClassItem[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [modal, setModal] = useState<ClassItem | null | 'new'>(null)
  const [detail, setDetail] = useState<ClassItem | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await get<ClassItem[]>(`${BASE}/classes`)
      setList(Array.isArray(res.data) ? res.data : [])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const deleteClass = async (id: number) => {
    if (!confirm('确认删除此班级？')) return
    await del(`${BASE}/classes/${id}`)
    load()
  }

  const filtered = list.filter(c => !search || c.name.includes(search) || (c.description || '').includes(search))

  return (
    <AdminLayout title="班级管理" description="创建班级、绑定学员与课程">
      <Card className="p-4">
        <div className="flex items-center gap-3 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="搜索班级名称..."
              className="w-full pl-9 pr-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
            />
          </div>
          <Button variant="primary" size="sm" leftIcon={<Plus className="w-4 h-4" />} onClick={() => setModal('new')}>新建班级</Button>
        </div>

        {loading ? (
          <p className="text-sm text-slate-400 text-center py-8">加载中...</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-8">暂无班级</p>
        ) : (
          <div className="space-y-2">
            {filtered.map((c) => (
              <div key={c.id} className="flex items-center gap-3 px-4 py-3 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-slate-900 dark:text-white truncate">{c.name}</p>
                  {c.description && <p className="text-xs text-slate-400 truncate">{c.description}</p>}
                </div>
                <button
                  onClick={() => setDetail(c)}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg bg-teal-50 dark:bg-teal-900/20 text-teal-700 dark:text-teal-300 flex items-center gap-1"
                >
                  <Users className="w-3.5 h-3.5" /> 管理
                </button>
                <button onClick={() => setModal(c)} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors"><Pencil className="w-4 h-4" /></button>
                <button onClick={() => deleteClass(c.id)} className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"><Trash2 className="w-4 h-4" /></button>
              </div>
            ))}
          </div>
        )}
      </Card>

      {modal && (
        <ClassModal
          cls={modal === 'new' ? null : modal}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); load() }}
        />
      )}
      {detail && <ClassDetailModal cls={detail} onClose={() => setDetail(null)} />}
    </AdminLayout>
  )
}
