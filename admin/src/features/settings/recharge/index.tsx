import { ContentSection } from '../components/content-section'
import { RechargePanel } from './recharge'

export function SettingsRecharge() {
  return (
    <ContentSection
      wide
      title='账户充值'
      desc='为账户余额充值，可查看历史充值记录。此页面为演示，不会发生真实扣款。'
    >
      <RechargePanel />
    </ContentSection>
  )
}
