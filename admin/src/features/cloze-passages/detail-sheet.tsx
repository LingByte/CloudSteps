import { useEffect, useState } from 'react'
import { Loader2, Pencil } from 'lucide-react'
import { get } from '@/lib/api'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import type { ClozeBlankRow, ClozePassageRow } from './types'

export function ClozePassageDetailSheet({
  passage,
  onClose,
  onEdit,
}: {
  passage: ClozePassageRow | null
  onClose: () => void
  onEdit?: (row: ClozePassageRow) => void
}) {
  const [loading, setLoading] = useState(false)
  const [detail, setDetail] = useState<ClozePassageRow | null>(null)
  const [blanks, setBlanks] = useState<ClozeBlankRow[]>([])
  const [content, setContent] = useState('')

  useEffect(() => {
    if (!passage?.id) {
      setDetail(null)
      setBlanks([])
      setContent('')
      return
    }
    setLoading(true)
    void get<{ passage: ClozePassageRow; blanks: ClozeBlankRow[] }>(
      `/cloze/admin/passages/${passage.id}`
    )
      .then((res) => {
        setDetail(res.data.passage)
        setContent(res.data.passage?.content || '')
        setBlanks(res.data.blanks || [])
      })
      .catch(() => {
        setDetail(passage)
        setContent(passage.content || '')
        setBlanks([])
      })
      .finally(() => setLoading(false))
  }, [passage?.id])

  const row = detail || passage

  return (
    <Sheet open={!!passage} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className='flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl'>
        <SheetHeader className='shrink-0 space-y-1 border-b px-6 py-4 pe-12'>
          <div className='flex items-start justify-between gap-3'>
            <div className='min-w-0'>
              <SheetTitle className='text-left leading-snug'>{row?.title}</SheetTitle>
              {row ? (
                <p className='text-sm text-muted-foreground'>
                  {row.level} · {row.status} · 空位 {row.blankCount ?? blanks.length}
                </p>
              ) : null}
            </div>
            {row && onEdit ? (
              <Button
                variant='outline'
                size='sm'
                className='shrink-0'
                onClick={() => onEdit(row)}
              >
                <Pencil className='size-4' />
                编辑
              </Button>
            ) : null}
          </div>
        </SheetHeader>
        {loading ? (
          <div className='flex flex-1 items-center justify-center py-16'>
            <Loader2 className='size-6 animate-spin text-muted-foreground' />
          </div>
        ) : (
          <div className='flex-1 space-y-6 overflow-y-auto px-6 py-5 text-sm'>
            {row?.summary ? (
              <section>
                <h4 className='mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground'>
                  摘要
                </h4>
                <p className='text-muted-foreground'>{row.summary}</p>
              </section>
            ) : null}
            <section>
              <h4 className='mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground'>
                正文
              </h4>
              <div className='whitespace-pre-wrap rounded-lg border bg-muted/20 px-4 py-3 leading-relaxed'>
                {content || '—'}
              </div>
            </section>
            <section>
              <h4 className='mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground'>
                空位（{blanks.length}）
              </h4>
              <div className='space-y-3'>
                {blanks.length === 0 ? (
                  <p className='text-muted-foreground'>暂无空位</p>
                ) : (
                  blanks.map((b) => (
                    <div key={b.id ?? b.blankNo} className='rounded-lg border px-4 py-3'>
                      <p className='font-medium'>空位 {b.blankNo}</p>
                      <ul className='mt-2 space-y-1 text-muted-foreground'>
                        {(b.options || []).map((o) => (
                          <li
                            key={o.key}
                            className={
                              o.key === b.answer
                                ? 'font-medium text-emerald-700'
                                : undefined
                            }
                          >
                            {o.key}. {o.text}
                            {o.key === b.answer ? ' ✓' : ''}
                          </li>
                        ))}
                      </ul>
                      {b.explanation ? (
                        <p className='mt-2 text-xs text-muted-foreground'>
                          {b.explanation}
                        </p>
                      ) : null}
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
