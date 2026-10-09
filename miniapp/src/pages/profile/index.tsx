/**
 * 个人中心 — 对齐 web/src/pages/Profile.tsx + Settings.tsx 的核心功能。
 *
 * 移动端布局:
 *  1. 用户头部(头像/昵称/角色徽章 + 编辑入口)
 *  2. 统计卡片(登录次数 / 资料完整度 / 连续学习)
 *  3. 基本信息列表(邮箱 / 手机 / 地区)
 *  4. 设置菜单(修改密码 / 绑定邮箱 / 消息通知 / 账号安全)
 *  5. 其他链接(关于我们 / 用户协议 / 隐私政策)
 *  6. 退出登录
 */
import React, { useEffect, useState } from 'react'
import { View, Text, ScrollView, Image } from '@tarojs/components'
import Taro from '@tarojs/taro'
import {
  Mail,
  Phone,
  Location,
  Setting,
  ShieldCheck,
  Notice,
  Right,
  Refresh,
  Edit,
  Close,
  Clock,
  Star,
  Check,
} from '@nutui/icons-react-taro'
import { CloudButton } from '../../components/button'
import { useAuthStore } from '../../stores/authStore'
import { resolveMediaUrl } from '../../utils/mediaUrl'
import { color } from '../../styles/tokens'
import './index.scss'

interface MenuItem {
  id: string
  icon: React.ReactNode
  label: string
  desc: string
  onClick: () => void
}

