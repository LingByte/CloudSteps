import { useEffect, useMemo, useState } from 'react'
import { View, Text, ScrollView, Button } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { ArrowLeft, Check } from '@nutui/icons-react-taro'
import { getTeacherTeachingPoolWithSubscription, type UserSubscription } from '../../api/coaching'
import { color } from '../../styles/tokens'
import './index.scss'

type Plan = { id: string; tab: string; name: string; period: string; price: number; monthly: string; save?: string; features: string[] }

const plans: Plan[] = [
  { id: 'monthly', tab: '月付', name: '月度会员', period: '1个月', price: 58, monthly: '¥58 / 月', features: ['全部功能无限制', '无限学习', '开通推广返佣', '优先客服支持'] },
  { id: 'quarterly', tab: '季付', name: '季度会员', period: '3个月', price: 98, monthly: '¥32.7 / 月', save: '省 ¥76', features: ['无限学习', '全部功能无限制', '开通推广返佣', '赠送 300 积分', '优先客服支持'] },
  { id: 'yearly', tab: '年付', name: '年度会员', period: '12个月', price: 198, monthly: '¥16.5 / 月', save: '比月付省 72%', features: ['无限学习', '全部功能无限制', '开通推广返佣', '赠送 1200 积分', '优先客服支持'] },
  { id: 'lifetime', tab: '永久会员', name: '永久会员', period: '永久有效', price: 498, monthly: '一次购买', save: '买断最划算', features: ['无限学习', '全部功能无限制', '开通推广返佣', '赠送 3000 积分', '优先客服支持', '后续内容持续更新'] },
]

const money = (v: number) => `¥${v % 1 === 0 ? v.toFixed(0) : v.toFixed(1)}`

export default function Recharge() {
  const [selectedId, setSelectedId] = useState('yearly')
  const [currentSub, setCurrentSub] = useState<UserSubscription | null>(null)
  const selected = useMemo(() => plans.find((p) => p.id === selectedId) ?? plans[2], [selectedId])

  useEffect(() => {
    void (async () => {
      try {
        const res = await getTeacherTeachingPoolWithSubscription()
        if (res.code === 200 && res.data) setCurrentSub(res.data.subscription ?? null)
      } catch { /* ignore */ }
    })()
  }, [])

  const subTypeText = (t?: string) => (t === 'monthly' ? '包月会员' : t === 'yearly' ? '包年会员' : '永久会员')

  return (
    <View className="recharge">
      <View className="rc__nav">
        <View className="rc__back" onClick={() => Taro.navigateBack()}><ArrowLeft size={22} color={color.charcoal} /></View>
        <Text className="rc__title">会员中心</Text>
        <View className="rc__back" />
      </View>
      <ScrollView className="rc__body" scrollY enableFlex>
        {currentSub && currentSub.status === 'active' && (
          <View className="rc__current">
            <View className="rc__current-badge">VIP</View>
            <View className="rc__current-info">
              <Text className="rc__current-name">{subTypeText(currentSub.type)} · 生效中</Text>
              <Text className="rc__current-expire">
                {currentSub.type === 'lifetime'
                  ? '买断会员 · 永久有效'
                  : `到期时间：${currentSub.expiredAt ? new Date(currentSub.expiredAt).toLocaleDateString('zh-CN') : '-'}`}
              </Text>
            </View>
          </View>
        )}

        <View className="rc__hero">
          <Text className="rc__hero-kicker">CloudSteps Plus</Text>
          <Text className="rc__hero-title">解锁完整学习能力</Text>
          <Text className="rc__hero-sub">一次购买，立即享受全部会员权益</Text>
        </View>

        <View className="rc__card">
          <View className="rc__card-head">
            <Text className="rc__card-title">选择套餐</Text>
            <Text className="rc__card-hint">按需选择，随时升级</Text>
          </View>
          <View className="rc__tabs">
            {plans.map((p) => (
              <View key={p.id} className={`rc__tab ${selectedId === p.id ? 'rc__tab--active' : ''}`} onClick={() => setSelectedId(p.id)}>
                <Text className="rc__tab-text">{p.tab}</Text>
                {p.id === 'yearly' && <Text className="rc__tab-badge">推荐</Text>}
              </View>
            ))}
          </View>
          <View className="rc__plan">
            <View className="rc__plan-top">
              <View className="rc__plan-info">
                <Text className="rc__plan-name">{selected.name}</Text>
                <Text className="rc__plan-period">{selected.period} · {selected.monthly}</Text>
              </View>
              <View className="rc__plan-price-box">
                {selected.save && <Text className="rc__save">{selected.save}</Text>}
                <Text className="rc__price">{money(selected.price)}</Text>
                <Text className="rc__price-hint">一次性支付</Text>
              </View>
            </View>
            <View className="rc__features">
              {selected.features.map((f) => (
                <View key={f} className="rc__feature">
                  <Check size={14} color={color.primary} />
                  <Text className="rc__feature-text">{f}</Text>
                </View>
              ))}
            </View>
          </View>
        </View>

        <View className="rc__card">
          <View className="rc__card-head">
            <Text className="rc__card-title">订单摘要</Text>
            <Text className="rc__noauto">不自动续费</Text>
          </View>
          <View className="rc__order-row">
            <Text className="rc__order-name">{selected.name}</Text>
            <Text className="rc__order-price">{money(selected.price)}</Text>
          </View>
          <View className="rc__order-total">
            <Text className="rc__order-label">应付金额</Text>
            <Text className="rc__order-final">{money(selected.price)}</Text>
          </View>
          <Button className="rc__pay" openType="contact">联系客服开通</Button>
          <Text className="rc__pay-hint">点击跳转微信客服会话，发送「开通会员」即可处理</Text>
        </View>
        <View style={{ height: '48rpx' }} />
      </ScrollView>
    </View>
  )
}
