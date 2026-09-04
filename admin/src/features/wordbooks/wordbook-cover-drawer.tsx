import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { ImageIcon, Loader2, Sparkles, Trash2, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { get, post } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Textarea } from '@/components/ui/textarea'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { type CoverJob, isCoverJobActive } from './cover-jobs'
import { parseCoverMeta } from './cover-meta'

// 默认提示词模板，由管理后台维护，后端不再硬编码。
const DEFAULT_PROMPT_TEMPLATE = `Design an original English vocabulary wordbook cover thumbnail for a learning app.
The cover MUST include clear, readable text (Chinese and/or English) as the main focus:
- Top line (large): "{{t1}}"
- Bottom line (medium): "{{t2}}"
- Version or series tag (small badge): "{{tag}}"
- Category label: "{{cat}}" · CEFR level "{{level}}"
- Wordbook name reference: "{{name}}"
Layout: modern flat illustration, soft gradient background, subtle geometric shapes and education motifs (book, lightbulb, globe) around the typography — do not let decorations obscure the text.
Typography: bold, high contrast, legible at small thumbnail size; balanced composition like a clean app icon cover.
Do not imitate real publisher or textbook covers; no third-party logos; copyright-safe original artwork.
Mood: friendly, bright, professional.`

type WordBookBrief = {
  id: string | number
  name: string
  level?: string
  description?: string
  coverUrl?: string
}

type CoverSizeOption = {
  value: string
  label: string
}

type CoverDefaults = {
  model: string
  configured: boolean
  defaultSize: string
  sizeOptions?: CoverSizeOption[]
}

type WordbookCoverDrawerProps = {
  book: WordBookBrief | null
  open: boolean
  onOpenChange: (open: boolean) => void
  job?: CoverJob
  onStart: (
    book: WordBookBrief,
    opts: {
      prompt: string
      size: string
      referenceFile?: File | null
      referenceBookId?: string | number | null
    }
  ) => Promise<boolean>
  onSave: (book: WordBookBrief) => Promise<void>
  onClear: (book: WordBookBrief) => Promise<void>
  onRefreshJob: (bookId: string | number) => Promise<CoverJob | undefined>
}

function Section({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: ReactNode
}) {
  return (
    <section className='space-y-3 rounded-lg border bg-card p-4 shadow-sm'>
      <div className='space-y-0.5'>
        <h3 className='text-sm leading-none font-medium'>{title}</h3>
        {description ? (
          <p className='text-xs text-muted-foreground'>{description}</p>
        ) : null}
      </div>
      {children}
    </section>
  )
}

