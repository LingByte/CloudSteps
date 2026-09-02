// 纯前端 mock 数据，不涉及后端。
// 充值页面参考汽水音乐：套餐卡片 + 自定义金额 + 支付方式 + 充值记录。

export type PaymentMethod = 'wechat' | 'alipay' | 'card'

export type RechargePackage = {
  id: string
  amount: number // 实付金额（元）
  bonus: number // 赠送金额（元）
  tag?: string // 角标文案，如「热门」「超值」
}

export type RechargeOrderStatus = 'success' | 'pending' | 'failed'

export type RechargeOrder = {
  id: string
  orderNo: string
  amount: number
  bonus: number
  method: PaymentMethod
  createdAt: string
  status: RechargeOrderStatus
}

export type RechargeBalance = {
  balance: number
  totalRecharged: number
  totalConsumed: number
}

export const mockBalance: RechargeBalance = {
  balance: 36.5,
  totalRecharged: 300,
  totalConsumed: 263.5,
}

export const mockPackages: RechargePackage[] = [
  { id: 'p6', amount: 6, bonus: 0 },
  { id: 'p18', amount: 18, bonus: 1, tag: '入门' },
  { id: 'p68', amount: 68, bonus: 8, tag: '热门' },
  { id: 'p128', amount: 128, bonus: 18, tag: '超值' },
  { id: 'p298', amount: 298, bonus: 48 },
  { id: 'p648', amount: 648, bonus: 128, tag: '豪华' },
]

export const mockOrders: RechargeOrder[] = [
  {
    id: '1',
    orderNo: 'CS20260902103012001',
    amount: 68,
    bonus: 8,
    method: 'wechat',
    createdAt: '2026-09-02 10:30:12',
    status: 'success',
  },
  {
    id: '2',
    orderNo: 'CS20260828192247012',
    amount: 18,
    bonus: 1,
    method: 'alipay',
    createdAt: '2026-08-28 19:22:47',
    status: 'success',
  },
  {
    id: '3',
    orderNo: 'CS20260820140555003',
    amount: 128,
    bonus: 18,
    method: 'wechat',
    createdAt: '2026-08-20 14:05:55',
    status: 'success',
  },
  {
    id: '4',
    orderNo: 'CS20260815081130004',
    amount: 6,
    bonus: 0,
    method: 'card',
    createdAt: '2026-08-15 08:11:30',
    status: 'failed',
  },
  {
    id: '5',
    orderNo: 'CS20260801233810005',
    amount: 298,
    bonus: 48,
    method: 'alipay',
    createdAt: '2026-08-01 23:38:10',
    status: 'success',
  },
]

export const paymentMethodLabel: Record<PaymentMethod, string> = {
  wechat: '微信支付',
  alipay: '支付宝',
  card: '银行卡',
}

export const orderStatusLabel: Record<RechargeOrderStatus, string> = {
  success: '成功',
  pending: '处理中',
  failed: '失败',
}

// 生成一个 mock 订单号
export function generateOrderNo(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const stamp =
    d.getFullYear().toString() +
    pad(d.getMonth() + 1) +
    pad(d.getDate()) +
    pad(d.getHours()) +
    pad(d.getMinutes()) +
    pad(d.getSeconds())
  const rand = String(Math.floor(Math.random() * 900) + 100)
  return `CS${stamp}${rand}`
}
