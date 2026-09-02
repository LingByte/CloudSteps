// 纯前端 mock 数据，不涉及后端。
// 邀请码页面只展示邀请码与邀请记录，不做奖励。

export type InviteRecordStatus = 'registered' | 'activated'

export type InviteRecord = {
  id: number
  invitee: string
  registeredAt: string
  status: InviteRecordStatus
}

export type InviteCodeInfo = {
  code: string
  link: string
  createdAt: string
  totalInvited: number
  totalActivated: number
}

export const mockInviteCode: InviteCodeInfo = {
  code: 'CLOUD-7K9F2A',
  link: 'https://cloudsteps.example.com/i/7K9F2A',
  createdAt: '2026-07-12 10:24:00',
  totalInvited: 8,
  totalActivated: 5,
}

export const mockInviteRecords: InviteRecord[] = [
  {
    id: 1,
    invitee: '138****2041',
    registeredAt: '2026-08-30 14:21:08',
    status: 'activated',
  },
  {
    id: 2,
    invitee: '159****7762',
    registeredAt: '2026-08-28 09:05:42',
    status: 'activated',
  },
  {
    id: 3,
    invitee: '小马同学',
    registeredAt: '2026-08-25 20:13:55',
    status: 'registered',
  },
  {
    id: 4,
    invitee: '186****1190',
    registeredAt: '2026-08-21 11:47:30',
    status: 'activated',
  },
  {
    id: 5,
    invitee: 'Lily',
    registeredAt: '2026-08-18 16:02:11',
    status: 'registered',
  },
  {
    id: 6,
    invitee: '133****8821',
    registeredAt: '2026-08-12 08:30:00',
    status: 'activated',
  },
  {
    id: 7,
    invitee: '阿涛',
    registeredAt: '2026-08-05 22:18:46',
    status: 'registered',
  },
  {
    id: 8,
    invitee: '177****4503',
    registeredAt: '2026-07-30 10:09:22',
    status: 'activated',
  },
]

// 生成一个新的 mock 邀请码（仅本地展示）
export function generateMockCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let tail = ''
  for (let i = 0; i < 6; i += 1) {
    tail += chars[Math.floor(Math.random() * chars.length)]
  }
  return `CLOUD-${tail}`
}
