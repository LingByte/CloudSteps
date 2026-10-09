import { useState } from 'react'
import { Input, ScrollView, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { Check, Copy, Right } from '@nutui/icons-react-taro'
import { PageBackHeader } from '../../components/page-back-header/PageBackHeader'
import { CloudButton } from '../../components/button'
import { createTeacherStudent } from '../../api/coaching'
import { setTrainingStudent } from '../../utils/trainingStudent'
import { color } from '../../styles/tokens'
import './index.scss'

const DEFAULT_PASSWORD = 'student123'

export default function CreateStudent() {
  const [displayName, setDisplayName] = useState('')
  const [studyHours, setStudyHours] = useState('0')
  const [submitting, setSubmitting] = useState(false)
  const [created, setCreated] = useState<{ username: string; password: string; name: string; studentId?: number } | null>(null)
  const [copied, setCopied] = useState<'account' | 'password' | 'all' | null>(null)

  const navigateAfterCreate = (createdInfo?: typeof created) => {
    const sid = createdInfo?.studentId
    const name = createdInfo?.name
    const url = sid ? `/pages/student-detail/index?id=${sid}&name=${encodeURIComponent(name || '')}` : '/pages/my-students/index'
    Taro.redirectTo({ url })
  }

  const copyText = (text: string, key: 'account' | 'password' | 'all') => {
    Taro.setClipboardData({
      data: text,
      success: () => {
        setCopied(key)
        Taro.showToast({ title: '已复制', icon: 'success' })
        setTimeout(() => setCopied(null), 1500)
      },
      fail: () => Taro.showToast({ title: '复制失败', icon: 'none' }),
    })
  }

  const onSubmit = async () => {
    const name = displayName.trim()
    if (!name) {
      Taro.showToast({ title: '请输入学员姓名', icon: 'none' })
      return
    }
    const hours = Number(studyHours)
    if (Number.isNaN(hours) || hours < 0) {
      Taro.showToast({ title: '课时数无效', icon: 'none' })
      return
    }
    setSubmitting(true)
    try {
      const res = await createTeacherStudent({ displayName: name, studyHours: Math.floor(hours) })
      if (res.code !== 200) {
        Taro.showToast({ title: res.msg || '创建失败', icon: 'none' })
        return
      }
      const sid = res.data?.student?.id || res.data?.quota?.studentId
      if (sid) setTrainingStudent(sid, name)
      const loginName = res.data?.username || res.data?.student?.username || ''
      const initPwd = res.data?.initialPassword || DEFAULT_PASSWORD
      if (!loginName) {
        Taro.showToast({ title: '学员创建成功', icon: 'success' })
        navigateAfterCreate({ username: '', password: '', name, studentId: sid })
        return
      }
      setCreated({ username: loginName, password: initPwd, name, studentId: sid })
    } catch (e: any) {
      Taro.showToast({ title: e?.msg || '创建失败', icon: 'none' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <View className="create-student">
      <PageBackHeader title="新建学员" fallbackTo="/pages/my-students/index" />

      <ScrollView className="create-student__content" scrollY enableFlex>
        <View className="create-student__section">
          <View className="create-student__section-head"><Text className="create-student__section-title">基本信息</Text></View>
          <View className="create-student__section-body">
            <View className="create-student__field">
              <Text className="create-student__label"><Text className="create-student__required">*</Text> 学员姓名</Text>
              <Input className="create-student__input" value={displayName} onInput={(e) => setDisplayName(e.detail.value)} placeholder="输入学员姓名" />
              <Text className="create-student__hint">账号由系统根据姓名生成，初始密码为 {DEFAULT_PASSWORD}</Text>
            </View>
            <View className="create-student__field">
              <Text className="create-student__label">初始课时</Text>
              <Input className="create-student__input" type="number" value={studyHours} onInput={(e) => setStudyHours(e.detail.value)} placeholder="0" />
              <Text className="create-student__hint">留 0 表示暂不分配课时，可之后在学员详情中调整。</Text>
            </View>
          </View>
        </View>

        <View className="create-student__link" onClick={() => Taro.navigateTo({ url: '/pages/my-students/index?link=1' })}>
          <Text>已有账号？关联现有学员</Text>
          <Right size={16} color={color.mutedForeground} />
        </View>

        <View className="create-student__submit-wrap">
          <CloudButton variant="brand" size="pillLg" className="create-student__submit" loading={submitting} onClick={() => void onSubmit()}>创建学员</CloudButton>
        </View>
      </ScrollView>

      {created ? (
        <View className="create-student__mask" onClick={() => { setCreated(null); navigateAfterCreate(created) }}>
          <View className="create-student__modal" onClick={(e) => e.stopPropagation()}>
            <View className="create-student__modal-head">
              <Text className="create-student__modal-title">学员创建成功</Text>
              <Text className="create-student__modal-desc">已为 {created.name} 创建登录账号</Text>
            </View>
            <View className="create-student__credential">
              <View className="create-student__credential-info"><Text className="create-student__credential-label">登录账号</Text><Text className="create-student__credential-value">{created.username}</Text></View>
              <CloudButton variant="outline" size="sm" onClick={() => copyText(created.username, 'account')}>{copied === 'account' ? <Check size={14} /> : <Copy size={14} />} 复制</CloudButton>
            </View>
            <View className="create-student__credential">
              <View className="create-student__credential-info"><Text className="create-student__credential-label">初始密码</Text><Text className="create-student__credential-value">{created.password}</Text></View>
              <CloudButton variant="outline" size="sm" onClick={() => copyText(created.password, 'password')}>{copied === 'password' ? <Check size={14} /> : <Copy size={14} />} 复制</CloudButton>
            </View>
            <View className="create-student__modal-actions">
              <CloudButton variant="outline" className="create-student__modal-btn" onClick={() => copyText(`账号：${created.username}\n密码：${created.password}`, 'all')}>{copied === 'all' ? <Check size={14} /> : <Copy size={14} />} 复制账号密码</CloudButton>
              <CloudButton variant="brand" className="create-student__modal-btn" onClick={() => { const info = created; setCreated(null); navigateAfterCreate(info) }}>完成</CloudButton>
            </View>
          </View>
        </View>
      ) : null}
    </View>
  )
}
