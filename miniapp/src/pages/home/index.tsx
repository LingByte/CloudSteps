/**
 * 首页(tab) — 对齐 web/src/pages/LessonPrep.tsx。
 * 常用功能 2x2 网格卡片 + 训练资料列表。
 * 教练角色显示学员选择器。
 */
import React, { useEffect, useMemo, useState } from 'react'
import { View, Text, ScrollView } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { Right, Star, Clock, Plus, List, Edit, Notice } from '@nutui/icons-react-taro'
import { useAuthStore } from '../../stores/authStore'
import { color } from '../../styles/tokens'
import {
  listAllTeacherCoachingQuotas,
  type TeacherCoachingQuotaRow,
} from '../../api/coaching'
import {
  getTrainingStudent,
  setTrainingStudent,
  studentLabelFromQuota,
} from '../../utils/trainingStudent'
import { shouldShowCoachOnboarding } from '../../utils/coachOnboarding'
import { CoachOnboarding } from '../../components/coach-onboarding/CoachOnboarding'
import { getPendingAnnouncementPopup, markAnnouncementRead } from '../../api/announcements'
import { MobileSelectSheet } from '../../components/mobile-select-sheet/MobileSelectSheet'
import { AppHeader } from '../../components/app-header/AppHeader'
import './index.scss'

interface QuickCard {
  key: string
  title: string
  desc: string
  tint: 'mint' | 'sky' | 'cream' | 'lavender' | 'orange' | 'rose' | 'green'
  icon: React.ReactNode
  section: 'common' | 'training' | 'data'
  onClick: () => void
}

