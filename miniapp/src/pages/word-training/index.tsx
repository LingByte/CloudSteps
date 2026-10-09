import { useEffect, useMemo, useState } from 'react'
import { Picker, ScrollView, Text, View } from '@tarojs/components'
import Taro, { getCurrentInstance } from '@tarojs/taro'
import { ArrowLeft, Clock, List, Right, User } from '@nutui/icons-react-taro'
import { useAuthStore } from '../../stores/authStore'
import { listWordBooks, type WordBookItem } from '../../api/wordbooks'
import {
  getStudyLighthouse,
  type LighthouseDay,
} from '../../api/study'
import {
  listAllTeacherCoachingQuotas,
  listStudentWordBooksAsTeacher,
  type StudentWordBookItem,
} from '../../api/coaching'
import { getTrainingStudent, setTrainingStudent, studentLabelFromQuota } from '../../utils/trainingStudent'
import { ensurePracticeBillingActive } from '../../utils/practiceBilling'
import { color } from '../../styles/tokens'
import './index.scss'

type LighthouseState = {
  days: LighthouseDay[]
  pendingCount: number
  masteredCount: number
  todayNewLearned: number
}

const emptyLighthouse: LighthouseState = { days: [], pendingCount: 0, masteredCount: 0, todayNewLearned: 0 }

