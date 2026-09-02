import {
  Settings2,
  ChevronRight,
  CalendarCheck,
  Pencil,
  MessageCircle,
  Flame,
  Mars,
  Venus,
  Loader2,
  Ticket,
  Wallet,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { CloudButton, CloudImageWithFallback } from "../components/cloudsteps";
import { CloudCard } from "../components/cloudsteps/arco";
import { getTeacherTeachingPool } from "../api/coaching";
import { getCheckInStatus, postCheckIn } from "../api/checkin";
import { useAuthStore } from "../stores/authStore";
import { teacherAvatarSrc } from "../utils/avatar";
import { formatTeachingMinutes } from "../utils/formatMinutes";
import { showToast } from "../utils/toast";
import { formatApiMessage } from "../utils/apiMessage";
import { useTranslation } from "react-i18next";

const tintClass = {
  sky: "bg-tint-sky text-secondary-brand",
  cream: "bg-tint-cream text-warning",
  mint: "bg-primary-soft text-primary",
  primary: "bg-primary-soft text-primary",
};

function GenderMark({ gender }: { gender?: string }) {
  const { t } = useTranslation();
  const g = (gender || "female").trim().toLowerCase();
  if (g === "male" || g === "m" || g === "男") {
    return (
      <span
        className="inline-flex items-center justify-center size-4 rounded-full bg-sky-100 text-sky-600 shrink-0"
        title={t("coach_center.male")}
        aria-label={t("coach_center.male")}
      >
        <Mars size={11} strokeWidth={2.25} />
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center justify-center size-4 rounded-full bg-pink-100 text-pink-600 shrink-0"
      title={t("coach_center.female")}
      aria-label={t("coach_center.female")}
    >
      <Venus size={11} strokeWidth={2.25} />
    </span>
  );
}

export default function CoachCenter() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const refreshUserInfo = useAuthStore((s) => s.refreshUserInfo);
  const role = (user as { role?: string } | null)?.role || "user";
  const isCoach = role === "teacher" || role === "user";

  const [poolMinutes, setPoolMinutes] = useState<number | null>(null);
  const [poolTotal, setPoolTotal] = useState<number | null>(null);
  const [poolLoading, setPoolLoading] = useState(false);
  const [checkedInToday, setCheckedInToday] = useState<boolean | null>(null);
  const [checkInLoading, setCheckInLoading] = useState(false);
  const [checkInSubmitting, setCheckInSubmitting] = useState(false);

  useEffect(() => {
    void refreshUserInfo();
  }, [refreshUserInfo]);

  const loadPool = useCallback(async () => {
    setPoolLoading(true);
    try {
      const res = await getTeacherTeachingPool();
      if (res.code === 200 && res.data) {
        setPoolMinutes(res.data.remainingMinutes ?? 0);
        setPoolTotal(res.data.totalAllocatedMinutes ?? 0);
      }
    } finally {
      setPoolLoading(false);
    }
  }, []);

  const loadCheckInStatus = useCallback(async () => {
    setCheckInLoading(true);
    try {
      const res = await getCheckInStatus();
      if (res.code === 200 && res.data) {
        setCheckedInToday(!!res.data.checkedInToday);
        if (typeof res.data.poolRemainingMinutes === "number") {
          setPoolMinutes(res.data.poolRemainingMinutes);
        }
      }
    } finally {
      setCheckInLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isCoach) return;
    void loadPool();
    void loadCheckInStatus();
  }, [isCoach, loadPool, loadCheckInStatus]);

  const onCheckInToday = async () => {
    if (checkInSubmitting || checkedInToday) return;
    setCheckInSubmitting(true);
    try {
      const res = await postCheckIn();
      if (res.code !== 200 || !res.data) {
        showToast.error(formatApiMessage(res.msg, "check_in.failed"));
        return;
      }
      const data = res.data;
      if (data.alreadyCheckedIn) {
        showToast.info(t("check_in.already_today"));
        setCheckedInToday(true);
      } else {
        const bonus =
          data.bonusMinutes > 0 ? t("check_in.bonus_suffix", { bonus: data.bonusMinutes }) : "";
        showToast.success(t("check_in.success", { minutes: data.grantedMinutes, bonus }));
        setCheckedInToday(true);
        setPoolMinutes(data.poolRemainingMinutes);
      }
      await Promise.all([loadPool(), loadCheckInStatus()]);
    } catch (e: unknown) {
      const msg =
        e && typeof e === "object" && "msg" in e
          ? formatApiMessage(String((e as { msg: string }).msg), "check_in.failed")
          : formatApiMessage(undefined, "check_in.failed");
      showToast.error(msg);
    } finally {
      setCheckInSubmitting(false);
    }
  };

  const name = user?.displayName || user?.email || "";
  const remaining = poolMinutes ?? 0;
  const total = poolTotal ?? 0;
  const remainPct =
    total > 0 ? Math.min(100, Math.round((remaining / total) * 100)) : 0;

  const checkInStatusLabel =
    checkedInToday === null
      ? "…"
      : checkedInToday
        ? t("coach_center.checked_in_today")
        : t("coach_center.not_checked_in_today");

  const featureList = useMemo(() => {
    const base = [
      {
        id: 4,
        icon: MessageCircle,
        label: t("coach_center.feedback"),
        description: t("coach_center.feedback_desc"),
        tint: "mint" as const,
        path: "/feedback",
      },
      {
        id: 3,
        icon: Settings2,
        label: t("coach_center.settings"),
        tint: "cream" as const,
        path: "/settings",
      },
      {
        id: 5,
        icon: Ticket,
        label: "邀请码",
        description: "邀请好友一起学习",
        tint: "sky" as const,
        path: "/invite-code",
      },
      {
        id: 6,
        icon: Wallet,
        label: "账户充值",
        description: "充值余额，解锁学习服务",
        tint: "mint" as const,
        path: "/recharge",
      },
    ];
    if (!isCoach) return base;
    return [
      {
        id: 1,
        icon: CalendarCheck,
        label: t("coach_center.completed_sessions"),
        description: t("coach_center.completed_desc"),
        tint: "primary" as const,
        path: "/coach-center/completed",
      },
      ...base,
    ];
  }, [isCoach, t]);

  return (
    <div className="flex flex-col flex-1 min-h-0 h-full gap-2 overflow-hidden">
      <CloudCard className="px-3 py-2.5 shrink-0">
        <div className="flex items-center gap-3">
          <div className="size-11 rounded-full bg-primary-soft border border-border overflow-hidden flex items-center justify-center shrink-0">
            <CloudImageWithFallback
              src={teacherAvatarSrc(user?.avatar)}
              alt={name}
              className="size-full object-cover rounded-full"
            />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 min-w-0">
              <h2 className=" font-semibold text-foreground truncate leading-snug">
                {name || "-"}
              </h2>
              <GenderMark gender={user?.gender} />
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">{t("coach_center.subtitle")}</p>
          </div>

          <CloudButton
            variant="ghost"
            size="icon"
            onClick={() => navigate("/profile/edit")}
            className="shrink-0 size-8 text-muted-foreground hover:text-primary"
            aria-label={t("coach_center.edit_profile")}
          >
            <Pencil size={15} />
          </CloudButton>
        </div>
      </CloudCard>

      {isCoach ? (
        <CloudCard
          className="relative overflow-hidden rounded-xl border-primary/25 bg-gradient-to-br from-primary/12 via-card to-secondary-brand/8 px-3.5 py-3 shrink-0 cursor-pointer hover:border-primary/40 transition-colors"
          onClick={() => navigate("/coach-center/checkin")}
        >
          <div className="pointer-events-none absolute -right-6 -top-8 size-24 rounded-full bg-primary/20 blur-2xl" />
          <div className="relative flex items-start gap-3">
            <div className="size-10 rounded-xl bg-primary text-primary-foreground flex items-center justify-center shrink-0 shadow-sm">
              <Flame size={18} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <span className="text-[11px] font-medium text-primary pt-0.5">
                  {t("coach_center.teaching_quota")}
                </span>
                <div
                  className="flex items-center gap-1 shrink-0 -mt-0.5 -mr-1"
                  onClick={(e) => e.stopPropagation()}
                >
                  <CloudButton
                    type="button"
                    variant="brand"
                    size="sm"
                    className="h-7 px-2.5 text-[11px] font-semibold"
                    disabled={checkInLoading || checkInSubmitting || !!checkedInToday}
                    onClick={() => void onCheckInToday()}
                  >
                    {checkInSubmitting ? <Loader2 className="size-3 animate-spin mr-1" /> : null}
                    {checkedInToday
                      ? t("check_in.checked_in")
                      : t("coach_center.check_in_today")}
                  </CloudButton>
                  <CloudButton
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-7 text-muted-soft hover:text-primary"
                    onClick={() => navigate("/coach-center/checkin")}
                    aria-label={t("coach_center.view_details")}
                  >
                    <ChevronRight size={16} />
                  </CloudButton>
                </div>
              </div>
              <div className="mt-0.5 text-base font-bold tabular-nums text-foreground tracking-tight leading-none">
                {poolLoading ? "…" : formatTeachingMinutes(remaining)}
              </div>
              <p className="mt-1 text-[10px] text-muted-foreground leading-snug">
                {total > 0 ? (
                  <>
                    {t("coach_center.total_allocated", { minutes: formatTeachingMinutes(total) })}
                    <span className="mx-1">·</span>
                    <span className={checkedInToday ? "text-primary" : undefined}>{checkInStatusLabel}</span>
                  </>
                ) : (
                  t("coach_center.checkin_hint")
                )}
              </p>
              {total > 0 ? (
                <div className="mt-2 h-1 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary transition-[width]"
                    style={{ width: `${remainPct}%` }}
                  />
                </div>
              ) : null}
            </div>
          </div>
        </CloudCard>
      ) : null}

      <CloudCard className="p-2 flex-1 flex flex-col min-h-0 overflow-hidden">
        <h2 className="text-xs font-semibold text-foreground px-2 pt-0.5 pb-1.5 shrink-0">
          {t("coach_center.feature_center")}
        </h2>
        <div className="flex-1 min-h-0 flex flex-col justify-evenly divide-y divide-border overflow-hidden">
          {featureList.map((feature) => {
            const Icon = feature.icon;
            return (
              <button
                key={feature.id}
                type="button"
                onClick={() => navigate(feature.path)}
                className="w-full flex items-center gap-3 px-2 py-2.5 rounded-xl hover:bg-muted/60 transition-colors group text-left min-h-0"
              >
                <div
                  className={`size-9 rounded-xl flex items-center justify-center shrink-0 ${tintClass[feature.tint]}`}
                >
                  <Icon size={16} />
                </div>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-medium text-foreground leading-snug">
                    {feature.label}
                  </span>
                  {"description" in feature && feature.description ? (
                    <span className="block text-[10px] text-muted-foreground mt-0.5 leading-snug truncate">
                      {feature.description}
                    </span>
                  ) : null}
                </span>
                <ChevronRight
                  size={14}
                  className="text-muted-soft group-hover:text-primary transition-colors shrink-0"
                />
              </button>
            );
          })}
        </div>
      </CloudCard>
    </div>
  );
}
