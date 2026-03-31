import { useMemo, useState, useEffect, useCallback, useRef } from 'react'
import { Plus, ChevronLeft, ChevronRight, X, Users, BookOpen, Calendar, Pencil, Trash2, UserPlus } from 'lucide-react'
import AdminLayout from '@/components/Layout/AdminLayout'
import Button from '@/components/UI/Button'
import { get, post, put, del } from '@/utils/request'
import { getApiBaseURL } from '@/config/apiConfig'

const BASE = getApiBaseURL()

interface UserOption { id: number; email: string; displayName: string; role: string }
interface Course { id: number; name: string; teacherId: number; teacher?: UserOption }
interface ClassItem { id: number; name: string; description?: string }
interface ClassCourse {
  id: number
  classId: number
  courseId: number
  course?: Course
}
interface Schedule {
  id: number; courseId: number; classCourseId?: number; title: string
  scheduledDate: string; startTime: string; endTime: string; notes: string
  students?: ScheduleStudent[]
  course?: Course
}
interface ScheduleStudent { id: number; scheduleId: number; studentId: number; student?: UserOption }

const PERIODS = [
  { label: '1', start: '08:00', end: '08:50' }, { label: '2', start: '09:00', end: '09:50' },
  { label: '3', start: '10:10', end: '11:00' }, { label: '4', start: '11:10', end: '12:00' },
  { label: '5', start: '14:00', end: '14:50' }, { label: '6', start: '15:00', end: '15:50' },
  { label: '7', start: '16:10', end: '17:00' }, { label: '8', start: '17:10', end: '18:00' },
  { label: '9', start: '19:00', end: '19:50' }, { label: '10', start: '20:00', end: '20:50' },
]
const DAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
const COLORS = ['bg-blue-400','bg-purple-400','bg-emerald-400','bg-amber-400','bg-rose-400','bg-cyan-400','bg-indigo-400']
const PERIOD_H = 46

const getWeekStart = (d: Date) => { const r = new Date(d); const day = r.getDay(); r.setDate(r.getDate()-(day===0?6:day-1)); r.setHours(0,0,0,0); return r }
const addDays = (d: Date, n: number) => { const r = new Date(d); r.setDate(r.getDate()+n); return r }
const fmtDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
const fmtDisplay = (s: string) => s ? new Date(s).toLocaleDateString('zh-CN') : ''
const timeToMin = (t: string) => { const [h,m] = t.split(':').map(Number); return h*60+m }
const getWeekNum = (d: Date) => { const s = new Date(d.getFullYear(),0,1); return Math.ceil(((d.getTime()-s.getTime())/86400000+s.getDay()+1)/7) }

const getPeriodRange = (st: string, et: string) => {
  const sm = timeToMin(st), em = timeToMin(et)
  let si = 0, ei = 0
  let minS = Infinity
  for (let i = 0; i < PERIODS.length; i++) {
    const d = Math.abs(timeToMin(PERIODS[i].start)-sm)
    if (d < minS) { minS = d; si = i }
  }
  let minE = Infinity
  for (let i = si; i < PERIODS.length; i++) {
    const d = Math.abs(timeToMin(PERIODS[i].end)-em)
    if (d < minE) { minE = d; ei = i }
  }
  return { start: si, end: Math.max(si, ei) }
}

