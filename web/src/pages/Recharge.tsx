import { useEffect, useMemo, useState } from "react";
import { Check, ChevronRight, Crown, LockKeyhole, CheckCircle2, Clock, Sparkles } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { CloudButton } from "../components/cloudsteps";
import { CloudCard } from "../components/cloudsteps/arco";
import { PageBackHeader } from "../components/PageBackHeader";
import { showToast } from "../utils/toast";
import { getTeacherTeachingPoolWithSubscription, type UserSubscription } from "../api/coaching";

type Plan = {
  id: string;
  tab: string;
  name: string;
  period: string;
  price: number;
  monthly: string;
  save?: string;
  features: string[];
};

const FIRST_MONTH_PRICE = 9.9;

const plans: Plan[] = [
  { id: "monthly", tab: "月付", name: "月度会员", period: "1个月", price: 58, monthly: "¥58 / 月", features: ["全部功能无限制", "无限学习", "开通推广返佣", "优先客服支持"] },
  { id: "quarterly", tab: "季付", name: "季度会员", period: "3个月", price: 98, monthly: "¥32.7 / 月", save: "省 ¥76", features: ["无限学习", "全部功能无限制", "开通推广返佣", "赠送 300 积分", "优先客服支持"] },
  { id: "yearly", tab: "年付", name: "年度会员", period: "12个月", price: 198, monthly: "¥16.5 / 月", save: "比月付省 72%", features: ["无限学习", "全部功能无限制", "开通推广返佣", "赠送 1200 积分", "优先客服支持"] },
  { id: "lifetime", tab: "永久会员", name: "永久会员", period: "永久有效", price: 498, monthly: "一次购买", save: "买断最划算", features: ["无限学习", "全部功能无限制", "开通推广返佣", "赠送 3000 积分", "优先客服支持", "后续内容持续更新"] },
];

const comparison = [
  ["价格", "免费", "¥58", "¥98", "¥198", "¥498"],
  ["有效期", "长期", "1个月", "3个月", "12个月", "永久"],
  ["学生数量", "1名", "无限", "无限", "无限", "无限"],
  ["核心功能", "部分可用", "全部功能", "全部功能", "全部功能", "全部功能"],
  ["开通积分", "—", "100", "300", "1200", "3000"],
  ["推广返佣", "—", "20%", "20%", "20%", "20%"],
];

const paymentMethods = [
  { id: "wechat", label: "微信支付", icon: "icon-weixinzhifu", color: "text-success" },
  { id: "alipay", label: "支付宝", icon: "icon-zhifubaozhifu", color: "text-secondary-brand" },
  { id: "bank", label: "信用卡银行卡", icon: "icon-xinyongkayinhangka", color: "text-primary" },
];

const money = (value: number) => `¥${value % 1 === 0 ? value.toFixed(0) : value.toFixed(1)}`;

