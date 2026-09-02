import { createFileRoute } from '@tanstack/react-router'
import { SettingsInviteCode } from '@/features/settings/invite-code'

export const Route = createFileRoute('/_authenticated/settings/invite-code')({
  component: SettingsInviteCode,
})
