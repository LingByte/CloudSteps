import { useEffect, useState } from 'react'
import { Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { Star } from '@nutui/icons-react-taro'
import { CloudButton } from '../../components/button'
import { TopBar } from '../../components/top-bar/TopBar'
import { getTrainingStudent } from '../../utils/trainingStudent'
import { clearVocabTestResultCache, loadCachedVocabQuestions, prefetchVocabTestQuestions } from '../../utils/vocabTestCache'
import { useAuthStore } from '../../stores/authStore'
import { color } from '../../styles/tokens'
import './index.scss'

export default function VocabTest() {
  const [preparing, setPreparing] = useState(() => !loadCachedVocabQuestions()?.length)
  const role = useAuthStore((s) => s.user)?.role || 'user'
  const isCoach = role === 'user' || role === 'admin' || role === 'teacher'
  const boundStudent = isCoach ? getTrainingStudent() : null

  useEffect(() => {
    prefetchVocabTestQuestions().then(
      () => setPreparing(false),
      () => setPreparing(false)
    )
  }, [])

  const handleBack = () => {
    Taro.navigateBack({ delta: 1 }).catch(() => Taro.reLaunch({ url: '/pages/home/index' }))
  }

  const handleStart = () => {
    if (preparing) return
    if (isCoach && !boundStudent?.id) {
      Taro.showToast({ title: '请先在首页选择学员', icon: 'none' })
      Taro.reLaunch({ url: '/pages/home/index' })
      return
    }
    clearVocabTestResultCache()
    Taro.navigateTo({ url: '/pages/vocab-test-testing/index' })
  }

  return (
    <View className="vocab-test">
      <TopBar title="词汇测试" onBack={handleBack} />
      <View className="vocab-test__center">
        <View className="vocab-test__panel">
          <View className="vocab-test__intro">
            <Text className="vocab-test__title">测一测你的词汇量</Text>
            <Text className="vocab-test__desc">{boundStudent?.name ? `本次测评将记入「${boundStudent.name}」的词汇测试记录` : '花几分钟测试一下，定位你的词汇水平'}</Text>
          </View>
          <View className="vocab-test__icon-wrap">
            <View className="vocab-test__icon-circle"><Star size={36} color={color.primary} /></View>
          </View>
          <CloudButton variant="brand" size="pillLg" className="vocab-test__start" loading={preparing} loadingText="正在准备题目…" onClick={() => void handleStart()}>开始测试</CloudButton>
          <Text className="vocab-test__tip">诚实做题可以得到真实的测试结果</Text>
        </View>
      </View>
    </View>
  )
}
