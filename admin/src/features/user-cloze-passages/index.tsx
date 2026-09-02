import { useEffect, useState } from 'react'
import { Eye, Loader2, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { del, get } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
import { UserClozeDetailSheet, type UserClozeRow } from './detail-sheet'

export function UserClozePassagesPage() {
  const [list, setList] = useState<UserClozeRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [keyword, setKeyword] = useState('')
  const [userId, setUserId] = useState('')
  const [loading, setLoading] = useState(false)
  const [detail, setDetail] = useState<UserClozeRow | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<UserClozeRow | null>(null)
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
      if (userId.trim()) params.append('userId', userId.trim())
      const res = await get<{ list: UserClozeRow[]; total: number }>(
        `/cloze/admin/custom/passages?${params}`
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
  }, [page])

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await del(`/cloze/admin/custom/passages/${deleteTarget.id}`)
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
    <AdminPage title='用户自定义完形填空' description={`共 ${total} 篇`}>
      <div className='mb-4 flex flex-wrap gap-2'>
        <Input
          className='w-48'
          placeholder='搜索标题'
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
        />
        <Input
          className='w-32'
          placeholder='用户 ID'
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
        />
        <Button
          size='sm'
          onClick={() => {
            setPage(1)
            void load(1)
          }}
        >
          查询
        </Button>
      </div>

      {loading ? (
        <div className='flex items-center gap-2 text-sm text-muted-foreground'>
          <Loader2 className='size-4 animate-spin' />
          加载中…
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>标题</TableHead>
              <TableHead>用户</TableHead>
              <TableHead>等级</TableHead>
              <TableHead>空位数</TableHead>
              <TableHead className='w-28'>操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.map((row) => (
              <TableRow key={row.id}>
                <TableCell className='max-w-[200px] truncate font-medium'>
                  {row.title}
                </TableCell>
                <TableCell>{row.username || row.email || row.userId}</TableCell>
                <TableCell>{row.level}</TableCell>
                <TableCell>{row.blankCount ?? '—'}</TableCell>
                <TableCell>
                  <div className='flex gap-1'>
                    <Button
                      size='sm'
                      variant='ghost'
                      onClick={() => setDetail(row)}
                    >
                      <Eye />
                    </Button>
                    <Button
                      size='sm'
                      variant='ghost'
                      className='text-destructive'
                      onClick={() => {
                        setDeleteTarget(row)
                        setDeleteOpen(true)
                      }}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <div className='mt-4 flex justify-end gap-2'>
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

      <UserClozeDetailSheet passage={detail} onClose={() => setDetail(null)} />
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title='确认删除'
        desc={`确定删除「${deleteTarget?.title}」？`}
        confirmText='删除'
        destructive
        isLoading={deleting}
        handleConfirm={() => void handleDeleteConfirm()}
      />
    </AdminPage>
  )
}
