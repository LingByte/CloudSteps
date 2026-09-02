import { useEffect, useRef, useState } from 'react'
import {
  CloudUpload,
  Download,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Send,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react'
import { toast } from 'sonner'
import { del, get, post, put } from '@/lib/api'
import { formatDateTime } from '@/lib/datetime'
import { sleep } from '@/lib/utils'
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
  CONTENT_SHEET_WIDE_PANEL_CLASS,
} from '@/components/content-sheet'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { MarkdownEditor } from '@/components/markdown-editor'
import { MarkdownView } from '@/components/markdown-view'
import { Checkbox } from '@/components/ui/checkbox'

type WechatMpArticle = {
  id: string
  title: string
  author: string
  digest: string
  content: string
  contentSourceUrl: string
  thumbMediaId: string
  thumbPreviewUrl: string
  status: string
  wechatMediaId: string
  wechatPublishId: string
  wechatArticleId?: string
  wechatArticleIndex?: number
  wechatArticleUrl?: string
  contentFormat?: string
  syncedAt?: string
  publishedAt?: string
  lastError?: string
  createdAt?: string
  updatedAt?: string
}

type FormState = {
  title: string
  author: string
  digest: string
  content: string
  contentSourceUrl: string
  thumbMediaId: string
  thumbPreviewUrl: string
}

type RemotePublishedArticle = {
  articleId: string
  index: number
  title: string
  author: string
  digest: string
  thumbUrl: string
  articleUrl: string
  updateTime: number
  isDeleted: boolean
  imported: boolean
  localId?: string
}

const remoteKey = (item: RemotePublishedArticle) => `${item.articleId}#${item.index}`

const emptyForm: FormState = {
  title: '',
  author: '',
  digest: '',
  content: '',
  contentSourceUrl: '',
  thumbMediaId: '',
  thumbPreviewUrl: '',
}

const ALL = 'all'

const statusLabel: Record<string, string> = {
  draft: '本地草稿',
  synced: '已同步草稿',
  publishing: '发布中',
  published: '已发布',
  failed: '失败',
}

const statusVariant: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  draft: 'secondary',
  synced: 'outline',
  publishing: 'default',
  published: 'default',
  failed: 'destructive',
}

