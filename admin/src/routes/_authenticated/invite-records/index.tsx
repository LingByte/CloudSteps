import { createFileRoute } from '@tanstack/react-router'
import { InviteRecordsPage } from '@/features/invite-records'

export const Route = createFileRoute('/_authenticated/invite-records/')({
  component: InviteRecordsPage,
})
