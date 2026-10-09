import { useCallback, useEffect, useMemo, useState } from 'react'
import { ScrollView, Text, View } from '@tarojs/components'
import Taro, { getCurrentInstance } from '@tarojs/taro'
import { Refresh } from '@nutui/icons-react-taro'
import { CloudButton } from '../../components/button'
import { TopBar } from '../../components/top-bar/TopBar'
import { getVocabResult } from '../../api/vocab'
import { getStudentVocabRecordAsTeacher } from '../../api/coaching'
import { clearVocabTestResultCache, refreshVocabTestQuestions } from '../../utils/vocabTestCache'
import { VocabTestResultView, type VocabTestResultPayload } from '../../components/vocab-test-result-view/VocabTestResultView'
import { color } from '../../styles/tokens'
import './index.scss'

function normalizeVocabResult(raw: any): VocabTestResultPayload | null {
  const data = raw?.record || raw
  if (!data) return null
  const estimatedVocab = Number(data.estimatedVocab)
  const correctCount = Number(data.correctCount)
  const totalCount = Number(data.totalCount ?? data.questionCount)
  if (!data.level && !data.estimatedLevel && !Number.isFinite(estimatedVocab)) return null
  return {
    level: String(data.level ?? data.estimatedLevel ?? ''),
    estimatedVocab: Number.isFinite(estimatedVocab) ? estimatedVocab : 0,
    correctCount: Number.isFinite(correctCount) ? correctCount : 0,
    totalCount: Number.isFinite(totalCount) ? totalCount : 0,
  }
}

export default function VocabTestResult() {
  const params = getCurrentInstance().router?.params || {}
  const studentId = String(params.studentId || '')
  const recordId = String(params.recordId || '')
  const isHistory = Boolean(studentId && recordId)
  const [result, setResult] = useState<VocabTestResultPayload | null>(null)
  const [loading, setLoading] = useState(true)

  const handleBack = useCallback(() => {
    Taro.navigateBack({ delta: 1 }).catch(() => {
      if (isHistory) {
        Taro.redirectTo({ url: `/pages/student-detail/index?id=${encodeURIComponent(studentId)}&tab=vocab` })
      } else {
        Taro.reLaunch({ url: '/pages/home/index' })
      }
    })
  }, [isHistory, studentId])

  const loadResult = useCallback(async () => {
    setLoading(true)
    try {
      setResult(null)
      if (isHistory) {
        const res = await getStudentVocabRecordAsTeacher(studentId, recordId)
        if (res.code === 200) setResult(normalizeVocabResult(res.data))
        return
      }
      const cached = Taro.getStorageSync('vocabulary_test_result')
      if (cached) {
        const parsed = normalizeVocabResult(typeof cached === 'string' ? JSON.parse(cached) : cached)
        if (parsed) {
          setResult(parsed)
          return
        }
        Taro.removeStorageSync('vocabulary_test_result')
      }
      const res = await getVocabResult()
      if (res.code === 200) setResult(normalizeVocabResult(res.data))
    } catch {
      /* noop */
    } finally {
      setLoading(false)
    }
  }, [isHistory, studentId, recordId])

  useEffect(() => { void loadResult() }, [loadResult])

  useEffect(() => {
    if (!result || isHistory) return
    refreshVocabTestQuestions().catch(() => {})
  }, [result, isHistory])

  const hasResult = useMemo(() => Boolean(result), [result])

  return (
    <View className="vtr-page">
      <TopBar title="测试结果" onBack={handleBack} />
      <ScrollView className="vtr-page__body" scrollY enableFlex>
        {loading ? <View className="vtr-page__loading"><Text>结果加载中...</Text></View> : !hasResult || !result ? (
          <View className="vtr-page__empty">
            <Text className="vtr-page__empty-title">暂无测试结果</Text>
            <Text className="vtr-page__empty-desc">{isHistory ? '这条测评记录不存在或无权查看' : '去开始一次词汇量测试吧'}</Text>
            <CloudButton variant="brand" size="pill" className="vtr-page__empty-btn" onClick={() => isHistory ? handleBack() : Taro.redirectTo({ url: '/pages/vocab-test/index' })}>{isHistory ? '返回' : '去测试'}</CloudButton>
          </View>
        ) : (
          <View className="vtr-page__result">
            <VocabTestResultView result={result} />
            {isHistory ? <CloudButton variant="outline" size="pill" className="vtr-page__action" onClick={handleBack}>返回</CloudButton> : (
              <>
                <View className="vtr-page__actions">
                  <CloudButton variant="brand" size="pill" className="vtr-page__action" onClick={() => { clearVocabTestResultCache(); Taro.redirectTo({ url: '/pages/vocab-test-testing/index' }) }}>重新测试</CloudButton>
                  <CloudButton variant="outline" size="pill" className="vtr-page__action" onClick={handleBack}>返回</CloudButton>
                </View>
                <CloudButton variant="outline" size="pill" className="vtr-page__refresh" onClick={() => void loadResult()}><Refresh size={16} color={color.mutedForeground} /> 刷新结果</CloudButton>
              </>
            )}
          </View>
        )}
      </ScrollView>
    </View>
  )
}
