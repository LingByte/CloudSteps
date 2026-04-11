import { get, post, ApiResponse } from '@/utils/request'

export type CoachingWeekSchedule = {
  id: number
  title: string
  scheduledDate: string
  startTime: string
  endTime: string
  teacherId: number
  studentId: number
  status: string
  students?: string[]
  session?: {
    status?: string
    startedAt?: string
    endedAt?: string
    actualMinutes?: number
    billedMinutes?: number
    teacherCreditedMinutes?: number
  }
}

export const getTeacherCoachingWeek = async (
  date: string
): Promise<ApiResponse<{ schedules: CoachingWeekSchedule[] }>> => {
  return get<{ schedules: CoachingWeekSchedule[] }>('/teacher/coaching/week', { params: { date } })
}

export type TeacherCoachingQuotaRow = {
  id: number
  teacherId: number
  studentId: number
  remainingMinutes: number
  totalAllocatedMinutes?: number
  version?: number
  /** 词汇测评次数 */
  vocabTestCount?: number
  /** 与该老师的陪练完课次数 */
  coachingSessionCount?: number
  /** 单词训练等学习会话次数（学员维度） */
  studySessionCount?: number
  latestVocabLevel?: string
  latestVocabTestAt?: string
  latestEstimatedVocab?: number
  student?: {
    displayName?: string
    username?: string
    email?: string
    phone?: string
    role?: string
    city?: string
    region?: string
  }
}

/** 当前老师名下学员与陪练剩余分钟（与后台额度同源，含词汇测评摘要） */
export const getTeacherCoachingQuotas = async (): Promise<ApiResponse<TeacherCoachingQuotaRow[]>> => {
  return get<TeacherCoachingQuotaRow[]>('/teacher/coaching/quotas')
}

export type VocabTestRecordDTO = {
  id: number
  userId: number
  estimatedLevel: string
  estimatedVocab: number
  answers?: string
  questionCount: number
  correctCount: number
  completedAt?: string | null
  createdAt?: string
}

export type CoachingSessionRecordDTO = {
  id: number
  appointmentId: number
  teacherId: number
  studentId: number
  startedAt: string
  endedAt: string
  actualMinutes: number
  billedMinutes: number
  teacherCreditedMinutes: number
  status: string
  appointment?: {
    title?: string
    scheduledDate?: string
    startTime?: string
    endTime?: string
  }
}

export type StudySessionDTO = {
  id: number
  userId: number
  wordBookId: number
  sessionType: string
  status: string
  startedAt: string
  completedAt?: string | null
  wordCount: number
  correctCount: number
}

export type StudentActivityKind = 'vocab_test' | 'coaching_session' | 'study_session'

export type StudentActivityListItem = {
  kind: StudentActivityKind
  id: number
  time: string
  title: string
  summary: string
  wordBookName?: string
  vocabTest?: VocabTestRecordDTO
  coachingSession?: CoachingSessionRecordDTO
  studySession?: StudySessionDTO
}

/** 合并：陪练完课 + 词汇测评 + 单词训练会话（完整时间线，前端自行筛选分页） */
export const listStudentActivityRecordsAsTeacher = async (
  studentId: number
): Promise<ApiResponse<{ list: StudentActivityListItem[]; total: number; page: number; pageSize: number }>> => {
  return get<{ list: StudentActivityListItem[]; total: number; page: number; pageSize: number }>(
    `/teacher/coaching/students/${studentId}/vocab-records`
  )
}

export const getStudentVocabRecordAsTeacher = async (
  studentId: number,
  recordId: number
): Promise<ApiResponse<VocabTestRecordDTO>> => {
  return get<VocabTestRecordDTO>(`/teacher/coaching/students/${studentId}/vocab-records/${recordId}`)
}

export const getStudentCoachingSessionAsTeacher = async (
  studentId: number,
  sessionId: number
): Promise<ApiResponse<CoachingSessionRecordDTO>> => {
  return get<CoachingSessionRecordDTO>(
    `/teacher/coaching/students/${studentId}/coaching-sessions/${sessionId}`
  )
}

export const getStudentStudySessionAsTeacher = async (
  studentId: number,
  sessionId: number
): Promise<ApiResponse<{ session: StudySessionDTO; wordBookName: string }>> => {
  return get<{ session: StudySessionDTO; wordBookName: string }>(
    `/teacher/coaching/students/${studentId}/study-sessions/${sessionId}`
  )
}

export const getStudentCoachingWeek = async (
  date: string
): Promise<ApiResponse<{ schedules: CoachingWeekSchedule[] }>> => {
  return get<{ schedules: CoachingWeekSchedule[] }>('/student/coaching/week', { params: { date } })
}

export const startCoachingAppointment = async (id: number): Promise<ApiResponse<unknown>> => {
  return post(`/teacher/coaching/appointments/${id}/start`)
}

export const endCoachingAppointment = async (id: number): Promise<ApiResponse<unknown>> => {
  return post(`/teacher/coaching/appointments/${id}/end`)
}

export type CoachingTimeStats = {
  todayMinutes: number    // 今日陪练时长（分钟）
  totalMinutes: number    // 累积陪练时长（分钟）
  todaySessions: number   // 今日陪练次数
  totalSessions: number   // 累积陪练次数
}

/** 获取用户陪练时长统计（老师或学生通用） */
export const getCoachingTimeStats = async (): Promise<ApiResponse<CoachingTimeStats>> => {
  return get<CoachingTimeStats>('/coaching/time-stats')
}
