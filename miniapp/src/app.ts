import { useEffect } from 'react'
import { useDidShow, useDidHide } from '@tarojs/taro'
import { useAuthStore } from './stores/authStore'
// 全局样式
import './app.scss'

function App(props) {
  const hydrate = useAuthStore((s) => s.hydrate)

  // 启动时从 Taro Storage 恢复登录状态
  useEffect(() => {
    hydrate()
    // 字体说明：
    // - H5 端：通过 index.html 的 <link> 加载 Google Fonts（Plus Jakarta Sans）
    // - 小程序端：Google Fonts 在国内被墙，直接 fallback 到 PingFang SC / 系统字体
    // - RN 端：用系统字体
    // app.scss 的 --font-sans 已按优先级排列，加载不到 Plus Jakarta Sans 时自动 fallback
  }, [hydrate])

  // 对应 onShow
  useDidShow(() => {})

  // 对应 onHide
  useDidHide(() => {})

  return props.children
}

export default App
