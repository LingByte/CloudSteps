import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Clock,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router";
import { DatePicker, Modal } from "@arco-design/web-react";
import {
  deleteTeacherCoachingAppointment,
  endCoachingAppointment,
  getStudentCoachingWeek,
  getTeacherCoachingWeek,
  listAllTeacherCoachingQuotas,
  startCoachingAppointment,
  type CoachingWeekSchedule,
  type TeacherCoachingQuotaRow,
} from "../api/coaching";
import { minutesUntilCoachingEnd, parseCoachingSlotEnd } from "../utils/coachingSchedule";
import {
  isTimetableCellTipDone,
  markTimetableCellTipDone,
  measureCoachTarget,
  type CoachTargetRect,
} from "../utils/coachOnboarding";
import { showToast } from "../utils/toast";
import { useAuthStore } from "../stores/authStore";
import { useIsMobile } from "./ui/use-mobile";
import { MobileDateWheel } from "./cloudsteps/MobileWheelPicker";
import { CloudSpin } from "./cloudsteps/arco";
import { CloudButton } from "./cloudsteps";

const pad2 = (n: number) => String(n).padStart(2, "0");
const fmtYMD = (d: Date) =>
  `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const fmtMD = (d: Date) => `${pad2(d.getMonth() + 1)}/${pad2(d.getDate())}`;

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function weekMonday(d: Date) {
  const x = startOfDay(d);
  const wd = x.getDay();
  const fromMon = (wd + 6) % 7;
  x.setDate(x.getDate() - fromMon);
  return x;
}

function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function studentLabel(
  t: TFunction,
  s?: { displayName?: string; username?: string },
  fallbackId?: number,
) {
  return s?.displayName || s?.username || (fallbackId ? t("ui.student_id", { id: fallbackId }) : t("ui.student_fallback"));
}

const DAY_HEADER_H = 52;
const EVENT_MIN_H = 32;
/** 时间轴相对可视区再拉高约 1/3，课块更易读 */
const AXIS_HEIGHT_SCALE = 4 / 3;

const STATUS_SOFT: Record<string, { bg: string; text: string; border: string; bar: string }> = {
  scheduled: {
    bg: "bg-gradient-to-br from-primary/15 to-primary/5",
    text: "text-primary",
    border: "border-primary",
    bar: "bg-primary",
  },
  in_progress: {
    bg: "bg-gradient-to-br from-sky-100 to-sky-50",
    text: "text-sky-700",
    border: "border-sky-500",
    bar: "bg-sky-500",
  },
  completed: {
    bg: "bg-gradient-to-br from-primary/10 to-primary/5",
    text: "text-primary/70",
    border: "border-primary/50",
    bar: "bg-primary/40",
  },
  cancelled: {
    bg: "bg-gradient-to-br from-red-50 to-red-100",
    text: "text-red-600",
    border: "border-red-500",
    bar: "bg-red-500",
  },
};

const PAST_SOFT = {
  bg: "bg-gradient-to-br from-primary/10 to-primary/5",
  text: "text-primary/70",
  border: "border-primary/50",
  bar: "bg-primary/40",
};

/** ISO → 本地 HH:mm；无效则 null */
function hmFromIso(iso?: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/**
 * 课表展示时段：已完课优先用 session 实际起止；进行中练习用实际开始+计划结束；否则用排课计划。
 */
function scheduleVisualRange(schedule: CoachingWeekSchedule): { start: string; end: string } {
  const plannedStart = schedule.startTime?.slice(0, 5) || "";
  const plannedEnd = schedule.endTime?.slice(0, 5) || "";
  const sess = schedule.session;
  const actualStart = hmFromIso(sess?.startedAt);
  const actualEnd = hmFromIso(sess?.endedAt);

  if (schedule.status === "completed" && actualStart) {
    return { start: actualStart, end: actualEnd || plannedEnd || actualStart };
  }
  if (schedule.status === "in_progress" && actualStart) {
    return { start: actualStart, end: plannedEnd || actualStart };
  }
  return { start: plannedStart, end: plannedEnd };
}

/** 计划时段已结束（不含进行中） */
function isSchedulePast(schedule: CoachingWeekSchedule, nowTs: number): boolean {
  if (schedule.status === "in_progress") return false;
  const end = parseCoachingSlotEnd(schedule.scheduledDate, schedule.endTime);
  if (!end) return false;
  return end.getTime() <= nowTs;
}

function parseHmToMinutes(t: string): number {
  const raw = (t || "").trim().slice(0, 5);
  const m = /^(\d{1,2}):(\d{2})$/.exec(raw);
  if (!m) return 0;
  return Number(m[1]) * 60 + Number(m[2]);
}

/** 结束 00:00 视为次日 0 点（当天末） */
function parseEndMinutes(t: string): number {
  const raw = (t || "").trim().slice(0, 5);
  if (raw === "00:00" || raw === "0:00") return 24 * 60;
  return parseHmToMinutes(t);
}

function fmtMinutes(mins: number): string {
  if (mins >= 24 * 60) return "24:00";
  const clamped = ((mins % (24 * 60)) + 24 * 60) % (24 * 60);
  return `${pad2(Math.floor(clamped / 60))}:${pad2(clamped % 60)}`;
}

function lessonDisplay(t: TFunction, s: CoachingWeekSchedule): { title: string; subtitle?: string } {
  const student = s.students?.[0]?.trim() || "";
  let title = s.title?.trim() || "";
  // 兼容旧默认标题「姓名 · 陪练」
  title = title.replace(/\s*[·•]\s*陪练\s*$/u, "").trim();
  if (title && student && title !== student) {
    return { title, subtitle: student };
  }
  if (student) return { title: student };
  if (title) return { title };
  return { title: t("coaching.lesson_default") };
}

function buildAxisMarks(axisStart: number, axisEnd: number): number[] {
  const span = axisEnd - axisStart;
  const step = span <= 180 ? 30 : span <= 480 ? 60 : 120;
  const first = Math.ceil(axisStart / step) * step;
  const marks: number[] = [];
  for (let m = first; m < axisEnd; m += step) marks.push(m);
  if (marks.length === 0 || marks[0] !== axisStart) marks.unshift(axisStart);
  return marks;
}

function layoutDayEvents(
  items: CoachingWeekSchedule[],
  axisStart: number,
  axisEnd: number,
  axisHeightPx: number,
  expandedGroupKey: string | null,
  raisedId: number | null,
): Array<{
  schedule: CoachingWeekSchedule;
  topPx: number;
  heightPx: number;
  showDetail: boolean;
  col: number;
  colCount: number;
  overlapGroupKey: string;
  overlapIndex: number;
  overlapCount: number;
  zIndex: number;
}> {
  const span = Math.max(1, axisEnd - axisStart);
  const STACK_OFFSET_PX = 8;
  const raw = items.map((schedule) => {
    const range = scheduleVisualRange(schedule);
    let s = parseHmToMinutes(range.start);
    let e = parseEndMinutes(range.end);
    if (e <= s) e = s + 30;
    s = Math.max(axisStart, Math.min(s, axisEnd - 5));
    e = Math.max(s + 15, Math.min(e, axisEnd));
    return { schedule, start: s, end: e };
  });
  const sorted = [...raw].sort((a, b) => a.start - b.start || b.end - a.end);
  const groups: Array<typeof sorted> = [];

  for (const event of sorted) {
    const matching = groups.filter((group) =>
      group.some((other) => other.end > event.start && other.start < event.end),
    );
    if (matching.length === 0) {
      groups.push([event]);
    } else {
      const target = matching[0];
      target.push(event);
      for (const group of matching.slice(1)) {
        target.push(...group);
        groups.splice(groups.indexOf(group), 1);
      }
    }
  }

  const groupById = new Map<number, { key: string; index: number; count: number }>();
  const groupStartByKey = new Map<string, number>();
  for (const group of groups) {
    const ordered = [...group].sort((a, b) => a.start - b.start || b.end - a.end);
    const key = ordered.map((event) => event.schedule.id).sort((a, b) => a - b).join("-");
    groupStartByKey.set(key, ordered[0].start);
    ordered.forEach((event, index) => {
      groupById.set(event.schedule.id, { key, index, count: ordered.length });
    });
  }

  return sorted.map((ev) => {
    const topPx = ((ev.start - axisStart) / span) * axisHeightPx;
    const normalHeightPx = Math.max(EVENT_MIN_H, ((ev.end - ev.start) / span) * axisHeightPx);
    const group = groupById.get(ev.schedule.id) || { key: String(ev.schedule.id), index: 0, count: 1 };
    const expanded = group.count > 1 && group.key === expandedGroupKey;
    const collapsedHeightPx = Math.max(EVENT_MIN_H, Math.min(normalHeightPx, 48));
    const heightPx = group.count === 1
      ? normalHeightPx
      : expanded
        ? Math.max(56, Math.min(normalHeightPx, 64))
        : collapsedHeightPx;
    const offsetPx = group.count === 1
      ? 0
      : expanded
        ? group.index * 44
        : group.index * STACK_OFFSET_PX;
    const collapsedTopPx = ((groupStartByKey.get(group.key) ?? ev.start) - axisStart) / span * axisHeightPx;

    return {
      schedule: ev.schedule,
      topPx: (group.count > 1 ? collapsedTopPx : topPx) + offsetPx,
      heightPx,
      showDetail: group.count === 1 ? normalHeightPx >= 40 : expanded || group.index === group.count - 1,
      col: 0,
      colCount: 1,
      overlapGroupKey: group.key,
      overlapIndex: group.index,
      overlapCount: group.count,
      zIndex: raisedId === ev.schedule.id ? 30 : 10 + group.index,
    };
  });
}

/** 课表内课程块（窄列友好，支持并排） */
function TimetableBlock({
  schedule,
  topPx,
  heightPx,
  showDetail,
  col,
  colCount,
  zIndex,
  overlapCount,
  overlapIndex,
  overlapExpanded,
  nowTs,
  onClick,
  t,
}: {
  schedule: CoachingWeekSchedule;
  topPx: number;
  heightPx: number;
  showDetail: boolean;
  col: number;
  colCount: number;
  zIndex: number;
  overlapCount: number;
  overlapIndex: number;
  overlapExpanded: boolean;
  nowTs: number;
  onClick: () => void;
  t: TFunction;
}) {
  const past = isSchedulePast(schedule, nowTs);
  const soft = past
    ? PAST_SOFT
    : STATUS_SOFT[schedule.status] || STATUS_SOFT.scheduled;
  const { title, subtitle } = lessonDisplay(t, schedule);
  const studentName = subtitle || (schedule.students?.[0]?.trim() ?? "");
  const range = scheduleVisualRange(schedule);
  const start = range.start;
  const end = range.end;
  const widthPct = 100 / colCount;
  const leftPct = col * widthPct;

  return (
    <button
      type="button"
      data-timetable-block
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={`absolute overflow-hidden rounded-[24px] border ${soft.border} bg-background text-left px-2.5 py-2 shadow-[0_2px_6px_rgba(0,0,0,0.16)] active:scale-[0.98] touch-manipulation`}
      style={{
        top: topPx,
        height: heightPx,
        zIndex,
        left: `calc(${leftPct}% + 2px)`,
        width: `calc(${widthPct}% - 4px)`,
        maxWidth: "min(100%, 280px)",
      }}
    >
      <div className="flex h-full min-w-0 flex-col items-center justify-center text-center">
        {showDetail ? (
          <>
            <div className="line-clamp-1 text-sm font-medium leading-tight text-foreground">
              {studentName && title && studentName !== title ? `${studentName}（${title}）` : studentName || title}
            </div>
            <div className={`mt-0.5 text-sm font-medium leading-tight tabular-nums ${past ? "text-muted-foreground" : soft.text}`}>
              {start}–{end}
            </div>
          </>
        ) : (
          <div className={`text-sm font-medium leading-tight tabular-nums ${past ? "text-muted-foreground" : soft.text}`}>
            {start}
          </div>
        )}
      </div>
      {overlapCount > 1 && !overlapExpanded && overlapIndex === 0 ? (
        <span className="absolute right-2 top-1 rounded-full bg-foreground/10 px-1.5 text-[10px] font-semibold text-foreground/70">
          +{overlapCount - 1}
        </span>
      ) : null}
    </button>
  );
}

function toPickerDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === "object" && value !== null && "toDate" in value) {
    const d = (value as { toDate: () => Date }).toDate();
    if (d instanceof Date && !Number.isNaN(d.getTime())) return d;
  }
  if (typeof value === "string" || typeof value === "number") {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return null;
}

type Props = {
  nowTs: number;
  mode?: "coach" | "student";
};

const MODAL_OVERLAY_CLASS =
  "fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4 pb-20 sm:pb-4";

const MODAL_SHEET_CLASS =
  "w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl border border-border bg-card shadow-xl flex flex-col max-h-[min(calc(100dvh-6rem),720px)] sm:max-h-[90dvh]";

const MODAL_BODY_CLASS = "flex-1 min-h-0 overflow-y-auto overscroll-contain p-5 space-y-4";

const MODAL_FOOTER_CLASS =
  "shrink-0 p-5 pt-3 border-t border-border bg-card pb-[max(1.25rem,env(safe-area-inset-bottom))]";

export function CoachingSchedulePanel({ nowTs, mode = "coach" }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const isMobile = useIsMobile();
  const user = useAuthStore((s) => s.user);
  const userId = user?.id ? Number(user.id) : 0;
  const isCoach = mode === "coach";

  const [weekAnchor, setWeekAnchor] = useState(() => new Date());
  const [schedules, setSchedules] = useState<CoachingWeekSchedule[]>([]);
  const [quotas, setQuotas] = useState<TeacherCoachingQuotaRow[]>([]);
  const [loadingSchedules, setLoadingSchedules] = useState(true);
  const [pendingActionById, setPendingActionById] = useState<
    Record<number, "start" | "end" | null>
  >({});
  const [selected, setSelected] = useState<CoachingWeekSchedule | null>(null);
  const [expandedOverlapGroup, setExpandedOverlapGroup] = useState<string | null>(null);
  const [raisedOverlapId, setRaisedOverlapId] = useState<number | null>(null);
  const [showCellTip, setShowCellTip] = useState(false);
  const [tipHole, setTipHole] = useState<CoachTargetRect | null>(null);
  const [tipReady, setTipReady] = useState(false);

  const timetableHostRef = useRef<HTMLDivElement>(null);
  const [axisHeightPx, setAxisHeightPx] = useState(280);

  useEffect(() => {
    if (!expandedOverlapGroup) return;
    const collapseOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest("[data-timetable-block]")) return;
      setExpandedOverlapGroup(null);
      setRaisedOverlapId(null);
    };
    document.addEventListener("pointerdown", collapseOnOutsidePointer);
    return () => document.removeEventListener("pointerdown", collapseOnOutsidePointer);
  }, [expandedOverlapGroup]);

  const weekMon = useMemo(() => weekMonday(weekAnchor), [weekAnchor]);
  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekMon, i)),
    [weekMon],
  );
  const todayYMD = fmtYMD(new Date());
  const weekShortLabel = `${fmtMD(weekMon)}–${fmtMD(addDays(weekMon, 6))}`;

  const byDay = useMemo(() => {
    const map: Record<string, CoachingWeekSchedule[]> = {};
    for (const d of weekDays) map[fmtYMD(d)] = [];
    for (const s of schedules) {
      const key = s.scheduledDate?.slice?.(0, 10) || s.scheduledDate;
      if (!key || !map[key]) continue;
      map[key].push(s);
    }
    for (const key of Object.keys(map)) {
      map[key].sort((a, b) => (a.startTime || "").localeCompare(b.startTime || ""));
    }
    return map;
  }, [schedules, weekDays]);

  /** 有课才画时间轴：按本周最早～最晚自适应 */
  const axisRange = useMemo(() => {
    if (schedules.length === 0) return null;
    let minM = Infinity;
    let maxM = -Infinity;
    for (const s of schedules) {
      const a = parseHmToMinutes(s.startTime);
      let b = parseEndMinutes(s.endTime);
      if (b <= a) b = a + 30;
      minM = Math.min(minM, a);
      maxM = Math.max(maxM, b);
    }
    if (!Number.isFinite(minM) || !Number.isFinite(maxM)) return null;
    const pad = 20;
    minM = Math.max(0, minM - pad);
    maxM = Math.min(24 * 60, maxM + pad);
    if (maxM - minM < 120) {
      const mid = (minM + maxM) / 2;
      minM = Math.max(0, Math.floor(mid - 60));
      maxM = Math.min(24 * 60, Math.ceil(mid + 60));
    }
    return { startMin: minM, endMin: maxM };
  }, [schedules]);

  const axisMarks = useMemo(
    () => (axisRange ? buildAxisMarks(axisRange.startMin, axisRange.endMin) : []),
    [axisRange],
  );

  const axisSpan = axisRange ? Math.max(1, axisRange.endMin - axisRange.startMin) : 1;
  /** H5：七天始终收进同一屏，桌面端保持舒适列宽 */
  const dayColPx = 64;
  const timeGutterPx = isMobile ? 32 : 40;
  const weekGridMinW = isMobile ? 0 : timeGutterPx + dayColPx * 7;
  const emptyGridMinW = isMobile ? 0 : dayColPx * 7;

  const activeCount = useMemo(
    () =>
      schedules.filter((s) => s.status === "scheduled" || s.status === "in_progress")
        .length,
    [schedules],
  );

  const loadQuotas = useCallback(async () => {
    if (!isCoach) return;
    try {
      setQuotas(await listAllTeacherCoachingQuotas());
    } catch {
      setQuotas([]);
    }
  }, [isCoach]);

  const loadWeek = useCallback(
    async (refDate?: string) => {
      const ref = refDate || fmtYMD(weekAnchor);
      setLoadingSchedules(true);
      try {
        const res = isCoach
          ? await getTeacherCoachingWeek(ref)
          : await getStudentCoachingWeek(ref);
        setSchedules(Array.isArray(res.data?.schedules) ? res.data!.schedules : []);
      } catch (e: unknown) {
        const msg =
          e && typeof e === "object" && "msg" in e
            ? String((e as { msg: string }).msg)
            : t("coaching.load_schedule_failed");
        showToast.error(msg);
        setSchedules([]);
      } finally {
        setLoadingSchedules(false);
      }
    },
    [weekAnchor, isCoach, t],
  );

  useEffect(() => {
    void loadWeek();
    void loadQuotas();
  }, [loadWeek, loadQuotas]);

  useLayoutEffect(() => {
    const el = timetableHostRef.current;
    if (!el) return;
    const measure = () => {
      const h = el.clientHeight;
      if (h > DAY_HEADER_H + 120) {
        setAxisHeightPx(Math.round((h - DAY_HEADER_H) * AXIS_HEIGHT_SCALE));
      }
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [loadingSchedules, axisRange, isMobile]);

  useEffect(() => {
    if (!isCoach || !userId || loadingSchedules) return;
    if (isTimetableCellTipDone(userId)) return;
    setShowCellTip(true);
  }, [isCoach, userId, loadingSchedules]);

  // 一旦展示过就写入浏览器缓存，避免下次进入重复弹出
  useEffect(() => {
    if (!showCellTip || !userId) return;
    markTimetableCellTipDone(userId);
  }, [showCellTip, userId]);

  useEffect(() => {
    if (!showCellTip || loadingSchedules) {
      setTipReady(false);
      return;
    }
    const t = window.setTimeout(() => setTipReady(true), 220);
    return () => window.clearTimeout(t);
  }, [showCellTip, loadingSchedules, schedules]);

  const remountTipHole = useCallback(() => {
    if (!showCellTip) {
      setTipHole(null);
      return;
    }
    const run = () => setTipHole(measureCoachTarget("timetable-day"));
    run();
    window.setTimeout(run, 120);
  }, [showCellTip]);

  useLayoutEffect(() => {
    remountTipHole();
  }, [remountTipHole, schedules, weekAnchor]);

  useEffect(() => {
    if (!showCellTip) return;
    const onResize = () => remountTipHole();
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onResize, true);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onResize, true);
    };
  }, [showCellTip, remountTipHole]);

  const dismissCellTip = () => {
    if (userId) markTimetableCellTipDone(userId);
    setShowCellTip(false);
    setTipHole(null);
  };

  const studentOptions = useMemo(
    () =>
      quotas.map((q) => ({
        value: String(q.studentId),
        label: studentLabel(t, q.student, q.studentId),
      })),
    [quotas, t],
  );

  const openScheduleForDay = async (day: Date) => {
    if (!isCoach) return;
    const dayYmd = fmtYMD(day);
    const todayYmd = fmtYMD(new Date());
    if (dayYmd < todayYmd) {
      showToast.info(t("coaching.cannot_schedule_past"));
      return;
    }

    let options = studentOptions;
    if (options.length === 0) {
      try {
        const list = await listAllTeacherCoachingQuotas();
        setQuotas(list);
        options = list.map((q) => ({
          value: String(q.studentId),
          label: studentLabel(t, q.student, q.studentId),
        }));
      } catch {
        // fall through to empty check
      }
    }
    if (options.length === 0) {
      showToast.info(t("coaching.add_student_before_schedule"));
      navigate("/my-students");
      return;
    }
    navigate(`/lesson-prep/new?date=${dayYmd}`);
  };

  const jumpToWeekOf = (dateString: string) => {
    if (!dateString) return;
    const d = new Date(`${dateString}T12:00:00`);
    if (!Number.isNaN(d.getTime())) setWeekAnchor(weekMonday(d));
  };

  useEffect(() => {
    const st = location.state as { refreshDate?: string } | null;
    const refreshDate = st?.refreshDate;
    if (!refreshDate) return;
    jumpToWeekOf(refreshDate);
    void loadWeek(refreshDate);
    void loadQuotas();
    navigate(location.pathname, { replace: true, state: {} });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state]);

  const onDeleteAppt = async (id: number) => {
    Modal.confirm({
      title: t("coaching.delete_confirm_title"),
      content: t("coaching.delete_confirm_desc"),
      okText: t("coaching.confirm_delete"),
      cancelText: t("ui.cancel"),
      okButtonProps: { status: "danger" },
      onOk: async () => {
        try {
          const res = await deleteTeacherCoachingAppointment(id);
          if (res.code !== 200) {
            showToast.error(res.msg || t("coaching.delete_failed"));
            return;
          }
          showToast.success(t("coaching.deleted"));
          setSelected(null);
          void loadWeek();
        } catch (e: unknown) {
          const msg =
            e && typeof e === "object" && "msg" in e
              ? String((e as { msg: string }).msg)
              : t("coaching.delete_failed");
          showToast.error(msg);
        }
      },
    });
  };

  const onStart = async (id: number) => {
    setPendingActionById((prev) => ({ ...prev, [id]: "start" }));
    try {
      const res = await startCoachingAppointment(id);
      if (res.code !== 200) {
        showToast.error(res.msg || t("coaching.cannot_start"));
        return;
      }
      showToast.success(t("coaching.started"));
      setSelected(null);
      void loadWeek();
      navigate("/material-selection");
    } catch (e: unknown) {
      const msg =
        e && typeof e === "object" && "msg" in e
          ? String((e as { msg: string }).msg)
          : t("coaching.start_failed");
      showToast.error(msg);
    } finally {
      setPendingActionById((prev) => ({ ...prev, [id]: null }));
    }
  };

  const onEnd = async (id: number) => {
    setPendingActionById((prev) => ({ ...prev, [id]: "end" }));
    try {
      const res = await endCoachingAppointment(id);
      if (res.code !== 200) {
        showToast.error(res.msg || t("coaching.cannot_end"));
        return;
      }
      showToast.success(t("coaching.ended"));
      setSelected(null);
      void loadWeek();
    } catch (e: unknown) {
      const msg =
        e && typeof e === "object" && "msg" in e
          ? String((e as { msg: string }).msg)
          : t("coaching.end_failed");
      showToast.error(msg);
    } finally {
      setPendingActionById((prev) => ({ ...prev, [id]: null }));
    }
  };

  const selectedPending = selected ? pendingActionById[selected.id] ?? null : null;
  const selectedMinsLeft =
    selected?.status === "in_progress"
      ? minutesUntilCoachingEnd(selected.scheduledDate, selected.endTime, nowTs)
      : null;
  const selectedPast =
    selected?.status === "scheduled" &&
    !!parseCoachingSlotEnd(selected.scheduledDate, selected.endTime) &&
    parseCoachingSlotEnd(selected.scheduledDate, selected.endTime)!.getTime() < nowTs;

  const weekTrigger = (
    <button
      type="button"
      className="w-full h-8 inline-flex items-center justify-center gap-1 rounded-lg border border-input bg-card px-2 text-xs font-medium text-foreground tabular-nums active:bg-muted/50 hover:border-primary/50 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/25 transition-colors touch-manipulation"
    >
      <Calendar size={14} className="text-muted-foreground shrink-0" />
      <span>{weekShortLabel}</span>
    </button>
  );

  return (
    <div className="flex h-full flex-col min-h-0 overflow-hidden bg-card sm:rounded-xl sm:border sm:border-border">
      {/* 紧凑顶栏：标题 + 周切换同一行 */}
      <div className="shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 border-b border-border">
        <h2 className="text-[15px] font-semibold text-foreground shrink-0 leading-none">
          {isCoach ? t("coaching.schedule_title") : t("coaching.my_schedule")}
        </h2>
        <span className="inline-flex items-center rounded-md bg-primary-soft px-1.5 py-0.5 text-[10px] font-medium text-primary shrink-0 leading-none">
          {t("coaching.pending_count", { count: activeCount })}
        </span>

        <div className="flex-1 min-w-0" />

        <CloudButton
          variant="outline"
          size="sm"
          className="shrink-0 size-8 p-0 touch-manipulation"
          aria-label={t("ui.prev_week")}
          onClick={() => setWeekAnchor(addDays(weekAnchor, -7))}
        >
          <ChevronLeft size={16} />
        </CloudButton>

        <div className="w-[7.5rem] sm:w-[9.5rem] shrink-0">
          {isMobile ? (
            <MobileDateWheel
              value={fmtYMD(weekMon)}
              allowClear={false}
              placeholder={t("coaching.select_week")}
              displayValue={weekShortLabel}
              sheetTitle={t("coaching.select_week_day")}
              className="!h-8 !min-h-8 !text-xs !text-center !flex !items-center !justify-center !px-1 !rounded-lg"
              onChange={(dateString) => jumpToWeekOf(dateString)}
            />
          ) : (
            <DatePicker.WeekPicker
              dayStartOfWeek={1}
              allowClear={false}
              value={weekMon}
              className="cloud-datepicker w-full"
              style={{ width: "100%", borderRadius: 8, height: 32 }}
              triggerElement={weekTrigger}
              onChange={(_val, date) => {
                const d = toPickerDate(date) || toPickerDate(_val);
                if (d) setWeekAnchor(weekMonday(d));
              }}
            />
          )}
        </div>

        <CloudButton
          variant="outline"
          size="sm"
          className="shrink-0 size-8 p-0 touch-manipulation"
          aria-label={t("ui.next_week")}
          onClick={() => setWeekAnchor(addDays(weekAnchor, 7))}
        >
          <ChevronRight size={16} />
        </CloudButton>
      </div>

      {/* 周课表：高度贴合可视区，仅横向滑动 */}
      <div ref={timetableHostRef} className="flex-1 min-h-0 overflow-hidden">
        {loadingSchedules ? (
          <div className="h-full flex items-center justify-center">
            <CloudSpin tip={t("coaching.loading_schedule")} />
          </div>
        ) : (
          <div className="h-full min-h-0 overflow-x-hidden overflow-y-auto overscroll-contain">
            {!axisRange ? (
              <div
                className="grid h-full min-h-0"
                style={{
                  width: "100%",
                  minWidth: emptyGridMinW,
                  gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
                  gridTemplateRows: `${DAY_HEADER_H}px minmax(0, 1fr)`,
                }}
              >
                {weekDays.map((d, i) => {
                  const ymd = fmtYMD(d);
                  const isToday = ymd === todayYMD;
                  return (
                    <button
                      key={`h-${ymd}`}
                      type="button"
                      data-coach={i === 0 ? "timetable-day" : undefined}
                      disabled={!isCoach}
                      onClick={() => {
                        if (!isCoach) return;
                        dismissCellTip();
                        openScheduleForDay(d);
                      }}
                      className={`sticky top-0 z-20 border-b border-border/70 px-0.5 py-1.5 text-center touch-manipulation ${
                        isToday ? "bg-primary-soft/70" : "bg-surface-soft"
                      } ${isCoach ? "active:bg-primary/10" : ""} ${
                        i < 6 ? "border-r border-border/40" : ""
                      }`}
                    >
                      <div
                        className={`text-[11px] font-semibold ${
                          isToday ? "text-primary" : "text-foreground"
                        }`}
                      >
                        {t("coaching.weekday_prefix", { day: t(`coaching.weekday.${i}`) })}
                      </div>
                      <div
                        className={`text-[10px] tabular-nums mt-0.5 ${
                          isToday ? "text-primary" : "text-muted-foreground"
                        }`}
                      >
                        {fmtMD(d)}
                      </div>
                    </button>
                  );
                })}
                {weekDays.map((d, i) => {
                  const ymd = fmtYMD(d);
                  const isToday = ymd === todayYMD;
                  return (
                    <button
                      key={`b-${ymd}`}
                      type="button"
                      disabled={!isCoach}
                      onClick={() => {
                        if (!isCoach) return;
                        dismissCellTip();
                        openScheduleForDay(d);
                      }}
                      className={`flex flex-col items-center justify-center gap-1.5 touch-manipulation min-h-0 h-full ${
                        isToday ? "bg-primary/[0.04]" : ""
                      } ${isCoach ? "active:bg-primary/[0.08]" : ""} ${
                        i < 6 ? "border-r border-border/30" : ""
                      }`}
                    >
                      {isCoach ? (
                        <>
                          <span className="inline-flex size-10 items-center justify-center rounded-full bg-primary/12 text-primary">
                            <Plus size={18} />
                          </span>
                          <span className="text-[11px] text-muted-foreground">{t("coaching.schedule_lesson")}</span>
                        </>
                      ) : (
                        <span className="text-[11px] text-muted-foreground">{t("coaching.no_lessons")}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div
                className="grid"
                style={{
                  width: "100%",
                  minWidth: weekGridMinW,
                  gridTemplateColumns: `${timeGutterPx}px repeat(7, minmax(0, 1fr))`,
                  gridTemplateRows: `${DAY_HEADER_H}px ${axisHeightPx}px`,
                }}
              >
                <div className="sticky top-0 left-0 z-30 bg-surface-soft border-b border-r border-border/70" />
                {weekDays.map((d, i) => {
                  const ymd = fmtYMD(d);
                  const isToday = ymd === todayYMD;
                  return (
                    <button
                      key={ymd}
                      type="button"
                      data-coach={i === 0 ? "timetable-day" : undefined}
                      disabled={!isCoach}
                      onClick={() => {
                        if (!isCoach) return;
                        dismissCellTip();
                        openScheduleForDay(d);
                      }}
                      className={`sticky top-0 z-20 border-b border-border/70 px-0.5 py-1.5 text-center touch-manipulation ${
                        isToday ? "bg-primary-soft/70" : "bg-surface-soft"
                      } ${isCoach ? "active:bg-primary/10" : ""} ${
                        i < 6 ? "border-r border-border/40" : ""
                      }`}
                    >
                      <div
                        className={`text-[11px] font-semibold ${
                          isToday ? "text-primary" : "text-foreground"
                        }`}
                      >
                        {t("coaching.weekday_prefix", { day: t(`coaching.weekday.${i}`) })}
                      </div>
                      <div
                        className={`text-[10px] tabular-nums mt-0.5 ${
                          isToday ? "text-primary" : "text-muted-foreground"
                        }`}
                      >
                        {fmtMD(d)}
                        {isCoach ? (
                          <Plus size={10} className="inline ml-0.5 align-[-1px] text-primary/70" />
                        ) : null}
                      </div>
                    </button>
                  );
                })}

                <div className="sticky left-0 z-10 bg-card border-r border-border/70 relative row-start-2" style={{ height: axisHeightPx }}>
                  {axisMarks.map((m) => (
                    <div
                      key={m}
                      className="absolute left-0 right-0 px-1 -translate-y-1/2"
                      style={{ top: ((m - axisRange.startMin) / axisSpan) * axisHeightPx }}
                    >
                      <span className="text-[10px] text-muted-foreground tabular-nums leading-none">
                        {fmtMinutes(m).slice(0, 5)}
                      </span>
                    </div>
                  ))}
                </div>

                {weekDays.map((d, dIdx) => {
                  const ymd = fmtYMD(d);
                  const isToday = ymd === todayYMD;
                  const isPastDay = ymd < todayYMD;
                  const dayItems = byDay[ymd] || [];
                  const laidOut = layoutDayEvents(
                    dayItems,
                    axisRange.startMin,
                    axisRange.endMin,
                    axisHeightPx,
                    expandedOverlapGroup,
                    raisedOverlapId,
                  );
                  const nowLocalM = new Date(nowTs).getHours() * 60 + new Date(nowTs).getMinutes();
                  const todayPastHeightPx =
                    isToday && nowLocalM > axisRange.startMin
                      ? Math.min(
                          axisHeightPx,
                          ((Math.min(nowLocalM, axisRange.endMin) - axisRange.startMin) / axisSpan) *
                            axisHeightPx,
                        )
                      : 0;
                  return (
                    <div
                      key={ymd}
                      className={`relative row-start-2 ${isToday ? "bg-primary/[0.04]" : ""} ${
                        dIdx < 6 ? "border-r border-border/30" : ""
                      }`}
                      style={{ height: axisHeightPx }}
                      onClick={() => {
                        if (expandedOverlapGroup) {
                          setExpandedOverlapGroup(null);
                          setRaisedOverlapId(null);
                        }
                      }}
                    >
                      {isPastDay ? (
                        <div
                          className="absolute inset-0 z-0 bg-muted/45 pointer-events-none"
                          aria-hidden
                        />
                      ) : null}
                      {todayPastHeightPx > 0 ? (
                        <div
                          className="absolute left-0 right-0 top-0 z-0 bg-muted/40 pointer-events-none"
                          style={{ height: todayPastHeightPx }}
                          aria-hidden
                        />
                      ) : null}
                      {axisMarks.map((m) => (
                        <div
                          key={m}
                          className="absolute left-0 right-0 border-t border-border/20 pointer-events-none"
                          style={{ top: ((m - axisRange.startMin) / axisSpan) * axisHeightPx }}
                        />
                      ))}

                      {isCoach ? (
                        <button
                          type="button"
                          aria-label={t("coaching.schedule_on_day", { date: ymd })}
                          className="absolute inset-0 z-0 touch-manipulation"
                          onClick={() => {
                            dismissCellTip();
                            if (expandedOverlapGroup) {
                              setExpandedOverlapGroup(null);
                              setRaisedOverlapId(null);
                              return;
                            }
                            openScheduleForDay(d);
                          }}
                        />
                      ) : null}

                      {laidOut.map((ev) => (
                        <TimetableBlock
                          key={ev.schedule.id}
                          schedule={ev.schedule}
                          topPx={ev.topPx}
                          heightPx={ev.heightPx}
                          showDetail={ev.showDetail}
                          col={ev.col}
                          colCount={ev.colCount}
                          zIndex={ev.zIndex}
                          overlapCount={ev.overlapCount}
                          overlapIndex={ev.overlapIndex}
                          overlapExpanded={expandedOverlapGroup === ev.overlapGroupKey}
                          nowTs={nowTs}
                          onClick={() => {
                            if (ev.overlapCount > 1 && expandedOverlapGroup !== ev.overlapGroupKey) {
                              setExpandedOverlapGroup(ev.overlapGroupKey);
                              setRaisedOverlapId(ev.schedule.id);
                              return;
                            }
                            if (ev.overlapCount > 1) setRaisedOverlapId(ev.schedule.id);
                            setSelected(ev.schedule);
                          }}
                          t={t}
                        />
                      ))}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {selected &&
        createPortal(
          <div className={MODAL_OVERLAY_CLASS} onClick={() => setSelected(null)}>
            <div
              className={`${MODAL_SHEET_CLASS} max-h-[min(calc(100dvh-6rem),640px)]`}
              onClick={(e) => e.stopPropagation()}
            >
              <div className={MODAL_BODY_CLASS}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="text-base font-semibold text-foreground truncate">
                      {lessonDisplay(t, selected).title || t("coaching.lesson_fallback", { id: selected.id })}
                    </h3>
                    <p className="text-xs text-muted-foreground mt-1">
                      {selected.scheduledDate?.slice?.(0, 10) || selected.scheduledDate} ·{" "}
                      {(() => {
                        const r = scheduleVisualRange(selected);
                        return `${r.start}–${r.end}`;
                      })()}
                      {selected.source === "practice" ||
                      selected.notes?.toLowerCase() === "practice"
                        ? ` · ${t("coach_sessions.source_practice")}`
                        : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="shrink-0 p-2 rounded-lg text-muted-foreground hover:bg-muted touch-manipulation"
                    onClick={() => setSelected(null)}
                    aria-label={t("ui.close")}
                  >
                    <X size={18} />
                  </button>
                </div>

                {selected.students && selected.students.length > 0 ? (
                  <div className="text-sm text-muted-foreground">
                    {t("coaching.student_label", { names: selected.students.join("、") })}
                  </div>
                ) : null}

                <div className="flex items-center gap-2 text-sm">
                  <Clock size={14} className="text-muted-foreground" />
                  <span
                    className={`font-medium ${(STATUS_SOFT[selected.status] || STATUS_SOFT.scheduled).text}`}
                  >
                    {t(`coaching.status.${selected.status}`, { defaultValue: selected.status })}
                  </span>
                  {selected.status === "in_progress" && selectedMinsLeft != null ? (
                    <span className="text-xs text-muted-foreground">
                      {t("coaching.mins_until_end", { count: Math.max(0, selectedMinsLeft) })}
                    </span>
                  ) : null}
                  {selectedPast ? (
                    <span className="text-xs text-muted-foreground">{t("coaching.slot_passed")}</span>
                  ) : null}
                </div>
              </div>

              <div className={`${MODAL_FOOTER_CLASS} space-y-0`}>
                {isCoach ? (
                  <div className="flex flex-wrap gap-2">
                    {selected.status === "scheduled" ? (
                      <>
                        <CloudButton
                          variant="outline"
                          size="sm"
                          className="border-destructive/35 text-destructive hover:bg-destructive/5 min-h-10 touch-manipulation"
                          onClick={() => void onDeleteAppt(selected.id)}
                        >
                          <Trash2 size={14} />
                          {t("coaching.delete")}
                        </CloudButton>
                        <CloudButton
                          variant="brand"
                          size="sm"
                          className="flex-1 min-h-10 touch-manipulation"
                          loading={selectedPending === "start"}
                          disabled={selectedPending !== null}
                          onClick={() => void onStart(selected.id)}
                        >
                          {t("coaching.start_class")}
                        </CloudButton>
                      </>
                    ) : null}
                    {selected.status === "in_progress" ? (
                      <>
                        <CloudButton
                          variant="brandOutline"
                          size="sm"
                          className="flex-1 min-h-10 touch-manipulation"
                          onClick={() => {
                            setSelected(null);
                            navigate("/material-selection");
                          }}
                        >
                          {t("coaching.enter_training")}
                        </CloudButton>
                        <CloudButton
                          variant="destructive"
                          size="sm"
                          className="min-h-10 touch-manipulation"
                          loading={selectedPending === "end"}
                          disabled={selectedPending !== null}
                          onClick={() => void onEnd(selected.id)}
                        >
                          {t("coaching.end_class")}
                        </CloudButton>
                      </>
                    ) : null}
                  </div>
                ) : (
                  <CloudButton
                    variant="outline"
                    size="sm"
                    className="w-full min-h-10 touch-manipulation"
                    onClick={() => setSelected(null)}
                  >
                    {t("ui.close")}
                  </CloudButton>
                )}
              </div>
            </div>
          </div>,
          document.body,
        )}

      {showCellTip && tipHole && (
        <div className="fixed inset-0 z-[65]">
          <div
            className="pointer-events-none absolute rounded-xl border-2 border-primary transition-[top,left,width,height] duration-300"
            style={{
              top: Math.max(0, tipHole.top - 6),
              left: Math.max(0, tipHole.left - 6),
              width: tipHole.width + 12,
              height: tipHole.height + 12,
              boxShadow: "0 0 0 9999px rgba(0,0,0,0.5)",
              animation: "coach-pulse 1.6s ease-in-out infinite",
            }}
          />
          <div className="absolute inset-0" onClick={dismissCellTip} />
          <div
            className="absolute z-[66] w-[min(100vw-2rem,20rem)] rounded-2xl border border-border bg-card p-4 shadow-xl"
            style={{
              top: Math.min(
                (typeof window !== "undefined" ? window.innerHeight : 800) - 180,
                tipHole.top + tipHole.height + 14,
              ),
              left: Math.min(
                Math.max(16, tipHole.left + tipHole.width / 2 - 160),
                (typeof window !== "undefined" ? window.innerWidth : 400) - 336,
              ),
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-semibold text-foreground">{t("coaching.cell_tip_title")}</h3>
            <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
              {t("coaching.cell_tip_desc")}
            </p>
            <CloudButton
              variant="brand"
              size="sm"
              className="w-full mt-3 min-h-10"
              onClick={dismissCellTip}
            >
              {t("announcements.got_it")}
            </CloudButton>
          </div>
          <style>{`
            @keyframes coach-pulse {
              0%, 100% { box-shadow: 0 0 0 9999px rgba(0,0,0,0.5), 0 0 0 0 rgba(78,205,196,0.45); }
              50% { box-shadow: 0 0 0 9999px rgba(0,0,0,0.5), 0 0 0 10px rgba(78,205,196,0); }
            }
          `}</style>
        </div>
      )}

      {showCellTip && tipReady && !tipHole && !loadingSchedules && (
        <div className="fixed inset-0 z-[65] flex items-center justify-center bg-black/45 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-5 shadow-xl">
            <h3 className="text-sm font-semibold text-foreground">{t("coaching.cell_tip_title")}</h3>
            <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
              {t("coaching.cell_tip_desc")}
            </p>
            <CloudButton
              variant="brand"
              size="sm"
              className="w-full mt-3 min-h-10"
              onClick={dismissCellTip}
            >
              {t("announcements.got_it")}
            </CloudButton>
          </div>
        </div>
      )}
    </div>
  );
}
