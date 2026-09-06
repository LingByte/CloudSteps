import { get, post, ApiResponse } from '../utils/request'

export type Announcement = {
  id: string | number
  title: string
  content: string
  status?: string
  publishedAt?: string
  priority?: number
  read?: boolean
  createdAt?: string
  updatedAt?: string
}

export const getPendingAnnouncementPopup = async (): Promise<
  ApiResponse<{
    announcements?: Announcement[]
    announcement: Announcement | null
  }>
> => {
  return get<{
    announcements?: Announcement[]
    announcement: Announcement | null
  }>('/announcements/pending-popup')
}

export const listAnnouncements = async (params?: {
  page?: number
  pageSize?: number
}): Promise<ApiResponse<{ list: Announcement[]; total: number }>> => {
  return get<{ list: Announcement[]; total: number }>('/announcements', {
    params: {
      page: params?.page ?? 1,
      pageSize: params?.pageSize ?? 20,
    },
  })
}

export const markAnnouncementRead = async (
  id: string | number
): Promise<ApiResponse<null>> => {
  return post<null>(`/announcements/${id}/read`)
}
