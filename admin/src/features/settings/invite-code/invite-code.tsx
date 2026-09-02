import { useState } from 'react'
import { Copy, RefreshCw, Ticket, Users } from 'lucide-react'
import { toast } from 'sonner'
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
import {
  generateMockCode,
  mockInviteCode,
  mockInviteRecords,
  type InviteRecord,
} from './mock'

const statusLabel: Record<InviteRecord['status'], string> = {
  registered: '已注册',
  activated: '已激活',
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
  const [code, setCode] = useState(mockInviteCode.code)
  const [link, setLink] = useState(mockInviteCode.link)
  const [records] = useState<InviteRecord[]>(mockInviteRecords)
  const [regenerating, setRegenerating] = useState(false)

  const totalInvited = mockInviteCode.totalInvited
  const totalActivated = mockInviteCode.totalActivated

  const onRegenerate = () => {
    if (regenerating) return
    setRegenerating(true)
    // 模拟生成新邀请码的耗时
    setTimeout(() => {
      const next = generateMockCode()
      setCode(next)
      setLink(`https://cloudsteps.example.com/i/${next.split('-')[1]}`)
      setRegenerating(false)
      toast.success('已生成新的邀请码')
    }, 500)
  }

  return (
    <div className='space-y-6'>
      {/* ===== 我的邀请码 ===== */}
      <Card>
        <CardHeader>
          <CardTitle className='flex items-center gap-2'>
            <Ticket size={18} />
            我的邀请码
          </CardTitle>
          <CardDescription>
            把邀请码或邀请链接分享给好友，好友注册后即可在下方看到记录。
          </CardDescription>
        </CardHeader>
        <CardContent className='space-y-4'>
          <div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
            <div className='flex items-baseline gap-3'>
              <span className='font-mono text-2xl font-bold tracking-wider'>
                {code}
              </span>
              <span className='text-xs text-muted-foreground'>
                生成于 {formatDateTime(mockInviteCode.createdAt)}
              </span>
            </div>
            <div className='flex gap-2'>
              <Button
                variant='outline'
                size='sm'
                onClick={() => copyText(code, '邀请码')}
              >
                <Copy size={14} />
                复制邀请码
              </Button>
              <Button
                variant='outline'
                size='sm'
                onClick={onRegenerate}
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
              <div className='truncate font-mono text-sm'>{link}</div>
            </div>
            <Button
              variant='ghost'
              size='sm'
              onClick={() => copyText(link, '邀请链接')}
            >
              <Copy size={14} />
              复制链接
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ===== 统计 ===== */}
      <div className='grid gap-4 sm:grid-cols-2'>
        <Card>
          <CardHeader>
            <CardDescription>累计邀请</CardDescription>
            <CardTitle className='text-3xl'>{totalInvited}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>已激活</CardDescription>
            <CardTitle className='text-3xl'>{totalActivated}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* ===== 邀请记录 ===== */}
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
                        {statusLabel[r.status]}
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
