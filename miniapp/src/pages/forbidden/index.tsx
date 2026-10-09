import { View, Text } from '@tarojs/components'
import Taro from '@tarojs/taro'
import './index.scss'

export default function Forbidden() {
  return (
    <View className="forbidden">
      <View className="fb__card">
        <Text className="fb__title">无权访问</Text>
        <Text className="fb__desc">你没有访问该页面的权限，请联系管理员。</Text>
        <View className="fb__btns">
          <View className="fb__btn fb__btn--primary" onClick={() => Taro.navigateBack().catch(() => Taro.reLaunch({ url: '/pages/home/index' }))}>
            <Text className="fb__btn-text">返回上一页</Text>
          </View>
          <View className="fb__btn fb__btn--outline" onClick={() => Taro.reLaunch({ url: '/pages/home/index' })}>
            <Text className="fb__btn-text fb__btn-text--dark">回到首页</Text>
          </View>
        </View>
      </View>
    </View>
  )
}
