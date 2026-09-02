import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router";
import { Clock, Pause } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { CloudButton } from "./cloudsteps";
import { formatCountdown, useClassTimerStore } from "../stores/classTimerStore";
import {
  canSyncPracticeBilling,
  ensurePracticeBillingActive,
  usePracticeBillingStore,
} from "../utils/practiceBilling";
import { showToast } from "../utils/toast";
import { isTimerZonePath } from "../utils/practiceFlowLock";

const PRESETS = [30, 40, 45, 50, 60];
const REMIND_PRESETS = [5, 10, 15, 20, 30];
const INLINE_FLAG = "lbClassTimerInline";

type SetupProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  wordCount?: number;
};

function playBeep(freq = 880, ms = 0.25) {
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g);
    g.connect(ctx.destination);
    o.frequency.value = freq;
    g.gain.value = 0.08;
    o.start();
    o.stop(ctx.currentTime + ms);
  } catch {
    // ignore
  }
}

/** 设置 / 调整上课定时（纯前端提醒，不扣额度） */
export function ClassTimerSetupDialog({ open, onOpenChange, wordCount = 0 }: SetupProps) {
  const { t } = useTranslation();
  const storeDuration = useClassTimerStore((s) => s.durationMin);
  const storeRemind = useClassTimerStore((s) => s.remindEveryMin);
  const endsAt = useClassTimerStore((s) => s.endsAt);
  const start = useClassTimerStore((s) => s.start);
  const billingName = usePracticeBillingStore((s) => s.link?.studentName || "");

  const [durationMin, setDurationMin] = useState(storeDuration || 45);
  const [custom, setCustom] = useState("");
  const [remindEveryMin, setRemindEveryMin] = useState(
    REMIND_PRESETS.includes(storeRemind) ? storeRemind : 5
  );

  useEffect(() => {
    if (!open) return;
    setDurationMin(storeDuration || 45);
    setCustom("");
    setRemindEveryMin(REMIND_PRESETS.includes(storeRemind) ? storeRemind : 5);
  }, [open, storeDuration, storeRemind]);

  const effectiveDuration = useMemo(() => {
    if (custom) {
      const n = Number(custom);
      if (Number.isFinite(n) && n >= 1) return Math.min(180, Math.round(n));
    }
    return durationMin;
  }, [custom, durationMin]);

  const applyCustom = () => {
    const n = Number(custom);
    if (!Number.isFinite(n) || n < 1) return;
    setDurationMin(Math.min(180, Math.round(n)));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm rounded-2xl" hideClose>
        <DialogHeader>
          <DialogTitle>{t("coaching.timer_title")}</DialogTitle>
          <DialogDescription>
            {billingName
              ? t("coaching.timer_student", { name: billingName })
              : t("coaching.timer_pick_duration")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div>
            <p className="text-sm font-medium text-foreground mb-2">{t("coaching.class_duration")}</p>
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => {
                    setDurationMin(m);
                    setCustom("");
                  }}
                  className={`px-3 py-1.5 rounded-xl text-sm border transition-colors ${
                    durationMin === m && !custom
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-card text-muted-foreground border-border hover:border-primary/40"
                  }`}
                >
                  {t("ui.minutes", { count: m })}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 mt-2">
              <input
                type="number"
                min={1}
                max={180}
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                onBlur={applyCustom}
                onKeyDown={(e) => {
                  if (e.key === "Enter") applyCustom();
                }}
                placeholder={t("coaching.custom_minutes")}
                className="w-28 h-9 px-3 rounded-xl border border-border bg-card text-sm outline-none focus:border-primary"
              />
              <span className="text-xs text-muted-foreground">{t("ui.minutes_range")}</span>
            </div>
          </div>

          <div>
            <p className="text-sm font-medium text-foreground mb-2">
              {t("coaching.final_remind_label")}
            </p>
            <div className="flex flex-wrap gap-2">
              {REMIND_PRESETS.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setRemindEveryMin(m)}
                  className={`px-3 py-1.5 rounded-xl text-sm border transition-colors ${
                    remindEveryMin === m
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-card text-muted-foreground border-border hover:border-primary/40"
                  }`}
                >
                  {t("ui.minutes_short", { count: m })}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground mt-2">
              {t("coaching.final_remind_once", { count: remindEveryMin })}
            </p>
          </div>

          {endsAt && (
            <p className="text-xs text-amber-700">
              {t("coaching.timer_running_reset", {
                student: billingName ? ` · ${billingName}` : "",
              })}
            </p>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          {endsAt ? (
            <CloudButton
              type="button"
              variant="outline"
              onClick={() => {
                useClassTimerStore.getState().stop();
                onOpenChange(false);
                showToast.info(t("coaching.timer_stopped"));
              }}
            >
              {t("coaching.end_timer")}
            </CloudButton>
          ) : (
            <CloudButton type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t("ui.close")}
            </CloudButton>
          )}
          <CloudButton
            type="button"
            variant="brand"
            onClick={() => {
              const mins = effectiveDuration;
              if (endsAt) useClassTimerStore.getState().stop();
              start({
                durationMin: mins,
                wordCount,
                remindEveryMin,
              });
              onOpenChange(false);
              showToast.success(
                t("coaching.timer_started", { mins, remind: remindEveryMin })
              );
            }}
          >
            {t("coaching.start_timer")}
          </CloudButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** 顶栏倒计时胶囊：未开定时点开设置；计时中点击暂停并打开菜单 */
export function ClassTimerBadge({ onClick }: { onClick: () => void }) {
  const { t } = useTranslation();
  const endsAt = useClassTimerStore((s) => s.endsAt);
  const pausedRemainingMs = useClassTimerStore((s) => s.pausedRemainingMs);
  const [left, setLeft] = useState(() => useClassTimerStore.getState().remainingMs());
  const paused = pausedRemainingMs != null;
  const active = Boolean(endsAt) || paused;

  useEffect(() => {
    document.documentElement.dataset[INLINE_FLAG] = "1";
    return () => {
      delete document.documentElement.dataset[INLINE_FLAG];
    };
  }, []);

  useEffect(() => {
    if (!active) {
      setLeft(0);
      return;
    }
    const tick = () => setLeft(useClassTimerStore.getState().remainingMs());
    tick();
    const id = window.setInterval(tick, 500);
    return () => window.clearInterval(id);
  }, [active, pausedRemainingMs]);

  if (!active) {
    return (
      <CloudButton
        type="button"
        variant="ghost"
        size="iconRound"
        onClick={onClick}
        aria-label={t("coaching.timer_title")}
        className="text-foreground"
      >
        <Clock size={18} />
      </CloudButton>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1 tabular-nums text-xs font-semibold px-2 py-1 rounded-full text-white shadow-sm ${
        paused ? "bg-amber-500" : "bg-[#E53E3E]"
      }`}
      aria-label={paused ? t("coaching.timer_paused") : t("coaching.pause_timer")}
    >
      {paused ? <Pause size={12} strokeWidth={2.5} /> : null}
      {formatCountdown(left)}
    </button>
  );
}

/**
 * 单词训练流程内：顶栏倒计时 + 到点 / 最后提醒（不在区外浮动展示）
 */
export function ClassSessionTimer() {
  const { t } = useTranslation();
  const location = useLocation();
  const inTimerZone = isTimerZonePath(location.pathname);
  const endsAt = useClassTimerStore((s) => s.endsAt);
  const markEndedNotified = useClassTimerStore((s) => s.markEndedNotified);
  const takeIntervalRemind = useClassTimerStore((s) => s.takeIntervalRemind);
  const wordCount = useClassTimerStore((s) => s.wordCount);
  const remindEveryMin = useClassTimerStore((s) => s.remindEveryMin);
  const billingName = usePracticeBillingStore((s) => s.link?.studentName || "");
  const hasBillingLink = usePracticeBillingStore((s) => Boolean(s.link?.appointmentId));
  const [left, setLeft] = useState(0);
  const [endOpen, setEndOpen] = useState(false);
  const [intervalOpen, setIntervalOpen] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  const [hideFloat, setHideFloat] = useState(false);

  useEffect(() => {
    const sync = () => setHideFloat(document.documentElement.dataset[INLINE_FLAG] === "1");
    sync();
    const id = window.setInterval(sync, 400);
    return () => window.clearInterval(id);
  }, []);

  // 断网恢复 / 切回前台：仅在练习区内、已选学员时与服务端对齐
  useEffect(() => {
    if (!inTimerZone || !hasBillingLink) return;
    const recover = () => {
      if (!canSyncPracticeBilling()) return;
      void ensurePracticeBillingActive(180, { force: true, silent: true });
    };
    const onVis = () => {
      if (document.visibilityState === "visible") recover();
    };
    window.addEventListener("online", recover);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("online", recover);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [hasBillingLink, inTimerZone]);

  useEffect(() => {
    if (!endsAt) {
      setLeft(0);
      return;
    }
    const tick = () => {
      const state = useClassTimerStore.getState();
      const ms = state.remainingMs();
      setLeft(ms);

      if (state.pausedRemainingMs != null) return;

      if (ms > 0 && state.takeIntervalRemind()) {
        setIntervalOpen(true);
        playBeep(660, 0.18);
        showToast.info(
          t("coaching.final_remind_toast", {
            remind: state.remindEveryMin,
            left: formatCountdown(ms),
          })
        );
      }

      if (ms <= 0 && !state.endedNotified) {
        markEndedNotified();
        setEndOpen(true);
        setIntervalOpen(false);
        playBeep(880, 0.25);
        showToast.warning(t("coaching.class_time_up"));
        // 仅提醒：不结账、不停额度计时
      }
    };
    tick();
    const id = window.setInterval(tick, 500);
    return () => window.clearInterval(id);
  }, [endsAt, markEndedNotified, takeIntervalRemind, t]);

  if (!inTimerZone) return null;
  if (!endsAt && !endOpen && !intervalOpen) return null;

  return (
    <>
      {endsAt && left > 0 && !hideFloat && (
        <div className="fixed top-[max(0.75rem,env(safe-area-inset-top))] right-3 z-[90] flex items-center gap-1">
          <button
            type="button"
            onClick={() => setSetupOpen(true)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-[#E53E3E] text-white text-xs font-semibold shadow-lg tabular-nums"
          >
            <Clock size={14} />
            {formatCountdown(left)}
          </button>
        </div>
      )}

      <ClassTimerSetupDialog open={setupOpen} onOpenChange={setSetupOpen} wordCount={wordCount} />

      <Dialog open={intervalOpen} onOpenChange={setIntervalOpen}>
        <DialogContent className="max-w-sm rounded-2xl" hideClose>
          <DialogHeader>
            <DialogTitle>{t("coaching.final_remind_dialog_title")}</DialogTitle>
            <DialogDescription>
              {t("coaching.final_remind_dialog_desc", {
                remind: remindEveryMin,
                left: formatCountdown(left),
                words: wordCount > 0 ? t("coaching.words_approx", { count: wordCount }) : "",
              })}
              {billingName ? ` · ${billingName}` : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <CloudButton type="button" variant="brand" onClick={() => setIntervalOpen(false)}>
              {t("coaching.continue_class")}
            </CloudButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={endOpen}
        onOpenChange={(o) => {
          setEndOpen(o);
          if (!o) useClassTimerStore.getState().stop();
        }}
      >
        <DialogContent className="max-w-sm rounded-2xl" hideClose>
          <DialogHeader>
            <DialogTitle>{t("coaching.time_up_title")}</DialogTitle>
            <DialogDescription>
              {t("coaching.time_up_desc", {
                student: billingName
                  ? t("coaching.time_up_student", { name: billingName })
                  : "",
              })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <CloudButton
              type="button"
              variant="outline"
              onClick={() => {
                setEndOpen(false);
                useClassTimerStore.getState().stop();
                setSetupOpen(true);
              }}
            >
              {t("coaching.set_more_time")}
            </CloudButton>
            <CloudButton
              type="button"
              variant="brand"
              onClick={() => {
                setEndOpen(false);
                useClassTimerStore.getState().stop();
              }}
            >
              {t("ui.got_it")}
            </CloudButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