export function WordbookCoverDrawer({
  book,
  open,
  onOpenChange,
  job,
  onStart,
  onSave,
  onClear,
  onRefreshJob,
}: WordbookCoverDrawerProps) {
  const [loadingDefaults, setLoadingDefaults] = useState(false)
  const [starting, setStarting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false)
  const [testing, setTesting] = useState(false)
  const [promptTemplate, setPromptTemplate] = useState(DEFAULT_PROMPT_TEMPLATE)
  const [prompt, setPrompt] = useState('')
  const [size, setSize] = useState('1792x1024')
  const [sizeOptions, setSizeOptions] = useState<CoverSizeOption[]>([
    { value: '1792x1024', label: '1792×1024（宽屏，推荐）' },
    { value: '1536x1024', label: '1536×1024（横屏）' },
    { value: '1280x720', label: '1280×720（横屏）' },
  ])
  const [configured, setConfigured] = useState(false)
  const [model, setModel] = useState('')
  const [referenceFile, setReferenceFile] = useState<File | null>(null)
  const [referenceBookId, setReferenceBookId] = useState<string | number | null>(
    null
  )
  const [referencePreview, setReferencePreview] = useState('')
  const [coverCandidates, setCoverCandidates] = useState<WordBookBrief[]>([])
  const [loadingCoverCandidates, setLoadingCoverCandidates] = useState(false)

  const active = job && isCoverJobActive(job.status)
  const preview =
    job?.previewUrl ||
    (job?.saved ? book?.coverUrl : '') ||
    book?.coverUrl ||
    ''

  const loadDefaults = useCallback(async () => {
    if (!book) return
    setLoadingDefaults(true)
    try {
      const res = await get<CoverDefaults>('/wordbooks/cover-ai/defaults')
      const data = res.data
      // 提示词模板由前端管理，不从后端获取
      setPromptTemplate(DEFAULT_PROMPT_TEMPLATE)
      if (!job?.prompt) {
        // 用模板预填一次提示词
        const { meta } = parseCoverMeta(book.description || '')
        const filled = DEFAULT_PROMPT_TEMPLATE
          .replace(/\{\{name\}\}/g, book.name)
          .replace(/\{\{level\}\}/g, book.level || '')
          .replace(/\{\{description\}\}/g, (book.description || '').slice(0, 120))
          .replace(/\{\{tag\}\}/g, meta?.tag || '')
          .replace(/\{\{t1\}\}/g, meta?.t1 || '')
          .replace(/\{\{t2\}\}/g, meta?.t2 || '')
          .replace(/\{\{cat\}\}/g, meta?.cat || '')
        setPrompt(filled.trim())
      }
      const opts = data?.sizeOptions?.length ? data.sizeOptions : sizeOptions
      if (data?.sizeOptions?.length) {
        setSizeOptions(data.sizeOptions)
      }
      const defaultSize = data?.defaultSize || '1792x1024'
      const raw = job?.size || defaultSize
      const picked = opts.find((o) => o.value === raw)
      setSize(picked && raw !== '1024x1024' ? raw : defaultSize)
      setConfigured(Boolean(data?.configured))
      setModel(data?.model || '')
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : '加载封面预设失败')
    } finally {
      setLoadingDefaults(false)
    }
  }, [book, job?.prompt, job?.size])

  const loadCoverCandidates = useCallback(async (currentBookId: string | number) => {
    setLoadingCoverCandidates(true)
    try {
      const all: WordBookBrief[] = []
      let page = 1
      const pageSize = 200
      for (;;) {
        const res = await get<{
          list?: WordBookBrief[]
          total?: number
        }>('/wordbooks/list', {
          params: { page, pageSize, hasCover: true },
        })
        const chunk = Array.isArray(res.data?.list) ? res.data.list : []
        all.push(...chunk)
        const total = Number(res.data?.total) || 0
        if (all.length >= total || chunk.length === 0 || page >= 10) break
        page += 1
      }
      setCoverCandidates(
        all.filter(
          (b) =>
            String(b.id) !== String(currentBookId) &&
            typeof b.coverUrl === 'string' &&
            b.coverUrl.trim() !== ''
        )
      )
    } catch {
      setCoverCandidates([])
    } finally {
      setLoadingCoverCandidates(false)
    }
  }, [])

  useEffect(() => {
    if (!open || !book) return
    setReferenceFile(null)
    setReferenceBookId(null)
    setReferencePreview('')
    void loadDefaults()
    void onRefreshJob(book.id)
    void loadCoverCandidates(book.id)
  }, [open, book, loadDefaults, onRefreshJob, loadCoverCandidates])

  const applyTemplate = () => {
    if (!book) return
    const { meta } = parseCoverMeta(book.description)
    const filled = promptTemplate
      .replace(/\{\{name\}\}/g, book.name)
      .replace(/\{\{level\}\}/g, book.level || '')
      .replace(/\{\{description\}\}/g, (book.description || '').slice(0, 120))
      .replace(/\{\{tag\}\}/g, meta?.tag || '')
      .replace(/\{\{t1\}\}/g, meta?.t1 || '')
      .replace(/\{\{t2\}\}/g, meta?.t2 || '')
      .replace(/\{\{cat\}\}/g, meta?.cat || '')
    setPrompt(filled.trim())
  }

  const onReferenceChange = (file: File | null) => {
    setReferenceFile(file)
    setReferenceBookId(null)
    if (!file) {
      setReferencePreview('')
      return
    }
    const reader = new FileReader()
    reader.onload = () => setReferencePreview(String(reader.result || ''))
    reader.readAsDataURL(file)
  }

  const onReferenceBookChange = (value: string) => {
    if (!value) {
      setReferenceBookId(null)
      setReferencePreview('')
      return
    }
    const picked = coverCandidates.find((b) => String(b.id) === value)
    setReferenceBookId(picked?.id ?? value)
    setReferenceFile(null)
    setReferencePreview(picked?.coverUrl?.trim() || '')
  }

  const runTest = async () => {
    setTesting(true)
    try {
      const res = await post<Record<string, unknown>>(
        '/wordbooks/cover-ai/test'
      )
      toast.success(res.msg || '图片生成接口可用')
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : '接口测试失败')
    } finally {
      setTesting(false)
    }
  }

  const handleStart = async () => {
    if (!book) return
    if (!prompt.trim()) {
      toast.error('请填写提示词')
      return
    }
    setStarting(true)
    try {
      const started = await onStart(book, {
        prompt: prompt.trim(),
        size: size.trim() || '1792x1024',
        referenceFile,
        referenceBookId,
      })
      if (started) onOpenChange(false)
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : '启动失败')
    } finally {
      setStarting(false)
    }
  }

  const handleSave = async () => {
    if (!book) return
    setSaving(true)
    try {
      await onSave(book)
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const handleClearConfirm = async () => {
    if (!book) return
    setClearing(true)
    try {
      await onClear(book)
      setClearConfirmOpen(false)
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : '清除失败')
    } finally {
      setClearing(false)
    }
  }

  const hasOfficialCover = Boolean(book?.coverUrl?.trim())

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side='right'
        className='flex w-full flex-col gap-0 border-l p-0 sm:max-w-xl'
      >
        <SheetHeader className='shrink-0 border-b px-6 py-5 text-left'>
          <SheetTitle className='flex items-center gap-2 text-base'>
            <Sparkles className='size-4 text-primary' />
            AI 生成词库封面
          </SheetTitle>
          <SheetDescription className='text-left'>
            提交后在后台生成，关闭抽屉不会中断任务。
          </SheetDescription>
        </SheetHeader>

        {book ? (
          <div className='flex-1 space-y-4 overflow-y-auto px-6 py-5'>
            <div className='rounded-lg bg-muted/50 px-4 py-3 text-sm'>
              <p className='font-medium text-foreground'>{book.name}</p>
              <p className='mt-1 text-xs text-muted-foreground'>
                {book.level ? `级别 ${book.level}` : '未设级别'}
                {model ? ` · 模型 ${model}` : ''}
                {!configured ? ' · 未配置 IMAGE_GEN_API_KEY' : ''}
              </p>
            </div>

            {active ? (
              <div className='flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-foreground'>
                <Loader2 className='size-4 shrink-0 animate-spin text-primary' />
                封面生成中，可在列表查看进度…
              </div>
            ) : null}

            <Section
              title='提示词'
              description='模板变量：name、level、tag、t1、t2、cat、description'
            >
              <div className='grid gap-1.5'>
                <Label className='text-xs text-muted-foreground'>模板</Label>
                <Textarea
                  rows={4}
                  className='min-h-[88px] resize-y'
                  value={promptTemplate}
                  onChange={(e) => setPromptTemplate(e.target.value)}
                  disabled={loadingDefaults || active}
                />
                <Button
                  type='button'
                  variant='outline'
                  size='sm'
                  className='w-fit'
                  onClick={applyTemplate}
                  disabled={active}
                >
                  用模板填充下方提示词
                </Button>
              </div>
              <Separator />
              <div className='grid gap-1.5'>
                <Label>本次生成提示词</Label>
                <Textarea
                  rows={5}
                  className='min-h-[100px] resize-y'
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  disabled={loadingDefaults || active}
                  placeholder='描述封面风格与主题，请勿仿冒真实教材封面'
                />
              </div>
            </Section>

            <Section title='生成参数'>
              <div className='grid gap-1.5'>
                <Label>尺寸</Label>
                <Select value={size} onValueChange={setSize} disabled={active}>
                  <SelectTrigger className='w-full'>
                    <SelectValue placeholder='选择尺寸' />
                  </SelectTrigger>
                  <SelectContent>
                    {sizeOptions.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className='text-xs text-muted-foreground'>
                  词库封面建议使用横屏比例，勿选正方形。
                </p>
              </div>
              <div className='grid gap-2'>
                <Label>参考图（可选）</Label>
                <p className='text-xs text-muted-foreground'>
                  上传本地图片，或选择已有封面的词库作为风格参考。
                </p>
                <div className='flex flex-wrap items-center gap-2'>
                  <Button type='button' variant='outline' size='sm' asChild>
                    <label className='cursor-pointer gap-2'>
                      <Upload className='size-4' />
                      上传图片
                      <input
                        type='file'
                        accept='image/*'
                        className='hidden'
                        disabled={active}
                        onChange={(e) =>
                          onReferenceChange(e.target.files?.[0] ?? null)
                        }
                      />
                    </label>
                  </Button>
                  {referenceFile ? (
                    <span className='text-xs text-muted-foreground'>
                      {referenceFile.name}
                    </span>
                  ) : null}
                </div>
                <div className='grid gap-1.5'>
                  <Label className='text-xs text-muted-foreground'>
                    或选择词库封面
                  </Label>
                  <Select
                    value={
                      referenceBookId ? String(referenceBookId) : undefined
                    }
                    onValueChange={onReferenceBookChange}
                    disabled={active || loadingCoverCandidates}
                  >
                    <SelectTrigger className='w-full'>
                      <SelectValue
                        placeholder={
                          loadingCoverCandidates
                            ? '加载词库列表…'
                            : coverCandidates.length
                              ? '选择已有封面的词库'
                              : '暂无其他词库封面'
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {coverCandidates.map((b) => (
                        <SelectItem key={String(b.id)} value={String(b.id)}>
                          {b.name}
                          {b.level ? ` · ${b.level}` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {referenceBookId ? (
                    <Button
                      type='button'
                      variant='ghost'
                      size='sm'
                      className='h-7 px-2 text-xs'
                      disabled={active}
                      onClick={() => {
                        setReferenceBookId(null)
                        setReferencePreview('')
                      }}
                    >
                      清除词库参考
                    </Button>
                  ) : null}
                </div>
                {referencePreview ? (
                  <img
                    src={referencePreview}
                    alt='参考图'
                    className='max-h-28 rounded-md border bg-muted/30 object-contain p-1'
                  />
                ) : null}
              </div>
            </Section>

            <Section title='预览'>
              <div className='relative flex aspect-[1792/1024] w-full items-center justify-center overflow-hidden rounded-md border border-dashed bg-muted/20'>
                {preview ? (
                  <img
                    src={preview}
                    alt='封面预览'
                    className='absolute inset-0 h-full w-full object-cover'
                  />
                ) : (
                  <div className='flex flex-col items-center gap-2 text-muted-foreground'>
                    <ImageIcon className='size-10 opacity-40' />
                    <span className='text-sm'>生成完成后显示预览</span>
                  </div>
                )}
              </div>
            </Section>
          </div>
        ) : null}

        <SheetFooter className='shrink-0 flex-row flex-wrap justify-end gap-2 border-t bg-muted/30 px-6 py-4'>
          <Button
            type='button'
            variant='outline'
            size='sm'
            disabled={testing || !configured}
            onClick={() => void runTest()}
          >
            {testing ? <Loader2 className='animate-spin' /> : null}
            测试接口
          </Button>
          {hasOfficialCover ? (
            <Button
              type='button'
              variant='outline'
              size='sm'
              disabled={clearing || active}
              onClick={() => setClearConfirmOpen(true)}
            >
              {clearing ? (
                <Loader2 className='animate-spin' />
              ) : (
                <Trash2 className='size-4' />
              )}
              清除封面
            </Button>
          ) : null}
          {job?.status === 'done' && job.previewUrl && !job.saved ? (
            <Button
              type='button'
              variant='secondary'
              size='sm'
              disabled={saving}
              onClick={() => void handleSave()}
            >
              {saving ? <Loader2 className='animate-spin' /> : null}
              保存为封面
            </Button>
          ) : null}
          <Button
            type='button'
            size='sm'
            disabled={starting || active || !configured}
            onClick={() => void handleStart()}
          >
            {starting || active ? <Loader2 className='animate-spin' /> : null}
            开始生成
          </Button>
        </SheetFooter>
      </SheetContent>

      <ConfirmDialog
        open={clearConfirmOpen}
        onOpenChange={setClearConfirmOpen}
        destructive
        isLoading={clearing}
        title='确认清除封面？'
        desc='清除后将恢复为无封面状态，词库列表将显示渐变/文字封面。'
        cancelBtnText='取消'
        confirmText='清除封面'
        handleConfirm={handleClearConfirm}
      />
    </Sheet>
  )
}
