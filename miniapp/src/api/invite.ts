import { get, post } from '../utils/request'
import type { ApiResponse } from '../types/api'
export type InviteRecord = { id: string | number; invitee: string; registeredAt: string; status: string }
export type InviteOverview = { code: string; createdAt: string; totalInvited: number; totalActivated: number; earnedMinutes: number; records: InviteRecord[]; reward?: { enabled: boolean; inviterRegisterMinutes: number; inviteeRegisterMinutes: number; inviterActivateMinutes: number; inviteeActivateMinutes: number } }
export function fetchMyInvite(): Promise<ApiResponse<InviteOverview>> { return get('/invite/me') }
export function rotateInviteCode(): Promise<ApiResponse<InviteOverview>> { return post('/invite/rotate') }
