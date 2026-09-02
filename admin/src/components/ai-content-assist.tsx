import { useState } from 'react'
import { Loader2, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { post } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'

export type AiContentKind = 'announcement' | 'wechat_mp_article'

export type AiGeneratedContent = {
  title?: string
  content?: string
  digest?: string
}

type Props = {
  kind: AiContentKind
  title?: string
  digest?: string
  onApply: (result: AiGeneratedContent) => void
}

export function AiContentAssist({ kind, title, digest, onApply }: Props) {
  const [open, setOpen] = useState(false)
  const [prompt, setPrompt] = useState('')
  const [loading, setLoading] = useState(false)

  const generate = async () => {
    const trimmed = prompt.trim()
    if (!trimmed) {
      toast.error('请先描述你想生成的内容')
      return
    }
    setLoading(true)
    try {
      const res = await post<AiGeneratedContent>('/admin/ai/generate-content', {
        kind,
        title: title?.trim() || undefined,
        digest: digest?.trim() || undefined,
        prompt: trimmed,
      })
      const data = res.data
      if (!data?.content?.trim() && !data?.title?.trim()) {
        toast.error('AI 未返回可用内容')
        return
      }
      onApply(data)
      toast.success('已填入 AI 生成内容，请检查后保存')
      setOpen(false)
      setPrompt('')
    } catch (e: unknown) {
      const msg =
        e && typeof e === 'object' && 'message' in e
          ? String((e as { message: string }).message)
          : 'AI 生成失败'
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className='rounded-lg border border-dashed border-primary/30 bg-primary/5 p-4'>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <div className='flex items-center gap-2 text-sm font-medium text-foreground'>
          <Sparkles className='size-4 text-primary' />
          AI 帮我写
        </div>
        <Button
          type='button'
          variant='outline'
          size='sm'
          onClick={() => setOpen((v) => !v)}
        >
          {open ? '收起' : '展开'}
        </Button>
      </div>
      {open ? (
        <div className='mt-3 space-y-3'>
          <div className='space-y-1.5'>
            <Label htmlFor={`ai-prompt-${kind}`} className='text-xs text-muted-foreground'>
              描述要点（活动主题、受众、语气、必须包含的信息等）
            </Label>
            <textarea
              id={`ai-prompt-${kind}`}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={4}
              placeholder={
                kind === 'wechat_mp_article'
                  ? '例如：写一篇关于寒假单词打卡活动的公众号图文，面向家长，强调坚持练习与抗遗忘复习…'
                  : '例如：写一条系统维护公告，今晚 23:00–24:00 暂停服务，请提前保存学习进度…'
              }
              className='w-full rounded-md border border-input bg-background px-3 py-2 text-sm leading-relaxed'
            />
          </div>
          <Button type='button' size='sm' disabled={loading} onClick={() => void generate()}>
            {loading ? <Loader2 className='size-4 animate-spin' /> : <Sparkles className='size-4' />}
            生成并填入
          </Button>
        </div>
      ) : (
        <p className='mt-2 text-xs leading-relaxed text-muted-foreground'>
          根据你的描述自动生成标题与正文（需服务端配置 LLM）。
        </p>
      )}
    </div>
  )
}
