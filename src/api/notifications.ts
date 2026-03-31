import { get, post, put, ApiResponse } from '@/utils/request'

export interface ApiNotification {
  id: number
  title: string
  content: string
  read: boolean
  created_at: string
}

export interface ListNotificationsResponse {
  list: ApiNotification[]
  total: number
  totalUnread: number
  totalRead: number
  page: number
  size: number
}

export const listNotifications = async (params: {
  page: number
  size: number
}): Promise<ApiResponse<ListNotificationsResponse>> => {
  return get<ListNotificationsResponse>('/notification', { params })
}

export const markAllNotificationsRead = async (): Promise<ApiResponse<null>> => {
  return post<null>('/notification/readAll')
}

export const markNotificationRead = async (id: number): Promise<ApiResponse<null>> => {
  return put<null>(`/notification/read/${id}`)
}
