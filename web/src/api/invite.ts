import { get, post, type ApiResponse } from "../utils/request";

export type InviteRecordStatus = "registered" | "activated";

export type InviteRecord = {
  id: string | number;
  invitee: string;
  registeredAt: string;
  status: InviteRecordStatus;
};

export type InviteReward = {
  enabled: boolean;
  inviterRegisterMinutes: number;
  inviteeRegisterMinutes: number;
  inviterActivateMinutes: number;
  inviteeActivateMinutes: number;
};

export type InviteOverview = {
  code: string;
  createdAt: string;
  totalInvited: number;
  totalActivated: number;
  earnedMinutes: number;
  reward: InviteReward;
  records: InviteRecord[];
};

export function fetchMyInvite(): Promise<ApiResponse<InviteOverview>> {
  return get<InviteOverview>("/invite/me");
}

export function rotateInviteCode(): Promise<ApiResponse<InviteOverview>> {
  return post<InviteOverview>("/invite/rotate");
}
