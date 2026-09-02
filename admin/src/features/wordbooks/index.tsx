import { useEffect, useState } from 'react'
import { getRouteApi, Link } from '@tanstack/react-router'
import { Loader2, Plus, Sparkles, Trash2, Wand2, X } from 'lucide-react'
import { toast } from 'sonner'
import { del, get, post, put } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
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
import { Switch } from '@/components/ui/switch'
import { AdminPage } from '@/components/admin-page'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { AudioJobButtons } from './audio-job-buttons'
import { coverJobButtonLabel } from './cover-jobs'
import {
  buildDescriptionFromForm,
  emptyWordBookForm,
  type WordBookEditForm,
  wordBookToForm,
} from './cover-meta'
import { CoverMetaBadges } from './cover-meta-badges'
import {
  DEFAULT_WORDBOOK_GROUPS,
  defaultWordbooksSearch,
  hasWordbookFilters,
  WORDBOOK_LEVELS,
  wordbooksApiParams,
  wordbooksListSearch,
  type WordbooksSearch,
} from './search'
import { useWordBookAudioJobs } from './use-wordbook-audio-jobs'
import { useWordbookCoverJobs } from './use-wordbook-cover-jobs'
import { WordbookCoverDrawer } from './wordbook-cover-drawer'

const route = getRouteApi('/_authenticated/wordbooks/')

// 封面渐变色组（与 web 端 WordBooks.tsx 保持一致）
const COVER_GRADIENTS: [string, string][] = [
  ['#4ECDC4', '#44A5A0'],
  ['#5B8DEF', '#4A7BC8'],
  ['#F6B042', '#E89832'],
  ['#E8718E', '#D45C78'],
  ['#8B7FD8', '#7B6BC8'],
  ['#66BB6A', '#4CAF50'],
  ['#FF8A65', '#FF7043'],
  ['#26C6DA', '#00ACC1'],
]

