import { useEffect, useMemo, useState } from 'react'
import { View, Text, ScrollView } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { ArrowLeft } from '@nutui/icons-react-taro'
import { getCheckInStatus, postCheckIn, type CheckInStatus } from '../../api/checkin'
import { color } from '../../styles/tokens'
import './index.scss'

const FALLBACK_TIERS = [
  { days: 1, minutes: 60 }, { days: 3, minutes: 70 }, { days: 5, minutes: 90 },
  { days: 7, minutes: 110 }, { days: 14, minutes: 180 }, { days: 30, minutes: 180 },
]

export default function CheckIn() {
  const [status, setStatus] = useState<CheckInStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const res = await getCheckInStatus()
      if (res.code === 200 && res.data) setStatus(res.data)
      else Taro.showToast({ title: res.msg || '查询失败', icon: 'none' })
    } catch (e: any) {
      Taro.showToast({ title: e?.msg || '查询失败', icon: 'none' })
    } finally { setLoading(false) }
  }
  useEffect(() => { void load() }, [])

  const streak = status?.currentStreak ?? 0
  const tiers = status?.rewardPreview?.length ? status.rewardPreview : FALLBACK_TIERS

  const onCheckIn = async () => {
    if (submitting || status?.checkedInToday) return
    setSubmitting(true)
    try {
      const res = await postCheckIn()
      if (res.code !== 200 || !res.data) { Taro.showToast({ title: res.msg || '打卡失败', icon: 'none' }); return }
      const d = res.data
      Taro.showToast({
        title: d.alreadyCheckedIn ? '今日已打卡' : `打卡成功 +${d.grantedMinutes}分钟${d.bonusMinutes > 0 ? `（连击奖励+${d.bonusMinutes}）` : ''}`,
        icon: 'none', duration: 2000,
      })
      await load()
    } catch (e: any) {
      Taro.showToast({ title: e?.msg || '打卡失败', icon: 'none' })
    } finally { setSubmitting(false) }
  }

  // 最近记录热力格子
  const cells = useMemo(() => status?.recentMask ?? [], [status])

  return (
    <View className="checkin">
      <View className="ci__nav">
        <View className="ci__back" onClick={() => Taro.navigateBack()}><ArrowLeft size={22} color={color.charcoal} /></View>
        <Text className="ci__title">每日打卡</Text>
        <View className="ci__back" />
      </View>
      <ScrollView className="ci__body" scrollY enableFlex>
        {loading && !status ? (
          <View className="ci__state"><Text>加载中...</Text></View>
        ) : (
          <>
            <View className="ci__hero">
              <View className="ci__hero-top">
                <View className="ci__hero-info">
                  <Text className="ci__hero-label">教学分钟池</Text>
                  <Text className="ci__hero-value">{status?.poolRemainingMinutes ?? 0}<Text className="ci__hero-unit">分钟</Text></Text>
                  <Text className="ci__hero-hint">
                    {status?.checkedInToday ? `今日已领取 ${status.dailyReward} 分钟` : `今日可领 ${status?.dailyReward ?? 60} 分钟`}
                  </Text>
                </View>
                <View
                  className={`ci__checkin-btn ${(submitting || status?.checkedInToday) ? 'ci__checkin-btn--disabled' : ''}`}
                  onClick={() => void onCheckIn()}
                >
                  <Text>{submitting ? '打卡中...' : status?.checkedInToday ? '已打卡' : `打卡 +${status?.dailyReward ?? 60}′`}</Text>
                </View>
              </View>
              <View className="ci__stats">
                <View className="ci__stat">
                  <Text className="ci__stat-label">连续打卡</Text>
                  <Text className="ci__stat-value">{status?.currentStreak ?? 0}<Text className="ci__stat-unit"> 天</Text></Text>
                </View>
                <View className="ci__stat">
                  <Text className="ci__stat-label">最长连续</Text>
                  <Text className="ci__stat-value">{status?.longestStreak ?? 0}<Text className="ci__stat-unit"> 天</Text></Text>
                </View>
                <View className="ci__stat">
                  <Text className="ci__stat-label">今年累计</Text>
                  <Text className="ci__stat-value">{status?.yearCheckIns ?? 0}<Text className="ci__stat-unit"> 天</Text></Text>
                </View>
              </View>
            </View>

            <View className="ci__card">
              <View className="ci__card-head">
                <Text className="ci__card-title">连击奖励</Text>
                <Text className="ci__card-hint">连续打卡天数越多，每日奖励越高</Text>
              </View>
              <View className="ci__tiers">
                {tiers.map((tier) => {
                  const done = streak >= tier.days
                  const next = status?.nextStreakBonusDays === tier.days && !status?.checkedInToday
                  return (
                    <View key={tier.days} className={`ci__tier ${done ? 'ci__tier--done' : next ? 'ci__tier--next' : ''}`}>
                      <Text className="ci__tier-days">{tier.days}天</Text>
                      <Text className="ci__tier-minutes">{tier.minutes}′</Text>
                    </View>
                  )
                })}
              </View>
            </View>

            <View className="ci__card">
              <View className="ci__card-head">
                <Text className="ci__card-title">打卡记录</Text>
                <Text className="ci__card-hint">最近 {cells.length} 天</Text>
              </View>
              <View className="ci__heatmap">
                {cells.map((checked, i) => (
                  <View key={i} className={`ci__cell ${checked ? 'ci__cell--checked' : ''}`} />
                ))}
              </View>
              <View className="ci__legend">
                <Text className="ci__legend-text">未打卡</Text>
                <View className="ci__cell" />
                <View className="ci__cell ci__cell--checked" />
                <Text className="ci__legend-text">已打卡</Text>
              </View>
            </View>
          </>
        )}
        <View style={{ height: '48rpx' }} />
      </ScrollView>
    </View>
  )
}
