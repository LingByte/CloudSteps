import { Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { ArrowLeft, ArrowRight, Check } from '@nutui/icons-react-taro'
import { color } from '../../styles/tokens'
import './index.scss'

type Material = {
  id: number
  name: string
  enabled: boolean
  path: string
}

const materials: Material[] = [
  { id: 1, name: '词汇测试', enabled: true, path: '/pages/vocab-test/index' },
  { id: 2, name: '单词练习', enabled: true, path: '/pages/wordbooks/index' },
  { id: 3, name: '解析语法', enabled: true, path: '/pages/grammar-analysis/index' },
  { id: 4, name: '阅读理解', enabled: true, path: '/pages/reading-comprehension/index' },
  { id: 5, name: '完形填空', enabled: true, path: '/pages/cloze-practice/index' },
  { id: 6, name: '情景口语', enabled: true, path: '/pages/scenario-selection/index' },
]

export default function MaterialSelection() {
  const handleMaterialClick = (material: Material) => {
    if (!material.enabled || !material.path) return
    Taro.navigateTo({ url: material.path })
  }

  return (
    <View className="material-selection">
      <View className="material-selection__nav">
        <View className="material-selection__nav-row">
          <View className="material-selection__back" onClick={() => Taro.navigateBack()}>
            <ArrowLeft size={18} color={color.charcoal} />
          </View>
          <Text className="material-selection__title">选择学习材料</Text>
        </View>
      </View>

      <View className="material-selection__content">
        <Text className="material-selection__subtitle">为你设计有针对性的资料，迅速提高水平</Text>
        <View className="material-selection__list">
          {materials.map((material) => (
            <View
              key={material.id}
              className={`material-selection__item ${!material.enabled ? 'material-selection__item--disabled' : ''}`}
              onClick={() => handleMaterialClick(material)}
            >
              <Text className={`material-selection__item-title ${!material.enabled ? 'material-selection__item-title--disabled' : ''}`}>{material.name}</Text>
              {material.enabled ? <Check size={18} color="#66bb6a" /> : null}
            </View>
          ))}
        </View>
      </View>

      <View className="material-selection__float" onClick={() => Taro.navigateTo({ url: '/pages/wordbooks/index' })}>
        <ArrowRight size={20} color="#ffffff" />
      </View>
    </View>
  )
}
