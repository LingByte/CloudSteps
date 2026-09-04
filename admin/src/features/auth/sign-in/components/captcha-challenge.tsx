import { useCallback, useEffect, useState } from 'react'
import { get } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export type CaptchaValue = {
  captchaId: string
  captchaType: string
  captchaValue: string | number
}

type CaptchaPayload = {
  id: string
  type: 'image' | 'math' | string
  data?: {
    image?: string
    question?: string
  }
}

export function CaptchaChallenge({
  onChange,
}: {
  onChange: (value: CaptchaValue | null) => void
}) {
  const [captcha, setCaptcha] = useState<CaptchaPayload | null>(null)
  const [answer, setAnswer] = useState('')
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setError(null)
    setAnswer('')
    onChange(null)
    try {
      const res = await get<CaptchaPayload>('/auth/captcha')
      const data = res.data
      if (
        data.type === 'jigsaw' ||
        data.type === 'rotate' ||
        data.type === 'click'
      ) {
        // 不支持的验证码类型，重新获取
        setCaptcha(null)
        return
      }
      setCaptcha(data)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '获取验证码失败')
    }
  }, [onChange])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const report = (raw: string) => {
    setAnswer(raw)
    if (!captcha || raw.trim() === '') {
      onChange(null)
      return
    }
    const trimmed = raw.trim()
    // Math captcha backend expects a numeric JSON value; strings become 0 via intValue().
    const captchaValue =
      captcha.type === 'math' && /^-?\d+$/.test(trimmed) ? Number(trimmed) : trimmed
    onChange({
      captchaId: captcha.id,
      captchaType: captcha.type,
      captchaValue,
    })
  }

  if (error) {
    return (
      <div className='space-y-1 text-sm'>
        <p className='text-destructive'>{error}</p>
        <Button
          type='button'
          variant='ghost'
          size='sm'
          onClick={() => void refresh()}
        >
          重试
        </Button>
      </div>
    )
  }

  if (!captcha) {
    return <p className='text-xs text-muted-foreground'>验证码加载中…</p>
  }

  if (captcha.type === 'math') {
    return (
      <div className='flex items-center gap-2'>
        <span className='inline-flex h-9 min-w-[9rem] shrink-0 items-center justify-center rounded-md bg-muted px-4 font-mono text-sm whitespace-nowrap'>
          {captcha.data?.question}
        </span>
        <Input
          type='text'
          inputMode='numeric'
          autoComplete='off'
          className='min-w-0 flex-1'
          value={answer}
          onChange={(e) => report(e.target.value)}
          placeholder='答案'
        />
        <Button
          type='button'
          variant='ghost'
          size='sm'
          className='shrink-0'
          onClick={() => void refresh()}
        >
          换一题
        </Button>
      </div>
    )
  }

  const img = captcha.data?.image || ''
  return (
    <div className='flex items-center gap-2'>
      <button
        type='button'
        className='relative aspect-[10/3] h-9 shrink-0 overflow-hidden rounded-md border p-0 leading-none'
        onClick={() => void refresh()}
        title='点击刷新'
      >
        {img ? (
          <img
            src={img}
            alt='验证码'
            className='absolute inset-0 block size-full object-cover'
          />
        ) : (
          <span className='text-xs text-muted-foreground'>加载中</span>
        )}
      </button>
      <Input
        value={answer}
        onChange={(e) => report(e.target.value)}
        placeholder='输入图中字符'
        autoComplete='off'
      />
    </div>
  )
}
