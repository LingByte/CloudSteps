import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { CloudButton } from "../components/cloudsteps";
import { CloudCard, CloudDatePicker, CloudEmpty, CloudSpin } from "../components/cloudsteps/arco";
import { listReviewBooksByDate, type ReviewBookStatRow } from "../api/review";
import { normalizeSnowflakeId } from "../utils/json-snowflake";
import { useTranslation } from "react-i18next";
import i18n from "../i18n";

type ReviewTask = {
  id: string;
  studentId: string;
  student: string;
  vocabularyPack: string;
  level: string;
  wordBookId: string;
  sessionId: string;
  count: number;
  timeSlot: string;
  timeSort: number;
  trainingAt: string;
  practiceStartedAt?: string;
  practiceEndedAt?: string | null;
};

type TimeSlotGroup = {
  timeSlot: string;
  timeSort: number;
  tasks: ReviewTask[];
};

function studentDisplayName(row: ReviewBookStatRow): string {
  const name = String(row.studentName || "").trim();
  if (name) return name;
  const id = normalizeSnowflakeId(row.studentId);
  return id ? i18n.t("student_detail.student_fallback", { id }) : i18n.t("anti_forgetting.current_user");
}

function clockParts(iso: string | null | undefined, endIso: string | null | undefined, tz: string) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const timeFmt = new Intl.DateTimeFormat("zh-CN", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const dateFmt = new Intl.DateTimeFormat("zh-CN", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = dateFmt.formatToParts(d);
  const y = parts.find((p) => p.type === "year")?.value ?? "";
  const mo = parts.find((p) => p.type === "month")?.value ?? "";
  const day = parts.find((p) => p.type === "day")?.value ?? "";
  const slot = timeFmt.format(d);
  const [hh, mm] = slot.split(":").map((x) => Number(x));
  // 结束时间：有 endedAt 则用，否则同开始时间（显示 17:05~17:05）
  let endSlot = slot;
  if (endIso) {
    const endD = new Date(endIso);
    if (!Number.isNaN(endD.getTime())) {
      endSlot = timeFmt.format(endD);
    }
  }
  return {
    slot,
    sort: (Number.isFinite(hh) ? hh : 0) * 60 + (Number.isFinite(mm) ? mm : 0),
    trainingAt: `${y}-${mo}-${day} ${slot}~${endSlot}`,
  };
}

function toDateInputValue(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function parseYMDLocal(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map((x) => Number(x));
  if (!y || !m || !d) return new Date();
  return new Date(y, m - 1, d);
}

export default function AntiForgetting() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const [selectedDate, setSelectedDate] = useState(() => {
    const q = (searchParams.get("date") || "").trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(q)) return q;
    return toDateInputValue(new Date());
  });
  const navigate = useNavigate();

  const [bookStats, setBookStats] = useState<ReviewBookStatRow[]>([]);
  const [loadingBooks, setLoadingBooks] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoadingBooks(true);
      try {
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Shanghai";
        const res = await listReviewBooksByDate(selectedDate, tz);
        const arr = Array.isArray(res.data) ? (res.data as ReviewBookStatRow[]) : [];
        if (mounted) setBookStats(arr);
      } catch {
        if (mounted) setBookStats([]);
      } finally {
        if (mounted) setLoadingBooks(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [selectedDate]);

  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Shanghai";

  const reviewTasks = useMemo<ReviewTask[]>(() => {
    return bookStats.map((b) => {
      const studentId = normalizeSnowflakeId(b.studentId) || "self";
      const wordBookId = normalizeSnowflakeId(b.wordBookId);
      const sessionId = normalizeSnowflakeId(b.sessionId);
      const clock = clockParts(b.practiceStartedAt, b.practiceEndedAt, timeZone);
      return {
        id: `${studentId}-${wordBookId}-${sessionId || "0"}`,
        studentId,
        student: studentDisplayName(b),
        vocabularyPack: b.name,
        level: String(b.level || "").trim(),
        wordBookId,
        sessionId,
        count: b.cnt,
        timeSlot: clock?.slot || "—",
        timeSort: clock?.sort ?? 9999,
        trainingAt: clock?.trainingAt || "—",
        practiceStartedAt: b.practiceStartedAt,
        practiceEndedAt: b.practiceEndedAt,
      };
    });
  }, [bookStats, timeZone]);

  const timelineGroups = useMemo<TimeSlotGroup[]>(() => {
    const map = new Map<string, TimeSlotGroup>();
    for (const task of reviewTasks) {
      const key = task.timeSlot;
      const group = map.get(key);
      if (group) {
        group.tasks.push(task);
      } else {
        map.set(key, { timeSlot: key, timeSort: task.timeSort, tasks: [task] });
      }
    }
    return Array.from(map.values())
      .sort((a, b) => a.timeSort - b.timeSort || a.timeSlot.localeCompare(b.timeSlot))
      .map((group) => ({
        ...group,
        tasks: [...group.tasks].sort((x, y) => x.student.localeCompare(y.student, "zh-CN")),
      }));
  }, [reviewTasks]);

  const shiftDate = (deltaDays: number) => {
    const d = parseYMDLocal(selectedDate);
    d.setDate(d.getDate() + deltaDays);
    setSelectedDate(toDateInputValue(d));
  };

  const isToday = selectedDate === toDateInputValue(new Date());

  const handleOpenTask = (task: ReviewTask) => {
    if (task.count <= 0 || !task.wordBookId) return;
    sessionStorage.setItem("lb_review_wordbook_id", task.wordBookId);
    sessionStorage.setItem("lb_review_wordbook_name", task.vocabularyPack);
    sessionStorage.setItem("lb_review_date", selectedDate);
    sessionStorage.setItem("lb_review_return", "/anti-forgetting");
    if (task.studentId && task.studentId !== "self") {
      sessionStorage.setItem("lb_review_student_id", task.studentId);
    } else {
      sessionStorage.removeItem("lb_review_student_id");
    }
    if (task.sessionId) {
      sessionStorage.setItem("lb_review_study_session_id", task.sessionId);
    } else {
      sessionStorage.removeItem("lb_review_study_session_id");
    }
    const studentQ =
      task.studentId && task.studentId !== "self"
        ? `&studentId=${encodeURIComponent(task.studentId)}`
        : "";
    const sessionQ = task.sessionId
      ? `&studySessionId=${encodeURIComponent(task.sessionId)}`
      : "";
    if (isToday) {
      sessionStorage.setItem("lb_mode", "review");
      navigate(
        `/review-word-list?wordBookId=${task.wordBookId}&date=${encodeURIComponent(selectedDate)}${sessionQ}${studentQ}`
      );
      return;
    }
    sessionStorage.removeItem("lb_mode");
    navigate(
      `/review-word-list?wordBookId=${task.wordBookId}&date=${encodeURIComponent(selectedDate)}&view=1${sessionQ}${studentQ}`
    );
  };

  return (
    <div className="space-y-4">
      <CloudCard className="p-4 sm:p-5">
        <div className="flex items-center gap-2 sm:gap-4">
          <CloudButton
            variant="ghost"
            size="icon"
            onClick={() => shiftDate(-1)}
            aria-label={t("anti_forgetting.prev_day")}
          >
            <ChevronLeft size={20} />
          </CloudButton>
          <div className="flex-1 min-w-0 flex flex-col items-center gap-2">
            <p className="text-xs text-muted-foreground">{t("anti_forgetting.select_date")}</p>
            <div className="w-full max-w-[280px]">
              <CloudDatePicker
                value={selectedDate || undefined}
                allowClear={false}
                onChange={(dateString) => {
                  if (dateString) setSelectedDate(dateString);
                }}
              />
            </div>
          </div>
          <CloudButton
            variant="ghost"
            size="icon"
            onClick={() => shiftDate(1)}
            aria-label={t("anti_forgetting.next_day")}
          >
            <ChevronRight size={20} />
          </CloudButton>
        </div>
      </CloudCard>

      {loadingBooks ? (
        <CloudSpin tip={t("practice.loading")} />
      ) : reviewTasks.length === 0 ? (
        <CloudCard className="p-6">
          <CloudEmpty description={t("anti_forgetting.empty")} />
        </CloudCard>
      ) : (
        <CloudCard className="overflow-hidden border border-primary/20">
          <div className="flex items-center gap-1.5 px-4 py-2.5 bg-primary-soft/35 border-b border-primary/20 text-sm text-muted-foreground">
            <span className="font-medium text-foreground/80 tabular-nums">{selectedDate}</span>
            <ChevronDown size={14} className="opacity-50" />
          </div>

          <div className="relative px-3 py-4 sm:px-5 sm:py-5">
            <div
              className="absolute left-[4.35rem] sm:left-[4.85rem] top-4 bottom-4 w-px bg-primary/25"
              aria-hidden
            />

            <div className="space-y-0">
              {timelineGroups.map((group, groupIdx) => (
                <div key={group.timeSlot} className="relative">
                  {group.tasks.map((task, idx) => {
                    const hasNextTask = idx < group.tasks.length - 1 || groupIdx < timelineGroups.length - 1;
                    return (
                    <div
                      key={task.id}
                      className={`group relative flex gap-3 sm:gap-4 py-3 transition-colors hover:bg-primary/[0.05] ${hasNextTask ? "-mx-3 sm:-mx-5 border-b border-primary/25 px-3 sm:px-5" : ""}`}
                    >
                      <div className="w-[3.25rem] sm:w-[3.75rem] shrink-0 flex justify-center items-center">
                        {idx === 0 ? (
                          <div className="relative z-[1] flex w-12 min-w-0 translate-x-1/2 justify-center px-1.5 py-2 rounded-md border border-primary/30 bg-primary-soft text-center text-xs font-medium text-primary tabular-nums shadow-sm">
                            {group.timeSlot}
                          </div>
                        ) : (
                          <div className="w-[3rem]" aria-hidden />
                        )}
                      </div>

                      <div className="relative flex-1 min-w-0 pt-0.5 pl-1 pr-24 sm:pr-28">
                        <div
                          className="absolute -left-[1.15rem] sm:-left-[1.35rem] top-[0.85rem] w-2.5 h-px bg-primary/35"
                          aria-hidden
                        />

                        <div className="text-[15px] font-semibold text-foreground leading-snug mb-1.5">
                          {task.student}
                        </div>

                        <button
                          type="button"
                          onClick={() => handleOpenTask(task)}
                          disabled={task.count <= 0}
                          className="w-full text-left group disabled:opacity-50"
                        >
                          <div className="flex items-start gap-1 text-sm text-foreground leading-relaxed">
                            <span className="text-muted-foreground shrink-0 mt-0.5">•</span>
                            <span className="min-w-0 flex-1">
                              {task.level ? (
                                <span className="text-muted-foreground">【{task.level}】</span>
                              ) : null}
                              {task.count > 0 ? (
                                <span className="text-muted-foreground">
                                  【{t("anti_forgetting.word_count_tag", { count: task.count })}】
                                </span>
                              ) : null}
                              <span className="text-foreground group-hover:text-primary transition-colors">
                                {task.vocabularyPack}
                              </span>
                            </span>
                          </div>
                          <p className="mt-1 pl-3.5 text-xs text-muted-foreground">
                            {t("anti_forgetting.training_at", { time: task.trainingAt })}
                          </p>
                        </button>

                        <CloudButton
                          type="button"
                          variant="brand"
                          size="pill"
                          className="absolute right-0 top-1/2 -translate-y-1/2 shrink-0 transition-all hover:brightness-95 active:scale-95 active:brightness-85"
                          disabled={task.count <= 0}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenTask(task);
                          }}
                        >
                          {t("practice.start_review")}
                        </CloudButton>
                      </div>
                    </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </CloudCard>
      )}
    </div>
  );
}
