export type ClozePassageRow = {
  id: number
  title: string
  level: string
  tags?: string
  summary?: string
  content?: string
  status: string
  blankCount?: number
  estimatedMinutes?: number
  sortOrder?: number
}

export type ClozeBlankOption = {
  key: string
  text: string
}

export type ClozeBlankRow = {
  id?: number
  blankNo: number
  options: ClozeBlankOption[]
  answer: string
  explanation?: string
}
