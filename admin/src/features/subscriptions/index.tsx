import { useEffect, useState } from 'react'
import { Crown, Loader2, Plus, Search } from 'lucide-react'
import { toast } from 'sonner'
import { del, get, put } from '@/lib/api'
import { formatDateTime } from '@/lib/datetime'
import { AdminPage } from '@/components/admin-page'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { userDisplayName, type CloudUser } from '@/features/users/user-display'

type SubscriptionType = 'monthly' | 'quarterly' | 'yearly' | 'lifetime'
type SubscriptionStatus = 'active' | 'expired' | 'cancelled'

type SubscriptionUser = {
  id?: string | number
  username?: string
  displayName?: string
  email?: string
  role?: string
}

type UserSubscription = {
  id: string | number
  userId: string | number
  type: SubscriptionType
  startedAt: string
  expiredAt?: string | null
  status: SubscriptionStatus
  user?: SubscriptionUser
}

const ALL = 'all'

const typeLabels: Record<SubscriptionType, string> = {
  monthly: '月度',
  quarterly: '季度',
  yearly: '年度',
  lifetime: '永久',
}

const statusLabels: Record<SubscriptionStatus, string> = {
  active: '生效中',
  expired: '已过期',
  cancelled: '已取消',
}

function userLabel(sub: UserSubscription) {
  if (!sub.user) return `#${sub.userId}`
  return userDisplayName(sub.user as CloudUser)
}

