import { useCallback, useEffect, useMemo, useState } from 'react'
import { Image, Text, View } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { Clock, Edit, Notice, Right, Setting, ShieldCheck, Star } from '@nutui/icons-react-taro'
import { getCheckInStatus, postCheckIn } from '../../api/checkin'
import { getTeacherTeachingPoolWithSubscription, type UserSubscription } from '../../api/coaching'
import { getFeedbackUnreadCount } from '../../api/feedback'
import { useAuthStore } from '../../stores/authStore'
import { resolveMediaUrl } from '../../utils/mediaUrl'
import { CloudButton } from '../../components/button'
import { AppHeader } from '../../components/app-header/AppHeader'
import { color } from '../../styles/tokens'
import './index.scss'

type Tint = 'sky' | 'cream' | 'mint' | 'primary'

type FeatureItem = {
  id: number
  label: string
  description?: string
  tint: Tint
  path: string
  icon: 'completed' | 'feedback' | 'settings' | 'invite' | 'recharge'
  badge?: number
}

function formatTeachingMinutes(mins: number): string {
  if (!Number.isFinite(mins)) return '—'
  return `${Math.max(0, Math.round(mins))} 分钟`
}

function GenderMark({ gender }: { gender?: string }) {
  const g = (gender || 'female').trim().toLowerCase()
  const male = g === 'male' || g === 'm' || g === '男'
  return <Text className={`coach__gender ${male ? 'coach__gender--male' : 'coach__gender--female'}`}>{male ? '♂' : '♀'}</Text>
}

function FeatureIcon({ icon, tint }: { icon: FeatureItem['icon']; tint: Tint }) {
  const iconColor = tint === 'sky' ? color.secondaryBrand : tint === 'cream' ? color.warning : color.primary
  if (icon === 'completed') return <Clock size={16} color={iconColor} />
  if (icon === 'feedback') return <Notice size={16} color={iconColor} />
  if (icon === 'settings') return <Setting size={16} color={iconColor} />
  if (icon === 'invite') return <Star size={16} color={iconColor} />
  return <ShieldCheck size={16} color={iconColor} />
}