export default function Profile() {
  const user = useAuthStore((s) => s.user)
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const hydrate = useAuthStore((s) => s.hydrate)
  const logout = useAuthStore((s) => s.logout)
  const refreshUserInfo = useAuthStore((s) => s.refreshUserInfo)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    if (!isAuthenticated) {
      hydrate()
    }
  }, [isAuthenticated, hydrate])

  // 未登录 → 跳登录页
  useEffect(() => {
    if (!isAuthenticated) {
      Taro.navigateTo({ url: '/pages/login/index' })
    }
  }, [isAuthenticated])

  const handleRefresh = async () => {
    if (refreshing) return
    setRefreshing(true)
    await refreshUserInfo()
    setRefreshing(false)
    Taro.showToast({ title: '已刷新', icon: 'none' })
  }

  const handleEdit = () => {
    Taro.navigateTo({ url: '/pages/profile-edit/index' })
  }

  const handleLogout = async () => {
    const res = await Taro.showModal({
      title: '确认退出',
      content: '退出后需要重新登录',
      confirmText: '退出',
      confirmColor: color.destructive,
    })
    if (res.confirm) {
      await logout()
      Taro.reLaunch({ url: '/pages/login/index' })
    }
  }

  const handleAbout = () => {
    Taro.navigateTo({ url: '/pages/about/index' })
  }

  // 头像:优先展示真实头像,无则取首字母占位
  const avatarUrl = resolveMediaUrl(user?.avatar)
  const avatarText = (() => {
    const name = user?.displayName || user?.email || '?'
    return name.charAt(0).toUpperCase()
  })()

  const displayName = user?.displayName || user?.email?.split('@')[0] || '用户'
  const roleText = user?.role === 'admin' ? '管理员' : '正式陪练'

  // 统计数据
  const profileComplete = (() => {
    if (typeof (user as any)?.profileComplete === 'number') return (user as any).profileComplete
    const checks = [
      Boolean(user?.displayName),
      Boolean(user?.avatar),
      Boolean(user?.phone),
      Boolean(user?.email),
      Boolean(user?.city || user?.region),
    ]
    return Math.round((checks.filter(Boolean).length / checks.length) * 100)
  })()

  const stats = [
    { label: '登录次数', value: String(user?.loginCount ?? '-'), icon: <Clock size={20} color={color.primary} />, color: color.primary },
    { label: '资料完整度', value: `${profileComplete}%`, icon: <Check size={20} color={color.secondaryBrand} />, color: color.secondaryBrand },
    { label: '连续学习', value: typeof (user as any)?.streakDays === 'number' ? `${(user as any).streakDays}天` : '-', icon: <Star size={20} color={color.wrong} />, color: color.wrong },
  ]

  // 基本信息
  const infoItems = [
    { icon: <Mail size={18} color={color.secondaryBrand} />, label: '邮箱', value: user?.email || '未填写' },
    { icon: <Phone size={18} color={color.primary} />, label: '手机号', value: user?.phone || '未填写' },
    { icon: <Location size={18} color={color.wrong} />, label: '地区', value: [user?.region, user?.city].filter(Boolean).join(' · ') || '未填写' },
  ]

  // 设置菜单
  const settingMenus: MenuItem[] = [
    { id: 'password', icon: <Setting size={20} color={color.primary} />, label: '修改密码', desc: '定期修改保障安全', onClick: () => Taro.navigateTo({ url: '/pages/settings/index' }) },
    { id: 'email', icon: <Mail size={20} color={color.primary} />, label: '绑定邮箱', desc: user?.email || '用于通知与找回', onClick: () => Taro.navigateTo({ url: '/pages/settings/index' }) },
    { id: 'notifications', icon: <Notice size={20} color={color.primary} />, label: '消息通知', desc: '管理推送提醒', onClick: () => Taro.navigateTo({ url: '/pages/settings/index' }) },
    { id: 'security', icon: <ShieldCheck size={20} color={color.secondaryBrand} />, label: '账号安全', desc: '登录记录与设备', onClick: () => Taro.navigateTo({ url: '/pages/settings/index' }) },
  ]

  // 其他链接
  const otherLinks = [
    { label: '关于我们', onClick: handleAbout },
    { label: '用户协议', onClick: () => Taro.navigateTo({ url: '/pages/terms/index' }) },
    { label: '隐私政策', onClick: () => Taro.navigateTo({ url: '/pages/privacy/index' }) },
  ]

  if (!isAuthenticated) {
    return (
      <View className="profile profile--loading">
        <Text className="profile__loading-text">请先登录</Text>
      </View>
    )
  }

  return (
    <ScrollView className="profile" scrollY enableFlex>
      {/* 用户头部 */}
      <View className="profile__header">
        <View className="profile__avatar">
          {avatarUrl ? (
            <Image className="profile__avatar-img" src={avatarUrl} mode="aspectFill" />
          ) : (
            <Text className="profile__avatar-text">{avatarText}</Text>
          )}
        </View>
        <View className="profile__user-info">
          <Text className="profile__name">{displayName}</Text>
          <View className="profile__role-badge">
            <ShieldCheck size={22} color={color.primary} />
            <Text className="profile__role-text">{roleText}</Text>
          </View>
        </View>
        <View className="profile__header-actions">
          <View className="profile__icon-btn" onClick={handleRefresh}>
            <Refresh size={20} color={color.mutedForeground} />
          </View>
          <View className="profile__icon-btn" onClick={handleEdit}>
            <Edit size={20} color={color.mutedForeground} />
          </View>
        </View>
      </View>

      {/* 统计卡片 */}
      <View className="profile__stats">
        {stats.map((s) => (
          <View key={s.label} className="profile__stat-card">
            <View className="profile__stat-icon" style={{ backgroundColor: `${s.color}15` }}>
              {s.icon}
            </View>
            <Text className="profile__stat-value">{s.value}</Text>
            <Text className="profile__stat-label">{s.label}</Text>
          </View>
        ))}
      </View>

      {/* 基本信息 */}
      <View className="profile__section">
        <Text className="profile__section-title">基本信息</Text>
        <View className="profile__card">
          {infoItems.map((item, idx) => (
            <View
              key={item.label}
              className={`profile__info-item ${idx < infoItems.length - 1 ? 'profile__info-item--border' : ''}`}
            >
              <View className="profile__info-icon">{item.icon}</View>
              <View className="profile__info-content">
                <Text className="profile__info-label">{item.label}</Text>
                <Text className="profile__info-value">{item.value}</Text>
              </View>
            </View>
          ))}
        </View>
      </View>

      {/* 设置菜单 */}
      <View className="profile__section">
        <Text className="profile__section-title">账号与设置</Text>
        <View className="profile__card">
          {settingMenus.map((item, idx) => (
            <View
              key={item.id}
              className={`profile__menu-item ${idx < settingMenus.length - 1 ? 'profile__menu-item--border' : ''}`}
              onClick={item.onClick}
            >
              <View className="profile__menu-icon">{item.icon}</View>
              <View className="profile__menu-content">
                <Text className="profile__menu-label">{item.label}</Text>
                <Text className="profile__menu-desc">{item.desc}</Text>
              </View>
              <Right size={16} color={color.mutedSoft} />
            </View>
          ))}
        </View>
      </View>

      {/* 其他链接 */}
      <View className="profile__section">
        <View className="profile__card">
          {otherLinks.map((link, idx) => (
            <View
              key={link.label}
              className={`profile__menu-item ${idx < otherLinks.length - 1 ? 'profile__menu-item--border' : ''}`}
              onClick={link.onClick}
            >
              <View className="profile__menu-content">
                <Text className="profile__menu-label">{link.label}</Text>
              </View>
              <Right size={16} color={color.mutedSoft} />
            </View>
          ))}
        </View>
      </View>

      {/* 退出登录 */}
      <View className="profile__logout">
        <CloudButton
          variant="outline"
          size="lg"
          onClick={handleLogout}
          className="profile__logout-btn"
        >
          <Close size={18} color={color.destructive} />
          <Text style={{ color: color.destructive, marginLeft: '8rpx' }}>退出登录</Text>
        </CloudButton>
      </View>

      <View className="profile__footer">
        <Text className="profile__footer-text">解忧 CloudSteps v1.0.0</Text>
      </View>
    </ScrollView>
  )
}
