import { describe, expect, it } from "vitest";
import {
  buildSessionReportCopyText,
  formatChineseDate,
  formatLessonTimeRange,
} from "./sessionReportCopy";
import type { StudySessionReport } from "../api/study";

const sample: StudySessionReport = {
  sessionId: "1",
  wordBookId: 11,
  wordBookName: "小学考纲",
  studentName: "James",
  status: "completed",
  startedAt: "2026-08-28T14:00:00+08:00",
  completedAt: "2026-08-28T15:05:00+08:00",
  durationMinutes: 65,
  screenedKnownCount: 68,
  screenedUnknownCount: 24,
  wordCount: 24,
  correctCount: 15,
  forgotCount: 9,
  accuracyPercent: 62.5,
  remainPending: 120,
  wordBookWordCount: 1969,
  learnedCount: 295,
  lessonCount: 23,
  remainingMinutes: 420,
  forgotWords: ["elevator  n. 电梯，升降机", "tower  n. 塔"],
  studiedWords: ["apple  n. 苹果", "book  n. 书"],
  aiAvailable: false,
};

const t = (key: string, opts?: Record<string, unknown>) => {
  const map: Record<string, string> = {
    "session_report.student_fallback": "学员",
    "session_report.wordbook_fallback": "本课词库",
    "session_report.copy_header": `${opts?.date} ${opts?.name}同学英语课反馈，请注意查收：`,
    "session_report.copy_date_fallback": "",
    "session_report.copy_name_line": `姓名：${opts?.name}`,
    "session_report.copy_time_line": `上课时间：${opts?.time}`,
    "session_report.copy_content_line": `课程内容：训前筛词、${opts?.book}生词识记背诵、训后检测`,
    "session_report.copy_perf_title": "【课堂表现】",
    "session_report.copy_perf_total": `✅1、总词汇量：${opts?.total}`,
    "session_report.copy_perf_new": `✅2、学新词量：${opts?.newWords}（本节识记${opts?.studied}），本课词条：`,
    "session_report.copy_perf_check": `✅3、训后检测：记住${opts?.remembered}，遗忘${opts?.forgot}词，正确率${opts?.accuracy}%，需巩固：`,
    "session_report.copy_eval_title": "【课堂评价】",
    "session_report.copy_eval_fallback": "fallback",
  };
  return map[key] ?? key;
};

describe("sessionReportCopy", () => {
  it("formats chinese date and time range", () => {
    expect(formatChineseDate("2026-08-28T14:00:00+08:00")).toBe("2026年08月28日");
    expect(
      formatLessonTimeRange(
        "2026-08-28T14:00:00+08:00",
        "2026-08-28T15:05:00+08:00",
        65
      )
    ).toBe("周五14：00~15：05（65min）");
  });

  it("builds parent-style feedback with emoji markers", () => {
    const text = buildSessionReportCopyText(sample, "本节课整体专注，继续保持。", t);
    expect(text).toContain("2026年08月28日 James同学英语课反馈，请注意查收：");
    expect(text).not.toContain("课时：");
    expect(text).toContain("【课堂表现】");
    expect(text).toContain("✅1、总词汇量：1969");
    expect(text).not.toContain("所学进度");
    expect(text).not.toContain("筛词熟");
    expect(text).toContain("✅2、学新词量：");
    expect(text).toContain("✅3、训后检测：记住15，遗忘9词，正确率63%，需巩固：");
    expect(text).toContain("✅apple  n. 苹果");
    expect(text).toContain("⭐elevator  n. 电梯，升降机");
    expect(text).toContain("【课堂评价】");
    expect(text).toContain("本节课整体专注，继续保持。");
    expect(text).not.toContain("📌");
    expect(text).not.toContain("📅");
  });
});
