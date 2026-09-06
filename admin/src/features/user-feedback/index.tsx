import { useEffect, useRef, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { ChevronRight, Loader2, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { get } from '@/lib/api'
import { formatDateTime } from '@/lib/datetime'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { AdminPage } from '@/components/admin-page'
import { feedbackPreviewText } from './message-body'
import {
  ALL,
  POLL_MS,
  ticketBadge,
  userReadBadge,
  type FeedbackTicket,
} from './shared'

export function UserFeedbackPage() {
  const [list, setList] = useState<FeedbackTicket[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState(ALL)
  const [userUnread, setUserUnread] = useState(ALL)
  const [userId, setUserId] = useState('')
  const [keyword, setKeyword] = useState('')
  const [loading, setLoading] = useState(false)
  const pageSize = 20
  const pageRef = useRef(page)
  const statusRef = useRef(status)
  const userUnreadRef = useRef(userUnread)
  const userIdRef = useRef(userId)
  const keywordRef = useRef(keyword)
  pageRef.current = page
  statusRef.current = status
  userUnreadRef.current = userUnread
  userIdRef.current = userId
  keywordRef.current = keyword

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
        className='mb-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap'
        onSubmit={(e) => {
          e.preventDefault()
          setPage(1)
          void load(1)
        }}
      >
        <Input
          className='w-full sm:w-36'
          placeholder='用户 ID'
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
        />
        <Input
          className='w-full sm:w-56'
          placeholder='内容关键词'
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
        />
        <div className='grid grid-cols-2 gap-2 sm:flex sm:flex-wrap'>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className='w-full sm:w-32'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>全部状态</SelectItem>
              <SelectItem value='open'>未关闭</SelectItem>
              <SelectItem value='closed'>已关闭</SelectItem>
            </SelectContent>
          </Select>
          <Select value={userUnread} onValueChange={setUserUnread}>
            <SelectTrigger className='w-full sm:w-32'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>已读不限</SelectItem>
              <SelectItem value='true'>用户未读</SelectItem>
              <SelectItem value='false'>用户已读</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button type='submit' variant='secondary' className='w-full sm:w-auto'>
          筛选
        </Button>
      </form>

      {/* 移动端：卡片列表 */}
      <div className='space-y-2 md:hidden'>
        {loading ? (
          <div className='flex items-center gap-2 rounded-lg border px-4 py-8 text-sm text-muted-foreground'>
            <Loader2 className='size-4 animate-spin' />
            加载中…
          </div>
        ) : list.length === 0 ? (
          <div className='rounded-lg border px-4 py-8 text-center text-sm text-muted-foreground'>
            暂无工单
          </div>
        ) : (
          list.map((row) => {
            const badge = ticketBadge(row)
            const read = userReadBadge(row)
            return (
              <Link
                key={row.id}
                to='/user-feedback/$ticketId'
                params={{ ticketId: String(row.id) }}
                className='block rounded-lg border bg-card p-3 transition hover:bg-accent/40 active:bg-accent/60'
              >
                <div className='flex items-start justify-between gap-2'>
                  <div className='min-w-0 flex-1'>
                    <p className='truncate font-medium'>
                      {row.userName || `用户 #${row.userId}`}
                    </p>
                    <p className='mt-0.5 text-xs text-muted-foreground'>
                      #{row.id} · ID {row.userId}
                      {row.replyCount > 0 ? ` · ${row.replyCount} 条回复` : ''}
                    </p>
                  </div>
                  <ChevronRight className='mt-0.5 size-4 shrink-0 text-muted-foreground' />
                </div>
                <p className='mt-2 line-clamp-2 text-sm text-foreground/90'>
                  {feedbackPreviewText(row.lastReplyPreview || row.content)}
                </p>
                <div className='mt-2.5 flex flex-wrap items-center gap-1.5'>
                  <Badge variant={badge.variant}>{badge.label}</Badge>
                  <Badge variant={read.variant}>{read.label}</Badge>
                  <span className='ms-auto text-[11px] text-muted-foreground'>
                    {formatDateTime(row.lastRepliedAt || row.createdAt)}
                  </span>
                </div>
              </Link>
            )
          })
        )}
      </div>

      {/* 桌面端：表格 */}
      <div className='hidden overflow-x-auto rounded-md border md:block'>
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
                      <Button variant='outline' size='sm' asChild>
                        <Link
                          to='/user-feedback/$ticketId'
                          params={{ ticketId: String(row.id) }}
                        >
                          打开
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>

      <div className='mt-4 flex items-center justify-between gap-2 text-sm text-muted-foreground'>
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
    </AdminPage>
  )
}

export { UserFeedbackTicketPage } from './ticket-detail'