function articlePreviewText(row: WechatMpArticle): string {
  const digest = row.digest?.trim()
  if (digest) return digest
  const plain = row.content
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`[^`]*`/g, '')
    .replace(/[#>*_\[\]()!-]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return plain.slice(0, 160)
}

const EDIT_SHEET_CLASS = CONTENT_SHEET_WIDE_PANEL_CLASS

export function WechatMpArticlesPage() {
  const [list, setList] = useState<WechatMpArticle[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState(ALL)
  const [loading, setLoading] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState<WechatMpArticle | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [detail, setDetail] = useState<WechatMpArticle | null>(null)
  const [deleting, setDeleting] = useState<WechatMpArticle | null>(null)
  const [actionId, setActionId] = useState<string | null>(null)
  const [uploadingThumb, setUploadingThumb] = useState(false)
  const [generatingThumb, setGeneratingThumb] = useState(false)
  const [thumbPrompt, setThumbPrompt] = useState('')
  const [thumbPromptOpen, setThumbPromptOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [remoteLoading, setRemoteLoading] = useState(false)
  const [remoteImporting, setRemoteImporting] = useState(false)
  const [remoteList, setRemoteList] = useState<RemotePublishedArticle[]>([])
  const [remoteTotal, setRemoteTotal] = useState(0)
  const [remoteOffset, setRemoteOffset] = useState(0)
  const [remoteSelected, setRemoteSelected] = useState<Record<string, boolean>>({})
  const thumbInputRef = useRef<HTMLInputElement>(null)
  const remoteCount = 20
  const pageSize = 20

  const loadRemote = async (offset = remoteOffset) => {
    setRemoteLoading(true)
    try {
      const res = await get<{
        list: RemotePublishedArticle[]
        total: number
        offset: number
      }>('/admin/wechat-mp-articles/remote/published', {
        params: { offset, count: remoteCount },
      })
      setRemoteList(res.data.list ?? [])
      setRemoteTotal(res.data.total ?? 0)
      setRemoteOffset(offset)
      setRemoteSelected({})
    } catch (e: unknown) {
      const msg =
        e && typeof e === 'object' && 'message' in e
          ? String((e as { message: string }).message)
          : '拉取微信文章失败'
      toast.error(msg)
    } finally {
      setRemoteLoading(false)
    }
  }

  const openImport = () => {
    setImportOpen(true)
    void loadRemote(0)
  }

  const toggleRemoteSelect = (item: RemotePublishedArticle, checked: boolean) => {
    const key = remoteKey(item)
    setRemoteSelected((prev) => {
      const next = { ...prev }
      if (checked) next[key] = true
      else delete next[key]
      return next
    })
  }

  const importSelected = async () => {
    const items = remoteList
      .filter((item) => remoteSelected[remoteKey(item)] && !item.imported && !item.isDeleted)
      .map((item) => ({ articleId: item.articleId, index: item.index }))
    if (items.length === 0) {
      toast.error('请选择未导入的文章')
      return
    }
    setRemoteImporting(true)
    try {
      const res = await post<{ created: WechatMpArticle[]; skipped: number; failed: string[] }>(
        '/admin/wechat-mp-articles/import',
        { items },
      )
      const created = res.data.created?.length ?? 0
      const failed = res.data.failed?.length ?? 0
      if (created > 0) {
        toast.success(`成功导入 ${created} 篇${res.data.skipped ? `，跳过 ${res.data.skipped} 篇` : ''}`)
      } else if (failed > 0) {
        toast.error(res.data.failed[0] || '导入失败')
      } else {
        toast.message(`跳过 ${res.data.skipped ?? 0} 篇（可能已导入）`)
      }
      setImportOpen(false)
      void load(page)
    } catch (e: unknown) {
      const msg =
        e && typeof e === 'object' && 'message' in e
          ? String((e as { message: string }).message)
          : '导入失败'
      toast.error(msg)
    } finally {
      setRemoteImporting(false)
    }
  }

  const load = async (p = page) => {
    setLoading(true)
    try {
      const res = await get<{ list: WechatMpArticle[]; total: number }>(
        '/admin/wechat-mp-articles',
        { params: { page: p, pageSize, status: status === ALL ? undefined : status } },
      )
      setList(res.data.list ?? [])
      setTotal(res.data.total ?? 0)
      setPage(p)
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
  }, [status])

  const openCreate = () => {
    setEditing(null)
    setForm(emptyForm)
    setThumbPrompt('')
    setThumbPromptOpen(false)
    setSheetOpen(true)
  }

  const openEdit = (row: WechatMpArticle) => {
    setEditing(row)
    setForm({
      title: row.title,
      author: row.author ?? '',
      digest: row.digest ?? '',
      content: row.content ?? '',
      contentSourceUrl: row.contentSourceUrl ?? '',
      thumbMediaId: row.thumbMediaId ?? '',
      thumbPreviewUrl: row.thumbPreviewUrl ?? '',
    })
    setThumbPrompt('')
    setThumbPromptOpen(false)
    setSheetOpen(true)
  }

  const uploadThumb = async (file: File) => {
    if (file.size > 2 * 1024 * 1024) {
      toast.error('封面图不能超过 2MB')
      return
    }
    const localPreview = URL.createObjectURL(file)
    setForm((prev) => ({ ...prev, thumbPreviewUrl: localPreview }))
    setUploadingThumb(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await post<{ mediaId: string; previewUrl?: string }>(
        '/admin/wechat-mp-articles/upload-thumb',
        fd,
        { timeout: 120_000 }
      )
      const preview = res.data.previewUrl?.trim() || localPreview
      setForm((prev) => ({
        ...prev,
        thumbMediaId: res.data.mediaId,
        thumbPreviewUrl: preview,
      }))
      toast.success('封面上传成功')
    } catch (e: unknown) {
      const msg =
        e && typeof e === 'object' && 'message' in e
          ? String((e as { message: string }).message)
          : '封面上传失败'
      toast.error(msg)
    } finally {
      setUploadingThumb(false)
    }
  }

  const generateThumb = async () => {
    setGeneratingThumb(true)
    try {
      await post<{ status?: string; started?: boolean }>(
        '/admin/wechat-mp-articles/generate-thumb',
        {
          title: form.title.trim(),
          digest: form.digest.trim(),
          prompt: thumbPrompt.trim() || undefined,
        },
        { timeout: 15_000 },
      )

      const deadline = Date.now() + 300_000
      while (Date.now() < deadline) {
        const res = await get<{
          status?: string
          error?: string
          mediaId?: string
          previewUrl?: string
        }>('/admin/wechat-mp-articles/generate-thumb', { timeout: 15_000 })

        const status = res.data?.status
        if (status === 'done') {
          const preview = res.data.previewUrl?.trim() || ''
          if (!res.data.mediaId) {
            throw new Error('封面生成完成但未返回素材 ID')
          }
          setForm((prev) => ({
            ...prev,
            thumbMediaId: res.data.mediaId!,
            thumbPreviewUrl: preview,
          }))
          toast.success('封面已生成并上传至微信素材库')
          return
        }
        if (status === 'failed') {
          throw new Error(res.data.error || '封面生成失败')
        }
        await sleep(2000)
      }
      throw new Error('封面生成超时，请稍后重试')
    } catch (e: unknown) {
      const msg =
        e && typeof e === 'object' && 'message' in e
          ? String((e as { message: string }).message)
          : '封面生成失败'
      toast.error(msg)
    } finally {
      setGeneratingThumb(false)
    }
  }

  const save = async () => {
    if (!form.title.trim()) {
      toast.error('请填写标题')
      return
    }
    setSaving(true)
    try {
      const payload = {
        title: form.title.trim(),
        author: form.author.trim(),
        digest: form.digest.trim(),
        content: form.content,
        contentSourceUrl: form.contentSourceUrl.trim(),
        thumbMediaId: form.thumbMediaId,
        thumbPreviewUrl: form.thumbPreviewUrl.startsWith('blob:') ? '' : form.thumbPreviewUrl,
      }
      if (editing) {
        await put(`/admin/wechat-mp-articles/${editing.id}`, payload)
        toast.success('已保存')
      } else {
        await post('/admin/wechat-mp-articles', payload)
        toast.success('已创建')
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

  const syncDraft = async (row: WechatMpArticle) => {
    setActionId(row.id)
    try {
      await post(`/admin/wechat-mp-articles/${row.id}/sync-draft`)
      toast.success('已同步到微信草稿箱')
      void load(page)
    } catch (e: unknown) {
      const msg =
        e && typeof e === 'object' && 'message' in e
          ? String((e as { message: string }).message)
          : '同步失败'
      toast.error(msg)
    } finally {
      setActionId(null)
    }
  }

  const publish = async (row: WechatMpArticle) => {
    setActionId(row.id)
    try {
      await post(`/admin/wechat-mp-articles/${row.id}/publish`)
      toast.success('已提交微信发布')
      void load(page)
    } catch (e: unknown) {
      const msg =
        e && typeof e === 'object' && 'message' in e
          ? String((e as { message: string }).message)
          : '发布失败'
      toast.error(msg)
    } finally {
      setActionId(null)
    }
  }

  const confirmDelete = async () => {
    if (!deleting) return
    try {
      await del(`/admin/wechat-mp-articles/${deleting.id}`)
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
      title='公众号图文'
      description='在后台编辑图文，或从微信公众号导入已发布文章。同步/发布需开通相应接口权限。'
      extra={
        <div className='flex gap-2'>
          <Button variant='outline' size='sm' onClick={() => void load(page)}>
            <RefreshCw className='size-4' />
            刷新
          </Button>
          <Button variant='outline' size='sm' onClick={openImport}>
            <Download className='size-4' />
            从公众号导入
          </Button>
          <Button size='sm' onClick={openCreate}>
            <Plus className='size-4' />
            新建图文
          </Button>
        </div>
      }
    >
      <div className='mb-4 flex flex-wrap items-center gap-3'>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className='w-40'>
            <SelectValue placeholder='状态' />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>全部状态</SelectItem>
            <SelectItem value='draft'>本地草稿</SelectItem>
            <SelectItem value='synced'>已同步草稿</SelectItem>
            <SelectItem value='published'>已发布</SelectItem>
            <SelectItem value='failed'>失败</SelectItem>
          </SelectContent>
        </Select>
        <span className='text-sm text-muted-foreground'>共 {total} 条</span>
      </div>

      <div className='rounded-md border'>
        {loading ? (
          <div className='flex h-32 items-center justify-center text-muted-foreground'>
            <Loader2 className='size-5 animate-spin' />
          </div>
        ) : list.length === 0 ? (
          <div className='flex h-32 items-center justify-center text-muted-foreground'>暂无图文</div>
        ) : (
          <div className='divide-y'>
            {list.map((row) => {
              const preview = articlePreviewText(row)
              return (
                <div
                  key={row.id}
                  className='flex gap-4 p-4 transition-colors hover:bg-muted/30 sm:gap-5 sm:p-5'
                >
                  <button
                    type='button'
                    className='shrink-0'
                    onClick={() => setDetail(row)}
                    title='查看详情'
                  >
                    {row.thumbPreviewUrl ? (
                      <img
                        src={row.thumbPreviewUrl}
                        alt=''
                        className='size-24 rounded-lg border object-cover shadow-sm sm:size-28'
                      />
                    ) : (
                      <div
                        className='flex size-24 items-center justify-center rounded-lg border bg-muted/50 text-xs text-muted-foreground sm:size-28'
                      >
                        无封面
                      </div>
                    )}
                  </button>

                  <div className='min-w-0 flex-1 space-y-2'>
                    <div className='flex flex-wrap items-start justify-between gap-2'>
                      <div className='min-w-0 space-y-1'>
                        <button
                          type='button'
                          className='text-left text-base font-semibold leading-snug hover:text-primary'
                          onClick={() => setDetail(row)}
                        >
                          {row.title || '未命名'}
                        </button>
                        <div className='flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground'>
                          {row.author ? <span>作者：{row.author}</span> : null}
                          {row.wechatMediaId ? (
                            <span className='truncate max-w-[200px]'>
                              草稿 ID：{row.wechatMediaId}
                            </span>
                          ) : null}
                        </div>
                      </div>
                      <Badge
                        variant={statusVariant[row.status] ?? 'secondary'}
                        className='shrink-0'
                      >
                        {statusLabel[row.status] ?? row.status}
                      </Badge>
                    </div>

                    {preview ? (
                      <p className='text-sm leading-relaxed text-muted-foreground line-clamp-2'>
                        {preview}
                      </p>
                    ) : (
                      <p className='text-sm text-muted-foreground'>暂无摘要或正文</p>
                    )}

                    <div className='flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground'>
                      <span>创建：{formatDateTime(row.createdAt)}</span>
                      {row.syncedAt ? <span>同步：{formatDateTime(row.syncedAt)}</span> : null}
                      {row.publishedAt ? (
                        <span>发布：{formatDateTime(row.publishedAt)}</span>
                      ) : null}
                      {row.contentSourceUrl ? (
                        <a
                          href={row.contentSourceUrl}
                          target='_blank'
                          rel='noreferrer'
                          className='text-primary hover:underline line-clamp-1 max-w-[240px]'
                        >
                          原文链接
                        </a>
                      ) : null}
                      {row.wechatArticleUrl ? (
                        <a
                          href={row.wechatArticleUrl}
                          target='_blank'
                          rel='noreferrer'
                          className='text-primary hover:underline'
                        >
                          微信文章
                        </a>
                      ) : null}
                    </div>

                    {row.lastError ? (
                      <p className='text-xs text-destructive line-clamp-2'>{row.lastError}</p>
                    ) : null}
                  </div>

                  <div className='flex shrink-0 flex-row gap-0.5 sm:flex-col sm:gap-1'>
                    <Button
                      variant='ghost'
                      size='icon'
                      onClick={() => openEdit(row)}
                      title='编辑'
                    >
                      <Pencil className='size-4' />
                    </Button>
                    <Button
                      variant='ghost'
                      size='icon'
                      title='同步草稿'
                      disabled={actionId === row.id}
                      onClick={() => void syncDraft(row)}
                    >
                      {actionId === row.id ? (
                        <Loader2 className='size-4 animate-spin' />
                      ) : (
                        <CloudUpload className='size-4' />
                      )}
                    </Button>
                    <Button
                      variant='ghost'
                      size='icon'
                      title='发布'
                      disabled={actionId === row.id || !row.wechatMediaId}
                      onClick={() => void publish(row)}
                    >
                      <Send className='size-4' />
                    </Button>
                    <Button
                      variant='ghost'
                      size='icon'
                      title='删除'
                      onClick={() => setDeleting(row)}
                    >
                      <Trash2 className='size-4 text-destructive' />
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {totalPages > 1 ? (
        <div className='mt-4 flex items-center justify-end gap-2'>
          <Button variant='outline' size='sm' disabled={page <= 1} onClick={() => void load(page - 1)}>
            上一页
          </Button>
          <span className='text-sm text-muted-foreground'>
            {page} / {totalPages}
          </span>
          <Button
            variant='outline'
            size='sm'
            disabled={page >= totalPages}
            onClick={() => void load(page + 1)}
          >
            下一页
          </Button>
        </div>
      ) : null}

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className={EDIT_SHEET_CLASS}>
          <SheetHeader className={CONTENT_SHEET_HEADER_CLASS}>
            <SheetTitle>{editing ? '编辑图文' : '新建图文'}</SheetTitle>
            <SheetDescription>
              正文支持 Markdown，同步时会转为 HTML 推送到微信草稿箱。
            </SheetDescription>
          </SheetHeader>
          <div className={CONTENT_SHEET_BODY_CLASS}>
            <div className='space-y-5'>
              <AiContentAssist
                kind='wechat_mp_article'
                title={form.title}
                digest={form.digest}
                onApply={(data) =>
                  setForm((f) => ({
                    ...f,
                    title: data.title?.trim() || f.title,
                    digest: data.digest?.trim() || f.digest,
                    content: data.content?.trim() || f.content,
                  }))
                }
              />
              <div className='space-y-2'>
                <Label htmlFor='mp-title'>标题</Label>
                <Input
                  id='mp-title'
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder='不超过 32 字'
                />
              </div>
              <div className='grid gap-4 sm:grid-cols-2'>
                <div className='space-y-2'>
                  <Label htmlFor='mp-author'>作者</Label>
                  <Input
                    id='mp-author'
                    value={form.author}
                    onChange={(e) => setForm((f) => ({ ...f, author: e.target.value }))}
                  />
                </div>
                <div className='space-y-2'>
                  <Label htmlFor='mp-source'>原文链接</Label>
                  <Input
                    id='mp-source'
                    value={form.contentSourceUrl}
                    onChange={(e) => setForm((f) => ({ ...f, contentSourceUrl: e.target.value }))}
                    placeholder='可选'
                  />
                </div>
              </div>
              <div className='space-y-2'>
                <Label htmlFor='mp-digest'>摘要</Label>
                <Input
                  id='mp-digest'
                  value={form.digest}
                  onChange={(e) => setForm((f) => ({ ...f, digest: e.target.value }))}
                  placeholder='不超过 120 字，留空则微信自动截取'
                />
              </div>
              <div className='space-y-2'>
                <Label>封面图</Label>
                <div className='rounded-lg border bg-muted/30 p-4'>
                  <div className='flex flex-col gap-4 sm:flex-row sm:items-start'>
                    {form.thumbPreviewUrl ? (
                      <img
                        src={form.thumbPreviewUrl}
                        alt='封面预览'
                        className='h-36 w-full max-w-xs shrink-0 rounded-lg border object-cover shadow-sm sm:h-32 sm:w-48'
                      />
                    ) : (
                      <div
                        className='flex h-36 w-full max-w-xs shrink-0 items-center justify-center rounded-lg border bg-background text-sm text-muted-foreground sm:h-32 sm:w-48'
                      >
                        无封面
                      </div>
                    )}
                    <div className='min-w-0 flex-1 space-y-3'>
                      <p className='text-xs leading-relaxed text-muted-foreground'>
                        JPG / PNG，不超过 2MB。可上传或 AI 生成；生成后会同步至微信素材库并保留预览。
                      </p>
                      {thumbPromptOpen ? (
                        <textarea
                          value={thumbPrompt}
                          onChange={(e) => setThumbPrompt(e.target.value)}
                          rows={3}
                          placeholder='可选：自定义封面画面描述；留空则根据标题与摘要自动生成'
                          className='w-full rounded-md border border-input bg-background px-3 py-2 text-xs leading-relaxed'
                        />
                      ) : null}
                      <input
                        ref={thumbInputRef}
                        type='file'
                        accept='image/jpeg,image/png,image/jpg'
                        className='hidden'
                        onChange={(e) => {
                          const file = e.target.files?.[0]
                          if (file) void uploadThumb(file)
                          e.target.value = ''
                        }}
                      />
                      <div className='flex flex-wrap items-center gap-2'>
                        <Button
                          type='button'
                          variant='outline'
                          size='sm'
                          disabled={uploadingThumb || generatingThumb}
                          onClick={() => thumbInputRef.current?.click()}
                        >
                          {uploadingThumb ? (
                            <Loader2 className='size-4 animate-spin' />
                          ) : (
                            <Upload className='size-4' />
                          )}
                          {form.thumbMediaId ? '更换封面' : '上传封面'}
                        </Button>
                        <Button
                          type='button'
                          variant='outline'
                          size='sm'
                          disabled={uploadingThumb || generatingThumb}
                          onClick={() => void generateThumb()}
                        >
                          {generatingThumb ? (
                            <Loader2 className='size-4 animate-spin' />
                          ) : (
                            <Sparkles className='size-4' />
                          )}
                          AI 生成封面
                        </Button>
                        <Button
                          type='button'
                          variant='ghost'
                          size='sm'
                          className='text-xs'
                          onClick={() => setThumbPromptOpen((v) => !v)}
                        >
                          {thumbPromptOpen ? '收起描述' : '自定义画面'}
                        </Button>
                        {form.thumbMediaId ? (
                          <Badge variant='outline' className='text-xs'>
                            已上传微信素材
                          </Badge>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div className='space-y-2'>
                <Label>
                  {editing?.contentFormat === 'html' ? '正文（HTML）' : '正文（Markdown）'}
                </Label>
                {editing?.contentFormat === 'html' ? (
                  <textarea
                    value={form.content}
                    onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
                    className='min-h-[320px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono leading-relaxed'
                  />
                ) : (
                  <MarkdownEditor
                    value={form.content}
                    onChange={(value) => setForm((f) => ({ ...f, content: value }))}
                    minHeight='320px'
                  />
                )}
              </div>
            </div>
          </div>
          <SheetFooter className={CONTENT_SHEET_FOOTER_CLASS}>
            <Button variant='outline' onClick={() => setSheetOpen(false)}>
              取消
            </Button>
            <Button onClick={() => void save()} disabled={saving}>
              {saving ? <Loader2 className='size-4 animate-spin' /> : null}
              保存
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <Sheet open={!!detail} onOpenChange={(open) => !open && setDetail(null)}>
        <SheetContent className={EDIT_SHEET_CLASS}>
          <SheetHeader className={CONTENT_SHEET_HEADER_CLASS}>
            <SheetTitle>{detail?.title}</SheetTitle>
            <SheetDescription>
              {detail ? statusLabel[detail.status] ?? detail.status : ''}
              {detail?.wechatMediaId ? ` · media_id: ${detail.wechatMediaId}` : ''}
            </SheetDescription>
          </SheetHeader>
          <div className={CONTENT_SHEET_BODY_CLASS}>
            {detail?.thumbPreviewUrl ? (
              <img
                src={detail.thumbPreviewUrl}
                alt=''
                className='mb-4 max-h-48 w-full rounded-lg border object-cover'
              />
            ) : null}
            {detail?.digest ? (
              <p className='mb-4 text-sm text-muted-foreground leading-relaxed'>{detail.digest}</p>
            ) : null}
            {detail?.content ? (
              detail.contentFormat === 'html' ? (
                <div
                  className='prose prose-sm max-w-none text-sm leading-relaxed'
                  dangerouslySetInnerHTML={{ __html: detail.content }}
                />
              ) : (
                <MarkdownView content={detail.content} />
              )
            ) : null}
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={importOpen} onOpenChange={setImportOpen}>
        <SheetContent className='w-full overflow-y-auto sm:max-w-2xl'>
          <SheetHeader>
            <SheetTitle>从公众号导入已发布文章</SheetTitle>
            <SheetDescription>
              拉取微信侧已发布图文并导入本地。已导入的文章会标记，不会重复导入。
            </SheetDescription>
          </SheetHeader>
          <div className='flex items-center justify-between py-3'>
            <span className='text-sm text-muted-foreground'>微信共 {remoteTotal} 条发布记录</span>
            <Button variant='outline' size='sm' disabled={remoteLoading} onClick={() => void loadRemote(remoteOffset)}>
              <RefreshCw className={`size-4 ${remoteLoading ? 'animate-spin' : ''}`} />
              刷新
            </Button>
          </div>
          <div className='rounded-md border'>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className='w-10' />
                  <TableHead>标题</TableHead>
                  <TableHead className='w-36'>更新时间</TableHead>
                  <TableHead className='w-20'>状态</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {remoteLoading ? (
                  <TableRow>
                    <TableCell colSpan={4} className='h-24 text-center'>
                      <Loader2 className='mx-auto size-5 animate-spin' />
                    </TableCell>
                  </TableRow>
                ) : remoteList.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className='h-24 text-center text-muted-foreground'>
                      暂无已发布文章
                    </TableCell>
                  </TableRow>
                ) : (
                  remoteList.map((item) => {
                    const key = remoteKey(item)
                    const disabled = item.imported || item.isDeleted
                    return (
                      <TableRow key={key}>
                        <TableCell>
                          <Checkbox
                            checked={!!remoteSelected[key]}
                            disabled={disabled}
                            onCheckedChange={(checked) => toggleRemoteSelect(item, checked === true)}
                          />
                        </TableCell>
                        <TableCell>
                          <div className='font-medium line-clamp-1'>{item.title || '未命名'}</div>
                          {item.articleUrl ? (
                            <a
                              href={item.articleUrl}
                              target='_blank'
                              rel='noreferrer'
                              className='text-xs text-primary hover:underline'
                            >
                              预览链接
                            </a>
                          ) : null}
                        </TableCell>
                        <TableCell className='text-sm text-muted-foreground'>
                          {item.updateTime
                            ? formatDateTime(new Date(item.updateTime * 1000).toISOString())
                            : '-'}
                        </TableCell>
                        <TableCell>
                          {item.imported ? (
                            <Badge variant='outline'>已导入</Badge>
                          ) : item.isDeleted ? (
                            <Badge variant='secondary'>已删除</Badge>
                          ) : (
                            <Badge variant='default'>可导入</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>
          {remoteTotal > remoteCount ? (
            <div className='mt-4 flex items-center justify-end gap-2'>
              <Button
                variant='outline'
                size='sm'
                disabled={remoteOffset <= 0 || remoteLoading}
                onClick={() => void loadRemote(Math.max(0, remoteOffset - remoteCount))}
              >
                上一页
              </Button>
              <span className='text-sm text-muted-foreground'>
                {Math.floor(remoteOffset / remoteCount) + 1} /{' '}
                {Math.max(1, Math.ceil(remoteTotal / remoteCount))}
              </span>
              <Button
                variant='outline'
                size='sm'
                disabled={remoteOffset + remoteCount >= remoteTotal || remoteLoading}
                onClick={() => void loadRemote(remoteOffset + remoteCount)}
              >
                下一页
              </Button>
            </div>
          ) : null}
          <SheetFooter className='pt-4'>
            <Button variant='outline' onClick={() => setImportOpen(false)}>
              取消
            </Button>
            <Button disabled={remoteImporting} onClick={() => void importSelected()}>
              {remoteImporting ? <Loader2 className='size-4 animate-spin' /> : null}
              导入选中
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        title='删除图文'
        desc={`确定删除「${deleting?.title ?? ''}」？此操作不会删除微信侧草稿。`}
        confirmText='删除'
        cancelBtnText='取消'
        destructive
        handleConfirm={confirmDelete}
      />
    </AdminPage>
  )
}
