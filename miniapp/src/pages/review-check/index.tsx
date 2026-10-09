/**
 * 复习检测入口 — 小程序端复用已有复习单词列表。
 */
import { useEffect } from 'react'
import { View, Text } from '@tarojs/components'
import Taro from '@tarojs/taro'
import './index.scss'

export default function ReviewCheck() {
  useEffect(() => {
    const timer = setTimeout(() => {
      Taro.redirectTo({ url: '/pages/review-word-list/index' })
    }, 500)
    return () => clearTimeout(timer)
  }, [])

  return (
    <View className="review-check-entry">
      <Text>正在打开复习列表...</Text>
    </View>
  )
}