function hashStr(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

function pickGradient(tag: string): [string, string] {
  return COVER_GRADIENTS[hashStr(tag) % COVER_GRADIENTS.length]
}

type WordBook = {
  id: string | number
  name: string
  description: string
  level: string
  wordCount: number
  coverUrl: string
  isActive: boolean
}

type WordBookGroup = { key: string; label: string }

const ALL = 'all'

const COVER_CAT_OPTIONS = [
  '小学',
  '初中',
  '高中',
  '大学',
  '考研',
  '留学考试',
  '教材',
  '其他',
]

export function WordBooksPage() {
  const search = route.useSearch()
  const navigate = route.useNavigate()
  const [list, setList] = useState<WordBook[]>([])
  const [total, setTotal] = useState(0)
  const [groups, setGroups] = useState<WordBookGroup[]>([
    ...DEFAULT_WORDBOOK_GROUPS,
  ])
  const [sources, setSources] = useState<string[]>([])
  const [keywordInput, setKeywordInput] = useState(search.keyword ?? '')
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<WordBook | null>(null)
  const [form, setForm] = useState<WordBookEditForm>(emptyWordBookForm())
  const [saving, setSaving] = useState(false)
  const [publishingId, setPublishingId] = useState<number | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<WordBook | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [coverBook, setCoverBook] = useState<WordBook | null>(null)
  const {
    jobs,
    pageBatching,
    toggleBatchAudio,
    startPageBatchAudio,
    startPurgeAudio,
  } = useWordBookAudioJobs(list)
  const {
    jobs: coverJobs,
    startCoverJob,
    saveCover,
    clearCover,
    refreshBookJob,
  } = useWordbookCoverJobs(list)

  const page = search.page
  const pageSize = search.pageSize
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  const patchSearch = (next: Partial<WordbooksSearch>) => {
    void navigate({
      search: (prev) => wordbooksListSearch({ ...prev, ...next }),
      replace: true,
    })
  }

  const load = async () => {
    setLoading(true)
    try {
      const res = await get<{
        list: WordBook[]
        total: number
        groups?: WordBookGroup[]
        sources?: string[]
      }>(`/wordbooks/list?${wordbooksApiParams(search)}`)
      setList(res.data.list || [])
      setTotal(res.data.total || 0)
      if (Array.isArray(res.data.groups) && res.data.groups.length > 0) {
        setGroups(res.data.groups)
      }
      if (Array.isArray(res.data.sources)) {
        setSources(res.data.sources)
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : '加载词库失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    setKeywordInput(search.keyword ?? '')
  }, [search.keyword])

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    search.page,
    search.pageSize,
    search.keyword,
    search.isActive,
    search.group,
    search.sourceName,
    search.level,
  ])

  const save = async () => {
    if (!form.name.trim()) {
      toast.error('请填写词库名称')
      return
    }
    setSaving(true)
    try {
      const payload = {
        name: form.name.trim(),
        level: form.level.trim(),
        description: buildDescriptionFromForm(form),
      }
      if (editing) await put(`/wordbooks/${editing.id}`, payload)
      else await post('/wordbooks', payload)
      toast.success(editing ? '已更新' : '已创建')
      setOpen(false)
      await load()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const requestDelete = (b: WordBook) => {
    setDeleteTarget(b)
    setDeleteOpen(true)
  }

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await del(`/wordbooks/${deleteTarget.id}`)
      toast.success('已删除')
      await load()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : '删除失败')
    } finally {
      setDeleting(false)
      setDeleteOpen(false)
      setDeleteTarget(null)
    }
  }

  const publish = async (b: WordBook) => {
    if (publishingId === b.id) return
    setPublishingId(b.id)
    try {
      await put(`/wordbooks/${b.id}`, { isActive: true })
      toast.success(`「${b.name}」已上架`)
      setList((prev) =>
        prev.map((item) =>
          item.id === b.id ? { ...item, isActive: true } : item
        )
      )
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : '上架失败')
    } finally {
      setPublishingId(null)
    }
  }

  const listSearch = wordbooksListSearch(search)

  return (
    <AdminPage
      title='词库管理'
      description={`共 ${total} 本`}
      extra={
        <div className='flex flex-wrap items-center gap-2'>
          <Button
            variant='outline'
            disabled={pageBatching || loading || list.length === 0}
            onClick={() => void startPageBatchAudio(list)}
          >
            {pageBatching ? <Loader2 className='animate-spin' /> : <Wand2 />}
            批量生成当前页音频
          </Button>
          <Button
            onClick={() => {
              setEditing(null)
              setForm(emptyWordBookForm())
              setOpen(true)
            }}
          >
            <Plus />
            新建词库
          </Button>
        </div>
      }
    >
      <form
        className='mb-4 flex flex-wrap items-center gap-2'
        onSubmit={(e) => {
          e.preventDefault()
          patchSearch({ keyword: keywordInput.trim() || undefined, page: 1 })
        }}
      >
        <Input
          value={keywordInput}
          onChange={(e) => setKeywordInput(e.target.value)}
          placeholder='搜索词库名称'
          className='w-full sm:w-56'
        />
        <Select
          value={search.isActive ?? ALL}
          onValueChange={(v) =>
            patchSearch({
              isActive: v === ALL ? undefined : (v as 'true' | 'false'),
              page: 1,
            })
          }
        >
          <SelectTrigger className='w-full sm:w-32'>
            <SelectValue placeholder='上架状态' />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>全部状态</SelectItem>
            <SelectItem value='true'>已上架</SelectItem>
            <SelectItem value='false'>未上架</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={search.group ?? ALL}
          onValueChange={(v) =>
            patchSearch({ group: v === ALL ? undefined : v, page: 1 })
          }
        >
          <SelectTrigger className='w-full sm:w-36'>
            <SelectValue placeholder='分类' />
          </SelectTrigger>
          <SelectContent>
            {groups.map((g) => (
              <SelectItem key={g.key || ALL} value={g.key || ALL}>
                {g.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={search.level ?? ALL}
          onValueChange={(v) =>
            patchSearch({ level: v === ALL ? undefined : v, page: 1 })
          }
        >
          <SelectTrigger className='w-full sm:w-28'>
            <SelectValue placeholder='级别' />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>全部级别</SelectItem>
            {WORDBOOK_LEVELS.map((lv) => (
              <SelectItem key={lv} value={lv}>
                {lv}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={search.sourceName ?? ALL}
          onValueChange={(v) =>
            patchSearch({ sourceName: v === ALL ? undefined : v, page: 1 })
          }
        >
          <SelectTrigger className='w-full sm:w-40'>
            <SelectValue placeholder='来源' />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>全部来源</SelectItem>
            {sources.map((source) => (
              <SelectItem key={source} value={source}>
                {source}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button type='submit' variant='secondary'>
          搜索
        </Button>
        {hasWordbookFilters(search) ? (
          <Button
            type='button'
            variant='ghost'
            onClick={() => {
              setKeywordInput('')
              void navigate({ search: defaultWordbooksSearch(), replace: true })
            }}
          >
            <X />
            清空筛选
          </Button>
        ) : null}
      </form>

      {loading ? (
        <div className='flex items-center gap-2 text-sm text-muted-foreground'>
          <Loader2 className='size-4 animate-spin' />
          加载中…
        </div>
      ) : (
        <div className='grid gap-4 sm:grid-cols-2 xl:grid-cols-3'>
          {list.map((b) => {
            const coverJob = coverJobs[b.id]
            const coverSrc = coverJob?.previewUrl || b.coverUrl
            const coverBusy =
              coverJob?.status === 'queued' || coverJob?.status === 'running'
            return (
              <Card key={b.id}>
                <CardHeader className='flex flex-row items-start justify-between space-y-0'>
                  <div>
                    <CardTitle className='text-base'>
                      <Link
                        to='/wordbooks/$bookId'
                        params={{ bookId: String(b.id) }}
                        search={listSearch}
                        className='hover:underline'
                      >
                        {b.name}
                      </Link>
                    </CardTitle>
                    <div className='mt-1.5'>
                      <CoverMetaBadges description={b.description} />
                    </div>
                  </div>
                  {b.isActive ? (
                    <Badge variant='default'>已上架</Badge>
                  ) : (
                    <Button
                      size='sm'
                      variant='outline'
                      disabled={publishingId === b.id}
                      onClick={() => void publish(b)}
                    >
                      {publishingId === b.id ? (
                        <Loader2 className='animate-spin' />
                      ) : null}
                      上架
                    </Button>
                  )}
                </CardHeader>
                <CardContent className='space-y-3'>
                  <div className='relative aspect-[1792/1024] w-full overflow-hidden rounded-md border bg-muted'>
                    {coverSrc ? (
                      <img
                        src={coverSrc}
                        alt={`${b.name} 封面`}
                        className='absolute inset-0 h-full w-full object-cover'
                      />
                    ) : (
                      <div
                        className='flex h-full w-full items-center justify-center px-2'
                        style={{
                          background: `linear-gradient(135deg, ${pickGradient(b.name)[0]}, ${pickGradient(b.name)[1]})`,
                        }}
                      >
                        <span className='line-clamp-2 text-center text-sm font-bold text-white'>
                          {b.name}
                        </span>
                      </div>
                    )}
                    <Button
                      type='button'
                      size='sm'
                      variant='secondary'
                      className='absolute right-2 bottom-2 z-10 shadow-sm'
                      onClick={() => setCoverBook(b)}
                    >
                      {coverBusy ? (
                        <Loader2 className='size-4 animate-spin' />
                      ) : (
                        <Sparkles className='size-4' />
                      )}
                      {coverJobButtonLabel(coverJob)}
                    </Button>
                  </div>
                  <div className='flex items-center justify-between text-sm text-muted-foreground'>
                    <span>{b.level || '—'}</span>
                    <span>{b.wordCount ?? 0} 词</span>
                  </div>
                  <div className='flex flex-wrap gap-2'>
                    <Button size='sm' variant='outline' asChild>
                      <Link
                        to='/wordbooks/$bookId'
                        params={{ bookId: String(b.id) }}
                        search={listSearch}
                      >
                        单词
                      </Link>
                    </Button>
                    <AudioJobButtons
                      job={jobs[b.id]}
                      onBatch={() => void toggleBatchAudio(b)}
                      onPurge={() => void startPurgeAudio(b)}
                    />
                    <Button
                      size='sm'
                      variant='outline'
                      onClick={() => setCoverBook(b)}
                    >
                      {coverBusy ? (
                        <Loader2 className='size-4 animate-spin' />
                      ) : (
                        <Sparkles className='size-4' />
                      )}
                      {coverJobButtonLabel(coverJob)}
                    </Button>
                    <Button
                      size='sm'
                      variant='ghost'
                      onClick={() => {
                        setEditing(b)
                        setForm(wordBookToForm(b))
                        setOpen(true)
                      }}
                    >
                      编辑
                    </Button>
                    <Button
                      size='sm'
                      variant='ghost'
                      onClick={() => requestDelete(b)}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <div className='mt-4 flex items-center justify-end gap-2 text-sm'>
        <Button
          variant='outline'
          size='sm'
          disabled={page <= 1}
          onClick={() => patchSearch({ page: Math.max(1, page - 1) })}
        >
          上一页
        </Button>
        <span>
          {page} / {totalPages}
        </span>
        <Button
          variant='outline'
          size='sm'
          disabled={page >= totalPages}
          onClick={() => patchSearch({ page: page + 1 })}
        >
          下一页
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className='max-w-md gap-0 p-0'>
          <DialogHeader className='border-b px-6 py-4'>
            <DialogTitle>{editing ? '编辑词库' : '新建词库'}</DialogTitle>
          </DialogHeader>
          <div className='grid gap-4 px-6 py-4'>
            <div className='grid gap-1.5'>
              <Label>名称</Label>
              <Input
                value={form.name}
                onChange={(e) =>
                  setForm((f) => ({ ...f, name: e.target.value }))
                }
              />
            </div>
            <div className='grid gap-1.5'>
              <Label>CEFR 级别</Label>
              <Select
                value={form.level}
                onValueChange={(v) => setForm((f) => ({ ...f, level: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder='选择级别' />
                </SelectTrigger>
                <SelectContent>
                  {WORDBOOK_LEVELS.map((lv) => (
                    <SelectItem key={lv} value={lv}>
                      {lv}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className='space-y-3 rounded-lg border bg-muted/30 p-4'>
              <p className='text-sm font-medium'>封面标签</p>
              <p className='text-xs text-muted-foreground'>
                用于学员端词库卡片展示，保存为结构化数据而非 JSON 文本。
              </p>
              <div className='grid gap-3 sm:grid-cols-2'>
                <div className='grid gap-1.5 sm:col-span-2'>
                  <Label className='text-xs'>学段分类</Label>
                  <Select
                    value={form.coverCat || '__none__'}
                    onValueChange={(v) =>
                      setForm((f) => ({
                        ...f,
                        coverCat: v === '__none__' ? '' : v,
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder='如：小学' />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value='__none__'>不设置</SelectItem>
                      {COVER_CAT_OPTIONS.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className='grid gap-1.5'>
                  <Label className='text-xs'>上标题 (t1)</Label>
                  <Input
                    placeholder='如：小学英语'
                    value={form.coverT1}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, coverT1: e.target.value }))
                    }
                  />
                </div>
                <div className='grid gap-1.5'>
                  <Label className='text-xs'>下标题 (t2)</Label>
                  <Input
                    placeholder='如：六年级下册'
                    value={form.coverT2}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, coverT2: e.target.value }))
                    }
                  />
                </div>
                <div className='grid gap-1.5 sm:col-span-2'>
                  <Label className='text-xs'>版本标签 (tag)</Label>
                  <Input
                    placeholder='如：陕旅版三起'
                    value={form.coverTag}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, coverTag: e.target.value }))
                    }
                  />
                </div>
              </div>
            </div>
            <div className='grid gap-1.5'>
              <Label>文字简介（可选）</Label>
              <Input
                placeholder='无封面标签时作为普通简介展示'
                value={form.notes}
                onChange={(e) =>
                  setForm((f) => ({ ...f, notes: e.target.value }))
                }
                disabled={Boolean(
                  form.coverTag.trim() ||
                  form.coverT1.trim() ||
                  form.coverT2.trim() ||
                  form.coverCat.trim()
                )}
              />
              {form.coverTag ||
              form.coverT1 ||
              form.coverT2 ||
              form.coverCat ? (
                <p className='text-xs text-muted-foreground'>
                  已填写封面标签时，简介以标签形式展示，无需填写此项。
                </p>
              ) : null}
            </div>
            {editing ? (
              <div className='flex items-center gap-2'>
                <Switch
                  checked={editing.isActive}
                  onCheckedChange={async (v) => {
                    try {
                      await put(`/wordbooks/${editing.id}`, { isActive: v })
                      toast.success(v ? '已上架' : '已下架')
                      await load()
                    } catch (e: unknown) {
                      toast.error(e instanceof Error ? e.message : '更新失败')
                    }
                  }}
                />
                <span className='text-sm'>上架</span>
              </div>
            ) : null}
          </div>
          <DialogFooter className='border-t bg-muted/30 px-6 py-4'>
            <Button variant='outline' onClick={() => setOpen(false)}>
              取消
            </Button>
            <Button onClick={() => void save()} disabled={saving}>
              {saving ? <Loader2 className='animate-spin' /> : '保存'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={(v) => {
          setDeleteOpen(v)
          if (!v) setDeleteTarget(null)
        }}
        destructive
        isLoading={deleting}
        title='确认删除词库？'
        desc={
          deleteTarget
            ? `将永久删除词库「${deleteTarget.name}」以及其相关单词与学习数据。此操作不可撤销。`
            : '将永久删除该词库。此操作不可撤销。'
        }
        confirmText='删除'
        handleConfirm={handleDeleteConfirm}
      />

      <WordbookCoverDrawer
        book={coverBook}
        open={!!coverBook}
        onOpenChange={(v) => {
          if (!v) setCoverBook(null)
        }}
        job={coverBook ? coverJobs[coverBook.id] : undefined}
        onStart={async (book, opts) => {
          const r = await startCoverJob(book, opts)
          return r === 'started'
        }}
        onSave={async (book) => {
          const url = await saveCover(book)
          if (url) {
            setList((prev) =>
              prev.map((item) =>
                item.id === book.id ? { ...item, coverUrl: url } : item
              )
            )
            setCoverBook((prev) =>
              prev?.id === book.id ? { ...prev, coverUrl: url } : prev
            )
          }
        }}
        onClear={async (book) => {
          await clearCover(book)
          setList((prev) =>
            prev.map((item) =>
              item.id === book.id ? { ...item, coverUrl: '' } : item
            )
          )
          setCoverBook((prev) =>
            prev?.id === book.id ? { ...prev, coverUrl: '' } : prev
          )
        }}
        onRefreshJob={refreshBookJob}
      />
    </AdminPage>
  )
}
