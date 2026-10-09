/**
 * 学习报告 — 对齐 web/src/pages/SessionReport.tsx。
 *
 * 从 storage 读取会话 ID，调用 API 获取报告数据并展示。
 */
import { useEffect, useState } from 'react'
import { View, Text, ScrollView } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { ArrowLeft } from '@nutui/icons-react-taro'
import {
  getStudySessionReport,
  type StudySessionReport,
} from '../../api/study'
import { clearStudyRetry } from '../../utils/studyBatchFlow'
import { color } from '../../styles/tokens'
import './index.scss'

export default function SessionReport() {
  const [report, setReport] = useState<StudySessionReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    const sessionId = Taro.getStorageSync('lb_study_session_id')
    if (!sessionId) {
      setErr('未找到会话信息')
      setLoading(false)
      return
    }
    void (async () => {
      try {
        const res = await getStudySessionReport(sessionId)
        if (res.code !== 200 || !res.data) {
          setErr(res.msg || '加载报告失败')
          return
        }
        setReport(res.data)
      } catch (e: unknown) {
        const msg = e && typeof e === 'object' && 'msg' in e ? String((e as { msg: string }).msg) : '加载报告失败'
        setErr(msg)
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  const handleCopyReport = () => {
    if (!report) return
    const text = [
      `学习报告：${report.wordBookName}`,
      `学员：${report.studentName || '—'}`,
      `练习词数：${report.wordCount}`,
      `记住：${report.correctCount}`,
      `忘记：${report.forgotCount}`,
      `正确率：${report.accuracyPercent}%`,
      report.reportSummary ? `AI 报告：${report.reportSummary}` : '',
    ].filter(Boolean).join('\\n')
    Taro.setClipboardData({ data: text }).then(() => Taro.showToast({ title: '报告已复制', icon: 'success' })).catch(() => Taro.showToast({ title: '复制失败', icon: 'none' }))
  }

  const handleBack = () => {
    // 清理会话数据
    Taro.removeStorageSync('lb_study_session_id')
    Taro.removeStorageSync('lb_study_words')
    Taro.removeStorageSync('lb_study_results')
    Taro.removeStorageSync('lb_study_all_words')
    Taro.removeStorageSync('lb_study_total_batches')
    Taro.removeStorageSync('lb_study_batch_idx')
    Taro.removeStorageSync('lb_study_batch_results')
    Taro.removeStorageSync('lb_study_check_phase')
    Taro.removeStorageSync('lb_mode')
    clearStudyRetry()
    // 与 web 一致：报告完成后进入抗遗忘设置
    Taro.redirectTo({ url: '/pages/create-anti-forgetting/index' })
  }

  return (
    <View className="sr">
      {/* 顶部导航 */}
      <View className="sr__navbar">
        <View className="sr__nav-btn" onClick={handleBack}>
          <ArrowLeft size={22} color={color.charcoal} />
        </View>
        <Text className="sr__nav-title">学习报告</Text>
        <View className="sr__nav-btn" />
      </View>

      <ScrollView className="sr__body" scrollY enableFlex>
        {loading ? (
          <View className="sr__state">
            <Text className="sr__state-text">加载报告中...</Text>
          </View>
        ) : err ? (
          <View className="sr__state">
            <Text className="sr__state-text">{err}</Text>
          </View>
        ) : report ? (
          <View className="sr__content">
            {/* 概览卡片 */}
            <View className="sr__overview">
              <Text className="sr__overview-title">{report.wordBookName}</Text>
              <Text className="sr__overview-student">学员: {report.studentName || '—'}</Text>
              <Text className="sr__overview-time">
                {report.startedAt ? new Date(report.startedAt).toLocaleString('zh-CN') : ''}
              </Text>
            </View>

            {/* 核心数据 */}
            <View className="sr__stats-grid">
              <View className="sr__stat-card sr__stat-card--mint">
                <Text className="sr__stat-value">{report.wordCount}</Text>
                <Text className="sr__stat-label">练习词数</Text>
              </View>
              <View className="sr__stat-card sr__stat-card--green">
                <Text className="sr__stat-value">{report.correctCount}</Text>
                <Text className="sr__stat-label">记住</Text>
              </View>
              <View className="sr__stat-card sr__stat-card--red">
                <Text className="sr__stat-value">{report.forgotCount}</Text>
                <Text className="sr__stat-label">忘记</Text>
              </View>
              <View className="sr__stat-card sr__stat-card--sky">
                <Text className="sr__stat-value">{report.accuracyPercent}%</Text>
                <Text className="sr__stat-label">正确率</Text>
              </View>
            </View>

            {/* 筛查数据 */}
            <View className="sr__section">
              <Text className="sr__section-title">筛查数据</Text>
              <View className="sr__info-card">
                <View className="sr__info-row">
                  <Text className="sr__info-label">已认识</Text>
                  <Text className="sr__info-value">{report.screenedKnownCount} 词</Text>
                </View>
                <View className="sr__info-row">
                  <Text className="sr__info-label">不认识</Text>
                  <Text className="sr__info-value">{report.screenedUnknownCount} 词</Text>
                </View>
                <View className="sr__info-row">
                  <Text className="sr__info-label">用时</Text>
                  <Text className="sr__info-value">{report.durationMinutes} 分钟</Text>
                </View>
              </View>
            </View>

            {/* 进度数据 */}
            {report.wordBookWordCount ? (
              <View className="sr__section">
                <Text className="sr__section-title">词库进度</Text>
                <View className="sr__info-card">
                  <View className="sr__info-row">
                    <Text className="sr__info-label">词库总词数</Text>
                    <Text className="sr__info-value">{report.wordBookWordCount}</Text>
                  </View>
                  <View className="sr__info-row">
                    <Text className="sr__info-label">已学词数</Text>
                    <Text className="sr__info-value">{report.learnedCount ?? 0}</Text>
                  </View>
                  <View className="sr__info-row">
                    <Text className="sr__info-label">剩余待学</Text>
                    <Text className="sr__info-value">{report.remainPending}</Text>
                  </View>
                </View>
              </View>
            ) : null}

            {/* 忘记的单词 */}
            {report.forgotWords && report.forgotWords.length > 0 && (
              <View className="sr__section">
                <Text className="sr__section-title">忘记的单词 ({report.forgotWords.length})</Text>
                <View className="sr__word-tags">
                  {report.forgotWords.map((w, i) => (
                    <View key={i} className="sr__word-tag sr__word-tag--wrong">
                      <Text className="sr__word-tag-text">{w}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* 已学的单词 */}
            {report.studiedWords && report.studiedWords.length > 0 && (
              <View className="sr__section">
                <Text className="sr__section-title">已学单词 ({report.studiedWords.length})</Text>
                <View className="sr__word-tags">
                  {report.studiedWords.map((w, i) => (
                    <View key={i} className="sr__word-tag sr__word-tag--correct">
                      <Text className="sr__word-tag-text">{w}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* AI 报告 */}
            {report.reportSummary ? (
              <View className="sr__section">
                <Text className="sr__section-title">AI 课堂报告</Text>
                <View className="sr__ai-card">
                  <Text className="sr__ai-text">{report.reportSummary}</Text>
                </View>
              </View>
            ) : null}

            <View style={{ height: '140rpx' }} />
          </View>
        ) : null}
      </ScrollView>

      {/* 底部按钮 */}
      <View className="sr__bottom-bar">
        {report ? <View className="sr__btn sr__btn--secondary" onClick={handleCopyReport}><Text className="sr__btn-text">复制报告</Text></View> : null}
        <View className="sr__btn sr__btn--primary" onClick={handleBack}>
          <Text className="sr__btn-text">完成</Text>
        </View>
      </View>
    </View>
  )
}
