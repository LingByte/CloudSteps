import { get, post, ApiResponse } from '@/utils/request'

export interface TeacherWeekSchedule {
  id: number
  title: string
  scheduledDate: string
  startTime: string
  endTime: string
  courseId: number
  course?: any
  students?: string[]
  status?: string
  session?: any
}

export const getTeacherWeek = async (date: string): Promise<ApiResponse<{ schedules: TeacherWeekSchedule[] }>> => {
  return get<{ schedules: TeacherWeekSchedule[] }>('/teacher/week', { params: { date } })
}

export const getStudentWeek = async (date: string): Promise<ApiResponse<{ schedules: TeacherWeekSchedule[] }>> => {
  return get<{ schedules: TeacherWeekSchedule[] }>('/student/week', { params: { date } })
}

export const startTeacherSession = async (scheduleId: number): Promise<ApiResponse<null>> => {
  return post<null>(`/teacher/sessions/${scheduleId}/start`)
}

export const endTeacherSession = async (scheduleId: number): Promise<ApiResponse<null>> => {
  return post<null>(`/teacher/sessions/${scheduleId}/end`)
}

export interface TrainingRecordItem {
  id: number
  name: string
  appointmentTime: string
  duration: string
  coach: string
  student: string
  status: string
}

export const listTeacherRecords = async (params: {
  page: number
  pageSize: number
  status?: string
}): Promise<ApiResponse<{ page: number; pageSize: number; total: number; records: TrainingRecordItem[] }>> => {
  return get<{ page: number; pageSize: number; total: number; records: TrainingRecordItem[] }>('/teacher/records', {
    params,
  })
}

export const listTeacherStudents = async (): Promise<ApiResponse<{ list: any[]; total: number }>> => {
  return get<{ list: any[]; total: number }>('/teacher/students')
}
