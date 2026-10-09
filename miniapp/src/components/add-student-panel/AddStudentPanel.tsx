import { useState } from 'react'
import { Input, ScrollView, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { Plus } from '@nutui/icons-react-taro'
import { CloudButton } from '../button'
import {
  addTeacherCoachingStudent,
  searchCoachingStudents,
  type CoachingStudentSearchResult,
} from '../../api/coaching'
import { color } from '../../styles/tokens'
import './add-student-panel.scss'

type Props = {
  open: boolean
  onClose: () => void
  onAdded?: () => void
}

export function AddStudentPanel({ open, onClose, onAdded }: Props) {
  const [searchQ, setSearchQ] = useState('')
  const [searching, setSearching] = useState(false)
  const [searchResults, setSearchResults] = useState<CoachingStudentSearchResult[]>([])
  const [picked, setPicked] = useState<CoachingStudentSearchResult | null>(null)
  const [quotaLessons, setQuotaLessons] = useState('2')
  const [adding, setAdding] = useState(false)

  if (!open) return null

  const onSearch = async () => {
    const q = searchQ.trim()
    if (!q) {
      Taro.showToast({ title: '请输入搜索关键词', icon: 'none' })
      return
    }
    setSearching(true)
    try {
      const res = await searchCoachingStudents(q)
      const list = Array.isArray(res.data) ? res.data : []
      setSearchResults(list)
      if (!list.length) Taro.showToast({ title: '未找到该用户', icon: 'none' })
    } catch {
      Taro.showToast({ title: '搜索失败', icon: 'none' })
      setSearchResults([])
    } finally {
      setSearching(false)
    }
  }

  const onAdd = async () => {
    if (!picked) {
      Taro.showToast({ title: '请先选择学员', icon: 'none' })
      return
    }
    const lessons = Number(quotaLessons)
    if (Number.isNaN(lessons) || lessons < 0 || !Number.isInteger(lessons)) {
      Taro.showToast({ title: '请输入有效的课时数', icon: 'none' })
      return
    }
    setAdding(true)
    try {
      const res = await addTeacherCoachingStudent({ studentId: picked.id, remainingLessons: lessons })
      if (res.code !== 200) {
        Taro.showToast({ title: res.msg || '添加失败', icon: 'none' })
        return
      }
      Taro.showToast({ title: '学员添加成功', icon: 'success' })
      setPicked(null)
      setSearchQ('')
      setSearchResults([])
      onAdded?.()
      onClose()
    } catch (e: any) {
      Taro.showToast({ title: e?.msg || '添加失败', icon: 'none' })
    } finally {
      setAdding(false)
    }
  }

  return (
    <View className="add-student-panel">
      <View className="add-student-panel__head">
        <View className="add-student-panel__title">
          <Plus size={16} color={color.primary} />
          <Text>添加学员</Text>
        </View>
        <CloudButton variant="ghost" size="sm" onClick={onClose}>收起</CloudButton>
      </View>

      <View className="add-student-panel__search">
        <Input
          className="add-student-panel__input"
          value={searchQ}
          onInput={(e) => setSearchQ(e.detail.value)}
          onConfirm={() => void onSearch()}
          placeholder="搜索用户名、手机号或邮箱"
          placeholderClass="add-student-panel__placeholder"
        />
        <CloudButton variant="brand" size="pill" loading={searching} onClick={() => void onSearch()}>搜索</CloudButton>
      </View>

      {searchResults.length ? (
        <ScrollView className="add-student-panel__results" scrollY>
          {searchResults.map((u) => (
            <View key={u.id} className={`add-student-panel__result ${picked?.id === u.id ? 'add-student-panel__result--active' : ''}`} onClick={() => setPicked(u)}>
              <Text className="add-student-panel__result-name">{u.displayName || u.username}</Text>
              <Text className="add-student-panel__result-meta">{[u.username, u.phone, u.email].filter(Boolean).join(' · ')}</Text>
            </View>
          ))}
        </ScrollView>
      ) : null}

      {picked ? (
        <>
          <View className="add-student-panel__quota">
            <Text className="add-student-panel__label">初始课时</Text>
            <Input className="add-student-panel__input" type="number" value={quotaLessons} onInput={(e) => setQuotaLessons(e.detail.value)} />
          </View>
          <CloudButton variant="brand" size="pill" loading={adding} className="add-student-panel__submit" onClick={() => void onAdd()}>确认添加</CloudButton>
        </>
      ) : null}
    </View>
  )
}

export default AddStudentPanel
