import { ContentSection } from '../components/content-section'
import { InviteCodePanel } from './invite-code'

export function SettingsInviteCode() {
  return (
    <ContentSection
      wide
      title='邀请码'
      desc='查看你的专属邀请码与邀请记录，分享给好友即可邀请注册。'
    >
      <InviteCodePanel />
    </ContentSection>
  )
}
