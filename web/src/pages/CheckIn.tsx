import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { ChevronLeft, Crown, Flame, Loader2 } from "lucide-react";
import { CloudButton } from "../components/cloudsteps";
import { CloudCard } from "../components/cloudsteps/arco";
import { getCheckInStatus, postCheckIn, type CheckInStatus } from "../api/checkin";
import { getMySubscription } from "../api/pay";
import type { UserSubscription } from "../api/coaching";
import { formatTeachingMinutes } from "../utils/formatMinutes";
import { showToast } from "../utils/toast";
import { useTranslation } from "react-i18next";
import { formatApiMessage } from "../utils/apiMessage";

const MONTH_KEYS = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"] as const;

const FALLBACK_TIERS = [
  { days: 1, minutes: 60 },
  { days: 3, minutes: 70 },
  { days: 5, minutes: 90 },
  { days: 7, minutes: 110 },
  { days: 14, minutes: 180 },
  { days: 30, minutes: 180 },
];

export default function CheckIn() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [status, setStatus] = useState<CheckInStatus | null>(null);
  const [subscription, setSubscription] = useState<UserSubscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [res, subRes] = await Promise.all([getCheckInStatus(), getMySubscription().catch(() => null)]);
      if (res.code === 200 && res.data) {
        setStatus(res.data);
      } else {
        showToast.error(formatApiMessage(res.msg, "common.query_failed"));
      }
      setSubscription(subRes && subRes.code === 200 ? subRes.data ?? null : null);
    } catch (e: unknown) {
      const msg =
        e && typeof e === "object" && "msg" in e ? String((e as { msg: string }).msg) : formatApiMessage(undefined, "common.query_failed");
      showToast.error(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // 构建最近 90 天贡献热力图：按周排列，每列 7 格（周日→周六）。
  const heatmap = useMemo(() => {
    const mask = status?.recentMask ?? [];
    const pad = status?.recentStartWeekday ?? 0;
    const totalDays = status?.recentDays ?? mask.length;
    const startDateStr = status?.recentStartDate ?? "";
    if (!totalDays) return { weeks: [], monthLabels: [] as { label: string; weekIndex: number }[], startDateStr };

    // 前面补 pad 个空格对齐到周几
    const cells: Array<{ day: number; checked: boolean; date: Date } | null> = [];
    for (let i = 0; i < pad; i++) cells.push(null);
    const start = new Date(startDateStr);
    for (let d = 0; d < totalDays; d++) {
      const date = new Date(start);
      date.setDate(start.getDate() + d);
      cells.push({ day: d, checked: !!mask[d], date });
    }
    // 补齐到整周
    const remainder = cells.length % 7;
    if (remainder > 0) {
      for (let i = 0; i < 7 - remainder; i++) cells.push(null);
    }

    // 按周分组
    const weeks: Array<Array<{ day: number; checked: boolean; date: Date } | null>> = [];
    for (let i = 0; i < cells.length; i += 7) {
      weeks.push(cells.slice(i, i + 7));
    }

    // 月份标签
    const monthLabels: { label: string; weekIndex: number }[] = [];
    let lastMonth = -1;
    for (let w = 0; w < weeks.length; w++) {
      for (const cell of weeks[w]) {
        if (cell) {
          const m = cell.date.getMonth();
          if (m !== lastMonth) {
            monthLabels.push({ label: t(`check_in.month.${MONTH_KEYS[m]}`), weekIndex: w });
            lastMonth = m;
          }
        }
      }
    }

    return { weeks, monthLabels, startDateStr };
  }, [status, t]);

  const tiers = status?.rewardPreview?.length ? status.rewardPreview : FALLBACK_TIERS;
  const streak = status?.currentStreak ?? 0;

  const isMember = subscription?.status === "active";
  const memberValidity = !subscription
    ? ""
    : subscription.type === "lifetime" || !subscription.expiredAt
      ? "永久有效"
      : `有效期至 ${new Date(subscription.expiredAt).toLocaleDateString("zh-CN")}`;

  const onCheckIn = async () => {
    if (isMember || submitting || status?.checkedInToday) return;
    setSubmitting(true);
    try {
      const res = await postCheckIn();
      if (res.code !== 200 || !res.data) {
        showToast.error(formatApiMessage(res.msg, "check_in.failed"));
        return;
      }
      const data = res.data;
      if (data.alreadyCheckedIn) {
        showToast.info(t("check_in.already_today"));
      } else {
        const bonus =
          data.bonusMinutes > 0 ? t("check_in.bonus_suffix", { bonus: data.bonusMinutes }) : "";
        showToast.success(t("check_in.success", { minutes: data.grantedMinutes, bonus }));
      }
      await load();
    } catch (e: unknown) {
      const msg =
        e && typeof e === "object" && "msg" in e ? formatApiMessage(String((e as { msg: string }).msg), "check_in.failed") : formatApiMessage(undefined, "check_in.failed");
      showToast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-2.5 overflow-y-auto pb-3">
      <div className="flex items-center gap-1.5 shrink-0 -ml-1">
        <CloudButton
          type="button"
          variant="ghost"
          size="icon"
          className="size-8"
          onClick={() => navigate("/coach-center")}
          aria-label={t("check_in.back_coach")}
        >
          <ChevronLeft size={18} />
        </CloudButton>
        <h3 className="text-sm font-semibold text-foreground tracking-tight">{t("check_in.title")}</h3>
      </div>

      {loading && !status ? (
        <CloudCard className="p-8 flex justify-center">
          <Loader2 className="size-5 animate-spin text-primary" />
        </CloudCard>
      ) : (
        <>
          <section
            className={
              isMember
                ? "relative overflow-hidden rounded-xl border border-amber-500/35 bg-gradient-to-br from-amber-400/20 via-card to-amber-700/10 px-3.5 py-3.5"
                : "relative overflow-hidden rounded-xl border border-primary/20 bg-gradient-to-br from-primary/[0.09] via-card to-transparent px-3.5 py-3.5"
            }
          >
            <div
              className={
                isMember
                  ? "pointer-events-none absolute -right-10 -top-12 size-28 rounded-full bg-amber-400/25 blur-2xl"
                  : "pointer-events-none absolute -right-10 -top-12 size-28 rounded-full bg-primary/10 blur-2xl"
              }
            />

            <div className="relative flex items-end justify-between gap-3">
              <div className="min-w-0">
                <p className={`text-[10px] font-medium uppercase tracking-wider ${isMember ? "text-amber-800" : "text-muted-foreground"}`}>
                  {isMember ? "会员" : t("check_in.teaching_quota")}
                </p>
                <p className={`mt-1 text-2xl font-bold tracking-tight leading-none ${isMember ? "text-amber-950" : "tabular-nums text-foreground"}`}>
                  {isMember ? memberValidity : formatTeachingMinutes(status?.poolRemainingMinutes ?? 0)}
                </p>
                {isMember ? null : (
                <p className="mt-1.5 text-[10px] text-muted-foreground leading-snug">
                  {status?.checkedInToday
                    ? t("check_in.claimed_today", { n: status.dailyReward })
                    : t("check_in.claimable_today", { n: status?.dailyReward ?? 60 })}
                </p>
                )}
              </div>

              {isMember ? (
                <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-300 to-amber-600 text-amber-950 shadow-sm">
                  <Crown size={16} />
                </span>
              ) : (
                <CloudButton
                  type="button"
                  variant="brand"
                  size="sm"
                  className="relative shrink-0 h-9 px-4 text-xs font-semibold shadow-sm"
                  disabled={submitting || !!status?.checkedInToday}
                  onClick={() => void onCheckIn()}
                >
                  {submitting ? <Loader2 className="size-3.5 animate-spin mr-1.5" /> : null}
                  {status?.checkedInToday
                    ? t("check_in.checked_in")
                    : t("check_in.check_in_btn", { n: status?.dailyReward ?? 60 })}
                </CloudButton>
              )}
            </div>

            <div className="relative mt-3 grid grid-cols-3 gap-1.5">
              <div className="rounded-lg bg-background/60 border border-border/50 px-2.5 py-2">
                <div className="flex items-center gap-0.5 text-[9px] text-muted-foreground">
                  <Flame size={10} className="text-orange-500" />
                  {t("check_in.streak")}
                </div>
                <p className="mt-0.5 text-sm font-semibold tabular-nums leading-none">
                  {status?.currentStreak ?? 0}
                  <span className="text-[10px] font-normal text-muted-foreground ml-0.5">{t("practice.day_unit")}</span>
                </p>
              </div>
              <div className="rounded-lg bg-background/60 border border-border/50 px-2.5 py-2">
                <div className="text-[9px] text-muted-foreground">{t("check_in.longest")}</div>
                <p className="mt-0.5 text-sm font-semibold tabular-nums leading-none">
                  {status?.longestStreak ?? 0}
                  <span className="text-[10px] font-normal text-muted-foreground ml-0.5">{t("practice.day_unit")}</span>
                </p>
              </div>
              <div className="rounded-lg bg-background/60 border border-border/50 px-2.5 py-2">
                <div className="text-[9px] text-muted-foreground">{t("check_in.this_year")}</div>
                <p className="mt-0.5 text-sm font-semibold tabular-nums leading-none">
                  {status?.yearCheckIns ?? 0}
                  <span className="text-[10px] font-normal text-muted-foreground ml-0.5">{t("practice.day_unit")}</span>
                </p>
              </div>
            </div>
          </section>

          <CloudCard className="px-3 py-3">
            <div className="flex items-baseline justify-between gap-2 mb-2">
              <h2 className="text-xs font-semibold text-foreground">{t("check_in.streak_rewards")}</h2>
              <p className="text-[9px] text-muted-foreground truncate">
                {t("check_in.streak_rewards_hint")}
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {tiers.map((tier) => {
                const done = streak >= tier.days;
                const next =
                  status?.nextStreakBonusDays === tier.days && !status?.checkedInToday;
                return (
                  <span
                    key={tier.days}
                    className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] tabular-nums transition-colors ${
                      done
                        ? "border-primary/25 bg-primary/8 text-primary"
                        : next
                          ? "border-primary bg-primary/12 text-primary font-medium"
                          : "border-border/80 bg-muted/40 text-muted-foreground"
                    }`}
                  >
                    <span className="opacity-70">{t("check_in.tier_days", { days: tier.days })}</span>
                    <span className="font-semibold">{tier.minutes}′</span>
                  </span>
                );
              })}
            </div>
          </CloudCard>

          <CloudCard className="px-3 py-3">
            <div className="flex items-baseline justify-between gap-2 mb-2.5">
              <h2 className="text-xs font-semibold text-foreground">{t("check_in.history")}</h2>
              <p className="text-[9px] text-muted-foreground truncate">
                {t("check_in.history_hint", { count: status?.yearCheckIns ?? 0 })}
              </p>
            </div>

            <div className="overflow-x-auto -mx-1 px-1 flex justify-center">
              <div className="w-max">
                {/* 月份标签行 */}
                <div className="flex gap-[4px] mb-1.5 pl-7 relative h-3.5">
                  {heatmap.monthLabels.map((ml, i) => {
                    const next = heatmap.monthLabels[i + 1];
                    const span = next ? next.weekIndex - ml.weekIndex : heatmap.weeks.length - ml.weekIndex;
                    return (
                      <div
                        key={ml.label + i}
                        className="text-[10px] text-muted-soft leading-3.5 whitespace-nowrap"
                        style={{ width: `calc(${span} * (var(--cell-size) + 4px))` }}
                      >
                        {ml.label}
                      </div>
                    );
                  })}
                </div>

                <div className="flex gap-[4px]">
                  {/* 星期标签列 */}
                  <div className="flex flex-col gap-[4px] shrink-0 w-6">
                    {(["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const).map((w) => (
                      <div
                        key={w}
                        className="text-[9px] text-muted-soft leading-none flex items-center justify-end pr-1"
                        style={{ height: "var(--cell-size)" }}
                      >
                        {t(`check_in.weekday.${w}`)}
                      </div>
                    ))}
                  </div>

                  {/* 热力图格子 */}
                  {heatmap.weeks.map((week, wi) => (
                    <div key={wi} className="flex flex-col gap-[4px]">
                      {week.map((cell, ci) => {
                        const isToday = cell
                          ? cell.date.toDateString() === new Date().toDateString()
                          : false;
                        return (
                          <button
                            key={ci}
                            type="button"
                            disabled={!cell}
                            onClick={() => {
                              if (!cell) return;
                              const dateStr = cell.date.toLocaleDateString("zh-CN", {
                                year: "numeric",
                                month: "long",
                                day: "numeric",
                                weekday: "long",
                              });
                              if (cell.checked) {
                                showToast.success(t("check_in.day_checked", { date: dateStr }));
                              } else if (isToday) {
                                showToast.info(t("check_in.day_today_unchecked", { date: dateStr }));
                              } else {
                                showToast.info(t("check_in.day_unchecked", { date: dateStr }));
                              }
                            }}
                            className={`rounded-[3px] transition-all ${cell ? "cursor-pointer hover:ring-2 hover:ring-primary/40 hover:scale-110" : "cursor-default"}`}
                            style={{
                              width: "var(--cell-size)",
                              height: "var(--cell-size)",
                              backgroundColor: cell
                                ? cell.checked
                                  ? "var(--cell-active)"
                                  : "var(--cell-idle)"
                                : "transparent",
                              outline: isToday ? "2px solid var(--primary)" : "none",
                              outlineOffset: isToday ? "1px" : "0",
                            }}
                            title={
                              cell
                                ? `${cell.date.toLocaleDateString()} ${cell.checked ? t("check_in.legend_checked") : t("check_in.legend_unchecked")}`
                                : ""
                            }
                          />
                        );
                      })}
                    </div>
                  ))}
                </div>

                {/* 图例 */}
                <div className="flex items-center gap-2 mt-2.5 justify-end">
                  <span className="text-[9px] text-muted-soft">{t("check_in.legend_unchecked")}</span>
                  <div
                    className="rounded-[3px]"
                    style={{ width: "var(--cell-size)", height: "var(--cell-size)", backgroundColor: "var(--cell-idle)" }}
                  />
                  <div
                    className="rounded-[3px]"
                    style={{ width: "var(--cell-size)", height: "var(--cell-size)", backgroundColor: "var(--cell-active)" }}
                  />
                  <span className="text-[9px] text-muted-soft">{t("check_in.legend_checked")}</span>
                </div>
              </div>
            </div>
          </CloudCard>
        </>
      )}
    </div>
  );
}
