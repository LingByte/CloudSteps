import { useEffect, useState } from 'react'
import { View, Text, ScrollView } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { ArrowLeft } from '@nutui/icons-react-taro'
import { getSpeakingStats, type SpeakingStats } from '../../api/scenarioDialogue'
import { color } from '../../styles/tokens'
import './index.scss'

export default function ScenarioHistory() {
  const [stats, setStats] = useState<SpeakingStats | null>(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => { void getSpeakingStats().then((res) => { if (res.code === 200) setStats(res.data); setLoading(false) }, () => setLoading(false)) }, [])
  return <View className="scenario-history">
    <View className="sh__nav"><View className="sh__back" onClick={() => Taro.navigateBack()}><ArrowLeft size={22} color={color.charcoal} /></View><Text className="sh__title">练习历史</Text><View className="sh__back" /></View>
    <ScrollView className="sh__body" scrollY enableFlex>
      {loading ? <View className="sh__state"><Text>加载中...</Text></View> : !stats || stats.totalSessions === 0 ? <View className="sh__state"><Text>暂无练习记录</Text></View> : <>
        <View className="sh__stats"><View><Text className="sh__value">{stats.totalSessions}</Text><Text className="sh__label">练习次数</Text></View><View><Text className="sh__value">{Math.round(stats.totalMinutes)}</Text><Text className="sh__label">累计分钟</Text></View><View><Text className="sh__value">{stats.avgOverallScore}</Text><Text className="sh__label">平均得分</Text></View></View>
        <View className="sh__card"><Text className="sh__section-title">最近练习</Text>{stats.recentSessions.map((session) => <View key={session.id} className="sh__item" onClick={() => Taro.navigateTo({ url: `/pages/scenario-review/index?sessionId=${session.id}` })}><View className="sh__item-main"><Text className="sh__item-name">{session.scenario?.name || '情景对话'}</Text><Text className="sh__item-date">{session.endedAt ? new Date(session.endedAt).toLocaleString('zh-CN') : '—'}</Text></View><View className="sh__score"><Text>{session.overallScore}</Text><Text>分</Text></View></View>)}</View>
      </>}
      <View style={{ height: '48rpx' }} />
    </ScrollView>
  </View>
}
