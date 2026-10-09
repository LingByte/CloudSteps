import type { ReactNode } from 'react'
import { View, Text } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { ArrowLeft } from '@nutui/icons-react-taro'
import './top-bar.scss'

type TopBarProps = {
  title: string
  onBack?: () => void
  rightSlot?: ReactNode
}

export function TopBar({ title, onBack, rightSlot }: TopBarProps) {
  const handleBack = () => {
    if (onBack) onBack()
    else Taro.navigateBack()
  }

  return (
    <View className="top-bar">
      <View className="top-bar__inner">
        <View className="top-bar__left">
          <View className="top-bar__back" onClick={handleBack}>
            <ArrowLeft size={18} color="#2D3748" />
          </View>
        </View>
        <View className="top-bar__title-wrap">
          <Text className="top-bar__title">{title}</Text>
        </View>
        <View className="top-bar__right">{rightSlot}</View>
      </View>
    </View>
  )
}

export default TopBar
