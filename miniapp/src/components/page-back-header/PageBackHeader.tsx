import type { ReactNode } from 'react'
import { View, Text } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { ArrowLeft } from '@nutui/icons-react-taro'
import './page-back-header.scss'

type PageBackHeaderProps = {
  title: string
  subtitle?: string
  onBack?: () => void
  fallbackTo?: string
  extra?: ReactNode
}

const TAB_PATHS = new Set([
  '/pages/home/index',
  '/pages/lesson-prep/index',
  '/pages/wordbooks/index',
  '/pages/anti-forgetting/index',
  '/pages/coach/index',
])

export function PageBackHeader({
  title,
  subtitle,
  onBack,
  fallbackTo = '/pages/home/index',
  extra,
}: PageBackHeaderProps) {
  const handleBack = () => {
    if (onBack) {
      onBack()
      return
    }
    Taro.navigateBack({
      fail: () => {
        if (TAB_PATHS.has(fallbackTo)) Taro.switchTab({ url: fallbackTo })
        else Taro.redirectTo({ url: fallbackTo })
      },
    })
  }

  return (
    <View className="page-back-header">
      <View className="page-back-header__inner">
        <View className="page-back-header__back" onClick={handleBack}>
          <ArrowLeft size={22} color="#37352f" />
        </View>
        <View className="page-back-header__text">
          <Text className="page-back-header__title">{title}</Text>
          {subtitle ? <Text className="page-back-header__subtitle">{subtitle}</Text> : null}
        </View>
        {extra ? <View className="page-back-header__extra">{extra}</View> : null}
      </View>
    </View>
  )
}

export default PageBackHeader
