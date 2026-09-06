export const OFFICIAL_AVATAR = '/logo.png'
export const DEFAULT_USER_AVATAR = '/default-teacher-avatar.png'
export const ALL = 'all'
export const POLL_MS = 4000
export const DEFAULT_INBOX_TITLE = '关于你的反馈'

export type FeedbackReply = {
  id: number
  role: string
  content: string
  createdAt?: string
}

export type FeedbackTicket = {
  id: number
  userId: number | string
  userName?: string
  userEmail?: string
  userAvatar?: string
  content: string
  contact?: string
  status: string
  userUnread?: boolean
  lastRepliedAt?: string
  lastReplierRole?: string
  lastReplyPreview?: string
  replyCount: number
  createdAt?: string
  replies?: FeedbackReply[]
}

/** 站内信总结宏（只发 inbox，不写工单） */
export const INBOX_MACROS: {
  id: string
  label: string
  title: string
  body: string
}[] = [
  {
    id: 'ack',
    label: '已收到',
    title: '反馈处理进度',
    body: '你好，已收到你的反馈，我们正在排查。有进展会在「反馈给我们」的工单里同步，也可随时在工单补充信息。',
  },
  {
    id: 'fixed',
    label: '已修复',
    title: '反馈问题已处理',
    body: '你好，你反馈的问题已经修复。请刷新页面或重新打开应用后再试；若仍异常，请到「反馈给我们」继续留言并附上最新截图。',
  },
  {
    id: 'need-info',
    label: '需补充信息',
    title: '反馈需要补充信息',
    body: '你好，为了尽快定位，请到「反馈给我们」补充：1）复现步骤；2）出现时间；3）截图或报错原文。收到后我们会继续跟进。',
  },
  {
    id: 'not-bug',
    label: '非缺陷说明',
    title: '关于你的反馈',
    body: '你好，经确认这是当前设计/预期行为，不是缺陷。如有其他使用上的困扰，欢迎继续在「反馈给我们」说明，我们再一起看。',
  },
  {
    id: 'roadmap',
    label: '后续优化',
    title: '反馈已记录',
    body: '你好，你的建议我们已经记录，会纳入后续优化排期。有明确版本计划时会再通知你，感谢反馈。',
  },
  {
    id: 'close-thanks',
    label: '结案感谢',
    title: '反馈已结案',
    body: '你好，按你提供的信息，当前问题已处理完毕。若之后还有异常，请到「反馈给我们」新开或继续留言。感谢你的耐心。',
  },
]

export function ticketBadge(row: FeedbackTicket) {
  if (row.status === 'closed') {
    return { label: '已关闭', variant: 'secondary' as const }
  }
  if (row.lastReplierRole === 'admin') {
    return { label: '已回复', variant: 'outline' as const }
  }
  return { label: '待回应', variant: 'default' as const }
}

export function userReadBadge(row: FeedbackTicket) {
  if (row.userUnread) {
    return { label: '用户未读', variant: 'destructive' as const }
  }
  return { label: '用户已读', variant: 'secondary' as const }
}
