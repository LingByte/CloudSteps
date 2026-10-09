import { useEffect, useMemo, useState } from 'react'
import { Image, Input, ScrollView, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { ArrowLeft } from '@nutui/icons-react-taro'
import { CloudButton } from '../../components/button'
import { MobileSelectSheet } from '../../components/mobile-select-sheet/MobileSelectSheet'
import { updateCurrentUser, uploadAvatar } from '../../api/auth'
import { useAuthStore } from '../../stores/authStore'
import { resolveMediaUrl } from '../../utils/mediaUrl'
import { color } from '../../styles/tokens'
import './index.scss'

const GENDER_OPTIONS = [
  { label: '男', value: 'male' },
  { label: '女', value: 'female' },
  { label: '其他', value: 'other' },
]

const TIMEZONE_OPTIONS = [
  { label: '中国标准时间 (UTC+8)', value: 'Asia/Shanghai' },
  { label: 'Asia/Hong_Kong', value: 'Asia/Hong_Kong' },
  { label: 'Asia/Taipei', value: 'Asia/Taipei' },
  { label: 'Asia/Singapore', value: 'Asia/Singapore' },
  { label: 'Asia/Tokyo', value: 'Asia/Tokyo' },
  { label: 'America/Los_Angeles', value: 'America/Los_Angeles' },
  { label: 'America/New_York', value: 'America/New_York' },
  { label: 'Europe/London', value: 'Europe/London' },
  { label: 'Europe/Paris', value: 'Europe/Paris' },
]

export default function ProfileEdit() {
  const user = useAuthStore((s) => s.user)
  const refreshUserInfo = useAuthStore((s) => s.refreshUserInfo)
  const updateProfile = useAuthStore((s) => s.updateProfile)

  const [displayName, setDisplayName] = useState('')
  const [phone, setPhone] = useState('')
  const [gender, setGender] = useState('')
  const [timezone, setTimezone] = useState('')
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [errorText, setErrorText] = useState<string | null>(null)

  const avatarUrl = resolveMediaUrl(avatarPreview || user?.avatar)

  useEffect(() => {
    setDisplayName(user?.displayName ?? '')
    setPhone(user?.phone ?? '')
    setGender(user?.gender ?? '')
    setTimezone(user?.timezone ?? '')
    setAvatarPreview(null)
  }, [user])

  const locationText = useMemo(() => {
    const region = user?.region?.trim()
    const city = user?.city?.trim()
    if (region && city && !region.includes(city)) return `${region} · ${city}`
    return region || city || ''
  }, [user?.region, user?.city])

  const profileComplete = useMemo(() => {
    if (typeof user?.profileComplete === 'number') return user.profileComplete
    const checks = [
      Boolean(displayName.trim() || user?.displayName),
      Boolean(avatarPreview || user?.avatar),
      Boolean(phone.trim() || user?.phone),
      Boolean(user?.email),
      Boolean(gender.trim() || user?.gender),
      Boolean(locationText),
    ]
    return Math.round((checks.filter(Boolean).length / checks.length) * 100)
  }, [user, displayName, avatarPreview, phone, gender, locationText])

  const stats = useMemo(() => [
    { label: '登录次数', value: String(user?.loginCount ?? '-') },
    { label: '资料完整度', value: `${profileComplete}%` },
    { label: '连续学习', value: typeof user?.streakDays === 'number' ? `${user.streakDays}天` : '-' },
  ], [user, profileComplete])

  const onPickAvatar = async () => {
    if (uploading) return
    try {
      const res = await Taro.chooseImage({ count: 1, sizeType: ['compressed'], sourceType: ['album', 'camera'] })
      const filePath = res.tempFilePaths[0]
      if (!filePath) return
      setAvatarPreview(filePath)
      setUploading(true)
      setErrorText(null)
      try {
        const uploadRes = await uploadAvatar(filePath)
        if (uploadRes.code !== 200 || !uploadRes.data?.avatar) {
          setErrorText(uploadRes.msg || '头像上传失败')
          setAvatarPreview(null)
          return
        }
        updateProfile({ avatar: uploadRes.data.avatar })
        setAvatarPreview(uploadRes.data.avatar)
        await refreshUserInfo()
        Taro.showToast({ title: '头像已更新', icon: 'success' })
      } catch (err: any) {
        setAvatarPreview(null)
        setErrorText(err?.msg || '头像上传失败')
        Taro.showToast({ title: err?.msg || '头像上传失败', icon: 'none' })
      } finally {
        setUploading(false)
      }
    } catch {}
  }

  const onSave = async () => {
    setErrorText(null)
    if (!displayName.trim()) {
      setErrorText('请输入昵称')
      return
    }
    try {
      setSaving(true)
      const res = await updateCurrentUser({
        displayName: displayName.trim(),
        phone: phone.trim(),
        gender: gender.trim(),
        timezone: timezone.trim(),
      })
      if (res.code !== 200) {
        setErrorText(res.msg || '保存失败')
        return
      }
      await refreshUserInfo()
      Taro.switchTab({ url: '/pages/coach/index' })
    } catch (e: any) {
      setErrorText(e?.msg || e?.message || '保存失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <View className="profile-edit">
      <View className="profile-edit__top">
        <View className="profile-edit__back" onClick={() => Taro.navigateBack()}>
          <ArrowLeft size={18} color={color.charcoal} />
        </View>
        <View className="profile-edit__heading">
          <Text className="profile-edit__title">编辑个人资料</Text>
          <Text className="profile-edit__account">账号：{user?.email || '-'}</Text>
        </View>
        <CloudButton variant="brand" size="sm" loading={saving} loadingText="保存中" disabled={saving || uploading} onClick={onSave}>
          保存
        </CloudButton>
      </View>

      <View className="profile-edit__stats">
        {stats.map((s) => (
          <View key={s.label} className="profile-edit__stat">
            <Text className="profile-edit__stat-label">{s.label}</Text>
            <Text className="profile-edit__stat-value">{s.value}</Text>
          </View>
        ))}
      </View>

      <ScrollView className="profile-edit__body" scrollY enableFlex>
        <View className="profile-edit__card">
          <View className="profile-edit__avatar-area">
            <View className="profile-edit__avatar-wrap" onClick={onPickAvatar}>
              {avatarUrl ? (
                <Image className="profile-edit__avatar" src={avatarUrl} mode="aspectFill" />
              ) : (
                <View className="profile-edit__avatar profile-edit__avatar--placeholder">
                  <Text>{(displayName || user?.email || '?').slice(0, 1).toUpperCase()}</Text>
                </View>
              )}
              <View className="profile-edit__avatar-badge">
                {uploading ? <Text className="profile-edit__avatar-badge-text">…</Text> : <Text className="profile-edit__avatar-badge-text">✚</Text>}
              </View>
            </View>
            <Text className="profile-edit__avatar-hint">点击头像更换</Text>
          </View>

          <View className="profile-edit__field">
            <Text className="profile-edit__label">昵称</Text>
            <Input className="profile-edit__input" value={displayName} onInput={(e) => setDisplayName(e.detail.value)} placeholder="请输入昵称" placeholderClass="profile-edit__placeholder" />
          </View>

          <View className="profile-edit__field-grid">
            <View className="profile-edit__field">
              <Text className="profile-edit__label">手机号</Text>
              <Input className="profile-edit__input" value={phone} onInput={(e) => setPhone(e.detail.value)} placeholder="请输入手机号" placeholderClass="profile-edit__placeholder" />
            </View>
            <MobileSelectSheet
              label="性别"
              title="选择性别"
              value={gender || undefined}
              options={GENDER_OPTIONS}
              placeholder="请选择性别"
              onChange={(v) => setGender(String(v ?? ''))}
            />
          </View>

          <MobileSelectSheet
            label="时区"
            title="选择时区"
            value={timezone || undefined}
            options={TIMEZONE_OPTIONS}
            placeholder="请选择时区"
            showSearch
            onChange={(v) => setTimezone(String(v ?? ''))}
          />

          <View className="profile-edit__field">
            <Text className="profile-edit__label">地区</Text>
            <View className="profile-edit__readonly"><Text>{locationText || '登录后根据 IP 自动识别'}</Text></View>
            <Text className="profile-edit__readonly-hint">地区由登录 IP 自动识别</Text>
          </View>

          {errorText ? <View className="profile-edit__error"><Text>{errorText}</Text></View> : null}
        </View>
      </ScrollView>
    </View>
  )
}
