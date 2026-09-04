import { useEffect, useState } from 'react'
import { getRouteApi, Link } from '@tanstack/react-router'
import { ArrowLeft, Loader2, Plus, Trash2 } from 'lucide-react'
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
import { AudioJobButtons } from './audio-job-buttons'
import { wordbooksListSearch } from './search'
import { type Word } from './types'
import { useWordBookAudioJobs } from './use-wordbook-audio-jobs'
import { WordMutateDrawer } from './word-mutate-drawer'

const bookRoute = getRouteApi('/_authenticated/wordbooks/$bookId')

export function WordBookWordsPage({ bookId }: { bookId: string }) {
  const listSearch = wordbooksListSearch(bookRoute.useSearch())
  const [bookName, setBookName] = useState('')
  const [list, setList] = useState<Word[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [keyword, setKeyword] = useState('')
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Word | null>(null)
  const pageSize = 30
  const { jobs, toggleBatchAudio, startPurgeAudio } = useWordBookAudioJobs(
    bookName ? [{ id: bookId, name: bookName }] : []
  )

  const load = async (nextPage = page) => {
    setLoading(true)
    try {
      const book = await get<{ name: string }>(`/wordbooks/${bookId}`)
      setBookName(book.data.name)
      const res = await get<{ list: Word[]; total: number }>(
        `/wordbooks/${bookId}/managed-words?page=${nextPage}&pageSize=${pageSize}&keyword=${encodeURIComponent(keyword)}`
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
  }, [bookId, page])

  const remove = async (w: Word) => {
    if (!confirm(`删除单词 ${w.word}？`)) return
    try {
      await del(`/wordbooks/${bookId}/words/${w.id}`)
      toast.success('已删除')
      await load()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : '删除失败')
    }
  }

  return (
    <AdminPage
      title={bookName || '词库单词'}
      description={`共 ${total} 词`}
      extra={
        <div className='flex gap-2'>
          <Button variant='outline' asChild>
            <Link to='/wordbooks' search={listSearch}>
              <ArrowLeft />
              返回
            </Link>
          </Button>
          <AudioJobButtons
            job={jobs[bookId]}
            size='default'
            onBatch={() =>
              void toggleBatchAudio({
                id: bookId,
                name: bookName || `词库 #${bookId}`,
              })
            }
            onPurge={() => {
              if (!confirm('清除本词库全部音频？')) return
              void startPurgeAudio({
                id: bookId,
                name: bookName || `词库 #${bookId}`,
              })
            }}
          />
          <Button
            onClick={() => {
              setEditing(null)
              setOpen(true)
            }}
          >
            <Plus />
            添加单词
          </Button>
        </div>
      }
    >
      <form
        className='mb-4 flex gap-2'
        onSubmit={(e) => {
          e.preventDefault()
          setPage(1)
          void load(1)
        }}
      >
        <Input
          value={keyword}
          className='max-w-xs'
          placeholder='搜索单词 / 释义'
          onChange={(e) => setKeyword(e.target.value)}
        />
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
              <TableHead>单词</TableHead>
              <TableHead>音标</TableHead>
              <TableHead>释义</TableHead>
              <TableHead>音频</TableHead>
              <TableHead className='w-28'>操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.map((w) => (
              <TableRow key={w.id}>
                <TableCell className='font-medium'>{w.word}</TableCell>
                <TableCell className='text-muted-foreground'>
                  {w.phonetic || '—'}
                </TableCell>
                <TableCell className='max-w-md truncate'>
                  {w.translationShort || w.translation || '—'}
                </TableCell>
                <TableCell>{w.audioUrl ? '有' : '无'}</TableCell>
                <TableCell>
                  <Button
                    size='sm'
                    variant='ghost'
                    onClick={() => {
                      setEditing(w)
                      setOpen(true)
                    }}
                  >
                    编辑
                  </Button>
                  <Button
                    size='sm'
                    variant='ghost'
                    onClick={() => void remove(w)}
                  >
                    <Trash2 />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
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

      <WordMutateDrawer
        open={open}
        onOpenChange={setOpen}
        bookId={bookId}
        word={editing}
        onSaved={() => void load()}
      />
    </AdminPage>
  )
}
