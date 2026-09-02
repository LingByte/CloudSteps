import { useEffect, useState } from 'react'
import { Eye, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { get } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { AdminPage } from '@/components/admin-page'
import { UserPicker } from '@/features/inbox-notifications/user-picker'
import {
  ScenarioSessionDetailSheet,
  type ScenarioSessionRow,
} from './session-detail-sheet'

const statusLabel: Record<string, string> = {
  pending: '待开始',
  active: '进行中',
  completed: '已完成',
}

export function ScenarioSessionsPage() {
  const [list, setList] = useState<ScenarioSessionRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [userId, setUserId] = useState('')
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(false)
  const [detail, setDetail] = useState<ScenarioSessionRow | null>(null)
  const pageSize = 20

  const load = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      })
      if (userId.trim()) params.set('userId', userId.trim())
      if (status.trim()) params.set('status', status.trim())
      const res = await get<{ list: ScenarioSessionRow[]; total: number }>(
        `/admin/scenario-dialogue/sessions?${params}`
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
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, status])

  const openDetail = async (row: ScenarioSessionRow) => {
    setDetail(row)
    try {
      const res = await get<ScenarioSessionRow>(
        `/admin/scenario-dialogue/sessions/${row.id}`
      )
      setDetail({ ...row, ...res.data })
    } catch {
      // keep summary
    }
  }

  return (
    <AdminPage title='场景对话训练记录' description={`共 ${total} 条`}>
      <div className='mb-4 flex flex-wrap items-end gap-3'>
        <div className='w-64'>
          <p className='mb-1 text-xs text-muted-foreground'>筛选用户</p>
          <UserPicker value={userId} onChange={(id) => setUserId(id)} />
        </div>
        <div>
          <p className='mb-1 text-xs text-muted-foreground'>状态</p>
          <select
            className='h-9 rounded-md border bg-background px-3 text-sm'
            value={status}
            onChange={(e) => {
              setStatus(e.target.value)
              setPage(1)
            }}
          >
            <option value=''>全部</option>
            <option value='completed'>已完成</option>
            <option value='active'>进行中</option>
            <option value='pending'>待开始</option>
          </select>
        </div>
        {userId && (
          <Button size='sm' variant='ghost' onClick={() => setUserId('')}>
            清除用户
          </Button>
        )}
        <Button
          size='sm'
          onClick={() => {
            setPage(1)
            void load()
          }}
        >
          查询
        </Button>
        <Button
          size='sm'
          variant='outline'
          onClick={() => {
            setUserId('')
            setStatus('')
            setPage(1)
          }}
        >
          重置
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
              <TableHead>用户</TableHead>
              <TableHead>场景</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>综合分</TableHead>
              <TableHead>轮次</TableHead>
              <TableHead>时长</TableHead>
              <TableHead>结束时间</TableHead>
              <TableHead className='w-24'>操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.map((r) => (
              <TableRow key={r.id}>
                <TableCell>{r.username || r.email || r.userId}</TableCell>
                <TableCell className='max-w-[160px] truncate'>
                  {r.scenarioName || `#${r.scenarioId}`}
                </TableCell>
                <TableCell>
                  <Badge variant='secondary'>
                    {statusLabel[r.status || ''] || r.status}
                  </Badge>
                </TableCell>
                <TableCell>{r.overallScore ?? '—'}</TableCell>
                <TableCell>{r.turnCount ?? '—'}</TableCell>
                <TableCell>
                  {r.durationSec != null && r.durationSec > 0
                    ? `${Math.round(r.durationSec / 60)} 分`
                    : '—'}
                </TableCell>
                <TableCell>{r.endedAt || '—'}</TableCell>
                <TableCell>
                  <Button
                    size='sm'
                    variant='ghost'
                    onClick={() => void openDetail(r)}
                  >
                    <Eye />
                    详情
                  </Button>
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

      <ScenarioSessionDetailSheet
        open={!!detail}
        onOpenChange={(open) => {
          if (!open) setDetail(null)
        }}
        session={detail}
      />
    </AdminPage>
  )
}
