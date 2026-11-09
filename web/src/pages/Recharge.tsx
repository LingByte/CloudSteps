import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import QRCode from "qrcode";
import { Check, Crown, LockKeyhole, CheckCircle2, Clock, Sparkles } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { CloudButton } from "../components/cloudsteps";
import { CloudCard } from "../components/cloudsteps/arco";
import { PageBackHeader } from "../components/PageBackHeader";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { type UserSubscription } from "../api/coaching";
import { createWechatNativePay, createWechatPay, getMySubscription, getWechatPayOrder, type WechatPayParams } from "../api/pay";
import { showToast } from "../utils/toast";
import { formatApiMessage } from "../utils/apiMessage";

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

const money = (value: number) => `¥${value % 1 === 0 ? value.toFixed(0) : value.toFixed(1)}`;

function planLabel(type?: string) {
  if (type === "monthly") return "月度会员";
  if (type === "quarterly") return "季度会员";
  if (type === "yearly") return "年度会员";
  if (type === "lifetime") return "永久会员";
  return "会员";
}

function formatDay(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" });
}

function daysRemaining(value?: string | null) {
  if (!value) return null;
  const end = new Date(value).getTime();
  if (Number.isNaN(end)) return null;
  return Math.max(0, Math.ceil((end - Date.now()) / 86_400_000));
}

const planRank: Record<string, number> = { monthly: 1, quarterly: 2, yearly: 3, lifetime: 4 };

function invokeWechatPay(pay: WechatPayParams) {
  return new Promise<void>((resolve, reject) => {
    const run = () => {
      const bridge = (window as unknown as { WeixinJSBridge?: { invoke: Function } }).WeixinJSBridge;
      if (!bridge) {
        reject(new Error("请在微信中打开"));
        return;
      }
      bridge.invoke(
        "getBrandWCPayRequest",
        {
          appId: pay.appId,
          timeStamp: pay.timeStamp,
          nonceStr: pay.nonceStr,
          package: pay.package,
          signType: pay.signType,
          paySign: pay.paySign,
        },
        (res: { err_msg?: string }) => {
          if (res?.err_msg === "get_brand_wcpay_request:ok") resolve();
          else reject(new Error(res?.err_msg || "支付未完成"));
        },
      );
    };
    if (typeof (window as unknown as { WeixinJSBridge?: unknown }).WeixinJSBridge === "undefined") {
      document.addEventListener("WeixinJSBridgeReady", run, { once: true });
    } else {
      run();
    }
  });
}

