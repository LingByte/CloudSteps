import { useEffect, useState } from 'react'
import {
  Eye,
  Loader2,
  Megaphone,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
} from 'lucide-react'
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { AdminPage } from '@/components/admin-page'
import { AiContentAssist } from '@/components/ai-content-assist'
import {
  CONTENT_SHEET_BODY_CLASS,
  CONTENT_SHEET_FOOTER_CLASS,
  CONTENT_SHEET_HEADER_CLASS,
  CONTENT_SHEET_PANEL_CLASS,
  CONTENT_SHEET_WIDE_PANEL_CLASS,
} from '@/components/content-sheet'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { MarkdownEditor } from '@/components/markdown-editor'
import { MarkdownView } from '@/components/markdown-view'

type Announcement = {
  id: number
  title: string
  content: string
  status: string
  publishedAt?: string
  priority: number
  readCount?: number
  createdAt?: string
  updatedAt?: string
}

type AnnouncementReader = {
  userId: number
  userName: string
  userEmail?: string
  readAt: string
}

type FormState = {
  title: string
  content: string
  priority: string
  publish: boolean
}

const emptyForm: FormState = {
  title: '',
  content: '',
  priority: '0',
  publish: true,
}

const ALL = 'all'

export function AnnouncementsPage() {
  const [list, setList] = useState<Announcement[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState(ALL)
  const [loading, setLoading] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState<Announcement | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [detail, setDetail] = useState<Announcement | null>(null)
  const [readers, setReaders] = useState<AnnouncementReader[]>([])
  const [readersTotal, setReadersTotal] = useState(0)
  const [readersLoading, setReadersLoading] = useState(false)
  const [deleting, setDeleting] = useState<Announcement | null>(null)
  const pageSize = 20

  const loadReaders = async (announcementId: number) => {
    setReadersLoading(true)
    try {
      const res = await get<{ list: AnnouncementReader[]; total: number }>(
        `/admin/announcements/${announcementId}/readers`,
        { params: { page: 1, pageSize: 100 } }
      )
      setReaders(res.data?.list ?? [])
      setReadersTotal(res.data?.total ?? 0)
    } catch {
      setReaders([])
      setReadersTotal(0)
    } finally {
      setReadersLoading(false)
    }
  }

  const openDetail = (row: Announcement) => {
    setDetail(row)
    void loadReaders(row.id)
  }

  const load = async (nextPage = page) => {
    setLoading(true)
    try {
      const res = await get<{ list: Announcement[]; total: number }>(
        '/admin/announcements',
        {
          params: {
            page: nextPage,
            pageSize,
            status: status === ALL ? undefined : status,
          },
        }
      )
      setList(res.data?.list ?? [])
      setTotal(res.data?.total ?? 0)
      setPage(nextPage)
    } catch (e: unknown) {
      const msg =
        e && typeof e === 'object' && 'message' in e
          ? String((e as { message: string }).message)
          : '加载失败'
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load(1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status])

  const openCreate = () => {
    setEditing(null)
    setForm(emptyForm)
    setSheetOpen(true)
  }

  const openEdit = (row: Announcement) => {
    setEditing(row)
    setForm({
      title: row.title,
      content: row.content,
      priority: String(row.priority ?? 0),
      publish: row.status === 'published',
    })
    setSheetOpen(true)
  }

  const save = async () => {
    const title = form.title.trim()
    if (!title) {
      toast.error('请填写标题')
      return
    }
    setSaving(true)
    try {
      const priority = Number(form.priority) || 0
      if (editing) {
        await put(`/admin/announcements/${editing.id}`, {
          title,
          content: form.content,
          priority,
        })
        if (form.publish && editing.status !== 'published') {
          await post(`/admin/announcements/${editing.id}/publish`)
        }
        if (!form.publish && editing.status === 'published') {
          await post(`/admin/announcements/${editing.id}/unpublish`)
        }
        toast.success('已保存')
      } else {
        await post('/admin/announcements', {
          title,
          content: form.content,
          priority,
          publish: form.publish,
        })
        toast.success(form.publish ? '已发布' : '已保存草稿')
      }
      setSheetOpen(false)
      void load(page)
    } catch (e: unknown) {
      const msg =
        e && typeof e === 'object' && 'message' in e
          ? String((e as { message: string }).message)
          : '保存失败'
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

  const confirmDelete = async () => {
    if (!deleting) return
    try {
      await del(`/admin/announcements/${deleting.id}`)
      toast.success('已删除')
      setDeleting(null)
      void load(page)
    } catch {
      toast.error('删除失败')
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return (
    <AdminPage
      title='系统公告'
      description='后台发布公告；用户登录后未读会弹窗一次，点「我知道了」会清空当前未读弹窗队列，不再连环弹出旧公告。'
      extra={
        <div className='flex gap-2'>
          <Button variant='outline' size='sm' onClick={() => void load(page)}>
            <RefreshCw className='size-4' />
            刷新
          </Button>
          <Button size='sm' onClick={openCreate}>
            <Plus className='size-4' />
            新建公告
          </Button>
        </div>
      }
    >
      <div className='mb-4 flex flex-wrap items-center gap-3'>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className='w-36'>
            <SelectValue placeholder='状态' />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>全部状态</SelectItem>
            <SelectItem value='published'>已发布</SelectItem>
            <SelectItem value='draft'>草稿</SelectItem>
          </SelectContent>
        </Select>
        <span className='text-sm text-muted-foreground'>共 {total} 条</span>
      </div>

      <div className='rounded-md border'>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>标题</TableHead>
              <TableHead className='w-24'>状态</TableHead>
              <TableHead className='w-20'>优先级</TableHead>
              <TableHead className='w-24'>已读</TableHead>
              <TableHead className='w-44'>发布时间</TableHead>
              <TableHead className='w-40 text-right'>操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className='h-24 text-center text-muted-foreground'
                >
                  <Loader2 className='mx-auto size-5 animate-spin' />
                </TableCell>
              </TableRow>
            ) : list.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className='h-24 text-center text-muted-foreground'
                >
                  暂无公告
                </TableCell>
              </TableRow>
            ) : (
              list.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className='font-medium'>{row.title}</TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        row.status === 'published' ? 'default' : 'secondary'
                      }
                    >
                      {row.status === 'published' ? '已发布' : '草稿'}
                    </Badge>
                  </TableCell>
                  <TableCell>{row.priority}</TableCell>
                  <TableCell className='text-sm tabular-nums'>
                    <button
                      type='button'
                      className='text-primary hover:underline'
                      onClick={() => openDetail(row)}
                    >
                      {row.readCount ?? 0} 人
                    </button>
                  </TableCell>
                  <TableCell className='text-sm text-muted-foreground'>
                    {row.publishedAt ? formatDateTime(row.publishedAt) : '—'}
                  </TableCell>
                  <TableCell className='text-right'>
                    <div className='inline-flex gap-1'>
                      <Button
                        variant='ghost'
                        size='icon'
                        onClick={() => openDetail(row)}
                        aria-label='预览'
                      >
                        <Eye className='size-4' />
                      </Button>
                      <Button
                        variant='ghost'
                        size='icon'
                        onClick={() => openEdit(row)}
                        aria-label='编辑'
                      >
                        <Pencil className='size-4' />
                      </Button>
                      <Button
                        variant='ghost'
                        size='icon'
                        onClick={() => setDeleting(row)}
                        aria-label='删除'
                      >
                        <Trash2 className='size-4 text-destructive' />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 ? (
        <div className='mt-3 flex items-center justify-end gap-2'>
          <Button
            variant='outline'
            size='sm'
            disabled={page <= 1 || loading}
            onClick={() => void load(page - 1)}
          >
            上一页
          </Button>
          <span className='text-sm text-muted-foreground'>
            {page} / {totalPages}
          </span>
          <Button
            variant='outline'
            size='sm'
            disabled={page >= totalPages || loading}
            onClick={() => void load(page + 1)}
          >
            下一页
          </Button>
        </div>
      ) : null}

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className={CONTENT_SHEET_WIDE_PANEL_CLASS}>
          <SheetHeader className={CONTENT_SHEET_HEADER_CLASS}>
            <SheetTitle className='flex items-center gap-2'>
              <Megaphone className='size-4' />
              {editing ? '编辑公告' : '新建公告'}
            </SheetTitle>
            <SheetDescription>
              发布后，未读用户登录 Web
              会看到弹窗；确认后写入已读，不再主动弹出。
            </SheetDescription>
          </SheetHeader>
          <div className={CONTENT_SHEET_BODY_CLASS}>
            <div className='space-y-5'>
              <AiContentAssist
                kind='announcement'
                title={form.title}
                onApply={(data) =>
                  setForm((f) => ({
                    ...f,
                    title: data.title?.trim() || f.title,
                    content: data.content?.trim() || f.content,
                  }))
                }
              />
              <div className='grid gap-1.5'>
              <Label htmlFor='ann-title'>标题</Label>
              <Input
                id='ann-title'
                value={form.title}
                onChange={(e) =>
                  setForm((f) => ({ ...f, title: e.target.value }))
                }
                placeholder='公告标题'
              />
            </div>
            <div className='grid gap-1.5'>
              <Label htmlFor='ann-priority'>优先级</Label>
              <Input
                id='ann-priority'
                type='number'
                value={form.priority}
                onChange={(e) =>
                  setForm((f) => ({ ...f, priority: e.target.value }))
                }
              />
              <p className='text-xs text-muted-foreground'>
                数字越大越优先弹出
              </p>
            </div>
            <div className='grid gap-1.5'>
              <Label>正文</Label>
              <MarkdownEditor
                value={form.content}
                onChange={(v) => setForm((f) => ({ ...f, content: v }))}
              />
            </div>
            <label className='flex items-center gap-2 text-sm'>
              <input
                type='checkbox'
                checked={form.publish}
                onChange={(e) =>
                  setForm((f) => ({ ...f, publish: e.target.checked }))
                }
              />
              保存后立即发布
            </label>
            </div>
          </div>
          <SheetFooter className={CONTENT_SHEET_FOOTER_CLASS}>
            <Button variant='outline' onClick={() => setSheetOpen(false)}>
              取消
            </Button>
            <Button disabled={saving} onClick={() => void save()}>
              {saving ? <Loader2 className='size-4 animate-spin' /> : null}
              保存
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <Sheet
        open={detail != null}
        onOpenChange={(o) => {
          if (!o) {
            setDetail(null)
            setReaders([])
            setReadersTotal(0)
          }
        }}
      >
        <SheetContent className={CONTENT_SHEET_PANEL_CLASS}>
          <SheetHeader className={CONTENT_SHEET_HEADER_CLASS}>
            <SheetTitle>{detail?.title}</SheetTitle>
            <SheetDescription>
              {detail?.status === 'published' ? '已发布' : '草稿'}
              {detail?.publishedAt
                ? ` · ${formatDateTime(detail.publishedAt)}`
                : ''}
              {` · 已读 ${readersTotal || detail?.readCount || 0} 人`}
            </SheetDescription>
          </SheetHeader>
          <div className={CONTENT_SHEET_BODY_CLASS}>
            <div className='space-y-5'>
              {detail?.content ? (
                <MarkdownView content={detail.content} />
              ) : (
                <p className='text-sm text-muted-foreground'>无正文</p>
              )}
            <div className='border-t pt-4'>
              <h3 className='mb-2 text-sm font-semibold'>已读用户</h3>
              {readersLoading ? (
                <div className='flex justify-center py-6'>
                  <Loader2 className='size-5 animate-spin text-muted-foreground' />
                </div>
              ) : readers.length === 0 ? (
                <p className='text-sm text-muted-foreground'>暂无人已读</p>
              ) : (
                <ul className='max-h-64 divide-y overflow-y-auto rounded-md border'>
                  {readers.map((r) => (
                    <li
                      key={`${r.userId}-${r.readAt}`}
                      className='px-3 py-2 text-sm'
                    >
                      <div className='font-medium'>
                        {r.userName || `用户 #${r.userId}`}
                      </div>
                      <div className='text-xs text-muted-foreground'>
                        {r.userEmail ? `${r.userEmail} · ` : ''}
                        {formatDateTime(r.readAt)}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <ConfirmDialog
        open={deleting != null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title='删除公告？'
        desc={deleting ? `确定删除「${deleting.title}」？` : ''}
        handleConfirm={() => void confirmDelete()}
      />
    </AdminPage>
  )
}
