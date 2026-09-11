import { createFileRoute } from '@tanstack/react-router'
import { ClozePassagesPage } from '@/features/cloze-passages'

export const Route = createFileRoute('/_authenticated/cloze-passages/')({
  component: ClozePassagesPage,
})
