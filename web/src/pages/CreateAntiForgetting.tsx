import { CloudButton } from "../components/cloudsteps";
import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { listStudySessions, updateStudySessionsPracticeTime } from "../api/study";
import { showToast } from "../utils/toast";
import { formatApiMessage } from "../utils/apiMessage";
import { formatPracticeTimeRange } from "../utils/reviewPracticeTime";
import { getTrainingStudent } from "../utils/trainingStudent";
import { isValidSnowflakeId, normalizeSnowflakeId } from "../utils/json-snowflake";

function toDateInputValue(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function formatHmFromTs(ts: number) {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function readLessonDefaults() {
  const now = Date.now();
  const endRaw = Number(sessionStorage.getItem("lb_lesson_practice_end") || now);
  const startRaw = Number(sessionStorage.getItem("lb_lesson_practice_start") || 0);
  const endTs = Number.isFinite(endRaw) && endRaw > 0 ? endRaw : now;
  const minGapMs = 15 * 60_000;
  const startTs =
    Number.isFinite(startRaw) && startRaw > 0 && startRaw < endTs
      ? startRaw
      : endTs - minGapMs;
  // 默认至少间隔 15 分钟（开始/结束落到同一分钟时也会拉开）
  const safeEndTs = endTs - startTs < minGapMs ? startTs + minGapMs : endTs;
  return {
    date: toDateInputValue(new Date(safeEndTs)),
    startTime: formatHmFromTs(startTs),
    endTime: formatHmFromTs(safeEndTs),
  };
}

function ensureMinGapHm(startHm: string, endHm: string, gapMinutes = 15): string {
  const [sh, sm] = startHm.split(":").map((x) => Number(x));
  const [eh, em] = endHm.split(":").map((x) => Number(x));
  if (![sh, sm, eh, em].every((n) => Number.isFinite(n))) {
    return endHm;
  }
  const startMin = sh * 60 + sm;
  const endMin = eh * 60 + em;
  if (endMin - startMin >= gapMinutes) return endHm;
  const next = (startMin + gapMinutes) % (24 * 60);
  return `${String(Math.floor(next / 60)).padStart(2, "0")}:${String(next % 60).padStart(2, "0")}`;
}

export default function CreateAntiForgetting() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const trainingStudent = useMemo(() => getTrainingStudent(), []);
  const defaults = useMemo(() => readLessonDefaults(), []);

  const [date, setDate] = useState(defaults.date);
  const [startTime, setStartTime] = useState(defaults.startTime);
  const [endTime, setEndTime] = useState(defaults.endTime);
  const [sessionIds, setSessionIds] = useState<string[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingSessions(true);
      try {
        const studentId = normalizeSnowflakeId(trainingStudent?.id);
        const res = await listStudySessions({
          page: 1,
          pageSize: 50,
          sessionType: "study",
          status: "completed",
          date: defaults.date,
          ...(studentId ? { studentId } : {}),
        });
        if (cancelled) return;
        const list = Array.isArray(res.data?.list) ? res.data.list : [];
        const ids = list
          .map((row) => normalizeSnowflakeId(row.id))
          .filter((id) => isValidSnowflakeId(id));
        setSessionIds(ids);

        const latest = list.find((row) => row.startedAt) || list[0];
        if (latest?.startedAt) {
          const start = new Date(latest.startedAt);
          if (!Number.isNaN(start.getTime())) {
            setDate(toDateInputValue(start));
            setStartTime(formatHmFromTs(start.getTime()));
          }
        }
        if (latest?.completedAt) {
          const end = new Date(latest.completedAt);
          if (!Number.isNaN(end.getTime())) {
            const startHm = latest.startedAt
              ? formatHmFromTs(new Date(latest.startedAt).getTime())
              : defaults.startTime;
            setEndTime(ensureMinGapHm(startHm, formatHmFromTs(end.getTime()), 15));
          }
        } else if (latest?.startedAt) {
          const start = new Date(latest.startedAt);
          if (!Number.isNaN(start.getTime())) {
            setEndTime(formatHmFromTs(start.getTime() + 15 * 60_000));
          }
        }
      } catch {
        if (!cancelled) setSessionIds([]);
      } finally {
        if (!cancelled) setLoadingSessions(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [defaults.date, trainingStudent?.id]);

  const preview = formatPracticeTimeRange(
    `${date}T${startTime}:00`,
    `${date}T${endTime}:00`
  );

  const handleConfirm = async () => {
    if (!startTime || !endTime || startTime >= endTime) {
      showToast.warning(t("create_anti_forgetting.time_invalid"));
      return;
    }
    if (sessionIds.length === 0) {
      showToast.warning(t("create_anti_forgetting.no_sessions_hint"));
      return;
    }
    setSaving(true);
    try {
      const studentId = normalizeSnowflakeId(trainingStudent?.id);
      const res = await updateStudySessionsPracticeTime({
        date,
        startTime,
        endTime,
        ...(studentId ? { studentId } : {}),
        sessionIds,
      });
      if (res.code !== 200) {
        showToast.error(formatApiMessage(res.msg, "common.operation_failed"));
        return;
      }
      sessionStorage.removeItem("lb_lesson_practice_start");
      sessionStorage.removeItem("lb_lesson_practice_end");
      showToast.success(t("create_anti_forgetting.saved_toast"));
      navigate("/anti-forgetting");
    } catch (e: unknown) {
      const msg =
        e && typeof e === "object" && "msg" in e
          ? formatApiMessage(String((e as { msg: string }).msg))
          : t("common.operation_failed");
      showToast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-dvh bg-background">
      <div className="bg-card sticky top-0 z-10 border-b border-border">
        <div className="flex items-center px-4 h-14">
          <CloudButton
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => navigate(-1)}
            className="-ml-1"
          >
            <ArrowLeft size={22} className="text-charcoal" />
          </CloudButton>
          <h1 className="flex-1 text-center text-base font-semibold text-foreground -ml-8">
            {t("create_anti_forgetting.title")}
          </h1>
        </div>
      </div>

      <div className="px-4 mt-5 space-y-4 max-w-lg mx-auto pb-8">
        <div className="rounded-xl bg-primary-soft px-4 py-3">
          <p className="text-sm text-charcoal leading-relaxed">
            {t("create_anti_forgetting.intro")}
          </p>
          {trainingStudent?.name ? (
            <p className="text-xs text-muted-foreground mt-2">
              {t("create_anti_forgetting.student", { name: trainingStudent.name })}
            </p>
          ) : null}
        </div>

        <div className="space-y-3">
          <p className="text-sm font-medium text-foreground">{t("create_anti_forgetting.time_label")}</p>
          <label className="block space-y-1">
            <span className="text-xs text-muted-foreground">{t("create_anti_forgetting.date")}</span>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full h-11 px-3 rounded-xl border border-border bg-card text-sm outline-none focus:border-primary"
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block space-y-1">
              <span className="text-xs text-muted-foreground">{t("create_anti_forgetting.start_time")}</span>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full h-11 px-3 rounded-xl border border-border bg-card text-sm outline-none focus:border-primary"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs text-muted-foreground">{t("create_anti_forgetting.end_time")}</span>
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="w-full h-11 px-3 rounded-xl border border-border bg-card text-sm outline-none focus:border-primary"
              />
            </label>
          </div>
          {preview ? (
            <p className="text-xs text-muted-foreground">
              {t("create_anti_forgetting.preview", { range: preview })}
            </p>
          ) : null}
          {loadingSessions ? (
            <p className="text-xs text-muted-foreground">{t("create_anti_forgetting.loading_sessions")}</p>
          ) : sessionIds.length > 0 ? (
            <p className="text-xs text-muted-foreground">
              {t("create_anti_forgetting.sessions_count", { count: sessionIds.length })}
            </p>
          ) : (
            <p className="text-xs text-amber-700">{t("create_anti_forgetting.no_sessions_hint")}</p>
          )}
        </div>

        <p className="text-[11px] text-muted-foreground leading-relaxed">
          {t("create_anti_forgetting.count_hint")}
        </p>

        <CloudButton
          variant="brand"
          className="w-full h-11"
          loading={saving}
          disabled={!loadingSessions && sessionIds.length === 0}
          onClick={() => void handleConfirm()}
        >
          {t("create_anti_forgetting.save_view")}
        </CloudButton>
        {!loadingSessions && sessionIds.length === 0 ? (
          <CloudButton
            variant="outline"
            className="w-full h-11"
            onClick={() => navigate("/anti-forgetting")}
          >
            {t("create_anti_forgetting.skip")}
          </CloudButton>
        ) : null}
      </div>
    </div>
  );
}
