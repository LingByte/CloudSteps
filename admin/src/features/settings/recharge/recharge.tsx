import { useMemo, useState } from 'react'
import { CreditCard, Wallet } from 'lucide-react'
import { toast } from 'sonner'
import { formatDateTime } from '@/lib/datetime'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ConfirmDialog } from '@/components/confirm-dialog'
import {
  generateOrderNo,
  mockBalance,
  mockOrders,
  mockPackages,
  orderStatusLabel,
  paymentMethodLabel,
  type PaymentMethod,
  type RechargeOrder,
  type RechargeOrderStatus,
} from './mock'

const methods: { value: PaymentMethod; label: string }[] = [
  { value: 'wechat', label: '微信支付' },
  { value: 'alipay', label: '支付宝' },
  { value: 'card', label: '银行卡' },
]

const statusFilterOptions: {
  value: 'all' | RechargeOrderStatus
  label: string
}[] = [
  { value: 'all', label: '全部' },
  { value: 'success', label: '成功' },
  { value: 'pending', label: '处理中' },
  { value: 'failed', label: '失败' },
]

function yuan(n: number) {
  return `¥${n.toFixed(n % 1 === 0 ? 0 : 2)}`
}

export function RechargePanel() {
  const [balance, setBalance] = useState(mockBalance)
  const [orders, setOrders] = useState<RechargeOrder[]>(mockOrders)
  const [selectedPkgId, setSelectedPkgId] = useState<string | null>(
    mockPackages[2]?.id ?? null
  )
  const [customAmount, setCustomAmount] = useState('')
  const [method, setMethod] = useState<PaymentMethod>('wechat')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [paying, setPaying] = useState(false)
  const [statusFilter, setStatusFilter] = useState<'all' | RechargeOrderStatus>(
    'all'
  )

  const selectedPkg = useMemo(
    () => mockPackages.find((p) => p.id === selectedPkgId) ?? null,
    [selectedPkgId]
  )

  // 当前生效的金额与赠送（套餐优先，其次自定义）
  const effectiveAmount = useMemo(() => {
    if (selectedPkg)
      return { amount: selectedPkg.amount, bonus: selectedPkg.bonus }
    const n = Number(customAmount)
    if (customAmount && Number.isFinite(n) && n > 0) {
      return { amount: Math.floor(n), bonus: 0 }
    }
    return { amount: 0, bonus: 0 }
  }, [selectedPkg, customAmount])

  const canPay = effectiveAmount.amount > 0

  const onPickPackage = (id: string) => {
    setSelectedPkgId(id)
    setCustomAmount('')
  }

  const onInputCustom = (v: string) => {
    // 只允许正整数
    const cleaned = v.replace(/[^\d]/g, '')
    setCustomAmount(cleaned)
    if (cleaned) setSelectedPkgId(null)
  }

  const onPay = () => {
    if (!canPay) return
    setConfirmOpen(true)
  }

  const onConfirmPay = async () => {
    setPaying(true)
    // 模拟支付耗时
    await new Promise((r) => setTimeout(r, 600))
    const order: RechargeOrder = {
      id: String(Date.now()),
      orderNo: generateOrderNo(),
      amount: effectiveAmount.amount,
      bonus: effectiveAmount.bonus,
      method,
      createdAt: new Date().toISOString().replace('T', ' ').slice(0, 19),
      status: 'success',
    }
    setOrders((prev) => [order, ...prev])
    setBalance((prev) => ({
      ...prev,
      balance: prev.balance + order.amount + order.bonus,
      totalRecharged: prev.totalRecharged + order.amount,
    }))
    setPaying(false)
    setConfirmOpen(false)
    setCustomAmount('')
    toast.success(
      `充值成功 ${yuan(order.amount)}${
        order.bonus > 0 ? ` + 赠送 ${yuan(order.bonus)}` : ''
      }`
    )
  }

  const filteredOrders = useMemo(() => {
    if (statusFilter === 'all') return orders
    return orders.filter((o) => o.status === statusFilter)
  }, [orders, statusFilter])

  return (
    <Tabs defaultValue='recharge' className='w-full'>
      <TabsList>
        <TabsTrigger value='recharge'>充值</TabsTrigger>
        <TabsTrigger value='records'>充值记录</TabsTrigger>
      </TabsList>

      {/* ===== Tab: 充值 ===== */}
      <TabsContent value='recharge' className='space-y-6 pt-4'>
        {/* 余额卡片 */}
        <div className='grid gap-4 sm:grid-cols-3'>
          <Card>
            <CardHeader>
              <CardDescription>当前余额</CardDescription>
              <CardTitle className='text-3xl'>
                {yuan(balance.balance)}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader>
              <CardDescription>累计充值</CardDescription>
              <CardTitle className='text-3xl'>
                {yuan(balance.totalRecharged)}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader>
              <CardDescription>累计消费</CardDescription>
              <CardTitle className='text-3xl'>
                {yuan(balance.totalConsumed)}
              </CardTitle>
            </CardHeader>
          </Card>
        </div>

        {/* 套餐选择 */}
        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2'>
              <Wallet size={18} />
              选择充值套餐
            </CardTitle>
            <CardDescription>
              选择对应套餐，部分套餐含赠送金额。
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className='grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6'>
              {mockPackages.map((p) => {
                const active = selectedPkgId === p.id
                return (
                  <button
                    key={p.id}
                    type='button'
                    onClick={() => onPickPackage(p.id)}
                    className={cn(
                      'relative flex flex-col items-center justify-center rounded-xl border-2 px-3 py-4 text-center transition-colors',
                      active
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-primary/50 hover:bg-muted/40'
                    )}
                  >
                    {p.tag ? (
                      <span className='absolute -top-2 left-1/2 -translate-x-1/2 rounded-full bg-primary px-2 py-0.5 text-[10px] font-medium text-primary-foreground'>
                        {p.tag}
                      </span>
                    ) : null}
                    <span className='text-xl font-bold'>{yuan(p.amount)}</span>
                    {p.bonus > 0 ? (
                      <span className='mt-1 text-xs text-muted-foreground'>
                        送 {yuan(p.bonus)}
                      </span>
                    ) : (
                      <span className='mt-1 text-xs text-transparent'>—</span>
                    )}
                  </button>
                )
              })}
            </div>

            {/* 自定义金额 */}
            <div className='mt-5 flex items-center gap-3'>
              <span className='text-sm text-muted-foreground'>
                自定义金额：
              </span>
              <div className='relative w-40'>
                <span className='pointer-events-none absolute inset-y-0 start-2 flex items-center text-sm text-muted-foreground'>
                  ¥
                </span>
                <Input
                  className='ps-6'
                  inputMode='numeric'
                  placeholder='其他金额'
                  value={customAmount}
                  onChange={(e) => onInputCustom(e.target.value)}
                />
              </div>
              <span className='text-xs text-muted-foreground'>
                （整数，无赠送）
              </span>
            </div>
          </CardContent>
        </Card>

        {/* 支付方式 + 提交 */}
        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2'>
              <CreditCard size={18} />
              支付方式
            </CardTitle>
          </CardHeader>
          <CardContent className='space-y-4'>
            <div className='flex flex-wrap gap-2'>
              {methods.map((m) => {
                const active = method === m.value
                return (
                  <button
                    key={m.value}
                    type='button'
                    onClick={() => setMethod(m.value)}
                    className={cn(
                      'rounded-lg border px-4 py-2 text-sm transition-colors',
                      active
                        ? 'border-primary bg-primary/5 font-medium'
                        : 'border-border hover:bg-muted/40'
                    )}
                  >
                    {m.label}
                  </button>
                )
              })}
            </div>

            <div className='flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between'>
              <div className='text-sm'>
                <span className='text-muted-foreground'>实付 </span>
                <span className='text-lg font-bold'>
                  {yuan(effectiveAmount.amount)}
                </span>
                {effectiveAmount.bonus > 0 ? (
                  <span className='ms-2 text-xs text-muted-foreground'>
                    到账 {yuan(effectiveAmount.amount + effectiveAmount.bonus)}
                    （含赠送 {yuan(effectiveAmount.bonus)}）
                  </span>
                ) : null}
              </div>
              <Button onClick={onPay} disabled={!canPay || paying}>
                {paying ? '支付中…' : '确认充值'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      {/* ===== Tab: 充值记录 ===== */}
      <TabsContent value='records' className='pt-4'>
        <Card>
          <CardHeader>
            <div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
              <div>
                <CardTitle>充值记录</CardTitle>
                <CardDescription>查看历史充值订单与状态。</CardDescription>
              </div>
              <Select
                value={statusFilter}
                onValueChange={(v) =>
                  setStatusFilter(v as 'all' | RechargeOrderStatus)
                }
              >
                <SelectTrigger className='w-32'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {statusFilterOptions.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>订单号</TableHead>
                  <TableHead>实付</TableHead>
                  <TableHead>赠送</TableHead>
                  <TableHead>支付方式</TableHead>
                  <TableHead>时间</TableHead>
                  <TableHead>状态</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredOrders.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className='h-24 text-center text-muted-foreground'
                    >
                      暂无记录
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredOrders.map((o) => (
                    <TableRow key={o.id}>
                      <TableCell className='font-mono text-xs'>
                        {o.orderNo}
                      </TableCell>
                      <TableCell>{yuan(o.amount)}</TableCell>
                      <TableCell>{o.bonus > 0 ? yuan(o.bonus) : '—'}</TableCell>
                      <TableCell>{paymentMethodLabel[o.method]}</TableCell>
                      <TableCell>{formatDateTime(o.createdAt)}</TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            o.status === 'success'
                              ? 'default'
                              : o.status === 'pending'
                                ? 'secondary'
                                : 'destructive'
                          }
                        >
                          {orderStatusLabel[o.status]}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </TabsContent>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title='确认充值'
        desc={
          <div className='space-y-1 text-sm'>
            <div>
              实付金额：<b>{yuan(effectiveAmount.amount)}</b>
            </div>
            {effectiveAmount.bonus > 0 ? (
              <div>赠送金额：{yuan(effectiveAmount.bonus)}</div>
            ) : null}
            <div>支付方式：{paymentMethodLabel[method]}</div>
            <div className='text-muted-foreground'>
              此为演示页面，不会发生真实扣款。
            </div>
          </div>
        }
        confirmText={paying ? '支付中…' : '确认支付'}
        isLoading={paying}
        handleConfirm={onConfirmPay}
      />
    </Tabs>
  )
}
