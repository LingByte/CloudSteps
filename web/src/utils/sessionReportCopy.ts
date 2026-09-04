import type { StudySessionReport } from "../api/study";

const WEEKDAY_ZH = ["日", "一", "二", "三", "四", "五", "六"];

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

/** 2026年08月28日 */
export function formatChineseDate(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}年${pad2(d.getMonth() + 1)}月${pad2(d.getDate())}日`;
}

/** 周五14：00~15：05（65min） */
export function formatLessonTimeRange(
  startedAt?: string,
  completedAt?: string,
  durationMinutes?: number
): string {
  if (!startedAt) return "";
  const start = new Date(startedAt);
  if (Number.isNaN(start.getTime())) return "";
  const end = completedAt ? new Date(completedAt) : null;
  const endValid = end && !Number.isNaN(end.getTime()) ? end : null;
  const mins =
    typeof durationMinutes === "number" && durationMinutes >= 0
      ? durationMinutes
      : endValid
        ? Math.max(0, Math.round((endValid.getTime() - start.getTime()) / 60000))
        : 0;
  const weekday = `周${WEEKDAY_ZH[start.getDay()]}`;
  const startHm = `${pad2(start.getHours())}：${pad2(start.getMinutes())}`;
  const endHm = endValid
    ? `${pad2(endValid.getHours())}：${pad2(endValid.getMinutes())}`
    : "";
  const range = endHm ? `${weekday}${startHm}~${endHm}` : `${weekday}${startHm}`;
  return mins > 0 ? `${range}（${mins}min）` : range;
}

/**
 * Parent / WeChat-style classroom feedback copy.
 * Keeps emoji section markers (✅⭐📌📅) matching teacher handoff format.
 */
export function buildSessionReportCopyText(
  report: StudySessionReport,
  note: string,
  t: (key: string, opts?: Record<string, unknown>) => string
): string {
  const name = (report.studentName || t("session_report.student_fallback")).trim();
  const book = (report.wordBookName || t("session_report.wordbook_fallback")).trim();
  const when = report.completedAt || report.startedAt;
  const dateZh = formatChineseDate(when);
  const timeLine = formatLessonTimeRange(report.startedAt, report.completedAt, report.durationMinutes);
  const accuracy = Math.round(report.accuracyPercent);
  const totalWords = Math.max(0, Number(report.wordBookWordCount) || 0);
  const newWords = Math.max(report.screenedUnknownCount, report.wordCount);
  const coachNote = (note || report.reportSummary || "").trim();

  const lines: string[] = [];
  lines.push(
    t("session_report.copy_header", {
      date: dateZh || t("session_report.copy_date_fallback"),
      name,
    })
  );
  lines.push(t("session_report.copy_name_line", { name }));
  if (timeLine) {
    lines.push(t("session_report.copy_time_line", { time: timeLine }));
  }
  lines.push(t("session_report.copy_content_line", { book }));
  lines.push("");
  lines.push(t("session_report.copy_perf_title"));
  if (totalWords > 0) {
    lines.push(t("session_report.copy_perf_total", { total: totalWords }));
  }
  lines.push(
    t("session_report.copy_perf_new", {
      newWords,
      studied: report.wordCount,
    })
  );

  const studied = (report.studiedWords || []).filter(Boolean);
  if (studied.length > 0) {
    for (const w of studied) {
      lines.push(`✅${w}`);
    }
  }

  lines.push(
    t("session_report.copy_perf_check", {
      remembered: report.correctCount,
      forgot: report.forgotCount,
      accuracy,
    })
  );

  const forgot = (report.forgotWords || []).filter(Boolean);
  if (forgot.length > 0) {
    for (const w of forgot) {
      lines.push(`⭐${w}`);
    }
  }

  lines.push("");
  lines.push(t("session_report.copy_eval_title"));
  lines.push(
    coachNote ||
      t("session_report.copy_eval_fallback", {
        name,
        accuracy,
        forgot: report.forgotCount,
        newWords,
      })
  );

  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
