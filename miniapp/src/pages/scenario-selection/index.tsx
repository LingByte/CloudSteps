/**
 * 情景口语页 — 对齐 web/src/pages/ScenarioSelection.tsx。
 *
 * 移动端布局:
 *  1. 顶部导航:返回 + "情景口语"
 *  2. 口语能力概览卡片:综合分 + 练习次数 + 累计分钟
 *  3. 场景列表:场景图标 + 名称 + 难度标签 + 描述
 *  4. 点击场景 startSession → scenario-dialogue 实时语音页
 */
import { useEffect, useState } from 'react'
import { View, Text, ScrollView } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { ArrowLeft, Star, Clock, Plus } from '@nutui/icons-react-taro'
import {
  listScenarios,
  getSpeakingStats,
  startSession,
  type Scenario,
  type SpeakingStats,
} from '../../api/scenarioDialogue'
import { color } from '../../styles/tokens'
import './index.scss'

const difficultyLabel: Record<string, string> = {
  easy: '入门',
  medium: '进阶',
  hard: '挑战',
}

const difficultyColor: Record<string, { bg: string; text: string }> = {
  easy: { bg: color.successSoft10, text: color.success },
  medium: { bg: 'rgba(85, 163, 255, 0.1)', text: color.secondaryBrand },
  hard: { bg: color.wrongSoft10, text: color.wrong },
}

function scenarioInitial(s: Scenario) {
  return (s.name || '?').trim().slice(0, 1).toUpperCase() || '?'
}

export default function ScenarioSelection() {
  const [scenarios, setScenarios] = useState<Scenario[]>([])
  const [stats, setStats] = useState<SpeakingStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [starting, setStarting] = useState<number | null>(null)

  useEffect(() => {
    let mounted = true
    Promise.all([listScenarios(), getSpeakingStats()])
      .then(([scRes, stRes]) => {
        if (!mounted) return
        if (scRes.code === 200) setScenarios(scRes.data || [])
        if (stRes.code === 200) setStats(stRes.data)
      })
      .catch(() => {
        // 忽略
      })
      .then(() => {
        if (mounted) setLoading(false)
      })
    return () => {
      mounted = false
    }
  }, [])

  const handleSelect = async (s: Scenario) => {
    if (starting) return
    setStarting(s.id)
    try {
      const res = await startSession(s.id)
      if (res.code !== 200 || !res.data) {
        Taro.showToast({ title: res.msg || '创建会话失败', icon: 'none' })
        return
      }
      Taro.setStorageSync('lb_scenario_session', JSON.stringify(res.data))
      Taro.navigateTo({ url: '/pages/scenario-dialogue/index' })
    } catch (e: any) {
      Taro.showToast({ title: e?.msg || '创建会话失败', icon: 'none' })
    } finally {
      setStarting(null)
    }
  }

  return (
    <View className="scenario">
      {/* 顶部导航栏 */}
      <View className="scenario__navbar">
        <View className="scenario__nav-btn" onClick={() => Taro.navigateBack()}>
          <ArrowLeft size={22} color={color.charcoal} />
        </View>
        <Text className="scenario__nav-title">情景口语</Text>
        <View className="scenario__nav-actions">
          <View className="scenario__nav-btn" onClick={() => Taro.navigateTo({ url: '/pages/scenario-history/index' })}>
            <Clock size={18} color={color.charcoal} />
          </View>
          <View className="scenario__nav-btn" onClick={() => Taro.navigateTo({ url: '/pages/create-custom-scenario/index' })}>
            <Plus size={18} color={color.primary} />
          </View>
        </View>
      </View>

      <ScrollView className="scenario__body" scrollY enableFlex>
        {/* 流程提示 */}
        <Text className="scenario__flow">选择场景 → 语音对话 → 实时纠错 → 课后复盘</Text>

        {/* 口语能力概览 */}
        {stats && stats.totalSessions > 0 && (
          <View className="scenario__stats">
            <View className="scenario__stats-header">
              <View className="scenario__stats-header-left">
                <Star size={16} color={color.primary} />
                <Text className="scenario__stats-title">口语能力概览</Text>
              </View>
            </View>
            <View className="scenario__stats-grid">
              <View className="scenario__stat-card scenario__stat-card--mint">
                <Text className="scenario__stat-value scenario__stat-value--primary">
                  {stats.avgOverallScore}
                </Text>
                <Text className="scenario__stat-label">综合分</Text>
              </View>
              <View className="scenario__stat-card scenario__stat-card--sky">
                <Text className="scenario__stat-value scenario__stat-value--blue">
                  {stats.totalSessions}
                </Text>
                <Text className="scenario__stat-label">练习次数</Text>
              </View>
              <View className="scenario__stat-card scenario__stat-card--soft">
                <Text className="scenario__stat-value scenario__stat-value--green">
                  {Math.round(stats.totalMinutes)}
                </Text>
                <Text className="scenario__stat-label">累计分钟</Text>
              </View>
            </View>
          </View>
        )}

        {/* 场景列表 */}
        {loading ? (
          <View className="scenario__state">
            <Text className="scenario__state-text">加载场景中...</Text>
          </View>
        ) : scenarios.length === 0 ? (
          <View className="scenario__empty">
            <Text className="scenario__empty-text">暂无可用场景</Text>
          </View>
        ) : (
          <View className="scenario__list">
            {scenarios.map((s) => {
              const diff = difficultyColor[s.difficulty] || difficultyColor.medium
              const label = difficultyLabel[s.difficulty] || s.difficulty
              return (
                <View
                  key={s.id}
                  className="scenario__item"
                  onClick={() => void handleSelect(s)}
                >
                  <View className="scenario__item-main">
                    <View
                      className="scenario__item-icon"
                      style={{ backgroundColor: diff.bg }}
                    >
                      <Text className="scenario__item-icon-text" style={{ color: diff.text }}>
                        {scenarioInitial(s)}
                      </Text>
                    </View>
                    <View className="scenario__item-info">
                      <View className="scenario__item-title-row">
                        <Text className="scenario__item-name">{s.name}</Text>
                        <View
                          className="scenario__item-tag"
                          style={{ backgroundColor: diff.bg }}
                        >
                          <Text className="scenario__item-tag-text" style={{ color: diff.text }}>
                            {label}
                          </Text>
                        </View>
                      </View>
                      <Text className="scenario__item-desc">{s.description}</Text>
                    </View>
                  </View>
                </View>
              )
            })}
          </View>
        )}
        <View style={{ height: '48rpx' }} />
      </ScrollView>
    </View>
  )
}
