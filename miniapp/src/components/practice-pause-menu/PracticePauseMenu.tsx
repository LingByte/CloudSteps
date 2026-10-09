import { Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { finishPracticeBilling } from '../../utils/practiceBilling'
import { getReviewReturnPath } from '../../utils/reviewPractice'
import './practice-pause-menu.scss'

type Props = { open: boolean; onResume: () => void; onClose: () => void; reportUrl?: string }

export function PracticePauseMenu({ open, onResume, onClose, reportUrl }: Props) {
  if (!open) return null
  const isReview = Taro.getStorageSync('lb_mode') === 'review'
  const homePath = reportUrl || (isReview ? getReviewReturnPath('/pages/word-training/index') : '/pages/word-training/index')
  const exit = () => {
    onClose()
    void (async () => {
      if (isReview) {
        Taro.removeStorageSync('lb_review_return')
        Taro.removeStorageSync('lb_mode')
      } else {
        await finishPracticeBilling()
      }
      Taro.reLaunch({ url: homePath }).catch(() => Taro.redirectTo({ url: homePath }))
    })()
  }
  return <View className="practice-pause-mask"><View className="practice-pause-panel"><Text className="practice-pause-title">暂停练习</Text><Text className="practice-pause-desc">当前进度已自动保存，可以继续练习。</Text><View className="practice-pause-primary" onClick={onResume}><Text>继续练习</Text></View><View className="practice-pause-secondary" onClick={exit}><Text>退出当前流程</Text></View></View></View>
}
