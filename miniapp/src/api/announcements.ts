import { get, post } from '../utils/request'
import type { ApiResponse } from '../types/api'
export type Announcement = { id: string | number; title: string; content: string; status?: string; publishedAt?: string; priority?: number; read?: boolean; createdAt?: string }
export function listAnnouncements(params?: { page?: number; pageSize?: number }): Promise<ApiResponse<{ list: Announcement[]; total: number }>> { return get('/announcements', { page: params?.page ?? 1, pageSize: params?.pageSize ?? 20 } as any) }
export function getPendingAnnouncementPopup(): Promise<ApiResponse<{ announcements?: Announcement[]; announcement: Announcement | null }>> { return get('/announcements/pending-popup') }
export function markAnnouncementRead(id: string | number): Promise<ApiResponse<null>> { return post(`/announcements/${id}/read`) }