export function SubscriptionsPage() {
  const [list, setList] = useState<UserSubscription[]>([])
  const [status, setStatus] = useState(ALL)
  const [loading, setLoading] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<UserSubscription | null>(null)
  const [search, setSearch] = useState('')
  const [searching, setSearching] = useState(false)
  const [results, setResults] = useState<CloudUser[]>([])
  const [selected, setSelected] = useState<CloudUser | null>(null)
  const [formType, setFormType] = useState<SubscriptionType>('monthly')
  const [duration, setDuration] = useState(1)
  const [submitting, setSubmitting] = useState(false)

  const load = async (nextStatus = status) => {
    setLoading(true)
    try {
      const res = await get<UserSubscription[]>('/coaching/subscriptions', {
        params: nextStatus === ALL ? undefined : { status: nextStatus },
      })
      setList(Array.isArray(res.data) ? res.data : [])
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : '加载订阅失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load(status)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status])

  useEffect(() => {
    if (!dialogOpen || selected) return
    const q = search.trim()
    if (!q) {
      setResults([])
      setSearching(false)
      return
    }
    const timer = window.setTimeout(() => {
      void (async () => {
        setSearching(true)
        try {
          const res = await get<{ users: CloudUser[] }>('/users', {
            params: { page: 1, pageSize: 8, search: q },
          })
          setResults(res.data.users || [])
        } catch (e: unknown) {
          setResults([])
          toast.error(e instanceof Error ? e.message : '检索用户失败')
        } finally {
          setSearching(false)
        }
      })()
    }, 250)
    return () => window.clearTimeout(timer)
  }, [search, dialogOpen, selected])

  const openCreate = () => {
    setEditing(null)
    setSelected(null)
    setSearch('')
    setResults([])
    setFormType('monthly')
    setDuration(1)
    setDialogOpen(true)
  }

  const openEdit = (sub: UserSubscription) => {
    setEditing(sub)
    setSelected({
      id: sub.userId as CloudUser['id'],
      username: sub.user?.username,
      displayName: sub.user?.displayName,
      email: sub.user?.email,
    })
    setSearch('')
    setResults([])
    setFormType(sub.type)
    setDuration(sub.type === 'quarterly' ? 3 : 1)
    setDialogOpen(true)
  }

  const submit = async () => {
    if (!selected) {
      toast.error('请先选择用户')
      return
    }
    setSubmitting(true)
    try {
      await put('/coaching/subscriptions', {
        userId: String(selected.id),
        type: formType,
        duration: formType === 'lifetime' ? undefined : duration,
      })
      toast.success(editing ? '订阅已更新' : '订阅已开通')
      setDialogOpen(false)
      await load()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : '保存失败')
    } finally {
      setSubmitting(false)
    }
  }

  const cancel = async (sub: UserSubscription) => {
    if (!window.confirm(`取消 ${userLabel(sub)} 的${typeLabels[sub.type]}会员？`)) return
    try {
      await del(`/coaching/subscriptions/${sub.id}`)
      toast.success('订阅已取消')
      await load()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : '取消失败')
    }
  }

  const durationLabel =
    formType === 'yearly' ? '年数' : '月数'

  return (
    <AdminPage
      title='会员订阅'
      description='查看和管理用户的月度、季度、年度与永久会员'
      extra={
        <Button onClick={openCreate}>
          <Plus className='size-4' />
          开通订阅
        </Button>
      }
    >
      <div className='mb-4 flex items-center gap-3'>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className='w-36'>
            <SelectValue placeholder='状态' />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>全部状态</SelectItem>
            <SelectItem value='active'>生效中</SelectItem>
            <SelectItem value='expired'>已过期</SelectItem>
            <SelectItem value='cancelled'>已取消</SelectItem>
          </SelectContent>
        </Select>
        <span className='text-sm text-muted-foreground'>共 {list.length} 条</span>
      </div>

      <div className='overflow-hidden rounded-md border'>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>用户</TableHead>
              <TableHead>类型</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>开始</TableHead>
              <TableHead>到期</TableHead>
              <TableHead className='text-right'>操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className='h-24 text-center text-muted-foreground'>
                  <Loader2 className='mx-auto size-4 animate-spin' />
                </TableCell>
              </TableRow>
            ) : list.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className='h-24 text-center text-muted-foreground'>
                  <Crown className='mx-auto mb-2 size-5 opacity-50' />
                  暂无订阅
                </TableCell>
              </TableRow>
            ) : (
              list.map((sub) => (
                <TableRow key={String(sub.id)}>
                  <TableCell>
                    <div className='font-medium'>{userLabel(sub)}</div>
                    {sub.user?.email ? (
                      <div className='text-xs text-muted-foreground'>{sub.user.email}</div>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <Badge variant='outline'>{typeLabels[sub.type] || sub.type}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={sub.status === 'active' ? 'default' : 'secondary'}>
                      {statusLabels[sub.status] || sub.status}
                    </Badge>
                  </TableCell>
                  <TableCell className='text-muted-foreground'>{formatDateTime(sub.startedAt)}</TableCell>
                  <TableCell className='text-muted-foreground'>
                    {sub.type === 'lifetime' || !sub.expiredAt ? '永久' : formatDateTime(sub.expiredAt)}
                  </TableCell>
                  <TableCell className='text-right'>
                    <Button variant='ghost' size='sm' onClick={() => openEdit(sub)}>
                      调整
                    </Button>
                    {sub.status === 'active' ? (
                      <Button variant='ghost' size='sm' onClick={() => void cancel(sub)}>
                        取消
                      </Button>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? '调整订阅' : '开通订阅'}</DialogTitle>
            <DialogDescription>
              已有生效中的订阅会被这次选择覆盖，到期时间从现在重新计算。
            </DialogDescription>
          </DialogHeader>
          <div className='space-y-4'>
            <div className='space-y-2'>
              <Label>用户</Label>
              {selected ? (
                <div className='flex items-center justify-between rounded-md border px-3 py-2 text-sm'>
                  <span>
                    {userDisplayName(selected)}
                    {selected.email ? (
                      <span className='ml-2 text-xs text-muted-foreground'>{selected.email}</span>
                    ) : null}
                  </span>
                  {editing ? null : (
                    <Button variant='ghost' size='sm' onClick={() => setSelected(null)}>
                      更换
                    </Button>
                  )}
                </div>
              ) : (
                <div className='space-y-2'>
                  <div className='relative'>
                    <Search className='absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground' />
                    <Input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder='输入昵称、用户名、邮箱或手机号检索'
                      className='pl-8'
                    />
                  </div>
                  {searching ? (
                    <p className='text-xs text-muted-foreground'>正在检索…</p>
                  ) : null}
                  {!searching && search.trim() && results.length === 0 ? (
                    <p className='text-xs text-muted-foreground'>没有匹配的用户</p>
                  ) : null}
                  {results.length > 0 ? (
                    <div className='max-h-48 overflow-y-auto rounded-md border'>
                      {results.map((user) => (
                        <button
                          key={String(user.id)}
                          type='button'
                          className='flex w-full flex-col items-start border-b px-3 py-2 text-left last:border-0 hover:bg-muted'
                          onClick={() => {
                            setSelected(user)
                            setResults([])
                            setSearch('')
                          }}
                        >
                          <span className='text-sm'>{userDisplayName(user)}</span>
                          <span className='text-xs text-muted-foreground'>
                            {[user.username, user.phone, user.email].filter(Boolean).join(' · ')}
                          </span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              )}
            </div>
            <div className='space-y-2'>
              <Label>套餐</Label>
              <Select
                value={formType}
                onValueChange={(v) => {
                  const next = v as SubscriptionType
                  setFormType(next)
                  setDuration(next === 'quarterly' ? 3 : 1)
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='monthly'>月度</SelectItem>
                  <SelectItem value='quarterly'>季度</SelectItem>
                  <SelectItem value='yearly'>年度</SelectItem>
                  <SelectItem value='lifetime'>永久</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {formType === 'lifetime' ? (
              <p className='text-xs text-muted-foreground'>永久会员没有到期时间。</p>
            ) : (
              <div className='space-y-2'>
                <Label>{durationLabel}</Label>
                <Input
                  type='number'
                  min={1}
                  value={duration}
                  onChange={(e) => setDuration(Math.max(1, Number(e.target.value) || 1))}
                  className='w-28'
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant='outline' onClick={() => setDialogOpen(false)} disabled={submitting}>
              关闭
            </Button>
            <Button onClick={() => void submit()} disabled={submitting || !selected}>
              {submitting ? '保存中…' : '保存'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminPage>
  )
}