export default function WordTraining() {
  const params = getCurrentInstance().router?.params || {}
  const authUser = useAuthStore((state) => state.user)
  const role = (authUser as { role?: string } | null)?.role || 'user'
  const isStudent = role === 'student'
  const isCoach = !isStudent
  const [books, setBooks] = useState<WordBookItem[]>([])
  const [studentBooks, setStudentBooks] = useState<StudentWordBookItem[]>([])
  const [students, setStudents] = useState<Array<{ id: number; label: string }>>([])
  const [studentId, setStudentId] = useState(() => String(getTrainingStudent()?.id || params.studentId || ''))
  const [selectedBookId, setSelectedBookId] = useState(() => String(params.wordBookId || Taro.getStorageSync('lb_wordbook_id') || ''))
  const [lighthouse, setLighthouse] = useState<LighthouseState>(emptyLighthouse)
  const [loading, setLoading] = useState(true)
  const [studentLoading, setStudentLoading] = useState(isCoach)
  const [bookLoading, setBookLoading] = useState(false)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState('')

  const visibleBooks = useMemo(() => {
    if (!isCoach || !studentId) return books
    return studentBooks.map((book) => ({ id: book.id, name: book.name, wordCount: book.wordCount }))
  }, [books, isCoach, studentBooks, studentId])

  const selectedBook = visibleBooks.find((book) => String(book.id) === selectedBookId) || visibleBooks[0]

  useEffect(() => {
    let mounted = true
    ;(async () => {
      setLoading(true)
      try {
        const res = await listWordBooks({ page: 1, pageSize: 100 })
        if (mounted && res.code === 200) {
          const list = Array.isArray(res.data?.list) ? res.data.list : []
          setBooks(list)
          if (!selectedBookId && list[0]) setSelectedBookId(String(list[0].id))
        }
      } catch {
        if (mounted) setError('词库加载失败')
      } finally {
        if (mounted) setLoading(false)
      }
    })()
    return () => { mounted = false }
  }, [])

  useEffect(() => {
    if (!isCoach) return
    let mounted = true
    ;(async () => {
      setStudentLoading(true)
      try {
        const rows = await listAllTeacherCoachingQuotas({ includeSelf: true })
        if (!mounted) return
        const mapped = rows.map((row) => ({ id: row.studentId, label: studentLabelFromQuota(row) }))
        setStudents(mapped)
        const current = studentId ? mapped.find((item) => String(item.id) === studentId) : mapped[0]
        if (current && !studentId) {
          setStudentId(String(current.id))
          setTrainingStudent(current.id, current.label)
        }
        if (!mapped.length) setError('暂无可训练学员，请先添加学员')
      } catch {
        if (mounted) setError('学员加载失败')
      } finally {
        if (mounted) setStudentLoading(false)
      }
    })()
    return () => { mounted = false }
  }, [isCoach])

  useEffect(() => {
    if (!isCoach || !studentId) return
    let mounted = true
    ;(async () => {
      setBookLoading(true)
      try {
        const res = await listStudentWordBooksAsTeacher(Number(studentId))
        if (!mounted) return
        const list = res.code === 200 && Array.isArray(res.data?.list) ? res.data.list : []
        setStudentBooks(list)
        if (list.length && !list.some((book) => String(book.id) === selectedBookId)) setSelectedBookId(String(list[0].id))
      } catch {
        if (mounted) setStudentBooks([])
      } finally {
        if (mounted) setBookLoading(false)
      }
    })()
    return () => { mounted = false }
  }, [isCoach, studentId])

  useEffect(() => {
    if (!selectedBook?.id) return
    let mounted = true
    ;(async () => {
      const res = await getStudyLighthouse(Number(selectedBook.id), studentId ? { studentId: Number(studentId) } : undefined)
      if (!mounted || res.code !== 200) return
      setLighthouse({
        days: Array.isArray(res.data?.days) ? res.data.days : [],
        pendingCount: Number(res.data?.pendingCount || 0),
        masteredCount: Number(res.data?.masteredCount || 0),
        todayNewLearned: Number(res.data?.todayNewLearned || 0),
      })
    })()
    return () => { mounted = false }
  }, [selectedBook?.id, studentId])

  const chooseStudent = (index: number) => {
    const item = students[index]
    if (!item) return
    setStudentId(String(item.id))
    setTrainingStudent(item.id, item.label)
    setSelectedBookId('')
    setLighthouse(emptyLighthouse)
  }

  const start = async () => {
    if (!selectedBook?.id || starting) {
      if (!selectedBook?.id) Taro.showToast({ title: '请先选择词库', icon: 'none' })
      return
    }
    setStarting(true)
    try {
      if (isCoach) {
        const link = await ensurePracticeBillingActive()
        if (!link) return
      }
      Taro.setStorageSync('lb_wordbook_id', String(selectedBook.id))
      Taro.setStorageSync('lb_wordbook_name', selectedBook.name)
      const studentQuery = isCoach && studentId ? `&studentId=${encodeURIComponent(studentId)}` : ''
      Taro.navigateTo({ url: `/pages/pre-training-check/index?wordBookId=${selectedBook.id}&wordBookName=${encodeURIComponent(selectedBook.name)}${studentQuery}` })
    } finally {
      setStarting(false)
    }
  }

  const startReview = () => {
    if (!selectedBook?.id) {
      Taro.showToast({ title: '请先选择词库', icon: 'none' })
      return
    }
    Taro.setStorageSync('lb_mode', 'review')
    Taro.setStorageSync('lb_review_wordbook_id', String(selectedBook.id))
    Taro.setStorageSync('lb_review_return', '/pages/word-training/index')
    if (isCoach && studentId) Taro.setStorageSync('lb_review_student_id', studentId)
    else Taro.removeStorageSync('lb_review_student_id')
    const studentQuery = isCoach && studentId ? `&studentId=${encodeURIComponent(studentId)}` : ''
    Taro.navigateTo({ url: `/pages/review-word-list/index?wordBookId=${selectedBook.id}&lighthouse=1${studentQuery}` })
  }

  return (
    <View className="word-training">
      <View className="word-training__nav">
        <View className="word-training__back" onClick={() => Taro.navigateBack()}><ArrowLeft size={20} color={color.charcoal} /></View>
        <Text className="word-training__title">单词训练</Text>
        <View className="word-training__nav-placeholder" />
      </View>
      <ScrollView className="word-training__body" scrollY enableFlex>
        {isCoach ? (
          <View className="word-training__card word-training__student-card">
            <View className="word-training__card-heading"><User size={18} color={color.secondaryBrand} /><Text>选择学员</Text></View>
            {studentLoading ? <Text className="word-training__muted">加载学员中…</Text> : students.length ? (
              <Picker mode="selector" range={students.map((item) => item.label)} value={Math.max(0, students.findIndex((item) => String(item.id) === studentId))} onChange={(event) => chooseStudent(Number(event.detail.value))}>
                <View className="word-training__picker"><Text>{students.find((item) => String(item.id) === studentId)?.label || '选择学员'}</Text><Right size={16} color={color.mutedForeground} /></View>
              </Picker>
            ) : <View><Text className="word-training__muted">暂无学员</Text><CloudLink text="去添加学员" url="/pages/my-students/index" /></View>}
          </View>
        ) : null}

        <View className="word-training__card">
          <View className="word-training__card-heading"><List size={18} color={color.primary} /><Text>选择词库</Text></View>
          {loading || bookLoading ? <Text className="word-training__muted">加载词库中…</Text> : visibleBooks.length ? (
            <Picker mode="selector" range={visibleBooks.map((book) => `${book.name}${book.wordCount ? ` · ${book.wordCount} 词` : ''}`)} value={Math.max(0, visibleBooks.findIndex((book) => String(book.id) === String(selectedBook?.id)))} onChange={(event) => setSelectedBookId(String(visibleBooks[Number(event.detail.value)]?.id || ''))}>
              <View className="word-training__picker"><Text>{selectedBook?.name || '选择词库'}</Text><Right size={16} color={color.mutedForeground} /></View>
            </Picker>
          ) : <Text className="word-training__muted">暂无可训练词库</Text>}
          {error ? <Text className="word-training__error">{error}</Text> : null}
        </View>

        <View className="word-training__card">
          <View className="word-training__card-heading"><Clock size={18} color={color.secondaryBrand} /><Text>记忆灯塔</Text></View>
          <View className="word-training__metrics">
            <Metric label="待复习" value={lighthouse.pendingCount} />
            <Metric label="已掌握" value={lighthouse.masteredCount} />
            <Metric label="今日新学" value={lighthouse.todayNewLearned} />
          </View>
          <View className="word-training__days">
            {lighthouse.days.length ? lighthouse.days.map((day) => <View key={day.id} className="word-training__day"><Text className="word-training__day-count">{day.count}</Text><Text>{day.label}</Text></View>) : <Text className="word-training__muted">选择词库后显示学习进度</Text>}
          </View>
        </View>

        <View className="word-training__start-wrap">
          <View className={`word-training__start word-training__start--secondary ${selectedBook ? '' : 'word-training__start--disabled'}`} onClick={startReview}><Text>开始复习</Text></View>
          <View className={`word-training__start ${selectedBook && !starting ? '' : 'word-training__start--disabled'}`} onClick={() => void start()}><Text>{starting ? '开课中…' : '继续练习'}</Text></View>
        </View>
        <View style={{ height: '48rpx' }} />
      </ScrollView>
    </View>
  )
}

function Metric({ label, value }: { label: string; value: number }) {
  return <View className="word-training__metric"><Text className="word-training__metric-value">{value}</Text><Text className="word-training__metric-label">{label}</Text></View>
}

function CloudLink({ text, url }: { text: string; url: string }) {
  return <Text className="word-training__link" onClick={() => Taro.navigateTo({ url })}>{text}</Text>
}
