import { useEffect, useState } from 'react'
import { Loader2, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { get, post, put } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
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
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  emptyBlank,
  fromApiBlank,
  OPTION_KEYS,
  toApiBlanks,
  type BlankForm,
} from './blank-types'
import type { ClozeBlankRow, ClozePassageRow } from './types'

const LEVELS = ['初阶', '中阶', '高阶'] as const

export function ClozePassageFormSheet({
  open,
  onOpenChange,
  editing,
  onSaved,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  editing: ClozePassageRow | null
  onSaved: () => void
}) {
  const [title, setTitle] = useState('')
  const [level, setLevel] = useState<string>('初阶')
  const [summary, setSummary] = useState('')
  const [tags, setTags] = useState('')
  const [content, setContent] = useState('')
  const [status, setStatus] = useState('published')
  const [estimatedMinutes, setEstimatedMinutes] = useState('5')
  const [sortOrder, setSortOrder] = useState('0')
  const [blanks, setBlanks] = useState<BlankForm[]>([emptyBlank(1)])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    if (!editing?.id) {
      setTitle('')
      setLevel('初阶')
      setSummary('')
      setTags('')
      setContent('')
      setStatus('published')
      setEstimatedMinutes('5')
      setSortOrder('0')
      setBlanks([emptyBlank(1)])
      return
    }
    setLoading(true)
    void get<{ passage: ClozePassageRow; blanks: ClozeBlankRow[] }>(
      `/cloze/admin/passages/${editing.id}`
    )
      .then((res) => {
        const p = res.data.passage
        setTitle(p.title || '')
        setLevel(p.level || '初阶')
        setSummary(p.summary || '')
        setTags(p.tags || '')
        setContent(p.content || '')
        setStatus(p.status || 'published')
        setEstimatedMinutes(String(p.estimatedMinutes ?? 5))
        setSortOrder(String(p.sortOrder ?? 0))
        const bs = (res.data.blanks || []).map(fromApiBlank)
        setBlanks(bs.length ? bs : [emptyBlank(1)])
      })
      .catch(() => {
        toast.error('加载文章详情失败')
        setTitle(editing.title || '')
        setLevel(editing.level || '初阶')
        setSummary(editing.summary || '')
        setTags(editing.tags || '')
        setContent(editing.content || '')
        setStatus(editing.status || 'published')
        setEstimatedMinutes(String(editing.estimatedMinutes ?? 5))
        setSortOrder(String(editing.sortOrder ?? 0))
        setBlanks([emptyBlank(1)])
      })
      .finally(() => setLoading(false))
  }, [open, editing])

  const updateBlank = (clientId: string, patch: Partial<BlankForm>) => {
    setBlanks((prev) =>
      prev.map((b) => (b.clientId === clientId ? { ...b, ...patch } : b))
    )
  }

  const updateOption = (
    clientId: string,
    key: (typeof OPTION_KEYS)[number],
    value: string
  ) => {
    setBlanks((prev) =>
      prev.map((b) =>
        b.clientId === clientId
          ? { ...b, options: { ...b.options, [key]: value } }
          : b
      )
    )
  }

  const addBlank = () =>
    setBlanks((prev) => [...prev, emptyBlank(prev.length + 1)])

  const removeBlank = (clientId: string) => {
    setBlanks((prev) => {
      if (prev.length <= 1) return prev
      return prev
        .filter((b) => b.clientId !== clientId)
        .map((b, i) => ({ ...b, blankNo: i + 1 }))
    })
  }

  const syncBlankNosFromContent = () => {
    const nos = Array.from(content.matchAll(/\{\{(\d+)\}\}/g)).map((m) =>
      Number(m[1])
    )
    if (nos.length === 0) {
      toast.message('正文中未检测到 {{n}} 空位标记')
      return
    }
    const unique = [...new Set(nos)].sort((a, b) => a - b)
    setBlanks((prev) => {
      const byNo = new Map(prev.map((b) => [b.blankNo, b]))
      return unique.map((n) => {
        const existing = byNo.get(n)
        return existing ? { ...existing, blankNo: n } : emptyBlank(n)
      })
    })
    toast.success(`已按正文同步 ${unique.length} 个空位`)
  }

  const handleSave = async () => {
    if (!title.trim() || !content.trim()) {
      toast.error('标题和正文不能为空')
      return
    }
    if (!/\{\{\d+\}\}/.test(content)) {
      toast.error('正文需包含空位标记，例如 {{1}} {{2}}')
      return
    }
    const apiBlanks = toApiBlanks(blanks)
    if (apiBlanks.length === 0) {
      toast.error('请至少添加一个完整空位（2 个以上选项 + 正确答案）')
      return
    }

    const minutes = Number.parseInt(estimatedMinutes, 10)
    const order = Number.parseInt(sortOrder, 10)
    const payload = {
      title: title.trim(),
      level,
      summary,
      tags,
      content,
      status,
      estimatedMinutes: Number.isFinite(minutes) && minutes > 0 ? minutes : 5,
      sortOrder: Number.isFinite(order) ? order : 0,
      blanks: apiBlanks,
    }

    setSaving(true)
    try {
      if (editing?.id) {
        await put(`/cloze/admin/passages/${editing.id}`, payload)
        toast.success('已更新')
      } else {
        await post('/cloze/admin/passages', payload)
        toast.success('已创建')
      }
      onOpenChange(false)
      onSaved()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className='flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl'>
        <SheetHeader className='shrink-0 border-b px-6 py-4 pe-12'>
          <SheetTitle>{editing ? '编辑完形填空' : '新增完形填空'}</SheetTitle>
        </SheetHeader>

        {loading ? (
          <div className='flex flex-1 items-center justify-center py-16'>
            <Loader2 className='size-6 animate-spin text-muted-foreground' />
          </div>
        ) : (
          <div className='flex-1 overflow-y-auto px-6 py-5'>
            <div className='space-y-6'>
              <section className='space-y-4'>
                <h3 className='text-sm font-semibold'>文章信息</h3>
                <div className='space-y-2'>
                  <Label>标题</Label>
                  <Input value={title} onChange={(e) => setTitle(e.target.value)} />
                </div>
                <div className='grid grid-cols-2 gap-4'>
                  <div className='space-y-2'>
                    <Label>等级</Label>
                    <Select value={level} onValueChange={setLevel}>
                      <SelectTrigger className='w-full'>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {LEVELS.map((lv) => (
                          <SelectItem key={lv} value={lv}>
                            {lv}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className='space-y-2'>
                    <Label>状态</Label>
                    <Select value={status} onValueChange={setStatus}>
                      <SelectTrigger className='w-full'>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value='published'>已发布</SelectItem>
                        <SelectItem value='draft'>草稿</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className='grid grid-cols-2 gap-4'>
                  <div className='space-y-2'>
                    <Label>预计分钟</Label>
                    <Input
                      type='number'
                      min={1}
                      value={estimatedMinutes}
                      onChange={(e) => setEstimatedMinutes(e.target.value)}
                    />
                  </div>
                  <div className='space-y-2'>
                    <Label>排序</Label>
                    <Input
                      type='number'
                      value={sortOrder}
                      onChange={(e) => setSortOrder(e.target.value)}
                    />
                  </div>
                </div>
                <div className='space-y-2'>
                  <Label>摘要</Label>
                  <Input value={summary} onChange={(e) => setSummary(e.target.value)} />
                </div>
                <div className='space-y-2'>
                  <Label>标签</Label>
                  <Input
                    value={tags}
                    onChange={(e) => setTags(e.target.value)}
                    placeholder='多个标签用逗号分隔，如：CEPOC,FCE,科普'
                  />
                </div>
                <div className='space-y-2'>
                  <Label>正文（用 {'{{1}}'} {'{{2}}'} 标记空位）</Label>
                  <Textarea
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    rows={10}
                    className='min-h-[180px] resize-y font-mono text-sm'
                  />
                </div>
              </section>

              <section className='space-y-3'>
                <div className='flex flex-wrap items-center justify-between gap-2'>
                  <h3 className='text-sm font-semibold'>空位题目</h3>
                  <div className='flex gap-2'>
                    <Button
                      type='button'
                      variant='outline'
                      size='sm'
                      onClick={syncBlankNosFromContent}
                    >
                      按正文同步空位
                    </Button>
                    <Button type='button' variant='outline' size='sm' onClick={addBlank}>
                      <Plus className='size-4' />
                      添加空位
                    </Button>
                  </div>
                </div>
                <div className='space-y-4'>
                  {blanks.map((b) => (
                    <div
                      key={b.clientId}
                      className='space-y-3 rounded-lg border bg-muted/20 p-4'
                    >
                      <div className='flex items-center justify-between gap-2'>
                        <div className='flex items-center gap-2'>
                          <Label className='shrink-0'>空位编号</Label>
                          <Input
                            type='number'
                            min={1}
                            className='w-20'
                            value={b.blankNo}
                            onChange={(e) =>
                              updateBlank(b.clientId, {
                                blankNo: Number.parseInt(e.target.value, 10) || 1,
                              })
                            }
                          />
                        </div>
                        {blanks.length > 1 && (
                          <Button
                            type='button'
                            variant='ghost'
                            size='icon'
                            className='size-8 text-muted-foreground hover:text-destructive'
                            onClick={() => removeBlank(b.clientId)}
                          >
                            <Trash2 className='size-4' />
                          </Button>
                        )}
                      </div>
                      <div className='grid grid-cols-1 gap-2 sm:grid-cols-2'>
                        {OPTION_KEYS.map((key) => (
                          <div key={key} className='space-y-1'>
                            <Label className='text-xs text-muted-foreground'>
                              选项 {key}
                            </Label>
                            <Input
                              value={b.options[key]}
                              onChange={(e) =>
                                updateOption(b.clientId, key, e.target.value)
                              }
                            />
                          </div>
                        ))}
                      </div>
                      <div className='grid grid-cols-1 gap-3 sm:grid-cols-2'>
                        <div className='space-y-2'>
                          <Label>正确答案</Label>
                          <Select
                            value={b.answer}
                            onValueChange={(v) =>
                              updateBlank(b.clientId, {
                                answer: v as BlankForm['answer'],
                              })
                            }
                          >
                            <SelectTrigger className='w-full'>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {OPTION_KEYS.map((key) => (
                                <SelectItem key={key} value={key}>
                                  {key}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className='space-y-2'>
                          <Label>解析</Label>
                          <Input
                            value={b.explanation}
                            onChange={(e) =>
                              updateBlank(b.clientId, {
                                explanation: e.target.value,
                              })
                            }
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </div>
        )}

        <SheetFooter className='shrink-0 flex-row justify-end gap-2 border-t bg-muted/30 px-6 py-4'>
          <Button variant='outline' onClick={() => onOpenChange(false)} disabled={saving}>
            取消
          </Button>
          <Button onClick={() => void handleSave()} disabled={saving || loading}>
            {saving ? '保存中…' : '保存'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
