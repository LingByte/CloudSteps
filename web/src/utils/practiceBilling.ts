import { create } from "zustand";
import { persist } from "zustand/middleware";
import { endCoachingAppointment, startPracticeSession } from "../api/coaching";
import i18n from "../i18n";
import { getTrainingStudent } from "./trainingStudent";
import { formatApiMessage } from "./apiMessage";
import { showToast } from "./toast";
import { useAuthStore } from "../stores/authStore";
import { normalizeSnowflakeId, sameSnowflakeId } from "./json-snowflake";
import { isCoachRole } from "./coachOnboarding";

export type PracticeBillingLink = {
  /** 雪花 ID，必须用字符串，禁止 Number() */
  appointmentId: string;
  /** 是否由练习流程创建且结束时应下课结账 */
  owned: boolean;
  studentId: string;
  studentName: string;
  /** 前端记录的开课时间（刷新后仍可展示） */
  startedAt: number;
};

type PracticeBillingState = {
  link: PracticeBillingLink | null;
  setLink: (link: PracticeBillingLink | null) => void;
  clear: () => void;
};

export const usePracticeBillingStore = create<PracticeBillingState>()(
  persist(
    (set) => ({
      link: null,
      setLink: (link) => set({ link }),
      clear: () => set({ link: null }),
    }),
    {
      name: "lb_practice_billing",
      merge: (persisted, current) => {
        const p = (persisted || {}) as Partial<PracticeBillingState>;
        const link = p.link;
        if (!link?.appointmentId) {
          return { ...current, ...p, link: null };
        }
        // 旧版本曾把雪花 ID 存成 number，精度已坏则丢弃，下次 ensure 会挂接进行中课次
        const apptId = normalizeSnowflakeId(link.appointmentId);
        if (!apptId || typeof link.appointmentId === "number") {
          return { ...current, link: null };
        }
        return {
          ...current,
          ...p,
          link: {
            ...link,
            appointmentId: apptId,
            studentId: normalizeSnowflakeId(link.studentId),
          },
        };
      },
    }
  )
);

function isAuthenticatedCoach(): boolean {
  const auth = useAuthStore.getState();
  if (!auth.isAuthenticated || !auth.token) return false;
  return isCoachRole(auth.user?.role);
}

/** 练习计费同步前提：已登录教练端 + 已选学员 */
export function canSyncPracticeBilling(): boolean {
  if (!isAuthenticatedCoach()) return false;
  return Boolean(getTrainingStudent()?.id);
}

export function clearPracticeBilling(): void {
  usePracticeBillingStore.getState().clear();
}

/** 并发 ensure 合并为一次请求，避免进入练习时连打三次 */
let ensureInFlight: Promise<PracticeBillingLink | null> | null = null;

/**
 * 进入单词训练后开课计费（幂等）：
 * - 本地已有同学员课次且未 force → 直接复用，不打接口
 * - 同学员已有上课中课次 → 服务端 reuse
 * - 纯前端计时器不应调用此函数
 */