export default function Recharge() {
  const [selectedId, setSelectedId] = useState("yearly");
  const [method, setMethod] = useState("微信支付");
  const [currentSub, setCurrentSub] = useState<UserSubscription | null | undefined>(undefined);
  const [showFirstMonthDeal, setShowFirstMonthDeal] = useState(false);
  const selected = useMemo(() => plans.find((plan) => plan.id === selectedId) ?? plans[2], [selectedId]);
  const isNewUser = !currentSub;
  const isFirstMonth = selectedId === "monthly" && isNewUser && showFirstMonthDeal;
  const finalPrice = isFirstMonth ? FIRST_MONTH_PRICE : selected.price;

  useEffect(() => {
    const timer = setTimeout(() => setShowFirstMonthDeal(true), 600);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const res = await getTeacherTeachingPoolWithSubscription();
        if (res.code === 200 && res.data) {
          setCurrentSub(res.data.subscription ?? null);
        }
      } catch {
        setCurrentSub(null);
      }
    })();
  }, []);

  const submit = () => {
    if (!window.confirm(`确认开通${selected.name}？一次性购买，不会自动续费。`)) return;
    showToast.success(`${selected.name}开通成功：${money(finalPrice)}（mock）`);
  };

  return (
    <div className="flex h-dvh flex-col bg-background text-foreground">
      <PageBackHeader title="会员中心" subtitle="选择适合你的会员方案" fallbackTo="/coach-center" maxWidthClass="max-w-6xl" />

      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-7">
          {/* 当前订阅状态 */}
          {currentSub && currentSub.status === "active" ? (
            <CloudCard className="mb-5 border-primary/30 bg-gradient-to-br from-primary/10 via-card to-card p-4 sm:p-5">
              <div className="flex items-center gap-3">
                <div className="size-10 rounded-xl bg-primary text-primary-foreground flex items-center justify-center shrink-0">
                  <Crown size={18} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-foreground">
                      {currentSub.type === "monthly" ? "包月会员" : currentSub.type === "yearly" ? "包年会员" : "永久会员"}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-primary-soft px-2 py-0.5 text-[10px] font-medium text-primary">
                      <CheckCircle2 size={11} /> 生效中
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {currentSub.type === "lifetime"
                      ? "买断会员 · 永久有效"
                      : `到期时间：${new Date(currentSub.expiredAt || "").toLocaleDateString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" })}`}
                  </p>
                </div>
                <div className="hidden items-center gap-1 text-xs text-muted-foreground sm:flex">
                  <Clock size={13} />
                  {currentSub.type === "lifetime" ? "永久" : `开通于 ${new Date(currentSub.startedAt).toLocaleDateString("zh-CN")}`}
                </div>
              </div>
            </CloudCard>
          ) : null}
          <div className="mb-5 flex items-end justify-between gap-4">
            <div>
              <p className="mb-1 text-xs font-medium uppercase tracking-[0.16em] text-primary">CloudSteps Plus</p>
              <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">解锁完整学习能力</h2>
              <p className="mt-1 text-sm text-muted-foreground">一次购买，立即享受全部会员权益。</p>
            </div>
            <span className="hidden items-center gap-1.5 rounded-full bg-primary-soft px-3 py-1.5 text-xs font-medium text-primary sm:flex"><LockKeyhole size={13} />安全支付</span>
          </div>

          <div className="grid items-stretch gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
            <CloudCard className="h-full p-4 sm:p-5">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-base font-semibold">选择套餐</h3>
                <span className="text-xs text-muted-foreground">按需选择，随时升级</span>
              </div>
              <div className="grid grid-cols-4 gap-1 rounded-xl bg-muted p-1" role="tablist" aria-label="会员套餐周期">
                {plans.map((plan) => (
                  <button key={plan.id} type="button" role="tab" aria-selected={selected.id === plan.id} onClick={() => { setSelectedId(plan.id); }} className={`relative rounded-lg px-1 py-2 text-xs transition-all sm:text-sm ${selected.id === plan.id ? "bg-card font-semibold text-foreground shadow-sm ring-1 ring-border/60" : "text-muted-foreground hover:text-foreground"}`}>
                    {plan.tab}
                    {plan.id === "yearly" ? <span className="absolute -right-1 -top-2 rounded-full bg-secondary-brand px-1.5 py-0.5 text-[10px] font-medium text-white">推荐</span> : null}
                  </button>
                ))}
              </div>

              <div className="mt-4 rounded-xl border border-primary/20 bg-accent/45 p-4 sm:p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <span className="mb-2 inline-flex size-8 items-center justify-center rounded-lg bg-primary text-white"><Crown size={16} /></span>
                    <h4 className="text-lg font-semibold">{selected.name}</h4>
                    <p className="mt-1 text-sm text-muted-foreground">{selected.period} · {selected.monthly}</p>
                  </div>
                  <div className="text-right">
                    {selected.save ? <span className="inline-block rounded-md bg-primary-soft px-2 py-1 text-xs font-semibold text-primary">{selected.save}</span> : null}
                    {isFirstMonth ? (
                      <div className="mt-2 flex items-end justify-end gap-2">
                        <AnimatePresence mode="popLayout">
                          <motion.span
                            key="original"
                            initial={{ opacity: 0, x: 20, position: "absolute" }}
                            animate={{ opacity: 1, x: 0, position: "relative" }}
                            exit={{ opacity: 0, x: -10 }}
                            transition={{ duration: 0.4, delay: 0.15 }}
                            className="text-base font-normal text-muted-foreground line-through"
                          >
                            {money(selected.price)}
                          </motion.span>
                          <motion.span
                            key="deal"
                            initial={{ opacity: 0, scale: 0.5 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ type: "spring", stiffness: 300, damping: 18, delay: 0.3 }}
                            className="text-3xl font-semibold tracking-tight text-primary sm:text-4xl"
                          >
                            {money(FIRST_MONTH_PRICE)}
                          </motion.span>
                        </AnimatePresence>
                      </div>
                    ) : (
                      <p className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">{money(finalPrice)}</p>
                    )}
                    <p className="text-xs text-muted-foreground">一次性支付</p>
                  </div>
                </div>
                <div className="my-4 h-px bg-border/70" />
                <ul className="grid gap-2 sm:grid-cols-2" aria-label={`${selected.name}权益`}>
                  {selected.features.map((feature, index) => <li key={feature} className={`flex items-center gap-2 text-sm ${index < 2 ? "font-medium text-foreground" : "text-muted-foreground"}`}><Check size={15} className="shrink-0 text-primary" />{feature}</li>)}
                </ul>
              </div>

            </CloudCard>

            <aside className="lg:sticky lg:top-5">
              <CloudCard className="p-4 sm:p-5">
                <div className="mb-4 flex items-center justify-between"><h3 className="text-base font-semibold">订单摘要</h3><span className="rounded-full bg-primary-soft px-2 py-1 text-xs text-primary">不自动续费</span></div>
                <div className="flex items-center justify-between border-b border-border/70 pb-3 text-sm"><span className="text-muted-foreground">{selected.name}</span><span className="font-medium">{money(selected.price)}</span></div>
                {isFirstMonth ? (
                  <div className="mt-3 flex items-center justify-between rounded-lg bg-primary/8 px-3 py-2">
                    <span className="text-xs font-medium text-primary">新用户首月特惠</span>
                    <span className="text-sm font-semibold text-primary">-{money(selected.price - FIRST_MONTH_PRICE)}</span>
                  </div>
                ) : null}
                <div className="mt-4 flex items-end justify-between"><span className="text-sm text-muted-foreground">应付金额</span>
                  <motion.span
                    key={finalPrice}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3 }}
                    className="text-2xl font-semibold text-primary"
                  >{money(finalPrice)}</motion.span></div>
                <CloudButton onClick={submit} className="mt-4 h-11 w-full bg-primary text-sm font-semibold text-primary-foreground hover:bg-primary/90 active:scale-[0.99]">立即开通</CloudButton>
                <p className="mt-2 text-center text-xs text-muted-foreground">支付即代表同意会员服务条款</p>
              </CloudCard>

              <CloudCard className="mt-3 p-4">
                <div className="mb-3 flex items-center gap-2 text-sm font-semibold"><Crown size={16} className="text-primary" />支付方式</div>
                <div className="grid grid-cols-3 gap-2">{paymentMethods.map((item) => <button key={item.id} type="button" onClick={() => setMethod(item.label)} aria-pressed={method === item.label} className={`flex min-h-12 flex-col items-center justify-center gap-1 rounded-md border px-1 py-1.5 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${method === item.label ? "border-primary bg-primary-soft font-medium text-primary" : "border-border text-muted-foreground hover:border-primary/50"}`}><i className={`payment-iconfont ${item.icon} ${item.color} text-lg leading-none`} aria-hidden="true" />{item.label}</button>)}</div>
                <p className="mt-3 flex items-center gap-1 text-xs text-muted-foreground">已选择：{method}<ChevronRight size={13} /></p>
              </CloudCard>
            </aside>
          </div>

          <CloudCard className="mt-5 overflow-hidden p-4 sm:p-5">
            <div className="mb-4 flex items-end justify-between gap-4"><div><h3 className="flex items-center gap-2 text-base font-semibold"><Sparkles size={17} className="text-primary" />会员权益对比</h3><p className="mt-1 text-xs text-muted-foreground">清晰比较不同方案，选择最适合你的会员</p></div><span className="text-xs text-muted-foreground">左右滑动查看</span></div>
            <div className="overflow-x-auto"><table className="min-w-[650px] w-full border-collapse text-sm"><caption className="sr-only">会员套餐权益对比表</caption><thead><tr>{comparison[0].map((item, index) => <th key={item} scope="col" className={`border border-border bg-muted/50 px-3 py-2.5 font-medium ${index === 0 ? "w-24 text-left" : "text-center"}`}>{item}</th>)}</tr></thead><tbody>{comparison.slice(1).map((row) => <tr key={row[0]}>{row.map((item, index) => <td key={`${row[0]}-${item}`} className={`border border-border px-3 py-2.5 ${index === 0 ? "font-medium text-foreground" : "text-center text-muted-foreground"}`}>{item}</td>)}</tr>)}</tbody></table></div>
          </CloudCard>
        </div>
      </main>
    </div>
  );
}
