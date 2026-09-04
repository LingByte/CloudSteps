import {
  encodeFeedbackContent,
  feedbackPreviewText,
  isFeedbackContentEmpty,
  parseFeedbackContent,
} from '@/lib/feedback-content'
import { cn } from '@/lib/utils'

export function AdminFeedbackMessageBody({
  content,
  className,
}: {
  content: string
  className?: string
}) {
  const { text, images } = parseFeedbackContent(content)
  return (
    <div className={cn('space-y-2', className)}>
      {text ? (
        <p className='text-sm leading-relaxed whitespace-pre-wrap break-words'>
          {text}
        </p>
      ) : null}
      {images.length > 0 ? (
        <div className='flex flex-wrap gap-2'>
          {images.map((url) => (
            <a
              key={url}
              href={url}
              target='_blank'
              rel='noreferrer'
              className='block overflow-hidden rounded-xl border bg-muted/40 max-w-[240px]'
            >
              <img
                src={url}
                alt=''
                className='max-h-56 w-full object-contain'
                loading='lazy'
              />
            </a>
          ))}
        </div>
      ) : null}
    </div>
  )
}

export {
  encodeFeedbackContent,
  feedbackPreviewText,
  isFeedbackContentEmpty,
  parseFeedbackContent,
}
