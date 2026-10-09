import { get, post } from '../utils/request'
import type { ApiResponse } from '../types/api'

export type FeedbackReply = { id: number; role: string; content: string; createdAt: string }
export type FeedbackTicket = { id: number; content: string; contact?: string; status: string; replyCount: number; createdAt: string; replies?: FeedbackReply[] }
export type ListFeedbackResponse = { list: FeedbackTicket[]; total: number; page: number; pageSize: number }
export function listFeedback(params?: { page?: number; pageSize?: number }): Promise<ApiResponse<ListFeedbackResponse>> { return get('/feedback', params as any) }
export function getFeedbackUnreadCount(): Promise<ApiResponse<{ count: number }>> { return get('/feedback/unread-count') }
export function createFeedback(body: { content: string; contact?: string }): Promise<ApiResponse<FeedbackTicket>> { return post('/feedback', body) }
export function replyFeedback(id: number, content: string): Promise<ApiResponse<FeedbackTicket>> { return post(`/feedback/${id}/replies`, { content }) }
