/**
 * 设置页 — 对齐 web/src/pages/Settings.tsx。
 * 小程序适配:用独立子页面替代 web 端的 Dialog 弹窗。
 * 包含:修改密码 / 绑定邮箱 / 消息通知 / 账号安全
 */
import { useEffect, useState } from 'react'
import { View, Text, Input, Switch, ScrollView } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { CloudButton } from '../../components/button'
import { useAuthStore } from '../../stores/authStore'
import {
  changePassword,
  bindEmail,
  sendBindEmailCode,
  updateNotificationSettings,
  getUserActivity,
  type UserActivity,
} from '../../api/auth'
import { color } from '../../styles/tokens'
import './index.scss'

type Panel = 'password' | 'email' | 'notifications' | 'security' | null

export default function Settings() {
  const user = useAuthStore((s) => s.user)
  const clearUser = useAuthStore((s) => s.clearUser)
  const refreshUserInfo = useAuthStore((s) => s.refreshUserInfo)
  const logout = useAuthStore((s) => s.logout)
  const [panel, setPanel] = useState<Panel>(null)
  const [errorText, setErrorText] = useState<string | null>(null)

  // 修改密码
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [savingPassword, setSavingPassword] = useState(false)

  // 绑定邮箱
  const [bindEmailValue, setBindEmailValue] = useState('')
  const [bindEmailCode, setBindEmailCode] = useState('')
  const [sendingBindEmailCode, setSendingBindEmailCode] = useState(false)
  const [bindingEmail, setBindingEmail] = useState(false)
  const [bindEmailCountdown, setBindEmailCountdown] = useState(0)

  // 通知设置
  const [emailNotifications, setEmailNotifications] = useState(false)
  const [pushNotifications, setPushNotifications] = useState(false)
  const [systemNotifications, setSystemNotifications] = useState(false)
  const [autoCleanUnreadEmails, setAutoCleanUnreadEmails] = useState(false)
  const [savingNotifications, setSavingNotifications] = useState(false)

  // 账号安全
  const [activityLoading, setActivityLoading] = useState(false)
  const [activities, setActivities] = useState<UserActivity[]>([])

  useEffect(() => {
    setEmailNotifications(Boolean(user?.emailNotifications))
    setPushNotifications(Boolean((user as any)?.pushNotifications))
    setSystemNotifications(Boolean((user as any)?.systemNotifications))
    setAutoCleanUnreadEmails(Boolean((user as any)?.autoCleanUnreadEmails))
  }, [user])

  useEffect(() => {
    if (bindEmailCountdown <= 0) return
    const t = setTimeout(() => setBindEmailCountdown((n) => n - 1), 1000)
    return () => clearTimeout(t)
  }, [bindEmailCountdown])

  useEffect(() => {
    if (panel !== 'security') return
    let mounted = true
    ;(async () => {
      try {
        setActivityLoading(true)
        const res = await getUserActivity({ page: 1, limit: 20 })
        if (!mounted) return
        if (res.code === 200) {
          setActivities(res.data?.activities ?? [])
        } else {
          setActivities([])
        }
      } catch {
        if (mounted) setActivities([])
      } finally {
        if (mounted) setActivityLoading(false)
      }
    })()
    return () => { mounted = false }
  }, [panel])

  const openPanel = (p: NonNullable<typeof panel>) => {
    setErrorText(null)
    setPanel(p)
  }

  // 修改密码
  const onSavePassword = async () => {
    setErrorText(null)
    if (!currentPassword) { setErrorText('请输入当前密码'); return }
    if (!newPassword || newPassword.length < 6) { setErrorText('新密码至少 6 位'); return }
    if (confirmPassword && confirmPassword !== newPassword) { setErrorText('两次输入的新密码不一致'); return }
    try {
      setSavingPassword(true)
      const res = await changePassword({ currentPassword, newPassword, confirmPassword: confirmPassword || undefined })
      if (res.code !== 200) { setErrorText(res.msg || '修改失败'); return }
      setPanel(null)
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('')
      Taro.showToast({ title: '密码已修改', icon: 'success' })
      if (res.data?.logout) {
        clearUser()
        Taro.reLaunch({ url: '/pages/login/index' })
      }
    } catch (e: any) {
      setErrorText(e?.msg || e?.message || '修改失败')
    } finally {
      setSavingPassword(false)
    }
  }

  // 发送绑定邮箱验证码
  const onSendBindCode = async () => {
    setErrorText(null)
    if (!bindEmailValue.trim()) { setErrorText('请先填写邮箱'); return }
    try {
      setSendingBindEmailCode(true)
      const res = await sendBindEmailCode(bindEmailValue.trim())
      if (res.code !== 200) { setErrorText(res.msg || '发送失败'); return }
      setBindEmailCountdown(60)
      Taro.showToast({ title: '验证码已发送', icon: 'none' })
    } catch (e: any) {
      setErrorText(e?.msg || e?.message || '发送失败')
    } finally {
      setSendingBindEmailCode(false)
    }
  }

  // 确认绑定邮箱
  const onBindEmail = async () => {
    setErrorText(null)
    if (!bindEmailValue.trim()) { setErrorText('请输入邮箱'); return }
    if (!bindEmailCode.trim()) { setErrorText('请输入验证码'); return }
    try {
      setBindingEmail(true)
      const res = await bindEmail(bindEmailValue.trim(), bindEmailCode.trim())
      if (res.code !== 200) { setErrorText(res.msg || '绑定失败'); return }
      await refreshUserInfo()
      Taro.showToast({ title: '邮箱绑定成功', icon: 'success' })
      setPanel(null)
      setBindEmailValue(''); setBindEmailCode('')
    } catch (e: any) {
      setErrorText(e?.msg || e?.message || '绑定失败')
    } finally {
      setBindingEmail(false)
    }
  }

  // 保存通知设置
  const onSaveNotifications = async () => {
    setErrorText(null)
    try {
      setSavingNotifications(true)
      const res = await updateNotificationSettings({
        emailNotifications, pushNotifications, systemNotifications, autoCleanUnreadEmails,
      })
      if (res.code !== 200) { setErrorText(res.msg || '保存失败'); return }
      await refreshUserInfo()
      Taro.showToast({ title: '设置已保存', icon: 'success' })
      setPanel(null)
    } catch (e: any) {
      setErrorText(e?.msg || e?.message || '保存失败')
    } finally {
      setSavingNotifications(false)
    }
  }

  // 退出登录
  const onLogout = async () => {
    const res = await Taro.showModal({
      title: '确认退出登录?',
      content: '退出后需要重新登录才能继续使用',
      confirmText: '退出登录',
      confirmColor: color.destructive,
    })
    if (res.confirm) {
      await logout()
      Taro.reLaunch({ url: '/pages/login/index' })
    }
  }

  const menus = [
    { id: 'password' as const, label: '修改密码', desc: '定期修改保障安全' },
    { id: 'email' as const, label: '绑定邮箱', desc: user?.email || '用于通知与找回' },
    { id: 'notifications' as const, label: '消息通知', desc: '管理推送提醒' },
    { id: 'security' as const, label: '账号安全', desc: '登录记录与设备' },
  ]

  const isAdmin = (user as { role?: string } | null)?.role === 'admin'
  const otherLinks = [
    ...(isAdmin ? [{ label: '订阅管理', url: '/pages/admin-subscriptions/index' }] : []),
    { label: '公告中心', url: '/pages/announcements/index' },
    { label: '使用指南', url: '/pages/guides/index' },
    { label: '词库书架', url: '/pages/wordbook-shelf/index' },
    { label: '邀请码', url: '/pages/invite-code/index' },
    { label: '意见反馈', url: '/pages/feedback/index' },
    { label: '关于我们', url: '/pages/about/index' },
    { label: '用户协议', url: '/pages/terms/index' },
    { label: '隐私政策', url: '/pages/privacy/index' },
  ]

  // ============ 子面板渲染 ============
  if (panel === 'password') {
    return (
      <ScrollView className="settings settings--panel" scrollY enableFlex>
        <View className="settings__panel-header">
          <Text className="settings__panel-back" onClick={() => setPanel(null)}>返回</Text>
          <Text className="settings__panel-title">修改密码</Text>
          <View style={{ width: '80rpx' }} />
        </View>
        <View className="settings__panel-body">
          <View className="settings__field">
            <Text className="settings__label">当前密码</Text>
            <Input className="settings__input" password value={currentPassword}
              onInput={(e) => setCurrentPassword(e.detail.value)} placeholder="请输入当前密码" placeholderClass="settings__placeholder" />
          </View>
          <View className="settings__field">
            <Text className="settings__label">新密码</Text>
            <Input className="settings__input" password value={newPassword}
              onInput={(e) => setNewPassword(e.detail.value)} placeholder="至少 6 位" placeholderClass="settings__placeholder" />
          </View>
          <View className="settings__field">
            <Text className="settings__label">确认新密码</Text>
            <Input className="settings__input" password value={confirmPassword}
              onInput={(e) => setConfirmPassword(e.detail.value)} placeholder="再次输入新密码" placeholderClass="settings__placeholder" />
          </View>
          {errorText && <View className="settings__error"><Text>{errorText}</Text></View>}
          <CloudButton variant="brand" size="lg" onClick={onSavePassword} loading={savingPassword} loadingText="保存中">
            保存
          </CloudButton>
        </View>
      </ScrollView>
    )
  }

  if (panel === 'email') {
    return (
      <ScrollView className="settings settings--panel" scrollY enableFlex>
        <View className="settings__panel-header">
          <Text className="settings__panel-back" onClick={() => setPanel(null)}>返回</Text>
          <Text className="settings__panel-title">绑定邮箱</Text>
          <View style={{ width: '80rpx' }} />
        </View>
        <View className="settings__panel-body">
          {user?.email && (
            <View className="settings__current-email">
              <Text className="settings__current-label">当前绑定邮箱</Text>
              <Text className="settings__current-value">{user.email}</Text>
            </View>
          )}
          <View className="settings__field">
            <Text className="settings__label">{user?.email ? '换绑邮箱' : '邮箱地址'}</Text>
            <Input className="settings__input" value={bindEmailValue}
              onInput={(e) => setBindEmailValue(e.detail.value)} placeholder="请输入要绑定的邮箱" placeholderClass="settings__placeholder" />
          </View>
          <View className="settings__field">
            <Text className="settings__label">验证码</Text>
            <View className="settings__code-row">
              <Input className="settings__input settings__input--code" value={bindEmailCode}
                onInput={(e) => setBindEmailCode(e.detail.value)} placeholder="输入验证码" placeholderClass="settings__placeholder" />
              <View className={`settings__send-btn ${bindEmailCountdown > 0 || sendingBindEmailCode ? 'settings__send-btn--disabled' : ''}`}
                onClick={() => bindEmailCountdown <= 0 && !sendingBindEmailCode && onSendBindCode()}>
                <Text>{sendingBindEmailCode ? '发送中' : bindEmailCountdown > 0 ? `${bindEmailCountdown}s` : '发送验证码'}</Text>
              </View>
            </View>
          </View>
          {errorText && <View className="settings__error"><Text>{errorText}</Text></View>}
          <CloudButton variant="brand" size="lg" onClick={onBindEmail} loading={bindingEmail} loadingText="绑定中">
            确认绑定
          </CloudButton>
        </View>
      </ScrollView>
    )
  }

  if (panel === 'notifications') {
    const notifItems = [
      { label: '邮件通知', desc: '重要活动与账号提醒', checked: emailNotifications, onChange: setEmailNotifications },
      { label: '推送通知', desc: '学习提醒与系统推送', checked: pushNotifications, onChange: setPushNotifications },
      { label: '系统通知', desc: '系统公告与安全提醒', checked: systemNotifications, onChange: setSystemNotifications },
      { label: '自动清理未读邮件', desc: '自动清理 7 天未读', checked: autoCleanUnreadEmails, onChange: setAutoCleanUnreadEmails },
    ]
    return (
      <ScrollView className="settings settings--panel" scrollY enableFlex>
        <View className="settings__panel-header">
          <Text className="settings__panel-back" onClick={() => setPanel(null)}>返回</Text>
          <Text className="settings__panel-title">消息通知</Text>
          <View style={{ width: '80rpx' }} />
        </View>
        <View className="settings__panel-body">
          {notifItems.map((item) => (
            <View key={item.label} className="settings__notif-item">
              <View className="settings__notif-info">
                <Text className="settings__notif-label">{item.label}</Text>
                <Text className="settings__notif-desc">{item.desc}</Text>
              </View>
              <Switch checked={item.checked} onChange={(e) => item.onChange(e.detail.value)} color={color.primary} />
            </View>
          ))}
          {errorText && <View className="settings__error"><Text>{errorText}</Text></View>}
          <CloudButton variant="brand" size="lg" onClick={onSaveNotifications} loading={savingNotifications} loadingText="保存中">
            保存
          </CloudButton>
        </View>
      </ScrollView>
    )
  }

  if (panel === 'security') {
    return (
      <ScrollView className="settings settings--panel" scrollY enableFlex>
        <View className="settings__panel-header">
          <Text className="settings__panel-back" onClick={() => setPanel(null)}>返回</Text>
          <Text className="settings__panel-title">账号安全</Text>
          <View style={{ width: '80rpx' }} />
        </View>
        <View className="settings__panel-body">
          <View className="settings__security-item">
            <Text className="settings__security-label">最近登录</Text>
            <Text className="settings__security-value">{user?.lastLogin || '-'}</Text>
          </View>
          <View className="settings__security-item">
            <Text className="settings__security-label">活动记录</Text>
            <Text className="settings__security-sub">显示最近 20 条</Text>
          </View>
          <View className="settings__activity-list">
            {activityLoading ? (
              <Text className="settings__activity-empty">加载中...</Text>
            ) : activities.length === 0 ? (
              <Text className="settings__activity-empty">暂无记录</Text>
            ) : (
              activities.map((a) => (
                <View key={a.id} className="settings__activity-item">
                  <Text className="settings__activity-action">{a.action || '-'}</Text>
                  <Text className="settings__activity-time">{a.createdAt}</Text>
                </View>
              ))
            )}
          </View>
          {errorText && <View className="settings__error"><Text>{errorText}</Text></View>}
        </View>
      </ScrollView>
    )
  }

  // ============ 主面板(菜单列表) ============
  return (
    <ScrollView className="settings" scrollY enableFlex>
      <View className="settings__header">
        <Text className="settings__back" onClick={() => Taro.navigateBack()}>返回</Text>
        <Text className="settings__title">设置</Text>
        <View style={{ width: '80rpx' }} />
      </View>

      <View className="settings__section">
        <Text className="settings__section-title">账号设置</Text>
        <View className="settings__card">
          {menus.map((item, idx) => (
            <View
              key={item.id}
              className={`settings__menu-item ${idx < menus.length - 1 ? 'settings__menu-item--border' : ''}`}
              onClick={() => openPanel(item.id)}
            >
              <View className="settings__menu-content">
                <Text className="settings__menu-label">{item.label}</Text>
                <Text className="settings__menu-desc">{item.desc}</Text>
              </View>
              <Text className="settings__menu-arrow">{'>'}</Text>
            </View>
          ))}
        </View>
      </View>

      <View className="settings__section">
        <Text className="settings__section-title">其他</Text>
        <View className="settings__card">
          {otherLinks.map((link, idx) => (
            <View
              key={link.label}
              className={`settings__menu-item ${idx < otherLinks.length - 1 ? 'settings__menu-item--border' : ''}`}
              onClick={() => Taro.navigateTo({ url: link.url })}
            >
              <View className="settings__menu-content">
                <Text className="settings__menu-label">{link.label}</Text>
              </View>
              <Text className="settings__menu-arrow">{'>'}</Text>
            </View>
          ))}
        </View>
      </View>

      <View className="settings__logout">
        <CloudButton variant="outline" size="lg" onClick={onLogout}>
          <Text style={{ color: 'var(--destructive)' }}>退出登录</Text>
        </CloudButton>
      </View>
    </ScrollView>
  )
}
