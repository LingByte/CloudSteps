import { useEffect, useState } from 'react'
import { View, Text, ScrollView } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { ArrowLeft, Copy } from '@nutui/icons-react-taro'
import { fetchMyInvite, rotateInviteCode, type InviteOverview } from '../../api/invite'
import { color } from '../../styles/tokens'
import './index.scss'
export default function InviteCode() {
  const [data, setData] = useState<InviteOverview | null>(null); const [loading, setLoading] = useState(true); const [rotating, setRotating] = useState(false)
  const load = async () => { try { const res = await fetchMyInvite(); if (res.code === 200) setData(res.data) } finally { setLoading(false) } }
  useEffect(() => { void load() }, [])
  const copy = () => { if (!data?.code) return; Taro.setClipboardData({ data: data.code }); Taro.showToast({ title: '已复制', icon: 'success' }) }
  const rotate = async () => { setRotating(true); try { const res = await rotateInviteCode(); if (res.code === 200) setData(res.data); else Taro.showToast({ title: res.msg || '操作失败', icon: 'none' }) } finally { setRotating(false) } }
  return <View className="invite"><View className="ic__nav"><View className="ic__back" onClick={() => Taro.navigateBack()}><ArrowLeft size={22} color={color.charcoal} /></View><Text className="ic__title">邀请码</Text><View className="ic__back" /></View><ScrollView className="ic__body" scrollY enableFlex>{loading ? <View className="ic__state"><Text>加载中...</Text></View> : data ? <><View className="ic__code-card"><Text className="ic__hint">分享邀请码，邀请好友加入</Text><Text className="ic__code">{data.code}</Text><View className="ic__copy" onClick={copy}><Copy size={18} color="#fff" /><Text>复制邀请码</Text></View><Text className="ic__rotate" onClick={() => void rotate()}>{rotating ? '更新中...' : '更换邀请码'}</Text></View><View className="ic__stats"><View><Text>{data.totalInvited}</Text><Text>已邀请</Text></View><View><Text>{data.totalActivated}</Text><Text>已激活</Text></View><View><Text>{data.earnedMinutes}</Text><Text>奖励分钟</Text></View></View><View className="ic__list-card"><Text className="ic__section">邀请记录</Text>{data.records?.length ? data.records.map((r) => <View key={r.id} className="ic__record"><Text>{r.invitee}</Text><Text>{r.status === 'activated' ? '已激活' : '已注册'}</Text></View>) : <Text className="ic__empty">暂无邀请记录</Text>}</View></> : <View className="ic__state"><Text>暂无邀请码</Text></View>}<View style={{ height: '48rpx' }} /></ScrollView></View>
}