export default function Coach() {
  const user = useAuthStore((s) => s.user)
  const refreshUserInfo = useAuthStore((s) => s.refreshUserInfo)
  const role = (user as { role?: string } | null)?.role || 'user'
  const isCoach = role === 'teacher' || role === 'user' || role === 'admin'

  const [poolMinutes, setPoolMinutes] = useState<number | null>(null)
  const [poolTotal, setPoolTotal] = useState<number | null>(null)
  const [poolLoading, setPoolLoading] = useState(false)
  const [subscription, setSubscription] = useState<UserSubscription | null | undefined>(undefined)
  const [checkedInToday, setCheckedInToday] = useState<boolean | null>(null)
  const [checkInLoading, setCheckInLoading] = useState(false)
  const [checkInSubmitting, setCheckInSubmitting] = useState(false)
  const [feedbackUnread, setFeedbackUnread] = useState(0)

  useEffect(() => {
    void refreshUserInfo()
  }, [refreshUserInfo])

  const loadFeedbackUnread = useCallback(async () => {
    try {
      const res = await getFeedbackUnreadCount()
      if (res.code === 200 && res.data) setFeedbackUnread(Math.max(0, Number(res.data.count) || 0))
    } catch {}
  }, [])

  const loadPool = useCallback(async () => {
    setPoolLoading(true)
    try {
      const res = await getTeacherTeachingPoolWithSubscription()
      if (res.code === 200 && res.data) {
        setPoolMinutes(res.data.remainingMinutes ?? 0)
        setPoolTotal(res.data.totalAllocatedMinutes ?? 0)
        setSubscription(res.data.subscription ?? null)
      }
    } finally {
      setPoolLoading(false)
    }
  }, [])

  const loadCheckInStatus = useCallback(async () => {
    setCheckInLoading(true)
    try {
      const res = await getCheckInStatus()
      if (res.code === 200 && res.data) {
        setCheckedInToday(!!res.data.checkedInToday)
        if (typeof res.data.poolRemainingMinutes === 'number') setPoolMinutes(res.data.poolRemainingMinutes)
      }
    } finally {
      setCheckInLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!isCoach) return
    void loadPool()
    void loadCheckInStatus()
  }, [isCoach, loadPool, loadCheckInStatus])

  useDidShow(() => {
    void loadFeedbackUnread()
    if (isCoach) void loadCheckInStatus()
  })

  const onCheckInToday = async () => {
    if (checkInSubmitting || checkedInToday) return
    setCheckInSubmitting(true)
    try {
      const res = await postCheckIn()
      if (res.code !== 200 || !res.data) {
        Taro.showToast({ title: res.msg || '打卡失败', icon: 'none' })
        return
      }
      const data = res.data
      Taro.showToast({
        title: data.alreadyCheckedIn ? '今天已打卡' : `打卡成功 +${data.grantedMinutes}分钟`,
        icon: 'none',
      })
      setCheckedInToday(true)
      setPoolMinutes(data.poolRemainingMinutes)
      await Promise.all([loadPool(), loadCheckInStatus()])
    } catch (e: any) {
      Taro.showToast({ title: e?.msg || '打卡失败', icon: 'none' })
    } finally {
      setCheckInSubmitting(false)
    }
  }

  const name = user?.displayName || user?.email || ''
  const avatarUrl = resolveMediaUrl(user?.avatar)
  const remaining = poolMinutes ?? 0
  const total = poolTotal ?? 0
  const remainPct = total > 0 ? Math.min(100, Math.round((remaining / total) * 100)) : 0
  const checkInStatusLabel = checkedInToday === null ? '…' : checkedInToday ? '今日已打卡' : '今日未打卡'

  const go = (url: string) => Taro.navigateTo({ url })

  const featureList = useMemo<FeatureItem[]>(() => {
    const recharge: FeatureItem = {
      id: 6,
      icon: 'recharge',
      label: subscription?.status === 'active' ? '会员中心' : '开通会员',
      description: subscription?.status === 'active'
        ? subscription.type === 'lifetime' ? '买断会员 · 永久有效' : `会员有效中 · 到期 ${new Date(subscription.expiredAt || '').toLocaleDateString('zh-CN')}`
        : '开通包月/包年/买断，畅享全部功能',
      tint: 'mint',
      path: '/pages/recharge/index',
    }
    const base: FeatureItem[] = [
      { id: 4, icon: 'feedback', label: '意见反馈', description: '提交问题与建议', tint: 'mint', path: '/pages/feedback/index', badge: feedbackUnread },
      { id: 3, icon: 'settings', label: '设置', tint: 'cream', path: '/pages/settings/index' },
      { id: 5, icon: 'invite', label: '邀请码', description: '邀请好友一起学习', tint: 'sky', path: '/pages/invite-code/index' },
      ...(isCoach ? [recharge] : []),
    ]
    if (!isCoach) return base
    return [
      { id: 1, icon: 'completed', label: '已上课程', description: '查看近 90 天已完成的陪练记录与课时结算', tint: 'primary', path: '/pages/coach-completed-sessions/index' },
      ...base,
    ]
  }, [feedbackUnread, isCoach, subscription])

  return (
    <View className="coach-wrap">
      <AppHeader />
      <View className="coach">
        <View className="coach__user-card">
          <View className="coach__avatar">
            {avatarUrl ? <Image className="coach__avatar-img" src={avatarUrl} mode="aspectFill" /> : <Text className="coach__avatar-text">{(name || '?').slice(0, 1).toUpperCase()}</Text>}
          </View>
          <View className="coach__user-info">
            <View className="coach__name-row">
              <Text className="coach__name">{name || '-'}</Text>
              <GenderMark gender={(user as any)?.gender} />
            </View>
            <Text className="coach__subtitle">教练工作台</Text>
          </View>
          <View className="coach__edit" onClick={() => go('/pages/profile-edit/index')}>
            <Edit size={15} color={color.mutedForeground} />
          </View>
        </View>

        {isCoach ? (
          <View className="coach__quota-card" onClick={() => go('/pages/check-in/index')}>
            <View className="coach__quota-glow" />
            <View className="coach__quota-icon"><ShieldCheck size={18} color="#fff" /></View>
            <View className="coach__quota-main">
              <View className="coach__quota-top">
                <Text className="coach__quota-label">教学时长池</Text>
                <View className="coach__quota-actions" onClick={(e) => e.stopPropagation()}>
                  <CloudButton
                    variant="brand"
                    size="sm"
                    className="coach__checkin-btn"
                    disabled={checkInLoading || checkInSubmitting || !!checkedInToday}
                    onClick={() => void onCheckInToday()}
                  >
                    {checkedInToday ? '已打卡' : '今日打卡'}
                  </CloudButton>
                  <View className="coach__quota-more" onClick={() => go('/pages/check-in/index')}>
                    <Right size={16} color={color.mutedSoft} />
                  </View>
                </View>
              </View>
              <Text className="coach__quota-value">{poolLoading ? '…' : formatTeachingMinutes(remaining)}</Text>
              <Text className="coach__quota-desc">
                {total > 0 ? `总分配 ${formatTeachingMinutes(total)} · ${checkInStatusLabel}` : '每日打卡可领取教学时长'}
              </Text>
              {total > 0 ? (
                <View className="coach__progress"><View className="coach__progress-fill" style={{ width: `${remainPct}%` }} /></View>
              ) : null}
            </View>
          </View>
        ) : null}

        <View className="coach__features">
          <Text className="coach__features-title">功能中心</Text>
          <View className="coach__feature-list">
            {featureList.map((feature) => (
              <View key={feature.id} className="coach__feature" onClick={() => go(feature.path)}>
                <View className={`coach__feature-icon coach__feature-icon--${feature.tint}`}>
                  <FeatureIcon icon={feature.icon} tint={feature.tint} />
                </View>
                <View className="coach__feature-text">
                  <View className="coach__feature-label-row">
                    <Text className="coach__feature-label">{feature.label}</Text>
                    {feature.badge && feature.badge > 0 ? <Text className="coach__feature-badge">{feature.badge > 99 ? '99+' : feature.badge}</Text> : null}
                  </View>
                  {feature.description ? <Text className="coach__feature-desc">{feature.description}</Text> : null}
                </View>
                <Right size={14} color={color.mutedSoft} />
              </View>
            ))}
          </View>
        </View>
      </View>
    </View>
  )
}
