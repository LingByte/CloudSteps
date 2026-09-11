export type ReadingPassageRow = {
  id: number
  title: string
  level: string
  tags?: string
  summary?: string
  content?: string
  status: string
  wordCount?: number
  estimatedMinutes?: number
  sortOrder?: number
  analysisReady?: boolean
  knowledgeReady?: boolean
}

export type ReadingAnalysisComponent = {
  label: string
  text: string
}

export type ReadingAnalysisPhrase = {
  text: string
  explanation: string
}

export type ReadingAnalysisSentence = {
  sentence: string
  translation: string
  components?: ReadingAnalysisComponent[]
  keyPhrases?: ReadingAnalysisPhrase[]
}

export type GenerateAnalysisResult = {
  id: number
  skipped?: boolean
  analysisReady?: boolean
  sentenceCount?: number
  items?: ReadingAnalysisSentence[]
}
