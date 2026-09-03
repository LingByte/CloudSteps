import { useEffect, useState } from 'react'
import { Loader2, Ticket } from 'lucide-react'
import { toast } from 'sonner'
import { get, put } from '@/lib/api'
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
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

export type InviteRecordStatus = 'registered' | 'activated'

export type AdminInviteRecord = {
  id: string | number
  inviterUserId: string | number
  inviteeUserId: string | number
  inviter: string
  invitee: string
  inviterAccount?: string
  inviteeAccount?: string
  code: string
  status: InviteRecordStatus
  registeredAt: string
  inviterGrantedMinutes?: number
  inviteeGrantedMinutes?: number
}

type InviteRewardSetting = {
  enabled: boolean
  inviterRegisterMinutes: number
  inviteeRegisterMinutes: number
  inviterActivateMinutes: number
  inviteeActivateMinutes: number
}

const ALL = 'all'

const statusLabel: Record<InviteRecordStatus, string> = {
  registered: '已注册',
  activated: '已激活',
}

const emptyReward: InviteRewardSetting = {
  enabled: true,
  inviterRegisterMinutes: 0,
  inviteeRegisterMinutes: 0,
  inviterActivateMinutes: 0,
  inviteeActivateMinutes: 0,
}

export function InviteRecordsPage() {
  const [list, setList] = useState<AdminInviteRecord[]>([])
  const [total, setTotal] = useState(0)
  const [totalInvited, setTotalInvited] = useState(0)
  const [totalActivated, setTotalActivated] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState(ALL)
  const [loading, setLoading] = useState(false)
  const [reward, setReward] = useState<InviteRewardSetting>(emptyReward)
  const [rewardLoading, setRewardLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const pageSize = 20

  const loadReward = async () => {
    setRewardLoading(true)
    try {
      const res = await get<InviteRewardSetting>('/admin/invite/reward')
      setReward({ ...emptyReward, ...res.data })
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : '加载奖励设置失败')
    } finally {
      setRewardLoading(false)
    }
  }

  const saveReward = async () => {
    setSaving(true)
    try {
      const res = await put<InviteRewardSetting>('/admin/invite/reward', reward)
      setReward({ ...emptyReward, ...res.data })
      toast.success('邀请奖励已保存')
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : '保存奖励设置失败')
    } finally {
      setSaving(false)
    }
  }

  const load = async (nextPage = page) => {
    setLoading(true)
    try {
      const res = await get<{
        records?: AdminInviteRecord[]
        total: number
        totalInvited: number
        totalActivated: number
      }>('/admin/invite/records', {
        params: {
          page: nextPage,
          page_size: pageSize,
          search: search || undefined,
          status: status === ALL ? undefined : status,
        },
      })
      setList(res.data.records || [])
      setTotal(res.data.total || 0)
      setTotalInvited(res.data.totalInvited || 0)
      setTotalActivated(res.data.totalActivated || 0)
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : '加载邀请记录失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadReward()
  }, [])

  useEffect(() => {
    void load(page)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, status])

  const setMinutes = (key: keyof InviteRewardSetting, raw: string) => {
    const n = Number(raw)
    setReward((prev) => ({
      ...prev,
      [key]: Number.isFinite(n) && n > 0 ? Math.floor(n) : 0,
    }))
  }

  return (
    <AdminPage title='邀请记录' description={`共 ${totalInvited} 条绑定，已激活 ${totalActivated}`}>
      <Card className='mb-6'>
        <CardHeader>
          <CardTitle>邀请奖励</CardTitle>
          <CardDescription>
            奖励写入老师授课时长。同一条邀请在「注册」「激活」各只发一次，改数字不影响已经发过的记录。
          </CardDescription>
        </CardHeader>
        <CardContent className='space-y-4'>
          {rewardLoading ? (
            <div className='flex items-center gap-2 text-sm text-muted-foreground'>
              <Loader2 className='size-4 animate-spin' />
              加载设置…
            </div>
          ) : (
            <>
              <div className='flex items-center gap-2'>
                <Switch
                  checked={reward.enabled}
                  onCheckedChange={(enabled) => setReward((prev) => ({ ...prev, enabled }))}
                />
                <Label>启用邀请奖励</Label>
              </div>
              <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-4'>
                <div className='space-y-1.5'>
                  <Label htmlFor='inviter-register'>好友注册 → 邀请人（分钟）</Label>
                  <Input
                    id='inviter-register'
                    type='number'
                    min={0}
                    value={reward.inviterRegisterMinutes}
                    onChange={(e) => setMinutes('inviterRegisterMinutes', e.target.value)}
                  />
                </div>
                <div className='space-y-1.5'>
                  <Label htmlFor='invitee-register'>好友注册 → 被邀请人（分钟）</Label>
                  <Input
                    id='invitee-register'
                    type='number'
                    min={0}
                    value={reward.inviteeRegisterMinutes}
                    onChange={(e) => setMinutes('inviteeRegisterMinutes', e.target.value)}
                  />
                </div>
                <div className='space-y-1.5'>
                  <Label htmlFor='inviter-activate'>好友激活 → 邀请人（分钟）</Label>
                  <Input
                    id='inviter-activate'
                    type='number'
                    min={0}
                    value={reward.inviterActivateMinutes}
                    onChange={(e) => setMinutes('inviterActivateMinutes', e.target.value)}
                  />
                </div>
                <div className='space-y-1.5'>
                  <Label htmlFor='invitee-activate'>好友激活 → 被邀请人（分钟）</Label>
                  <Input
                    id='invitee-activate'
                    type='number'
                    min={0}
                    value={reward.inviteeActivateMinutes}
                    onChange={(e) => setMinutes('inviteeActivateMinutes', e.target.value)}
                  />
                </div>
              </div>
              <Button onClick={() => void saveReward()} disabled={saving}>
                {saving ? '保存中…' : '保存奖励'}
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      <form
        className='mb-4 flex flex-wrap gap-2'
        onSubmit={(e) => {
          e.preventDefault()
          setPage(1)
          void load(1)
        }}
      >
        <Input
          className='max-w-xs'
          placeholder='搜索邀请人 / 被邀请人 / 邀请码 / 用户 ID'
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Select
          value={status}
          onValueChange={(value) => {
            setStatus(value)
            setPage(1)
          }}
        >
          <SelectTrigger className='w-32'>
            <SelectValue placeholder='状态' />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>全部状态</SelectItem>
            <SelectItem value='registered'>已注册</SelectItem>
            <SelectItem value='activated'>已激活</SelectItem>
          </SelectContent>
        </Select>
        <Button type='submit' variant='secondary'>
          搜索
        </Button>
      </form>
      {loading ? (
        <div className='flex items-center gap-2 text-sm text-muted-foreground'>
          <Loader2 className='size-4 animate-spin' />
          加载中…
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>注册时间</TableHead>
              <TableHead>邀请人</TableHead>
              <TableHead>被邀请人</TableHead>
              <TableHead>邀请码</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>已发奖励</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className='text-muted-foreground'>
                  暂无邀请记录
                </TableCell>
              </TableRow>
            ) : (
              list.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className='whitespace-nowrap text-sm'>
                    {formatDateTime(row.registeredAt)}
                  </TableCell>
                  <TableCell>
                    <p className='font-medium'>{row.inviter}</p>
                    <p className='text-xs text-muted-foreground'>
                      {row.inviterAccount || '—'} · ID {row.inviterUserId}
                    </p>
                  </TableCell>
                  <TableCell>
                    <p className='font-medium'>{row.invitee}</p>
                    <p className='text-xs text-muted-foreground'>
                      {row.inviteeAccount || '—'} · ID {row.inviteeUserId}
                    </p>
                  </TableCell>
                  <TableCell>
                    <span className='inline-flex items-center gap-1 font-mono text-sm'>
                      <Ticket className='size-3.5 text-muted-foreground' />
                      {row.code || '—'}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={row.status === 'activated' ? 'default' : 'secondary'}
                    >
                      {statusLabel[row.status] || row.status}
                    </Badge>
                  </TableCell>
                  <TableCell className='text-xs text-muted-foreground'>
                    邀请人 {row.inviterGrantedMinutes || 0} 分
                    <br />
                    被邀请 {row.inviteeGrantedMinutes || 0} 分
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      )}
      <div className='mt-4 flex items-center justify-end gap-2 text-sm'>
        <Button
          variant='outline'
          size='sm'
          disabled={page <= 1}
          onClick={() => setPage((p) => p - 1)}
        >
          上一页
        </Button>
        <span>
          {page} / {Math.max(1, Math.ceil(total / pageSize))}
        </span>
        <Button
          variant='outline'
          size='sm'
          disabled={page * pageSize >= total}
          onClick={() => setPage((p) => p + 1)}
        >
          下一页
        </Button>
      </div>
    </AdminPage>
  )
}
