import { useEffect, useState } from 'react'
import { Copy, Loader2, RefreshCw, Ticket, Users } from 'lucide-react'
import { toast } from 'sonner'
import { get, post } from '@/lib/api'
import { formatDateTime } from '@/lib/datetime'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

type InviteRecordStatus = 'registered' | 'activated'

type InviteRecord = {
  id: string | number
  invitee: string
  registeredAt: string
  status: InviteRecordStatus
}

type InviteOverview = {
  code: string
  createdAt: string
  totalInvited: number
  totalActivated: number
  records?: InviteRecord[]
}

const statusLabel: Record<InviteRecordStatus, string> = {
  registered: '已注册',
  activated: '已激活',
}

function inviteLink(code: string) {
  const origin = String(import.meta.env.VITE_WEB_ORIGIN || '').replace(/\/$/, '')
  const path = `/login?register=1&inviteCode=${encodeURIComponent(code)}`
  return origin ? `${origin}${path}` : path
}

async function copyText(text: string, label: string) {
  try {
    await navigator.clipboard.writeText(text)
    toast.success(`${label}已复制`)
  } catch {
    toast.error('复制失败，请手动选择复制')
  }
}

export function InviteCodePanel() {
  const [overview, setOverview] = useState<InviteOverview | null>(null)
  const [loading, setLoading] = useState(true)
  const [regenerating, setRegenerating] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const res = await get<InviteOverview>('/invite/me')
      setOverview(res.data)
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : '加载邀请码失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const onRegenerate = async () => {
    if (regenerating) return
    setRegenerating(true)
    try {
      const res = await post<InviteOverview>('/invite/rotate')
      setOverview(res.data)
      toast.success('已生成新的邀请码')
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : '更换邀请码失败')
    } finally {
      setRegenerating(false)
    }
  }

  if (loading && !overview) {
    return (
      <div className='flex items-center gap-2 text-sm text-muted-foreground'>
        <Loader2 className='size-4 animate-spin' />
        加载中…
      </div>
    )
  }

  const code = overview?.code || ''
  const link = code ? inviteLink(code) : ''
  const records = overview?.records || []

  return (
    <div className='space-y-6'>
      <Card>
        <CardHeader>
          <CardTitle className='flex items-center gap-2'>
            <Ticket size={18} />
            我的邀请码
          </CardTitle>
          <CardDescription>
            把邀请码或邀请链接分享给好友，好友注册后即可在下方看到记录。全站记录请到「邀请记录」。
          </CardDescription>
        </CardHeader>
        <CardContent className='space-y-4'>
          <div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
            <div className='flex items-baseline gap-3'>
              <span className='font-mono text-2xl font-bold tracking-wider'>
                {code || '—'}
              </span>
              {overview?.createdAt ? (
                <span className='text-xs text-muted-foreground'>
                  生成于 {formatDateTime(overview.createdAt)}
                </span>
              ) : null}
            </div>
            <div className='flex gap-2'>
              <Button
                variant='outline'
                size='sm'
                disabled={!code}
                onClick={() => copyText(code, '邀请码')}
              >
                <Copy size={14} />
                复制邀请码
              </Button>
              <Button
                variant='outline'
                size='sm'
                onClick={() => void onRegenerate()}
                disabled={regenerating}
              >
                <RefreshCw size={14} />
                {regenerating ? '生成中…' : '生成新码'}
              </Button>
            </div>
          </div>

          <div className='flex flex-col gap-2 rounded-lg border bg-muted/40 p-3 sm:flex-row sm:items-center sm:justify-between'>
            <div className='min-w-0'>
              <div className='text-xs text-muted-foreground'>专属邀请链接</div>
              <div className='truncate font-mono text-sm'>{link || '—'}</div>
            </div>
            <Button
              variant='ghost'
              size='sm'
              disabled={!link}
              onClick={() => copyText(link, '邀请链接')}
            >
              <Copy size={14} />
              复制链接
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className='grid gap-4 sm:grid-cols-2'>
        <Card>
          <CardHeader>
            <CardDescription>累计邀请</CardDescription>
            <CardTitle className='text-3xl'>{overview?.totalInvited || 0}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>已激活</CardDescription>
            <CardTitle className='text-3xl'>{overview?.totalActivated || 0}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className='flex items-center gap-2'>
            <Users size={18} />
            邀请记录
          </CardTitle>
          <CardDescription>
            好友通过你的邀请码注册后会出现于此。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>被邀请人</TableHead>
                <TableHead>注册时间</TableHead>
                <TableHead>状态</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {records.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={3}
                    className='h-24 text-center text-muted-foreground'
                  >
                    暂无邀请记录
                  </TableCell>
                </TableRow>
              ) : (
                records.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className='font-medium'>{r.invitee}</TableCell>
                    <TableCell>{formatDateTime(r.registeredAt)}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          r.status === 'activated' ? 'default' : 'secondary'
                        }
                      >
                        {statusLabel[r.status] || r.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