export default function LessonPrep() {
  const user = useAuthStore((s) => s.user)
  const hasHydrated = useAuthStore((s) => s.hasHydrated)
  const role = (user as { role?: string } | null)?.role || 'user'
  const isCoach = role === 'user' || role === 'admin' || role === 'teacher'
  const userId = user?.id ? Number(user.id) : 0

  const [students, setStudents] = useState<TeacherCoachingQuotaRow[]>([])
  const [studentId, setStudentId] = useState<string>(() => {
    const s = getTrainingStudent()
    return s?.id ? String(s.id) : ''
  })
  const [loadingStudents, setLoadingStudents] = useState(false)
  const [showOnboarding, setShowOnboarding] = useState(false)

  useEffect(() => {
    if (!hasHydrated || !userId) return
    setShowOnboarding(shouldShowCoachOnboarding(role, userId))
  }, [hasHydrated, userId, role])

  // 待弹公告（对齐 web AnnouncementPopupHost）
  useDidShow(() => {
    if (!hasHydrated || !userId) return
    void (async () => {
      try {
        const res = await getPendingAnnouncementPopup()
        if (res.code !== 200 || !res.data) return
        const items = res.data.announcements?.filter((a) => a?.id) ?? (res.data.announcement ? [res.data.announcement] : [])
        if (items.length === 0) return
        const first = items[0]
        const r = await Taro.showModal({
          title: first.title || '公告',
          content: first.content ? String(first.content).slice(0, 500) : '有新公告',
          confirmText: items.length > 1 ? '查看全部' : '知道了',
          cancelText: '关闭',
        })
        void Promise.all(items.map((a) => markAnnouncementRead(a.id).catch(() => {})))
        if (r.confirm && items.length > 1) Taro.navigateTo({ url: '/pages/announcements/index' })
      } catch { /* ignore */ }
    })()
  })

  useEffect(() => {
    if (!isCoach) return
    let mounted = true
    setLoadingStudents(true)
    ;(async () => {
      try {
        const rows = await listAllTeacherCoachingQuotas({ includeSelf: true })
        if (!mounted) return
        setStudents(rows)
        const saved = getTrainingStudent()
        let pick = saved?.id ? rows.find((r) => r.studentId === saved.id) : undefined
        if (!pick && rows[0]) pick = rows[0]
        if (pick) {
          const name = studentLabelFromQuota(pick)
          setStudentId(String(pick.studentId))
          setTrainingStudent(pick.studentId, name)
        }
      } catch {
        if (mounted) setStudents([])
      } finally {
        if (mounted) setLoadingStudents(false)
      }
    })()
    return () => {
      mounted = false
    }
  }, [isCoach])


  const studentOptions = useMemo(
    () =>
      students.map((r) => ({
        label: studentLabelFromQuota(r),
        value: String(r.studentId),
      })),
    [students],
  )

  const go = (url: string) => Taro.navigateTo({ url })

  const quickCards: QuickCard[] = [
    {
      key: 'vocab-test', title: '词汇测试', desc: '进入测评', section: 'common', tint: 'mint',
      icon: <Star size={17} color={color.primary} />,
      onClick: () => {
        if (isCoach && students.length === 0) { Taro.showToast({ title: '请先添加学员', icon: 'none' }); go('/pages/my-students/index'); return }
        if (isCoach && !studentId) { Taro.showToast({ title: '请先选择学员', icon: 'none' }); return }
        go('/pages/vocab-test/index')
      },
    },
    {
      key: 'material-selection', title: '单词训练', desc: '选择词库', section: 'common', tint: 'sky',
      icon: <List size={17} color={color.secondaryBrand} />, onClick: () => go('/pages/material-selection/index'),
    },
    {
      key: 'grammar', title: '解析语法', desc: '语法专项练习', section: 'training', tint: 'lavender',
      icon: <Edit size={17} color="#8b5cf6" />, onClick: () => go('/pages/grammar-analysis/index'),
    },
    {
      key: 'reading', title: '阅读理解', desc: '阅读训练', section: 'training', tint: 'orange',
      icon: <List size={17} color="#f97316" />, onClick: () => go('/pages/reading-comprehension/index'),
    },
    {
      key: 'cloze', title: '完形填空', desc: '完形专项', section: 'training', tint: 'rose',
      icon: <List size={17} color="#f43f5e" />, onClick: () => go('/pages/cloze-practice/index'),
    },
    {
      key: 'scenario', title: '情景口语', desc: 'AI 情景对话', section: 'training', tint: 'mint',
      icon: <Notice size={17} color={color.primary} />, onClick: () => go('/pages/scenario-selection/index'),
    },
    {
      key: 'wordbook-shelf', title: '我的书架', desc: '浏览词库', section: 'data', tint: 'green',
      icon: <List size={17} color="#22a559" />, onClick: () => go('/pages/wordbook-shelf/index'),
    },
    ...(isCoach ? [{
      key: 'my-students', title: '学员管理', desc: '学员与时长', section: 'data' as const, tint: 'sky' as const,
      icon: <Plus size={17} color={color.secondaryBrand} />, onClick: () => go('/pages/my-students/index'),
    }] : []),
    {
      key: 'training-records', title: '学习记录', desc: '正课与复习', section: 'data', tint: 'cream',
      icon: <Clock size={17} color={color.warning} />, onClick: () => go('/pages/training-records/index'),
    },
  ]

  const sectionCards = (section: QuickCard['section']) => quickCards.filter((card) => card.section === section)

  const onSelectStudent = (value: string) => {
    const row = students.find((item) => String(item.studentId) === value)
    if (!row) return
    setStudentId(String(row.studentId))
    setTrainingStudent(row.studentId, studentLabelFromQuota(row))
  }

  const renderSection = (title: string, section: QuickCard['section'], extra?: React.ReactNode) => (
    <View className="home__section" key={section}>
      <View className="home__section-heading"><View className="home__section-heading-left"><View className="home__section-bar" /><Text className="home__section-title">{title}</Text></View>{extra}</View>
      <View className="home__quick-grid">
        {sectionCards(section).map((card) => (
          <View key={card.key} className={`home__quick-card home__quick-card--${card.tint}`} onClick={card.onClick}>
            <View className={`home__quick-icon home__quick-icon--${card.tint}`}>{card.icon}</View>
            <View className="home__quick-text">
              <Text className="home__quick-title">{card.title}</Text>
              <Text className="home__quick-desc">{card.desc}</Text>
            </View>
            <Right className="home__quick-arrow" size={16} color={color.mutedSoft} />
          </View>
        ))}
      </View>
    </View>
  )

  return (
    <View className="home-wrap">
      <AppHeader />
      <ScrollView className="home" scrollY enableFlex>
        {renderSection('常用', 'common', isCoach ? (
        <View className="home__student-control" data-coach="picker">
          <Text className="home__student-label">学员</Text>
          <MobileSelectSheet
            className="home__student-picker"
            title="选择学员"
            size="small"
            placeholder={loadingStudents ? '加载中…' : studentOptions.length ? '选择学员' : '暂无学员'}
            options={studentOptions}
            value={studentId || undefined}
            showSearch={studentOptions.length > 4}
            disabled={loadingStudents || studentOptions.length === 0}
            onChange={onSelectStudent}
          />
        </View>
      ) : null)}
      {renderSection('训练资料', 'training')}
      {renderSection('数据管理', 'data')}

    </ScrollView>

      {userId > 0 ? (
        <CoachOnboarding
          open={showOnboarding}
          userId={userId}
          onDone={() => setShowOnboarding(false)}
        />
      ) : null}
    </View>
  )
}