// ── UserSearch ────────────────────────────────────────────────────────────────
const UserSearch = ({ role, placeholder, value, onChange }: {
  role: string; placeholder: string; value: UserOption | null; onChange: (u: UserOption | null) => void
}) => {
  const [q, setQ] = useState(''); const [results, setResults] = useState<UserOption[]>([]); const [open, setOpen] = useState(false)
  useEffect(() => {
    if (!q) { setResults([]); return }
    const t = setTimeout(async () => {
      const res = await get<UserOption[]>(`${BASE}/courses/users/search`, { params: { q, role } })
      setResults(Array.isArray(res.data) ? res.data : [])
    }, 300)
    return () => clearTimeout(t)
  }, [q, role])
  if (value) return (
    <div className="flex items-center gap-2 px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-800">
      <span className="flex-1 text-sm text-slate-900 dark:text-white">{value.displayName || value.email}</span>
      <button onClick={() => onChange(null)}><X className="w-4 h-4 text-slate-400" /></button>
    </div>
  )
  return (
    <div className="relative">
      <input value={q} onChange={e => { setQ(e.target.value); setOpen(true) }} onFocus={() => setOpen(true)} placeholder={placeholder}
        className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white" />
      {open && results.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg max-h-48 overflow-y-auto">
          {results.map(u => (
            <button key={u.id} onClick={() => { onChange(u); setQ(''); setOpen(false) }} className="w-full text-left px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-700 text-sm">
              <span className="font-medium text-slate-900 dark:text-white">{u.displayName || u.email}</span>
              <span className="ml-2 text-slate-400 text-xs">{u.email}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── ScheduleModal ─────────────────────────────────────────────────────────────
const ScheduleModal = ({ classes, classCourses, schedule, defaultDate, defaultPeriod, onClose, onSaved }: {
  classes: ClassItem[]
  classCourses: ClassCourse[]
  schedule: Schedule | null
  defaultDate?: string
  defaultPeriod?: number
  onClose: () => void
  onSaved: () => void
}) => {
  const isEdit = !!schedule
  const initialClassId = useMemo(() => {
    if (schedule?.classCourseId) {
      const cc = classCourses.find(x => x.id === schedule.classCourseId)
      if (cc) return cc.classId
    }
    return classes[0]?.id ?? 0
  }, [classes, classCourses, schedule?.classCourseId])

  const [classId, setClassId] = useState<number>(initialClassId)
  const classCourseOptions = useMemo(() => classCourses.filter(x => x.classId === classId), [classCourses, classId])
  const [classCourseId, setClassCourseId] = useState<number>(() => {
    if (schedule?.classCourseId) return schedule.classCourseId
    return classCourseOptions[0]?.id ?? 0
  })
  const [title, setTitle] = useState(schedule?.title ?? '')
  const [date, setDate] = useState(schedule ? schedule.scheduledDate.slice(0,10) : (defaultDate ?? ''))
  const [start, setStart] = useState(schedule?.startTime ?? (defaultPeriod !== undefined ? PERIODS[defaultPeriod].start : '09:00'))
  const [end, setEnd] = useState(schedule?.endTime ?? (defaultPeriod !== undefined ? PERIODS[defaultPeriod].end : '10:30'))
  const [notes, setNotes] = useState(schedule?.notes ?? '')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const opts = classCourses.filter(x => x.classId === classId)
    if (opts.length === 0) {
      setClassCourseId(0)
      return
    }
    if (!opts.some(o => o.id === classCourseId)) {
      setClassCourseId(opts[0].id)
    }
  }, [classCourses, classCourseId, classId])

  const save = async () => {
    if (!date || !start || !end || !classId || !classCourseId) return; setSaving(true)
    try {
      const body = { title, scheduledDate: date, startTime: start, endTime: end, notes }
      schedule
        ? await put(`${BASE}/courses/schedules/${schedule.id}`, body)
        : await post(`${BASE}/classes/${classId}/schedules`, { ...body, classCourseId })
      onSaved()
    } finally { setSaving(false) }
  }
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-xl w-full max-w-md shadow-xl">
        <div className="flex items-center justify-between p-5 border-b border-slate-200 dark:border-slate-700">
          <h2 className="font-semibold text-slate-900 dark:text-white">{schedule ? '编辑排课' : '新建排课'}</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-slate-400" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">班级 *</label>
            <select value={classId} onChange={e => setClassId(Number(e.target.value))} disabled={isEdit} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white disabled:opacity-60 disabled:cursor-not-allowed">
              {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">课程 *</label>
            <select value={classCourseId} onChange={e => setClassCourseId(Number(e.target.value))} disabled={isEdit} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white disabled:opacity-60 disabled:cursor-not-allowed">
              {classCourseOptions.map(cc => <option key={cc.id} value={cc.id}>{cc.course?.name || `course#${cc.courseId}`}</option>)}
            </select>
            {classCourseOptions.length === 0 && (
              <p className="mt-1 text-xs text-amber-500">该班级暂无绑定课程，请先到“班级管理”绑定课程。</p>
            )}
          </div>
          <div><label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">标题</label>
            <input value={title} onChange={e => setTitle(e.target.value)} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white" /></div>
          <div><label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">日期 *</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">开始 *</label>
              <input type="time" value={start} onChange={e => setStart(e.target.value)} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white" /></div>
            <div><label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">结束 *</label>
              <input type="time" value={end} onChange={e => setEnd(e.target.value)} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white" /></div>
          </div>
          <div><label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">备注</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white resize-none" /></div>
        </div>
        <div className="flex justify-end gap-2 p-5 border-t border-slate-200 dark:border-slate-700">
          <Button variant="ghost" size="sm" onClick={onClose}>取消</Button>
          <Button variant="primary" size="sm" onClick={save} disabled={saving || !date || !start || !end || !classId || !classCourseId}>{saving ? '保存中...' : '保存'}</Button>
        </div>
      </div>
    </div>
  )
}

// ── StudentPanel ──────────────────────────────────────────────────────────────
const StudentPanel = ({ schedule, onClose }: { schedule: Schedule; onClose: () => void }) => {
  const [students, setStudents] = useState<ScheduleStudent[]>(schedule.students ?? [])
  const [newStudent, setNewStudent] = useState<UserOption | null>(null)
  const [adding, setAdding] = useState(false)
  const reload = useCallback(async () => {
    const res = await get<ScheduleStudent[]>(`${BASE}/courses/schedules/${schedule.id}/students`)
    setStudents(Array.isArray(res.data) ? res.data : [])
  }, [schedule.id])
  const add = async () => {
    if (!newStudent) return; setAdding(true)
    try { await post(`${BASE}/courses/schedules/${schedule.id}/students`, { studentId: newStudent.id }); setNewStudent(null); await reload() }
    finally { setAdding(false) }
  }
  const remove = async (uid: number) => { await del(`${BASE}/courses/schedules/${schedule.id}/students/${uid}`); await reload() }
  return (
    <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-xl w-full max-w-md shadow-xl">
        <div className="flex items-center justify-between p-5 border-b border-slate-200 dark:border-slate-700">
          <div>
            <h2 className="font-semibold text-slate-900 dark:text-white">学员管理</h2>
            <p className="text-xs text-slate-500 mt-0.5">{fmtDisplay(schedule.scheduledDate)} {schedule.startTime}–{schedule.endTime}</p>
          </div>
          <button onClick={onClose}><X className="w-5 h-5 text-slate-400" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="flex gap-2">
            <div className="flex-1"><UserSearch role="student" placeholder="搜索学员" value={newStudent} onChange={setNewStudent} /></div>
            <Button variant="primary" size="sm" onClick={add} disabled={adding || !newStudent} leftIcon={<UserPlus className="w-4 h-4" />}>添加</Button>
          </div>
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {students.length === 0 && <p className="text-sm text-slate-400 text-center py-4">暂无学员</p>}
            {students.map(ss => (
              <div key={ss.id} className="flex items-center gap-3 px-3 py-2 bg-slate-50 dark:bg-slate-800 rounded-lg">
                <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
                  <span className="text-xs font-bold text-blue-600">{(ss.student?.displayName || ss.student?.email || '?')[0].toUpperCase()}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{ss.student?.displayName || ss.student?.email}</p>
                  {ss.student?.displayName && <p className="text-xs text-slate-400 truncate">{ss.student.email}</p>}
                </div>
                <button onClick={() => remove(ss.studentId)} className="text-slate-400 hover:text-red-500"><X className="w-4 h-4" /></button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── DetailModal ───────────────────────────────────────────────────────────────
const DetailModal = ({ schedule, classes, classCourses, onClose, onEdit, onDelete, onStudents }: {
  schedule: Schedule; classes: ClassItem[]; classCourses: ClassCourse[]; onClose: () => void
  onEdit: () => void; onDelete: () => void; onStudents: () => void
}) => {
  const cc = schedule.classCourseId ? classCourses.find(x => x.id === schedule.classCourseId) : undefined
  const cls = cc ? classes.find(c => c.id === cc.classId) : undefined
  const course = cc?.course || schedule.course
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-xl w-full max-w-sm shadow-xl">
        <div className="flex items-center justify-between p-5 border-b border-slate-200 dark:border-slate-700">
          <h2 className="font-semibold text-slate-900 dark:text-white">{schedule.title || course?.name || '排课详情'}</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-slate-400" /></button>
        </div>
        <div className="p-5 space-y-2.5 text-sm">
          {cls && <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400"><Users className="w-4 h-4 flex-shrink-0" /><span>{cls.name}</span></div>}
          {course && <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400"><BookOpen className="w-4 h-4 flex-shrink-0" /><span>{course.name}</span></div>}
          <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400"><Calendar className="w-4 h-4 flex-shrink-0" /><span>{fmtDisplay(schedule.scheduledDate)} {schedule.startTime}–{schedule.endTime}</span></div>
          <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400"><Users className="w-4 h-4 flex-shrink-0" /><span>{schedule.students?.length ?? 0} 名学员</span></div>
          {schedule.notes && <p className="text-slate-400 text-xs pl-6">{schedule.notes}</p>}
        </div>
        <div className="flex gap-2 p-5 border-t border-slate-200 dark:border-slate-700">
          <Button variant="ghost" size="sm" leftIcon={<Users className="w-4 h-4" />} onClick={onStudents} className="flex-1">管理学员</Button>
          <Button variant="ghost" size="sm" leftIcon={<Pencil className="w-4 h-4" />} onClick={onEdit}>编辑</Button>
          <button onClick={onDelete} className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"><Trash2 className="w-4 h-4" /></button>
        </div>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
type ModalState =
  | { type: 'new'; date: string; periodIdx: number }
  | { type: 'edit'; schedule: Schedule }
  | { type: 'detail'; schedule: Schedule }
  | { type: 'students'; schedule: Schedule }

const SchedulesPage = () => {
  const [classes, setClasses] = useState<ClassItem[]>([])
  const [classCourses, setClassCourses] = useState<ClassCourse[]>([])
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [loading, setLoading] = useState(true)
  const [weekStart, setWeekStart] = useState(() => getWeekStart(new Date()))
  const [filterClassId, setFilterClassId] = useState(0)
  const [modal, setModal] = useState<ModalState | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  const today = new Date(); today.setHours(0,0,0,0)

  const loadAll = useCallback(async () => {
    setLoading(true)
    try {
      const clsRes = await get<ClassItem[]>(`${BASE}/classes`)
      const cls: ClassItem[] = Array.isArray(clsRes.data) ? clsRes.data : []
      setClasses(cls)

      const ccAll: ClassCourse[] = []
      const schAll: Schedule[] = []
      await Promise.all(cls.map(async c => {
        const [ccRes, sRes] = await Promise.all([
          get<ClassCourse[]>(`${BASE}/classes/${c.id}/courses`),
          get<Schedule[]>(`${BASE}/classes/${c.id}/schedules`),
        ])
        if (Array.isArray(ccRes.data)) ccAll.push(...ccRes.data)
        if (Array.isArray(sRes.data)) schAll.push(...sRes.data)
      }))
      setClassCourses(ccAll)
      setSchedules(schAll)
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { loadAll() }, [loadAll])

  const deleteSchedule = async (id: number) => {
    if (!confirm('确认删除此排课？')) return
    await del(`${BASE}/courses/schedules/${id}`); setModal(null); loadAll()
  }

  const courseIds = useMemo(() => {
    const ids = new Set<number>()
    classCourses.forEach(cc => ids.add(cc.courseId))
    schedules.forEach(s => { if (s.courseId) ids.add(s.courseId) })
    return Array.from(ids)
  }, [classCourses, schedules])
  const colorMap = useMemo(() => {
    const m: Record<number, number> = {}
    courseIds.forEach((id, i) => { m[id] = i % COLORS.length })
    return m
  }, [courseIds])

  // 本周 + 筛选
  const weekSchedules = schedules.filter(s => {
    const d = new Date(s.scheduledDate); d.setHours(0,0,0,0)
    const ws = new Date(weekStart); ws.setHours(0,0,0,0)
    if (!(d >= ws && d < addDays(ws, 7))) return false
    if (!filterClassId) return true
    if (!s.classCourseId) return false
    const cc = classCourses.find(x => x.id === s.classCourseId)
    return !!cc && cc.classId === filterClassId
  })

  // 构建 grid
  const grid: Record<number, Record<number, { s: Schedule; span: number; isFirst: boolean }>> = {}
  weekSchedules.forEach(s => {
    const d = new Date(s.scheduledDate); d.setHours(0,0,0,0)
    let dayIdx = -1
    for (let i = 0; i < 7; i++) { const wd = new Date(weekDays[i]); wd.setHours(0,0,0,0); if (wd.getTime()===d.getTime()){dayIdx=i;break} }
    if (dayIdx===-1) return
    const { start, end } = getPeriodRange(s.startTime, s.endTime)
    for (let p = start; p <= end; p++) {
      if (!grid[p]) grid[p] = {}
      grid[p][dayIdx] = { s, span: end-start+1, isFirst: p===start }
    }
  })

  return (
    <AdminLayout title="排课管理" description="按周查看和管理排课">
      <div className="overflow-hidden flex flex-col rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm" style={{ height: 'calc(100vh - 140px)' }}>
        {/* 工具栏 */}
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-200 dark:border-slate-700 flex-shrink-0">
          <div className="flex items-center gap-1">
            <button onClick={() => setWeekStart(w => addDays(w,-7))} className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500"><ChevronLeft className="w-4 h-4" /></button>
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300 w-16 text-center">第 {getWeekNum(weekStart)} 周</span>
            <button onClick={() => setWeekStart(w => addDays(w,7))} className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500"><ChevronRight className="w-4 h-4" /></button>
            <button onClick={() => setWeekStart(getWeekStart(new Date()))} className="px-2 py-1 text-xs text-blue-600 bg-blue-50 dark:bg-blue-900/20 rounded font-medium">本周</button>
          </div>
          <select value={filterClassId} onChange={e => setFilterClassId(Number(e.target.value))}
            className="ml-2 px-2 py-1.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-xs text-slate-700 dark:text-slate-300">
            <option value={0}>全部班级</option>
            {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <Button variant="primary" size="sm" className="ml-auto" leftIcon={<Plus className="w-4 h-4" />}
            onClick={() => setModal({ type: 'new', date: fmtDate(weekDays[0]), periodIdx: 0 })}>
            新建排课
          </Button>
        </div>

        {/* 课表网格 */}
        <div ref={scrollRef} className="flex-1 overflow-auto">
          {loading ? (
            <div className="flex items-center justify-center h-full text-slate-400 text-sm">加载中...</div>
          ) : (
            <div style={{ minWidth: '560px' }}>
              {/* 表头 */}
              <div className="flex sticky top-0 z-10 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700">
                <div className="w-10 flex-shrink-0 border-r border-slate-200 dark:border-slate-700" />
                {weekDays.map((day, i) => {
                  const isToday = day.getTime()===today.getTime()
                  return (
                    <div key={i} className={`flex-1 py-1.5 text-center border-r border-slate-100 dark:border-slate-800 last:border-r-0 ${isToday?'bg-blue-50 dark:bg-blue-900/20':''}`}>
                      <p className={`text-[11px] ${isToday?'text-blue-600 font-semibold':'text-slate-400'}`}>{DAYS[i]}</p>
                      <div className={`mx-auto w-6 h-6 rounded-full flex items-center justify-center ${isToday?'bg-blue-600':''}`}>
                        <span className={`text-[11px] font-medium ${isToday?'text-white':'text-slate-600 dark:text-slate-300'}`}>{day.getDate()}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
              {/* 节次行 */}
              {PERIODS.map((p, periodIdx) => (
                <div key={periodIdx} className="flex border-b border-slate-100 dark:border-slate-800">
                  <div className="w-10 flex-shrink-0 border-r border-slate-200 dark:border-slate-700 flex flex-col items-center justify-center" style={{ height: PERIOD_H }}>
                    <span className="text-[10px] font-semibold text-slate-400">{p.label}</span>
                    <span className="text-[8px] text-slate-300">{p.start}</span>
                  </div>
                  {weekDays.map((day, dayIdx) => {
                    const cell = grid[periodIdx]?.[dayIdx]
                    return (
                      <div key={dayIdx} className="flex-1 relative border-r border-slate-100 dark:border-slate-800 last:border-r-0 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors"
                        style={{ height: PERIOD_H }}
                        onClick={() => !cell && setModal({ type: 'new', date: fmtDate(day), periodIdx })}>
                        {cell?.isFirst && (
                          <div className={`absolute inset-x-0.5 rounded-md overflow-hidden z-10 cursor-pointer ${COLORS[colorMap[cell.s.courseId]??0]} text-white`}
                            style={{ top: 2, height: PERIOD_H * cell.span - 4 }}
                            onClick={e => { e.stopPropagation(); setModal({ type: 'detail', schedule: cell.s }) }}>
                            <div className="p-1 h-full flex flex-col justify-between">
                              <p className="text-[10px] font-semibold leading-tight line-clamp-2">
                                {cell.s.course?.name || classCourses.find(cc => cc.id === cell.s.classCourseId)?.course?.name || cell.s.title}
                              </p>
                              {cell.span > 1 && <p className="text-[9px] opacity-75">{cell.s.startTime}–{cell.s.endTime}</p>}
                              <div className="flex items-center gap-0.5 opacity-75">
                                <Users className="w-2.5 h-2.5" /><span className="text-[9px]">{cell.s.students?.length??0}</span>
                              </div>
                            </div>
                          </div>
                        )}
                        {!cell && (
                          <div className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                            <Plus className="w-3 h-3 text-slate-300" />
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {(modal?.type==='new'||modal?.type==='edit') && (
        <ScheduleModal classes={classes} classCourses={classCourses} schedule={modal.type==='edit'?modal.schedule:null}
          defaultDate={modal.type==='new'?modal.date:undefined}
          defaultPeriod={modal.type==='new'?modal.periodIdx:undefined}
          onClose={() => setModal(null)} onSaved={() => { setModal(null); loadAll() }} />
      )}
      {modal?.type==='detail' && (
        <DetailModal schedule={modal.schedule} classes={classes} classCourses={classCourses} onClose={() => setModal(null)}
          onEdit={() => setModal({ type:'edit', schedule: modal.schedule })}
          onDelete={() => deleteSchedule(modal.schedule.id)}
          onStudents={() => setModal({ type:'students', schedule: modal.schedule })} />
      )}
      {modal?.type==='students' && (
        <StudentPanel schedule={modal.schedule} onClose={() => setModal(null)} />
      )}
    </AdminLayout>
  )
}

export default SchedulesPage
