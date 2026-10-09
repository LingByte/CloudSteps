/**
 * 情景对话 API — 对齐 web/src/api/scenarioDialogue.ts
 */
import { get, post } from '../utils/request'
import type { ApiResponse } from '../types/api'

export interface Scenario {
  id: number
  slug: string
  name: string
  description: string
  icon: string
  difficulty: string
  aiRole: string
}

export interface ScenarioTurn {
  id: number
  role: 'user' | 'assistant'
  content: string
  hasCorrection: boolean
  hasPronunciation: boolean
  turnIndex: number
}

export interface ReviewAnalysis {
  turnCount: number
  userWordCount: number
  englishRatio: number
  wordsPerMinute: number
  avgWordsPerTurn: number
  uniqueWordCount: number
  chineseCharCount: number
  chineseTurnCount: number
  shortTurnCount: number
  explicitCorrections: number
  implicitCorrections: number
  fluencyScore: number
  accuracyScore: number
  pronunciationScore: number
  vocabularyScore: number
  participationScore: number
  overallScore: number
  highlights: string[]
  issues: string[]
  suggestions: string[]
  nextSteps: string[]
  aiAnalysis: string
}

export interface ScenarioSession {
  id: number
  scenarioId: number
  status: string
  startedAt?: string
  endedAt?: string
  durationSec: number
  fluencyScore: number
  accuracyScore: number
  pronunciationScore: number
  overallScore: number
  turnCount: number
  userWordCount: number
  correctionCount: number
  pronunciationHints: number
  reviewSummary: string
  analysis?: ReviewAnalysis
  scenario?: Scenario
  turns?: ScenarioTurn[]
}

export interface VoiceReadyStatus {
  ready: boolean
  provider: string
  hint: string
}

export interface StartSessionResponse {
  sessionId: number
  deviceId: string
  wsPath: string
  scenario: Scenario
  voiceReady: VoiceReadyStatus
}

export interface SpeakingStats {
  totalSessions: number
  totalMinutes: number
  avgOverallScore: number
  avgFluencyScore: number
  avgAccuracyScore: number
  avgPronunciationScore: number
  totalCorrections: number
  recentSessions: ScenarioSession[]
}

export function listScenarios(): Promise<ApiResponse<Scenario[]>> {
  return get<Scenario[]>('/scenario-dialogue/scenarios')
}

export function startSession(scenarioId: number): Promise<ApiResponse<StartSessionResponse>> {
  return post<StartSessionResponse>('/scenario-dialogue/sessions', { scenarioId })
}

export function getSession(sessionId: number): Promise<ApiResponse<ScenarioSession>> {
  return get<ScenarioSession>(`/scenario-dialogue/sessions/${sessionId}`)
}

export function completeSession(sessionId: number): Promise<ApiResponse<ScenarioSession>> {
  return post<ScenarioSession>(`/scenario-dialogue/sessions/${sessionId}/complete`, {})
}

export function getSpeakingStats(): Promise<ApiResponse<SpeakingStats>> {
  return get<SpeakingStats>('/scenario-dialogue/stats')
}

export function getVoiceReady(): Promise<ApiResponse<VoiceReadyStatus>> {
  return get<VoiceReadyStatus>('/scenario-dialogue/voice/ready')
}

export type CustomScenarioPayload = {
  name: string
  description?: string
  aiRole: string
  prompt: string
  difficulty: string
}

export function createCustomScenario(payload: CustomScenarioPayload): Promise<ApiResponse<Scenario>> {
  return post<Scenario>('/scenario-dialogue/custom/scenarios', payload)
}

export function activateSession(sessionId: number): Promise<ApiResponse<any>> {
  return post(`/scenario-dialogue/sessions/${sessionId}/activate`, {})
}

export function recordTurn(sessionId: number, role: 'user' | 'assistant', content: string): Promise<ApiResponse<any>> {
  return post(`/scenario-dialogue/sessions/${sessionId}/turns`, { role, content })
}
