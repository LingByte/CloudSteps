import { useEffect, useMemo, useRef, useState } from 'react'
import { Eye, ImagePlus, Loader2, RefreshCw, X } from 'lucide-react'
import { toast } from 'sonner'
import { get, post } from '@/lib/api'
import { formatDateTime } from '@/lib/datetime'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { AdminPage } from '@/components/admin-page'
import {
  AdminFeedbackMessageBody,
  encodeFeedbackContent,
  feedbackPreviewText,
  isFeedbackContentEmpty,
} from './message-body'

const OFFICIAL_AVATAR = '/logo.png'
const DEFAULT_USER_AVATAR = '/default-teacher-avatar.png'

type FeedbackReply = {
  id: number
  role: string
  content: string
  createdAt?: string
}

type FeedbackTicket = {
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

const ALL = 'all'
const POLL_MS = 4000

/** 站内信总结宏（只发 inbox，不写工单） */
const INBOX_MACROS: {
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

const DEFAULT_INBOX_TITLE = '关于你的反馈'

function ticketBadge(row: FeedbackTicket) {
  if (row.status === 'closed') {
    return { label: '已关闭', variant: 'secondary' as const }
  }
  if (row.lastReplierRole === 'admin') {
    return { label: '已回复', variant: 'outline' as const }
  }
  return { label: '待回应', variant: 'default' as const }
}

function userReadBadge(row: FeedbackTicket) {
  if (row.userUnread) {
    return { label: '用户未读', variant: 'destructive' as const }
  }
  return { label: '用户已读', variant: 'secondary' as const }
}

export function UserFeedbackPage() {
  const [list, setList] = useState<FeedbackTicket[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState(ALL)
  const [userUnread, setUserUnread] = useState(ALL)
  const [userId, setUserId] = useState('')
  const [keyword, setKeyword] = useState('')
  const [loading, setLoading] = useState(false)
  const [detail, setDetail] = useState<FeedbackTicket | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [replyText, setReplyText] = useState('')
  const [replyImages, setReplyImages] = useState<string[]>([])
  const [inboxTitle, setInboxTitle] = useState(DEFAULT_INBOX_TITLE)
  const [inboxContent, setInboxContent] = useState('')
  const [saving, setSaving] = useState(false)
  const [sendingInbox, setSendingInbox] = useState(false)
  const [uploadingImage, setUploadingImage] = useState(false)
  const imageInputRef = useRef<HTMLInputElement | null>(null)
  const threadEndRef = useRef<HTMLDivElement | null>(null)
  const pageSize = 20
  const pageRef = useRef(page)
  const statusRef = useRef(status)
  const userUnreadRef = useRef(userUnread)
  const userIdRef = useRef(userId)
  const keywordRef = useRef(keyword)
  const detailIdRef = useRef<number | null>(null)
  pageRef.current = page
  statusRef.current = status
  userUnreadRef.current = userUnread
  userIdRef.current = userId
  keywordRef.current = keyword
  detailIdRef.current = detail?.id ?? null

  const load = async (nextPage = pageRef.current, silent = false) => {
    if (!silent) setLoading(true)
    try {
      const currentStatus = statusRef.current
      const currentUnread = userUnreadRef.current
      const res = await get<{ list: FeedbackTicket[]; total: number }>(
        '/admin/feedbacks',
        {
          params: {
            page: nextPage,
            pageSize,
            status: currentStatus === ALL ? undefined : currentStatus,
            userUnread: currentUnread === ALL ? undefined : currentUnread,
            userId: userIdRef.current.trim() || undefined,
            keyword: keywordRef.current.trim() || undefined,
          },
        }
      )
      setList(res.data.list || [])
      setTotal(res.data.total || 0)
    } catch (e: unknown) {
      if (!silent) {
        toast.error(e instanceof Error ? e.message : '加载工单失败')
      }
    } finally {
      if (!silent) setLoading(false)
    }
  }

  useEffect(() => {
    let cancelled = false
    let inFlight = false

    const refresh = async (silent: boolean) => {
      if (inFlight || cancelled) return
      inFlight = true
      try {
        await load(pageRef.current, silent)
        const ticketId = detailIdRef.current
        if (ticketId) {
          const res = await get<FeedbackTicket>(`/admin/feedbacks/${ticketId}`)
          if (!cancelled && detailIdRef.current === ticketId)
            setDetail(res.data)
        }
      } catch {
        /* keep previous snapshot on background poll */
      } finally {
        inFlight = false
      }
    }

    void refresh(false)
    const timer = window.setInterval(() => {
      if (document.hidden) return
      void refresh(true)
    }, POLL_MS)
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh(true)
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, status, userUnread])

  const resetInboxDraft = () => {
    setInboxTitle(DEFAULT_INBOX_TITLE)
    setInboxContent('')
  }

  const openDetail = async (id: number) => {
    setDetailLoading(true)
    setReplyText('')
    setReplyImages([])
    resetInboxDraft()
    try {
      const res = await get<FeedbackTicket>(`/admin/feedbacks/${id}`)
      setDetail(res.data)
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : '加载对话失败')
    } finally {
      setDetailLoading(false)
    }
  }

  const sendReply = async () => {
    if (!detail || isFeedbackContentEmpty(replyText, replyImages)) {
      toast.error('请填写回复内容或添加图片')
      return
    }
    setSaving(true)
    try {
      const res = await post<FeedbackTicket>(
        `/admin/feedbacks/${detail.id}/replies`,
        { content: encodeFeedbackContent(replyText, replyImages) }
      )
      setDetail(res.data)
      setReplyText('')
      setReplyImages([])
      toast.success('已写入工单')
      await load(page)
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : '回复失败')
    } finally {
      setSaving(false)
    }
  }

  const sendInboxSummary = async () => {
    if (!detail) return
    if (!inboxTitle.trim() || !inboxContent.trim()) {
      toast.error('请填写站内信标题与正文')
      return
    }
    setSendingInbox(true)
    try {
      await post('/admin/inbox-messages', {
        userId: String(detail.userId),
        title: inboxTitle.trim(),
        content: inboxContent.trim(),
        actionUrl: '/feedback',
        actionLabel: '查看反馈',
      })
      resetInboxDraft()
      toast.success('已发送站内信')
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : '发送站内信失败')
    } finally {
      setSendingInbox(false)
    }
  }

  const uploadReplyImage = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast.error('请选择图片文件')
      return
    }
    setUploadingImage(true)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await post<{ url: string }>('/admin/feedbacks/images', form, {
        timeout: 120_000,
      })
      const url = res.data?.url
      if (!url) throw new Error('上传失败')
      setReplyImages((prev) => [...prev, url])
      toast.success('图片已添加')
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : '图片上传失败')
    } finally {
      setUploadingImage(false)
      if (imageInputRef.current) imageInputRef.current.value = ''
    }
  }

  const closeTicket = async () => {
    if (!detail) return
    setSaving(true)
    try {
      const res = await post<FeedbackTicket>(
        `/admin/feedbacks/${detail.id}/close`
      )
      setDetail(res.data)
      toast.success('工单已关闭')
      await load(page)
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : '关闭失败')
    } finally {
      setSaving(false)
    }
  }

  const thread = useMemo(() => {
    if (!detail) return []
    return [
      {
        id: 0,
        role: 'user',
        content: detail.content,
        createdAt: detail.createdAt,
      },
      ...(detail.replies ?? []),
    ]
  }, [detail])

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return (
    <AdminPage
      title='用户反馈'
      description='工单对话与站内信总结分开。管理员回复后工单对用户为未读；用户进入反馈页后全部标为已读。'
      extra={
        <Button
          variant='outline'
          disabled={loading}
          onClick={() => void load(page)}
        >
          <RefreshCw className='size-4' />
          刷新
        </Button>
      }
    >
      <form
        className='mb-4 flex flex-wrap gap-2'
        onSubmit={(e) => {
          e.preventDefault()
          setPage(1)
          void load(1)
        }}
      >
        <Input
          className='w-36'
          placeholder='用户 ID'
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
        />
        <Input
          className='w-56'
          placeholder='内容关键词'
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
        />
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className='w-32'>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>全部状态</SelectItem>
            <SelectItem value='open'>未关闭</SelectItem>
            <SelectItem value='closed'>已关闭</SelectItem>
          </SelectContent>
        </Select>
        <Select value={userUnread} onValueChange={setUserUnread}>
          <SelectTrigger className='w-32'>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>已读不限</SelectItem>
            <SelectItem value='true'>用户未读</SelectItem>
            <SelectItem value='false'>用户已读</SelectItem>
          </SelectContent>
        </Select>
        <Button type='submit' variant='secondary'>
          筛选
        </Button>
      </form>

      <div className='overflow-x-auto rounded-md border'>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>用户</TableHead>
              <TableHead>最新内容</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>用户已读</TableHead>
              <TableHead>更新时间</TableHead>
              <TableHead className='text-right'>操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className='text-muted-foreground'>
                  <span className='inline-flex items-center gap-2'>
                    <Loader2 className='size-4 animate-spin' />
                    加载中…
                  </span>
                </TableCell>
              </TableRow>
            ) : list.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className='text-muted-foreground'>
                  暂无工单
                </TableCell>
              </TableRow>
            ) : (
              list.map((row) => {
                const badge = ticketBadge(row)
                const read = userReadBadge(row)
                return (
                  <TableRow key={row.id}>
                    <TableCell>
                      <div className='font-medium'>
                        {row.userName || `用户 #${row.userId}`}
                      </div>
                      <div className='text-xs text-muted-foreground'>
                        ID {row.userId}
                        {row.userEmail ? ` · ${row.userEmail}` : ''}
                      </div>
                    </TableCell>
                    <TableCell className='max-w-xs'>
                      <div className='truncate font-medium'>
                        {feedbackPreviewText(
                          row.lastReplyPreview || row.content
                        )}
                      </div>
                      <div className='text-xs text-muted-foreground'>
                        #{row.id}
                        {row.replyCount > 0
                          ? ` · ${row.replyCount} 条回复`
                          : ''}
                        {row.contact ? ` · ${row.contact}` : ''}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={badge.variant}>{badge.label}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={read.variant}>{read.label}</Badge>
                    </TableCell>
                    <TableCell className='text-sm whitespace-nowrap text-muted-foreground'>
                      {formatDateTime(row.lastRepliedAt || row.createdAt)}
                    </TableCell>
                    <TableCell className='text-right'>
                      <Button
                        variant='ghost'
                        size='icon'
                        onClick={() => void openDetail(row.id)}
                      >
                        <Eye className='size-4' />
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>

      <div className='mt-4 flex items-center justify-between text-sm text-muted-foreground'>
        <span>共 {total} 条</span>
        <div className='flex gap-2'>
          <Button
            variant='outline'
            size='sm'
            disabled={page <= 1 || loading}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            上一页
          </Button>
          <span className='self-center tabular-nums'>
            {page} / {totalPages}
          </span>
          <Button
            variant='outline'
            size='sm'
            disabled={page >= totalPages || loading}
            onClick={() => setPage((p) => p + 1)}
          >
            下一页
          </Button>
        </div>
      </div>

      <Sheet
        open={Boolean(detail) || detailLoading}
        onOpenChange={(open) => {
          if (!open) {
            setDetail(null)
            setReplyText('')
            setReplyImages([])
            resetInboxDraft()
          }
        }}
      >
        <SheetContent className='flex h-full w-[66vw] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-none'>
          <SheetHeader className='shrink-0 border-b px-6 py-4 text-left'>
            <SheetTitle>{detail ? `工单 #${detail.id}` : '工单'}</SheetTitle>
            <SheetDescription>
              {detail
                ? `${detail.userName || `用户 #${detail.userId}`} · ${formatDateTime(detail.createdAt)}`
                : '加载中'}
            </SheetDescription>
          </SheetHeader>
          {detailLoading && !detail ? (
            <div className='flex flex-1 items-center gap-2 px-6 text-sm text-muted-foreground'>
              <Loader2 className='size-4 animate-spin' />
              加载对话…
            </div>
          ) : detail ? (
            <div className='flex min-h-0 flex-1'>
              <div className='flex min-h-0 min-w-0 flex-[1.4] flex-col border-e'>
                <div className='flex shrink-0 flex-wrap items-center gap-2 border-b px-4 py-2.5'>
                  <Badge variant={ticketBadge(detail).variant}>
                    {ticketBadge(detail).label}
                  </Badge>
                  <Badge variant={userReadBadge(detail).variant}>
                    {userReadBadge(detail).label}
                  </Badge>
                  {detail.contact ? (
                    <span className='text-xs text-muted-foreground'>
                      联系方式：{detail.contact}
                    </span>
                  ) : null}
                </div>

                <div className='min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain bg-muted/20 px-4 py-4'>
                  {thread.map((item) => {
                    const adminMsg = item.role === 'admin'
                    const avatar = adminMsg
                      ? OFFICIAL_AVATAR
                      : detail.userAvatar || DEFAULT_USER_AVATAR
                    return (
                      <div
                        key={`${item.role}-${item.id}`}
                        className={`flex items-end gap-2.5 ${adminMsg ? 'flex-row' : 'flex-row-reverse'}`}
                      >
                        <img
                          src={avatar}
                          alt=''
                          className='size-9 shrink-0 rounded-full border bg-background object-cover'
                        />
                        <div
                          className={`flex max-w-[72%] min-w-0 flex-col ${adminMsg ? 'items-start' : 'items-end'}`}
                        >
                          <div
                            className={`mb-1 px-0.5 text-[11px] text-muted-foreground ${adminMsg ? 'text-left' : 'text-right'}`}
                          >
                            {adminMsg ? '解忧团队' : detail.userName || '用户'} ·{' '}
                            {formatDateTime(item.createdAt)}
                          </div>
                          <div
                            className={`rounded-2xl border px-3.5 py-2.5 shadow-sm ${
                              adminMsg
                                ? 'rounded-bl-md bg-card'
                                : 'rounded-br-md bg-primary text-primary-foreground'
                            }`}
                          >
                            <AdminFeedbackMessageBody content={item.content} />
                          </div>
                        </div>
                      </div>
                    )
                  })}
                  <div ref={threadEndRef} />
                </div>

                <div className='shrink-0 space-y-2 border-t bg-background px-4 py-3'>
                  {detail.status === 'closed' ? (
                    <p className='py-1 text-center text-sm text-muted-foreground'>
                      工单已关闭（仍可单独发站内信）
                    </p>
                  ) : (
                    <>
                      {replyImages.length > 0 ? (
                        <div className='flex flex-wrap gap-2'>
                          {replyImages.map((url) => (
                            <div
                              key={url}
                              className='relative size-16 overflow-hidden rounded-lg border bg-muted'
                            >
                              <img
                                src={url}
                                alt=''
                                className='size-full object-cover'
                              />
                              <button
                                type='button'
                                className='absolute top-0.5 right-0.5 flex size-5 items-center justify-center rounded-full bg-black/60 text-white'
                                onClick={() =>
                                  setReplyImages((prev) =>
                                    prev.filter((u) => u !== url)
                                  )
                                }
                              >
                                <X className='size-3' />
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : null}
                      <Textarea
                        rows={3}
                        value={replyText}
                        placeholder='输入回复内容，图片以附件形式添加'
                        onChange={(e) => setReplyText(e.target.value)}
                      />
                      <div className='flex flex-wrap items-center justify-between gap-2'>
                        <div className='flex items-center gap-1'>
                          <input
                            ref={imageInputRef}
                            type='file'
                            accept='image/*'
                            className='hidden'
                            onChange={(e) => {
                              const file = e.target.files?.[0]
                              if (file) void uploadReplyImage(file)
                            }}
                          />
                          <Button
                            type='button'
                            size='sm'
                            variant='outline'
                            disabled={saving || sendingInbox || uploadingImage}
                            onClick={() => imageInputRef.current?.click()}
                          >
                            {uploadingImage ? (
                              <Loader2 className='size-4 animate-spin' />
                            ) : (
                              <ImagePlus className='size-4' />
                            )}
                            添加图片
                          </Button>
                          <Button
                            variant='outline'
                            size='sm'
                            disabled={saving || sendingInbox || uploadingImage}
                            onClick={() => void closeTicket()}
                          >
                            关闭工单
                          </Button>
                        </div>
                        <Button
                          disabled={
                            saving ||
                            sendingInbox ||
                            uploadingImage ||
                            isFeedbackContentEmpty(replyText, replyImages)
                          }
                          onClick={() => void sendReply()}
                        >
                          {saving ? '发送中…' : '发送回复'}
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              </div>

              <div className='flex min-h-0 w-[320px] shrink-0 flex-col overflow-y-auto px-4 py-4'>
                <div className='space-y-3'>
                  <div className='grid gap-1.5'>
                    <Label>站内信宏</Label>
                    <div className='flex flex-wrap gap-1.5'>
                      {INBOX_MACROS.map((macro) => (
                        <Button
                          key={macro.id}
                          type='button'
                          size='sm'
                          variant='secondary'
                          disabled={sendingInbox}
                          onClick={() => {
                            setInboxTitle(macro.title)
                            setInboxContent(macro.body)
                          }}
                        >
                          {macro.label}
                        </Button>
                      ))}
                    </div>
                  </div>
                  <div className='grid gap-1.5'>
                    <Label htmlFor='feedback-inbox-title'>站内信标题</Label>
                    <Input
                      id='feedback-inbox-title'
                      value={inboxTitle}
                      onChange={(e) => setInboxTitle(e.target.value)}
                      placeholder='站内信标题'
                    />
                  </div>
                  <div className='grid gap-1.5'>
                    <Label htmlFor='feedback-inbox-body'>
                      站内信正文（总结）
                    </Label>
                    <Textarea
                      id='feedback-inbox-body'
                      rows={8}
                      value={inboxContent}
                      placeholder='单独发给用户的站内信总结，不写入工单'
                      onChange={(e) => setInboxContent(e.target.value)}
                    />
                  </div>
                  <Button
                    className='w-full'
                    variant='secondary'
                    disabled={
                      sendingInbox ||
                      saving ||
                      !inboxTitle.trim() ||
                      !inboxContent.trim()
                    }
                    onClick={() => void sendInboxSummary()}
                  >
                    {sendingInbox ? '发送中…' : '发送站内信'}
                  </Button>
                </div>
              </div>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </AdminPage>
  )
}