export async function ensurePracticeBillingActive(
  plannedMinutes = 180,
  opts?: { force?: boolean; silent?: boolean }
): Promise<PracticeBillingLink | null> {
  if (!isAuthenticatedCoach()) return null;

  const student = getTrainingStudent();
  if (!student?.id) {
    if (!opts?.silent) {
      showToast.warning(i18n.t("practice_billing.select_student"));
    }
    return null;
  }

  const existing = usePracticeBillingStore.getState().link;
  if (
    !opts?.force &&
    existing?.appointmentId &&
    sameSnowflakeId(existing.studentId, student.id)
  ) {
    return existing;
  }

  if (ensureInFlight) return ensureInFlight;

  ensureInFlight = (async () => {
    try {
      const res = await startPracticeSession({
        studentId: student.id,
        plannedMinutes: Math.max(1, Math.min(180, Math.round(plannedMinutes) || 180)),
      });
      if (res.code !== 200) {
        showToast.error(formatApiMessage(res.msg, "practice_billing.start_failed"));
        return sameSnowflakeId(existing?.studentId, student.id) ? existing : null;
      }
      const data = res.data;
      const apptId = normalizeSnowflakeId(
        data?.appointmentId ?? data?.appointment?.id
      );
      if (!apptId) {
        showToast.error(i18n.t("practice_billing.no_appointment"));
        return existing;
      }
      const name =
        data?.appointment?.students?.[0] ||
        student.name ||
        i18n.t("practice_billing.student_fallback", { id: student.id });
      const latest = usePracticeBillingStore.getState().link;
      const owned =
        sameSnowflakeId(latest?.appointmentId, apptId)
          ? latest!.owned
          : data?.owned !== false;
      const startedAt =
        sameSnowflakeId(latest?.appointmentId, apptId) && latest?.startedAt
          ? latest.startedAt
          : Date.now();
      const link: PracticeBillingLink = {
        appointmentId: apptId,
        owned,
        studentId: normalizeSnowflakeId(data?.studentId || student.id),
        studentName: name,
        startedAt,
      };
      usePracticeBillingStore.getState().setLink(link);

      if (!data?.reused && !existing) {
        showToast.info(i18n.t("practice_billing.will_bill", { name }));
      }
      return link;
    } catch (e: unknown) {
      if (existing && sameSnowflakeId(existing.studentId, student.id)) {
        return existing;
      }
      const msg =
        e && typeof e === "object" && "msg" in e
          ? formatApiMessage(String((e as { msg: string }).msg), "practice_billing.cannot_start")
          : i18n.t("practice_billing.cannot_start");
      showToast.error(msg);
      return null;
    } finally {
      ensureInFlight = null;
    }
  })();

  return ensureInFlight;
}

/** @deprecated 请用 ensurePracticeBillingActive；保留别名避免旧引用 */
export async function beginPracticeBilling(
  durationMin: number
): Promise<PracticeBillingLink | null> {
  return ensurePracticeBillingActive(durationMin);
}

/** 结束练习课次并扣额度；复用原排课的不在此下课 */
let finishInFlight: Promise<void> | null = null;

export async function finishPracticeBilling(
  link?: PracticeBillingLink | null
) {
  if (finishInFlight) return finishInFlight;
  finishInFlight = (async () => {
    const active = link ?? usePracticeBillingStore.getState().link;
    if (!active?.appointmentId) {
      usePracticeBillingStore.getState().clear();
      return;
    }
    if (!active.owned) {
      usePracticeBillingStore.getState().clear();
      return;
    }
    try {
      const res = await endCoachingAppointment(active.appointmentId);
      if (res.code !== 200) {
        showToast.error(formatApiMessage(res.msg, "practice_billing.settle_failed"));
        // 课次找不到多半是本地 ID 精度损坏，清掉以免反复失败
        if (String(res.msg || "").includes("不存在") || res.code === 2000) {
          usePracticeBillingStore.getState().clear();
        }
        return;
      }
      showToast.success(
        i18n.t("practice_billing.settled", { name: active.studentName })
      );
      usePracticeBillingStore.getState().clear();
    } catch (e: unknown) {
      const msg =
        e && typeof e === "object" && "msg" in e
          ? formatApiMessage(
              String((e as { msg: string }).msg),
              "practice_billing.settle_failed"
            )
          : i18n.t("practice_billing.settle_failed");
      showToast.error(msg);
    }
  })().finally(() => {
    finishInFlight = null;
  });
  return finishInFlight;
}

export function getPracticeBilling(): PracticeBillingLink | null {
  return usePracticeBillingStore.getState().link;
}

/** 写入抗遗忘识记时段（不结账） */
export function stampLessonPracticeWindow(endAt = Date.now()) {
  const billing = usePracticeBillingStore.getState().link;
  const startMs = billing?.startedAt ?? endAt;
  sessionStorage.setItem("lb_lesson_practice_start", String(startMs));
  sessionStorage.setItem("lb_lesson_practice_end", String(endAt));
}
