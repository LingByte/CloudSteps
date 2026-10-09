import { useCallback, useState } from 'react'
import { Image, Text, View } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { List, Notice, Refresh, Setting, Star } from '@nutui/icons-react-taro'
import { listNotifications } from '../../api/notifications'
import { useAuthStore } from '../../stores/authStore'
import './app-header.scss'

type NavItem = {
  path: string
  label: string
  icon: 'home' | 'lesson' | 'books' | 'review' | 'coach'
}

const NAV_ITEMS: NavItem[] = [
  { path: '/pages/home/index', label: '首页', icon: 'home' },
  { path: '/pages/lesson-prep/index', label: '备课', icon: 'lesson' },
  { path: '/pages/wordbooks/index', label: '词库', icon: 'books' },
  { path: '/pages/anti-forgetting/index', label: '抗遗忘', icon: 'review' },
  { path: '/pages/coach/index', label: '陪练中心', icon: 'coach' },
]

function NavIcon({ icon, active }: { icon: NavItem['icon']; active: boolean }) {
  const color = active ? '#4ECDC4' : '#787671'
  if (icon === 'home') return <Star size={18} color={color} />
  if (icon === 'lesson') return <List size={18} color={color} />
  if (icon === 'books') return <List size={18} color={color} />
  if (icon === 'review') return <Refresh size={18} color={color} />
  return <Setting size={18} color={color} />
}

export function AppHeader() {
  const user = useAuthStore((s) => s.user)
  const hasHydrated = useAuthStore((s) => s.hasHydrated)
  const [open, setOpen] = useState(false)
  const [unread, setUnread] = useState(0)
  const currentPath = `/${Taro.getCurrentInstance().router?.path || 'pages/home/index'}`
  const badge = unread > 99 ? '99+' : unread > 0 ? String(unread) : ''
  const userName = user?.displayName || user?.email || '-'

  const refreshUnread = useCallback(() => {
    if (!hasHydrated || !user?.id) return
    listNotifications({ page: 1, size: 1 })
      .then((res) => setUnread(res.data?.totalUnread ?? 0))
      .catch(() => {})
  }, [hasHydrated, user?.id])

  useDidShow(refreshUnread)

  const go = (url: string) => {
    setOpen(false)
    if (url === currentPath) return
    Taro.switchTab({ url })
  }

  return (
    <>
      <View className="app-header">
        <View className="app-header__accent" />
        <View className="app-header__inner">
          <View className="app-header__left">
            <View className="app-header__icon-btn" onClick={() => setOpen(true)}>
              <Text className="app-header__menu">☰</Text>
            </View>
            <View className="app-header__brand" onClick={() => go('/pages/home/index')}>
              <Image className="app-header__logo" src="/assets/logo.png" mode="aspectFit" />
              <Text className="app-header__name">解忧背词</Text>
            </View>
          </View>
          <View className="app-header__actions">
            <View className="app-header__icon-btn" onClick={() => Taro.navigateTo({ url: '/pages/guides/index' })}>
              <List size={18} color="#787671" />
            </View>
            <View className="app-header__icon-btn app-header__notice" onClick={() => Taro.navigateTo({ url: '/pages/notifications/index' })}>
              <Notice size={18} color="#787671" />
              {badge ? <Text className="app-header__badge">{badge}</Text> : null}
            </View>
          </View>
        </View>
      </View>

      {open ? (
        <View className="app-drawer">
          <View className="app-drawer__mask" onClick={() => setOpen(false)} />
          <View className="app-drawer__panel">
            <View className="app-drawer__profile">
              <View className="app-drawer__badge"><Text>官方陪练</Text></View>
              <View className="app-drawer__user">
                <View className="app-drawer__avatar"><Text>{userName.slice(0, 1).toUpperCase()}</Text></View>
                <View className="app-drawer__user-text">
                  <Text className="app-drawer__hello">Hi,</Text>
                  <Text className="app-drawer__name">{userName}</Text>
                </View>
              </View>
            </View>
            <View className="app-drawer__nav">
              {NAV_ITEMS.map((item) => {
                const active = currentPath === item.path
                return (
                  <View key={item.path} className={`app-drawer__item ${active ? 'app-drawer__item--active' : ''}`} onClick={() => go(item.path)}>
                    <NavIcon icon={item.icon} active={active} />
                    <Text className="app-drawer__item-label">{item.label}</Text>
                  </View>
                )
              })}
            </View>
          </View>
        </View>
      ) : null}
    </>
  )
}

export default AppHeader
