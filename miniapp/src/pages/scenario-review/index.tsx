import { useEffect, useState } from 'react'
import { View, Text, ScrollView } from '@tarojs/components'
import Taro, { getCurrentInstance } from '@tarojs/taro'
import { ArrowLeft } from '@nutui/icons-react-taro'
import { getSession, type ScenarioSession } from '../../api/scenarioDialogue'
import { color } from '../../styles/tokens'
import './index.scss'

export default function ScenarioReview() {
  const id = Number(getCurrentInstance().router?.params?.sessionId)
  const [session, setSession] = useState<ScenarioSession | null>(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => { if (!id) { setLoading(false); return } void getSession(id).then((res) => { if (res.code === 200) setSession(res.data); setLoading(false) }, () => setLoading(false)) }, [id])
  const score = (label: string, value: number) => <View className="sr2__score-row"><Text>{label}</Text><Text>{value}</Text><View className="sr2__bar"><View style={{ width: `${Math.max(0, Math.min(100, value))}%` }} /></View></View>
  return <View className="scenario-review"><View className="sr2__nav"><View className="sr2__back" onClick={() => Taro.navigateBack()}><ArrowLeft size={22} color={color.charcoal} /></View><Text className="sr2__title">练习复盘</Text><View className="sr2__back" /></View><ScrollView className="sr2__body" scrollY enableFlex>{loading ? <View className="sr2__state"><Text>加载中...</Text></View> : !session ? <View className="sr2__state"><Text>未找到练习记录</Text></View> : <View className="sr2__content"><View className="sr2__hero"><Text className="sr2__scenario">{session.scenario?.name || '情景对话'}</Text><Text className="sr2__overall">{session.overallScore}</Text><Text className="sr2__muted">综合得分 · {Math.max(1, Math.round(session.durationSec / 60))} 分钟 · {session.turnCount} 轮对话</Text></View><View className="sr2__card"><Text className="sr2__section">能力评分</Text>{score('流利度', session.fluencyScore)}{score('准确度', session.accuracyScore)}{score('发音', session.pronunciationScore)}{session.analysis ? score('词汇', session.analysis.vocabularyScore) : null}</View>{session.reviewSummary ? <View className="sr2__card"><Text className="sr2__section">复盘总结</Text><Text className="sr2__text">{session.reviewSummary}</Text></View> : null}{session.analysis?.aiAnalysis ? <View className="sr2__card"><Text className="sr2__section">AI 教练分析</Text><Text className="sr2__text">{session.analysis.aiAnalysis}</Text></View> : null}{session.turns?.length ? <View className="sr2__card"><Text className="sr2__section">对话记录</Text>{session.turns.map((turn) => <View key={turn.id} className={`sr2__turn ${turn.role === 'user' ? 'sr2__turn--user' : ''}`}><Text className="sr2__turn-role">{turn.role === 'user' ? '我' : 'AI'}</Text><Text className="sr2__text">{turn.content}</Text></View>)}</View> : null}</View>}<View style={{ height: '48rpx' }} /></ScrollView></View>
}
