import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { Calendar, ChevronLeft, ChevronRight, Clock, RefreshCw, Users } from "lucide-react";
import { CloudButton } from "../components/cloudsteps";
import { CloudEmpty, CloudSpin } from "../components/cloudsteps/arco";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { useAuthStore } from "../stores/authStore";
import { getTeacherCoachingCompleted, type CoachingWeekSchedule } from "../api/coaching";
import { useTranslation } from "react-i18next";

const PAGE_SIZE = 10;

function formatDateTime(raw?: string | null) {
  if (!raw) return "-";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function CoachCompletedSessions() {
  const { t } = useTranslation();
  const statusLabel: Record<string, string> = {
    completed: t("coach_sessions.status_completed"),
    scheduled: t("coach_sessions.status_scheduled"),
    in_progress: t("coach_sessions.status_in_progress"),
    cancelled: t("coach_sessions.status_cancelled"),
  };
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const role = (user as { role?: string } | null)?.role || "user";
  const isCoach = role === "teacher" || role === "user";

  const [schedules, setSchedules] = useState<CoachingWeekSchedule[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState<CoachingWeekSchedule | null>(null);

  const load = useCallback(
    async (nextPage = 1) => {
      if (!isCoach) return;
      setLoading(true);
      try {
        const res = await getTeacherCoachingCompleted({ page: nextPage, pageSize: PAGE_SIZE });
        if (res.code !== 200) {
          setSchedules([]);
          setTotal(0);
          return;
        }
        setSchedules(Array.isArray(res.data?.schedules) ? res.data!.schedules : []);
        setTotal(res.data?.total ?? 0);
        setPage(res.data?.page ?? nextPage);
      } catch {
        setSchedules([]);
        setTotal(0);
      } finally {
        setLoading(false);
      }
    },
    [isCoach]
  );

  useEffect(() => {
    if (!isCoach) {
      navigate("/coach-center", { replace: true });
      return;
    }
    void load(1);
  }, [isCoach, load, navigate]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-3 h-full">
      <div className="flex items-center gap-2 shrink-0">
        <CloudButton
          variant="ghost"
          size="icon"
          onClick={() => navigate("/coach-center")}
          aria-label={t("coach_sessions.back_coach")}
          className="shrink-0"
        >
          <ChevronLeft size={20} />
        </CloudButton>
        <div className="min-w-0 flex-1">
          <h3 className="text-lg font-semibold tracking-tight text-foreground sm:text-xl">
            {t("coach_sessions.title")}
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {t("coach_sessions.subtitle", {
              total: total > 0 ? t("coach_sessions.total_count", { count: total }) : "",
            })}
          </p>
          <p className="text-[11px] text-muted-soft mt-0.5">{t("coach_sessions.billing_only_hint")}</p>
        </div>
        <CloudButton
          variant="outline"
          size="sm"
          onClick={() => void load(page)}
          disabled={loading}
          className="shrink-0 gap-1.5"
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : undefined} />
          {t("practice.refresh")}
        </CloudButton>
      </div>

      <div className="flex-1 min-h-0 flex flex-col rounded-xl border border-border bg-card overflow-hidden">
        <div className="flex-1 min-h-0 overflow-y-auto">
          {loading ? (
            <div className="h-full min-h-[12rem] flex items-center justify-center">
              <CloudSpin tip={t("practice.loading")} />
            </div>
          ) : schedules.length === 0 ? (
            <div className="h-full min-h-[12rem] flex items-center justify-center p-6">
              <CloudEmpty description={t("coach_sessions.empty")} />
            </div>
          ) : (
            <div className="divide-y divide-border">
              {schedules.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setDetail(s)}
                  className="w-full text-left px-4 py-3.5 sm:px-5 hover:bg-muted/40 transition-colors group"
                >
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="font-medium text-foreground text-sm truncate">
                      {s.title || t("coach_sessions.schedule_fallback", { id: s.id })}
                    </div>
                    <span
                      className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded-md border ${
                        s.source === "practice"
                          ? "border-amber-200 bg-amber-50 text-amber-800"
                          : "border-border bg-muted text-muted-foreground"
                      }`}
                    >
                      {s.source === "practice"
                        ? t("coach_sessions.source_practice")
                        : t("coach_sessions.source_scheduled")}
                    </span>
                  </div>
                      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <Calendar size={13} className="text-primary" />
                          {s.scheduledDate?.slice?.(0, 10) || s.scheduledDate}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Clock size={13} />
                          {s.startTime}–{s.endTime}
                        </span>
                        {s.students && s.students.length > 0 && (
                          <span className="inline-flex items-center gap-1">
                            <Users size={13} />
                            {s.students.join("、")}
                          </span>
                        )}
                      </div>
                      {s.session?.billedMinutes != null && (
                        <p className="text-xs text-muted-soft mt-1.5 leading-relaxed">
{t("coach_sessions.actual_billed", { actual: s.session.actualMinutes ?? "-", billed: s.session.billedMinutes })}
                          {s.session.teacherCreditedMinutes != null && (
                            <>{t("coach_sessions.teacher_credited", { minutes: s.session.teacherCreditedMinutes })}</>
                          )}
                        </p>
                      )}
                    </div>
                    <ChevronRight
                      size={16}
                      className="text-muted-soft group-hover:text-primary shrink-0 mt-0.5 transition-colors"
                    />
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="shrink-0 border-t border-border px-4 py-3 flex items-center justify-between gap-3 bg-surface-soft/80">
          <span className="text-xs text-muted-foreground tabular-nums">
            {total > 0 ? t("coach_sessions.page", { page, total: totalPages }) : t("coach_sessions.no_pagination")}
          </span>
          <div className="flex items-center gap-2">
            <CloudButton
              type="button"
              variant="outline"
              size="sm"
              disabled={page <= 1 || loading || total === 0}
              onClick={() => void load(page - 1)}
            >
              {t("practice.prev_page")}
            </CloudButton>
            <CloudButton
              type="button"
              variant="outline"
              size="sm"
              disabled={page >= totalPages || loading || total === 0}
              onClick={() => void load(page + 1)}
            >
              {t("practice.next_page")}
            </CloudButton>
          </div>
        </div>
      </div>

      <Dialog open={detail !== null} onOpenChange={(v) => !v && setDetail(null)}>
        <DialogContent className="sm:max-w-[480px] rounded-xl border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground">{t("coach_sessions.detail_title")}</DialogTitle>
          </DialogHeader>
          {detail && (
            <div className="space-y-3 text-sm">
              <div className="rounded-xl bg-muted px-3.5 py-3">
                <div className="text-[11px] text-muted-foreground">{t("coach_sessions.course_title")}</div>
                <div className="font-semibold text-foreground mt-0.5">
                  {detail.title || t("coach_sessions.schedule_fallback", { id: detail.id })}
                </div>
                <div className="mt-1.5 text-xs text-muted-foreground">
                  {detail.source === "practice"
                    ? t("coach_sessions.source_practice_hint")
                    : t("coach_sessions.source_scheduled_hint")}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <div className="rounded-xl border border-border px-3 py-2.5">
                  <div className="text-[11px] text-muted-foreground">{t("coach_sessions.date")}</div>
                  <div className="text-charcoal mt-0.5">
                    {detail.scheduledDate?.slice?.(0, 10) || detail.scheduledDate || "-"}
                  </div>
                </div>
                <div className="rounded-xl border border-border px-3 py-2.5">
                  <div className="text-[11px] text-muted-foreground">{t("coach_sessions.time_slot")}</div>
                  <div className="text-charcoal mt-0.5">
                    {detail.startTime}–{detail.endTime}
                  </div>
                </div>
                <div className="rounded-xl border border-border px-3 py-2.5">
                  <div className="text-[11px] text-muted-foreground">{t("coach_sessions.status")}</div>
                  <div className="text-charcoal mt-0.5">
                    {statusLabel[detail.status] || detail.status || "-"}
                  </div>
                </div>
                <div className="rounded-xl border border-border px-3 py-2.5">
                  <div className="text-[11px] text-muted-foreground">{t("training_records.student")}</div>
                  <div className="text-charcoal mt-0.5 truncate">
                    {detail.students?.length ? detail.students.join("、") : "-"}
                  </div>
                </div>
              </div>
              <div className="rounded-xl border border-border px-3.5 py-3 space-y-1.5">
                <div className="text-[11px] text-muted-foreground mb-1">{t("coach_sessions.billing")}</div>
                <div className="flex justify-between text-charcoal">
                  <span>{t("coach_sessions.planned")}</span>
                  <span className="tabular-nums">{t("create_appointment.duration_min", { n: detail.session?.plannedMinutes ?? "-" })}</span>
                </div>
                <div className="flex justify-between text-charcoal">
                  <span>{t("coach_sessions.actual")}</span>
                  <span className="tabular-nums">{t("create_appointment.duration_min", { n: detail.session?.actualMinutes ?? "-" })}</span>
                </div>
                <div className="flex justify-between text-charcoal">
                  <span>{t("coach_sessions.student_deduct")}</span>
                  <span className="tabular-nums">{t("create_appointment.duration_min", { n: detail.session?.billedMinutes ?? "-" })}</span>
                </div>
                <div className="flex justify-between text-charcoal">
                  <span>{t("coach_sessions.teacher_credit")}</span>
                  <span className="tabular-nums">
                    {t("create_appointment.duration_min", { n: detail.session?.teacherCreditedMinutes ?? "-" })}
                  </span>
                </div>
                <div className="pt-1.5 border-t border-border flex justify-between text-xs text-muted-foreground">
                  <span>{t("coach_sessions.started")} {formatDateTime(detail.session?.startedAt)}</span>
                  <span>{t("coach_sessions.ended")} {formatDateTime(detail.session?.endedAt)}</span>
                </div>
              </div>
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-2">
            <CloudButton type="button" variant="outline" onClick={() => setDetail(null)}>
              {t("practice.close")}
            </CloudButton>
            <CloudButton
              type="button"
              variant="brand"
              onClick={() => {
                setDetail(null);
                navigate("/training-records");
              }}
            >
              {t("coach_sessions.view_training_records")}
            </CloudButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
