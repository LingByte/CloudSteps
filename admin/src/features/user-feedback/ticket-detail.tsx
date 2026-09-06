import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { ArrowLeft, ImagePlus, Loader2, X } from 'lucide-react'
import { toast } from 'sonner'
import { get, post } from '@/lib/api'
import { formatDateTime } from '@/lib/datetime'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { AdminPage } from '@/components/admin-page'
import {
  AdminFeedbackMessageBody,
  encodeFeedbackContent,
  isFeedbackContentEmpty,
} from './message-body'
import {
  DEFAULT_INBOX_TITLE,
  DEFAULT_USER_AVATAR,
  INBOX_MACROS,
  OFFICIAL_AVATAR,
  POLL_MS,
  ticketBadge,
  userReadBadge,
  type FeedbackTicket,
} from './shared'

export function UserFeedbackTicketPage({ ticketId }: { ticketId: string }) {
  const [detail, setDetail] = useState<FeedbackTicket | null>(null)
  const [loading, setLoading] = useState(true)
  const [replyText, setReplyText] = useState('')
  const [replyImages, setReplyImages] = useState<string[]>([])
  const [inboxTitle, setInboxTitle] = useState(DEFAULT_INBOX_TITLE)
  const [inboxContent, setInboxContent] = useState('')
  const [saving, setSaving] = useState(false)
  const [sendingInbox, setSendingInbox] = useState(false)
  const [uploadingImage, setUploadingImage] = useState(false)
  const imageInputRef = useRef<HTMLInputElement | null>(null)
  const threadEndRef = useRef<HTMLDivElement | null>(null)
  const ticketIdRef = useRef(ticketId)
  ticketIdRef.current = ticketId

  const resetInboxDraft = () => {
    setInboxTitle(DEFAULT_INBOX_TITLE)
    setInboxContent('')
  }

  const loadDetail = async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const res = await get<FeedbackTicket>(`/admin/feedbacks/${ticketId}`)
      if (ticketIdRef.current === ticketId) setDetail(res.data)
    } catch (e: unknown) {
      if (!silent) {
        toast.error(e instanceof Error ? e.message : '加载对话失败')
        setDetail(null)
      }
    } finally {
      if (!silent) setLoading(false)
    }
  }

  useEffect(() => {
    setReplyText('')
    setReplyImages([])
    resetInboxDraft()
    void loadDetail(false)

    let cancelled = false
    let inFlight = false
    const refresh = async () => {
      if (inFlight || cancelled || document.hidden) return
      inFlight = true
      try {
        await loadDetail(true)
      } catch {
        /* keep previous */
      } finally {
        inFlight = false
      }
    }
    const timer = window.setInterval(refresh, POLL_MS)
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticketId])

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [detail?.replies?.length, detail?.id])

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

  const title = detail ? `工单 #${detail.id}` : `工单 #${ticketId}`

  return (
    <AdminPage
      title={title}
      description={
        detail
          ? `${detail.userName || `用户 #${detail.userId}`} · ${formatDateTime(detail.createdAt)}`
          : '加载工单对话…'
      }
      extra={
        <Button variant='outline' asChild>
          <Link to='/user-feedback'>
            <ArrowLeft className='size-4' />
            返回列表
          </Link>
        </Button>
      }
    >
      {loading && !detail ? (
        <div className='flex items-center gap-2 py-16 text-sm text-muted-foreground'>
          <Loader2 className='size-4 animate-spin' />
          加载对话…
        </div>
      ) : !detail ? (
        <div className='space-y-3 py-12 text-center'>
          <p className='text-sm text-muted-foreground'>工单不存在或加载失败</p>
          <Button variant='secondary' asChild>
            <Link to='/user-feedback'>返回列表</Link>
          </Button>
        </div>
      ) : (
        <div className='flex flex-col gap-4 lg:h-[calc(100dvh-11rem)] lg:min-h-[28rem] lg:flex-row lg:gap-0 lg:overflow-hidden lg:rounded-lg lg:border'>
          {/* 对话区 */}
          <div className='flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-lg border lg:rounded-none lg:border-0 lg:border-e'>
            <div className='flex shrink-0 flex-wrap items-center gap-2 border-b px-3 py-2.5 sm:px-4'>
              <Badge variant={ticketBadge(detail).variant}>
                {ticketBadge(detail).label}
              </Badge>
              <Badge variant={userReadBadge(detail).variant}>
                {userReadBadge(detail).label}
              </Badge>
              <span className='text-xs text-muted-foreground'>
                ID {detail.userId}
                {detail.userEmail ? ` · ${detail.userEmail}` : ''}
              </span>
              {detail.contact ? (
                <span className='w-full text-xs text-muted-foreground sm:w-auto'>
                  联系方式：{detail.contact}
                </span>
              ) : null}
            </div>

            <div className='min-h-[min(52dvh,28rem)] flex-1 space-y-4 overflow-y-auto overscroll-contain bg-muted/20 px-3 py-4 sm:px-4 lg:min-h-0'>
              {thread.map((item) => {
                const adminMsg = item.role === 'admin'
                const avatar = adminMsg
                  ? OFFICIAL_AVATAR
                  : detail.userAvatar || DEFAULT_USER_AVATAR
                return (
                  <div
                    key={`${item.role}-${item.id}`}
                    className={`flex items-end gap-2 sm:gap-2.5 ${adminMsg ? 'flex-row' : 'flex-row-reverse'}`}
                  >
                    <img
                      src={avatar}
                      alt=''
                      className='size-8 shrink-0 rounded-full border bg-background object-cover sm:size-9'
                    />
                    <div
                      className={`flex max-w-[85%] min-w-0 flex-col sm:max-w-[72%] ${adminMsg ? 'items-start' : 'items-end'}`}
                    >
                      <div
                        className={`mb-1 px-0.5 text-[11px] text-muted-foreground ${adminMsg ? 'text-left' : 'text-right'}`}
                      >
                        {adminMsg ? '解忧团队' : detail.userName || '用户'} ·{' '}
                        {formatDateTime(item.createdAt)}
                      </div>
                      <div
                        className={`rounded-2xl border px-3 py-2 shadow-sm sm:px-3.5 sm:py-2.5 ${
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

            <div className='shrink-0 space-y-2 border-t bg-background px-3 py-3 sm:px-4'>
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
                          className='relative size-14 overflow-hidden rounded-lg border bg-muted sm:size-16'
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
                  <div className='flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between'>
                    <div className='flex flex-wrap items-center gap-1.5'>
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
                      className='w-full sm:w-auto'
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

          {/* 站内信侧栏：桌面右侧，移动端在下方 */}
          <div className='flex w-full shrink-0 flex-col rounded-lg border lg:w-[320px] lg:rounded-none lg:border-0 lg:overflow-y-auto'>
            <div className='space-y-3 p-3 sm:p-4'>
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
                <Label htmlFor='feedback-inbox-body'>站内信正文（总结）</Label>
                <Textarea
                  id='feedback-inbox-body'
                  rows={6}
                  className='lg:min-h-[12rem]'
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
      )}
    </AdminPage>
  )
}
