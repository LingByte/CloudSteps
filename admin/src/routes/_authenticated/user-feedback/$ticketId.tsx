import { createFileRoute } from '@tanstack/react-router'
import { UserFeedbackTicketPage } from '@/features/user-feedback'

export const Route = createFileRoute('/_authenticated/user-feedback/$ticketId')({
  component: UserFeedbackTicketRoute,
})

function UserFeedbackTicketRoute() {
  const { ticketId } = Route.useParams()
  return <UserFeedbackTicketPage ticketId={ticketId} />
}
