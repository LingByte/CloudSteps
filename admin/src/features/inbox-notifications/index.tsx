import { useEffect, useState } from 'react'
import { Eye, Loader2, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { del, get, post, put } from '@/lib/api'
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
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Switch } from '@/components/ui/switch'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { AdminPage } from '@/components/admin-page'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { MarkdownEditor } from '@/components/markdown-editor'
import { MarkdownView } from '@/components/markdown-view'
import { UserPicker } from './user-picker'

export type InboxMessage = {
  id: number
  userId: string
  userName?: string
  userEmail?: string
  title: string
  content: string
  actionUrl?: string
  actionLabel?: string
  read: boolean
  createdAt?: string
  updatedAt?: string
}

type InboxForm = {
  userId: string
  title: string
  content: string
  actionUrl: string
  actionLabel: string
  read: boolean
}

const ALL = 'all'
const emptyForm: InboxForm = {
  userId: '',
  title: '',
  content: '',
  actionUrl: '',
  actionLabel: '',
  read: false,
}

export function InboxNotificationsPage() {
  const [list, setList] = useState<InboxMessage[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [filter, setFilter] = useState(ALL)
  const [userId, setUserId] = useState('')
  const [title, setTitle] = useState('')
  const [loading, setLoading] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState<InboxMessage | null>(null)
  const [form, setForm] = useState<InboxForm>(emptyForm)
  const [detail, setDetail] = useState<InboxMessage | null>(null)
  const [deleting, setDeleting] = useState<InboxMessage | null>(null)
  const pageSize = 20

  const load = async (nextPage = page) => {
    setLoading(true)
    try {
      const res = await get<{
        list: InboxMessage[]
        total: number
      }>('/admin/inbox-messages', {
        params: {
          page: nextPage,
          pageSize,
          filter: filter === ALL ? undefined : filter,
          userId: userId.trim() || undefined,
          title: title.trim() || undefined,
        },
      })
      setList(res.data.list || [])
      setTotal(res.data.total || 0)
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : '加载站内信失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load(page)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, filter])

  const openCreate = () => {
    setEditing(null)
    setForm(emptyForm)
    setSheetOpen(true)
  }

  const openEdit = (row: InboxMessage) => {
    setEditing(row)
    setForm({
      userId: row.userId,
      title: row.title,
      content: row.content,
      actionUrl: row.actionUrl || '',
      actionLabel: row.actionLabel || '',
      read: row.read,
    })
    setSheetOpen(true)
  }

  const save = async () => {
    if (editing) {
      if (!form.title.trim() || !form.content.trim()) {
        toast.error('请填写标题与正文')
        return
      }
      setSaving(true)
      try {
        await put(`/admin/inbox-messages/${editing.id}`, {
          title: form.title.trim(),
          content: form.content,
          actionUrl: form.actionUrl.trim(),
          actionLabel: form.actionLabel.trim(),
          read: form.read,
        })
        toast.success('已更新')
        setSheetOpen(false)
        await load(page)
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : '保存失败')
      } finally {
        setSaving(false)
      }
      return
    }

    if (!form.userId.trim() || !form.title.trim() || !form.content.trim()) {
      toast.error('请选择用户，并填写标题与正文')
      return
    }
    setSaving(true)
    try {
      await post('/admin/inbox-messages', {
        userId: form.userId.trim(),
        title: form.title.trim(),
        content: form.content,
        actionUrl: form.actionUrl.trim() || undefined,
        actionLabel: form.actionLabel.trim() || undefined,
      })
      toast.success('已发送站内信')
      setSheetOpen(false)
      setPage(1)
      await load(1)
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : '发送失败')
    } finally {
      setSaving(false)
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return (
    <AdminPage
      title='站内信'
      description='用户 inbox 中的实际通知消息，可查询、发送、编辑与删除。'
      extra={
        <div className='flex gap-2'>
          <Button
            variant='outline'
            disabled={loading}
            onClick={() => void load(page)}
          >
            <RefreshCw className='size-4' />
            刷新
          </Button>
          <Button onClick={openCreate}>
            <Plus className='size-4' />
            发送站内信
          </Button>
        </div>
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
          className='w-48'
          placeholder='标题关键词'
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className='w-32'>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>全部</SelectItem>
            <SelectItem value='unread'>未读</SelectItem>
            <SelectItem value='read'>已读</SelectItem>
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
              <TableHead>标题</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>时间</TableHead>
              <TableHead className='text-right'>操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={5} className='text-muted-foreground'>
                  <span className='inline-flex items-center gap-2'>
                    <Loader2 className='size-4 animate-spin' />
                    加载中…
                  </span>
                </TableCell>
              </TableRow>
            ) : list.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className='text-muted-foreground'>
                  暂无站内信
                </TableCell>
              </TableRow>
            ) : (
              list.map((row) => (
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
                    <div className='truncate font-medium'>{row.title}</div>
                    <div className='truncate text-xs text-muted-foreground'>
                      {row.content}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={row.read ? 'secondary' : 'default'}>
                      {row.read ? '已读' : '未读'}
                    </Badge>
                  </TableCell>
                  <TableCell className='text-sm whitespace-nowrap text-muted-foreground'>
                    {formatDateTime(row.createdAt)}
                  </TableCell>
                  <TableCell className='text-right'>
                    <Button
                      variant='ghost'
                      size='icon'
                      onClick={() => setDetail(row)}
                    >
                      <Eye className='size-4' />
                    </Button>
                    <Button
                      variant='ghost'
                      size='icon'
                      onClick={() => openEdit(row)}
                    >
                      <Pencil className='size-4' />
                    </Button>
                    <Button
                      variant='ghost'
                      size='icon'
                      onClick={() => setDeleting(row)}
                    >
                      <Trash2 className='size-4' />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
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

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className='overflow-y-auto sm:max-w-2xl'>
          <SheetHeader>
            <SheetTitle>{editing ? '编辑站内信' : '发送站内信'}</SheetTitle>
            <SheetDescription>
              {editing
                ? '修改标题、正文或已读状态。正文支持 Markdown。'
                : '向指定用户 inbox 写入一条通知。正文支持 Markdown。'}
            </SheetDescription>
          </SheetHeader>
          <div className='mt-4 space-y-4 px-1'>
            {!editing ? (
              <div className='grid gap-1.5'>
                <Label>收件用户</Label>
                <UserPicker
                  value={form.userId}
                  onChange={(userId) =>
                    setForm((prev) => ({ ...prev, userId }))
                  }
                  disabled={saving}
                />
              </div>
            ) : (
              <p className='text-sm text-muted-foreground'>
                收件人：{editing?.userName || editing?.userId}
              </p>
            )}
            <div className='grid gap-1.5'>
              <Label htmlFor='inbox-title'>标题</Label>
              <Input
                id='inbox-title'
                value={form.title}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, title: e.target.value }))
                }
              />
            </div>
            <div className='grid gap-1.5'>
              <Label>正文（Markdown）</Label>
              <MarkdownEditor
                value={form.content}
                onChange={(content) =>
                  setForm((prev) => ({ ...prev, content }))
                }
                minHeight='280px'
                placeholder='支持 Markdown：标题、列表、链接、加粗等'
              />
            </div>
            <div className='grid gap-1.5'>
              <Label htmlFor='inbox-action-url'>跳转链接（可选）</Label>
              <Input
                id='inbox-action-url'
                value={form.actionUrl}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, actionUrl: e.target.value }))
                }
              />
            </div>
            <div className='grid gap-1.5'>
              <Label htmlFor='inbox-action-label'>按钮文案（可选）</Label>
              <Input
                id='inbox-action-label'
                value={form.actionLabel}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, actionLabel: e.target.value }))
                }
              />
            </div>
            {editing ? (
              <div className='flex items-center justify-between rounded-lg border p-3'>
                <Label htmlFor='inbox-read'>标记为已读</Label>
                <Switch
                  id='inbox-read'
                  checked={form.read}
                  onCheckedChange={(checked) =>
                    setForm((prev) => ({ ...prev, read: checked }))
                  }
                />
              </div>
            ) : null}
          </div>
          <SheetFooter className='mt-6'>
            <Button variant='outline' onClick={() => setSheetOpen(false)}>
              取消
            </Button>
            <Button disabled={saving} onClick={() => void save()}>
              {saving ? '保存中…' : editing ? '保存' : '发送'}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <Sheet
        open={Boolean(detail)}
        onOpenChange={(open) => !open && setDetail(null)}
      >
        <SheetContent className='overflow-y-auto sm:max-w-xl'>
          <SheetHeader>
            <SheetTitle>{detail?.title}</SheetTitle>
            <SheetDescription>
              {detail?.userName || detail?.userId} ·{' '}
              {formatDateTime(detail?.createdAt)}
            </SheetDescription>
          </SheetHeader>
          <div className='mt-4 space-y-3 px-1 text-sm'>
            <MarkdownView content={detail?.content ?? ''} />
            {detail?.actionUrl ? (
              <p className='text-muted-foreground'>
                链接：{detail.actionUrl}
                {detail.actionLabel ? `（${detail.actionLabel}）` : ''}
              </p>
            ) : null}
          </div>
        </SheetContent>
      </Sheet>

      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(next) => {
          if (!next) setDeleting(null)
        }}
        title='删除站内信'
        desc={`确定删除「${deleting?.title ?? ''}」？`}
        destructive
        cancelBtnText='取消'
        confirmText='删除'
        handleConfirm={async () => {
          if (!deleting) return
          await del(`/admin/inbox-messages/${deleting.id}`)
          toast.success('已删除')
          setDeleting(null)
          await load(page)
        }}
      />
    </AdminPage>
  )
}
