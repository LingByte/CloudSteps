import { useEffect, useState } from 'react'
import { Eye, Loader2, Pencil, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { del, get } from '@/lib/api'
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
import { ConfirmDialog } from '@/components/confirm-dialog'
import { ClozePassageDetailSheet } from './detail-sheet'
import { ClozePassageFormSheet } from './form-sheet'
import type { ClozePassageRow } from './types'

const LEVELS = ['初阶', '中阶', '高阶'] as const

export function ClozePassagesPage() {
  const [list, setList] = useState<ClozePassageRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [keyword, setKeyword] = useState('')
  const [level, setLevel] = useState<string>('all')
  const [status, setStatus] = useState<string>('all')
  const [loading, setLoading] = useState(false)
  const [detail, setDetail] = useState<ClozePassageRow | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<ClozePassageRow | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<ClozePassageRow | null>(null)
  const [deleting, setDeleting] = useState(false)
  const pageSize = 20

  const load = async (nextPage = page) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        page: String(nextPage),
        pageSize: String(pageSize),
      })
      if (keyword.trim()) params.append('keyword', keyword.trim())
      if (level !== 'all') params.append('level', level)
      if (status !== 'all') params.append('status', status)
      const res = await get<{ list: ClozePassageRow[]; total: number }>(
        `/cloze/admin/passages?${params}`
      )
      setList(res.data.list || [])
      setTotal(res.data.total || 0)
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load(page)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, level, status])

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await del(`/cloze/admin/passages/${deleteTarget.id}`)
      toast.success('已删除')
      setDeleteOpen(false)
      setDeleteTarget(null)
      if (detail?.id === deleteTarget.id) setDetail(null)
      await load(page)
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : '删除失败')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <AdminPage
      title='系统完形填空'
      description={`共 ${total} 篇系统文章。管理官方完形填空题库。`}
      extra={
        <Button
          onClick={() => {
            setEditing(null)
            setFormOpen(true)
          }}
        >
          <Plus />
          新增文章
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
          placeholder='搜索标题/摘要'
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          className='max-w-xs'
        />
        <Select value={level} onValueChange={setLevel}>
          <SelectTrigger className='w-32'>
            <SelectValue placeholder='等级' />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='all'>全部等级</SelectItem>
            {LEVELS.map((lv) => (
              <SelectItem key={lv} value={lv}>
                {lv}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className='w-32'>
            <SelectValue placeholder='状态' />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='all'>全部状态</SelectItem>
            <SelectItem value='published'>已发布</SelectItem>
            <SelectItem value='draft'>草稿</SelectItem>
          </SelectContent>
        </Select>
        <Button type='submit' variant='secondary'>
          搜索
        </Button>
      </form>

      <div className='rounded-md border'>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ID</TableHead>
              <TableHead>标题</TableHead>
              <TableHead>等级</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>空位数</TableHead>
              <TableHead className='text-right'>操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className='h-24 text-center'>
                  <Loader2 className='mx-auto size-5 animate-spin' />
                </TableCell>
              </TableRow>
            ) : list.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className='h-24 text-center text-muted-foreground'
                >
                  暂无数据
                </TableCell>
              </TableRow>
            ) : (
              list.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>{row.id}</TableCell>
                  <TableCell className='max-w-[240px] truncate font-medium'>
                    {row.title}
                  </TableCell>
                  <TableCell>{row.level}</TableCell>
                  <TableCell>{row.status}</TableCell>
                  <TableCell>{row.blankCount ?? 0}</TableCell>
                  <TableCell className='text-right'>
                    <Button
                      variant='ghost'
                      size='icon'
                      onClick={() => setDetail(row)}
                    >
                      <Eye />
                    </Button>
                    <Button
                      variant='ghost'
                      size='icon'
                      onClick={() => {
                        setEditing(row)
                        setFormOpen(true)
                      }}
                    >
                      <Pencil />
                    </Button>
                    <Button
                      variant='ghost'
                      size='icon'
                      onClick={() => {
                        setDeleteTarget(row)
                        setDeleteOpen(true)
                      }}
                    >
                      <Trash2 />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className='mt-4 flex items-center justify-between text-sm text-muted-foreground'>
        <span>
          第 {page} 页 · 共 {total} 条
        </span>
        <div className='flex gap-2'>
          <Button
            variant='outline'
            size='sm'
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            上一页
          </Button>
          <Button
            variant='outline'
            size='sm'
            disabled={page * pageSize >= total}
            onClick={() => setPage((p) => p + 1)}
          >
            下一页
          </Button>
        </div>
      </div>

      <ClozePassageDetailSheet
        passage={detail}
        onClose={() => setDetail(null)}
        onEdit={(row) => {
          setEditing(row)
          setFormOpen(true)
        }}
      />
      <ClozePassageFormSheet
        open={formOpen}
        onOpenChange={setFormOpen}
        editing={editing}
        onSaved={() => void load(page)}
      />
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title='删除文章'
        desc={`确定删除「${deleteTarget?.title}」？关联空位将一并删除。`}
        confirmText='删除'
        destructive
        isLoading={deleting}
        handleConfirm={() => void handleDeleteConfirm()}
      />
    </AdminPage>
  )
}
