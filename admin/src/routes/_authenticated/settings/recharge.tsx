import { createFileRoute } from '@tanstack/react-router'
import { SettingsRecharge } from '@/features/settings/recharge'

export const Route = createFileRoute('/_authenticated/settings/recharge')({
  component: SettingsRecharge,
})
