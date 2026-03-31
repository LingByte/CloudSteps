import { get, post, del, ApiResponse } from '@/utils/request'

export interface ClassItem {
  id: number
  name: string
  description?: string
  createdAt: string
}

export const listClasses = async (): Promise<ApiResponse<ClassItem[]>> => {
  return get<ClassItem[]>('/classes')
}

export const listClassStudents = async (classId: number): Promise<ApiResponse<any[]>> => {
  return get<any[]>(`/classes/${classId}/students`)
}

export const addClassStudent = async (classId: number, studentId: number): Promise<ApiResponse<null>> => {
  return post<null>(`/classes/${classId}/students`, { studentId })
}

export const removeClassStudent = async (classId: number, studentId: number): Promise<ApiResponse<null>> => {
  return del<null>(`/classes/${classId}/students/${studentId}`)
}

export const searchCourseUsers = async (q: string, role: string): Promise<ApiResponse<any[]>> => {
  return get<any[]>('/courses/users/search', { params: { q, role } })
}