export default function Recharge() {
  const [selectedId, setSelectedId] = useState("yearly");
  const [currentSub, setCurrentSub] = useState<UserSubscription | null | undefined>(undefined);
  const [showFirstMonthDeal, setShowFirstMonthDeal] = useState(false);
  const [paying, setPaying] = useState(false);
  const [scanPay, setScanPay] = useState<{ outTradeNo: string; qr: string; amount: string } | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const oauthHandled = useRef(false);
  const selected = useMemo(() => plans.find((plan) => plan.id === selectedId) ?? plans[2], [selectedId]);
  const isMember = currentSub?.status === "active";
  const isFirstMonth = selectedId === "monthly" && currentSub === null && showFirstMonthDeal;
  const finalPrice = isFirstMonth ? FIRST_MONTH_PRICE : selected.price;
  const currentPlan = plans.find((plan) => plan.id === currentSub?.type);
  const remainDays = daysRemaining(currentSub?.expiredAt);
  const currentColumn = isMember ? (planRank[currentSub?.type || ""] ?? 0) + 1 : -1;

  useEffect(() => {
    const timer = setTimeout(() => setShowFirstMonthDeal(true), 600);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const res = await getMySubscription();
        if (res.code === 200) setCurrentSub(res.data ?? null);
      } catch {
        setCurrentSub(null);
      }
    })();
  }, []);

  const refreshSub = async () => {
    const res = await getMySubscription();
    if (res.code === 200) setCurrentSub(res.data ?? null);
  };

  const startScanPay = async (plan: string) => {
    setPaying(true);
    try {
      const res = await createWechatNativePay({ plan });
      if (res.code !== 200 || !res.data?.codeUrl || !res.data.outTradeNo) {
        showToast.error(formatApiMessage(res.msg, "支付失败"));
        return;
      }
      const qr = await QRCode.toDataURL(res.data.codeUrl, { width: 280, margin: 1 });
      setScanPay({ outTradeNo: res.data.outTradeNo, qr, amount: money(finalPrice) });
    } catch (e: unknown) {
      const msg = e && typeof e === "object" && "msg" in e ? String((e as { msg: string }).msg) : e instanceof Error ? e.message : "";
      showToast.error(formatApiMessage(msg, "支付失败"));
    } finally {
      setPaying(false);
    }
  };

  const startPay = async (plan: string, code?: string) => {
    if (!/MicroMessenger/i.test(navigator.userAgent)) {
      await startScanPay(plan);
      return;
    }
    setPaying(true);
    try {
      const res = await createWechatPay({ plan, code });
      if (res.code !== 200 || !res.data) {
        showToast.error(formatApiMessage(res.msg, "支付失败"));
        return;
      }
      if (res.data.oauthUrl) {
        window.location.href = res.data.oauthUrl;
        return;
      }
      if (!res.data.pay || !res.data.outTradeNo) {
        showToast.error("支付参数缺失");
        return;
      }
      await invokeWechatPay(res.data.pay);
      const status = await getWechatPayOrder(res.data.outTradeNo);
      if (status.data?.status === "paid") {
        showToast.success("支付成功，会员已开通");
        await refreshSub();
        return;
      }
      showToast.info("支付结果确认中，请稍后刷新查看");
    } catch (e: unknown) {
      const msg = e && typeof e === "object" && "msg" in e ? String((e as { msg: string }).msg) : e instanceof Error ? e.message : "";
      if (/cancel|取消/.test(msg)) showToast.info("已取消支付");
      else showToast.error(formatApiMessage(msg, "支付失败"));
    } finally {
      setPaying(false);
    }
  };

  useEffect(() => {
    if (!scanPay) return;
    let stopped = false;
    const timer = window.setInterval(() => {
      void (async () => {
        try {
          const status = await getWechatPayOrder(scanPay.outTradeNo);
          if (stopped || status.data?.status !== "paid") return;
          stopped = true;
          setScanPay(null);
          showToast.success("支付成功，会员已开通");
          await refreshSub();
        } catch {
          /* 下一轮继续查 */
        }
      })();
    }, 2000);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [scanPay?.outTradeNo]);

  useEffect(() => {
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    if (!code || !state || oauthHandled.current) return;
    oauthHandled.current = true;
    setSelectedId(state);
    setSearchParams({}, { replace: true });
    void startPay(state, code);
  }, [searchParams, setSearchParams]);

  const submit = () => {
    if (isMember && currentSub?.type === "lifetime") return;
    void startPay(selectedId);
  };

  const payLabel = !isMember
    ? "立即开通"
    : currentSub?.type === "lifetime"
      ? "已是永久会员"
      : selectedId === currentSub?.type
        ? "续费并顺延"
        : (planRank[selectedId] ?? 0) > (planRank[currentSub?.type || ""] ?? 0)
          ? `升级为${selected.name}`
          : `调整为${selected.name}`;

  return (
    <div className="flex h-dvh flex-col bg-background text-foreground">
      <PageBackHeader
        title="会员中心"
        subtitle={isMember ? `${planLabel(currentSub?.type)} · ${currentSub?.type === "lifetime" ? "永久有效" : `有效期至 ${formatDay(currentSub?.expiredAt)}`}` : "选择适合你的会员方案"}
        fallbackTo="/coach-center"
        maxWidthClass="max-w-6xl"
      />

      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-7">
          {isMember && currentSub ? (
            <section className="mb-6 overflow-hidden rounded-2xl border border-amber-500/30 bg-gradient-to-br from-amber-400/20 via-card to-card">
              <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
                <div className="flex items-start gap-4">
                  <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-300 to-amber-600 text-amber-950 shadow-sm">
                    <Crown size={22} />
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-xl font-semibold tracking-tight">{planLabel(currentSub.type)}</h2>
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-800">
                        <CheckCircle2 size={12} /> 生效中
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-foreground/80">
                      {currentSub.type === "lifetime" ? "永久有效" : `有效期至 ${formatDay(currentSub.expiredAt)}`}
                    </p>
                    <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock size={12} />
                      开通于 {formatDay(currentSub.startedAt)}
                    </p>
                  </div>
                </div>
                {currentSub.type === "lifetime" ? (
                  <p className="text-sm font-medium text-amber-800">一次买断，长期可用</p>
                ) : remainDays != null ? (
                  <div className="sm:text-right">
                    <p className="text-xs font-medium text-amber-800">剩余</p>
                    <p className="text-3xl font-semibold tabular-nums tracking-tight text-amber-950">{remainDays}<span className="ml-1 text-base font-medium">天</span></p>
                  </div>
                ) : null}
              </div>
              {currentPlan ? (
                <ul className="grid grid-cols-2 gap-x-4 gap-y-2 border-t border-amber-500/15 px-5 py-4 sm:grid-cols-4 sm:px-6">
                  {currentPlan.features.slice(0, 4).map((feature) => (
                    <li key={feature} className="flex items-center gap-1.5 text-xs text-foreground/80">
                      <Check size={14} className="shrink-0 text-amber-700" />
                      {feature}
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>
          ) : null}
          <div className="mb-5 flex items-end justify-between gap-4">
            <div>
              <p className="mb-1 text-xs font-medium uppercase tracking-[0.16em] text-primary">CloudSteps Plus</p>
              <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">{isMember ? "续费或升级" : "解锁完整学习能力"}</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {isMember ? "续费和升级都会从当前到期日往后顺延。" : "一次购买，立即享受全部会员权益。"}
              </p>
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
                    {currentSub?.type === plan.id ? <span className="absolute -right-1 -top-2 rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-medium text-amber-950">当前</span> : plan.id === "yearly" ? <span className="absolute -right-1 -top-2 rounded-full bg-secondary-brand px-1.5 py-0.5 text-[10px] font-medium text-white">推荐</span> : null}
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
                <CloudButton onClick={submit} loading={paying} disabled={isMember && currentSub?.type === "lifetime"} className="mt-4 h-11 w-full bg-primary text-sm font-semibold text-primary-foreground hover:bg-primary/90 active:scale-[0.99]">{payLabel}</CloudButton>
                <p className="mt-2 text-center text-xs text-muted-foreground">支付即代表同意会员服务条款</p>
                {typeof navigator !== "undefined" && !/MicroMessenger/i.test(navigator.userAgent) ? (
                  <p className="mt-2 text-center text-xs text-muted-foreground">电脑上会弹出微信支付二维码，用微信扫一扫即可付款。</p>
                ) : null}
              </CloudCard>
            </aside>
          </div>

          <CloudCard className="mt-5 overflow-hidden p-4 sm:p-5">
            <div className="mb-4 flex items-end justify-between gap-4"><div><h3 className="flex items-center gap-2 text-base font-semibold"><Sparkles size={17} className="text-primary" />会员权益对比</h3><p className="mt-1 text-xs text-muted-foreground">清晰比较不同方案，选择最适合你的会员</p></div><span className="text-xs text-muted-foreground">左右滑动查看</span></div>
            <div className="overflow-x-auto"><table className="min-w-[650px] w-full border-collapse text-sm"><caption className="sr-only">会员套餐权益对比表</caption><thead><tr>{comparison[0].map((item, index) => <th key={item} scope="col" className={`border border-border px-3 py-2.5 font-medium ${index === 0 ? "w-24 text-left" : "text-center"} ${index === currentColumn ? "bg-amber-500/15 text-amber-950" : "bg-muted/50"}`}>{item}</th>)}</tr></thead><tbody>{comparison.slice(1).map((row) => <tr key={row[0]}>{row.map((item, index) => <td key={`${row[0]}-${index}`} className={`border border-border px-3 py-2.5 ${index === 0 ? "font-medium text-foreground" : "text-center text-muted-foreground"} ${index === currentColumn ? "bg-amber-500/10 text-foreground" : ""}`}>{item}</td>)}</tr>)}</tbody></table></div>
          </CloudCard>
        </div>
      </main>

      <Dialog open={scanPay != null} onOpenChange={(open) => { if (!open) setScanPay(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>微信扫码支付</DialogTitle>
            <DialogDescription>打开微信，扫一扫下面的二维码完成付款。支付成功后此窗口会自动关闭。</DialogDescription>
          </DialogHeader>
          {scanPay ? (
            <div className="flex flex-col items-center gap-3 pb-2">
              <img src={scanPay.qr} alt="微信支付二维码" className="size-56 rounded-lg border border-border bg-white p-2" />
              <p className="text-sm text-muted-foreground">{selected.name} · <span className="font-semibold text-foreground">{scanPay.amount}</span></p>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
