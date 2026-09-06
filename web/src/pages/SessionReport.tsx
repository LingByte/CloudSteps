import { Copy, Download, Loader2 } from "lucide-react";
import { toPng } from "html-to-image";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { useTranslation } from "react-i18next";
import { CloudButton, CloudImageWithFallback } from "../components/cloudsteps";
import {
  getStudySessionReport,
  streamStudySessionReport,
  type StudySessionReport,
} from "../api/study";
import { formatApiMessage } from "../utils/apiMessage";
import { showToast } from "../utils/toast";
import { teacherAvatarSrc } from "../utils/avatar";
import { buildSessionReportCopyText } from "../utils/sessionReportCopy";

function formatReportDate(iso?: string) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatReportDateTime(iso?: string) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function buildCoachFallback(
  report: StudySessionReport,
  t: (key: string, opts?: Record<string, unknown>) => string
) {
  const name = report.studentName || t("session_report.student_fallback");
  const acc = Math.round(report.accuracyPercent);
  if (acc >= 90) {
    return t("session_report.fallback.high", { name, accuracy: acc });
  }
  if (acc >= 70) {
    return t("session_report.fallback.mid", { name, accuracy: acc, forgot: report.forgotCount });
  }
  return t("session_report.fallback.low", { name, accuracy: acc, forgot: report.forgotCount });
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-1 px-0.5 text-[12px] font-semibold tracking-tight text-[#6B7280]">
      {children}
    </h2>
  );
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl bg-white px-3 py-2.5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] ${className}`}>
      {children}
    </div>
  );
}

type WordRow = { word: string; gloss: string };

function parseWordLabel(raw: string): WordRow {
  const text = raw.trim();
  const m = text.match(/^(\S+)\s+(.+)$/);
  if (!m) return { word: text, gloss: "" };
  return { word: m[1], gloss: m[2].trim() };
}

function WordList({
  title,
  items,
  tone,
}: {
  title: string;
  items: string[];
  tone: "ok" | "warn";
}) {
  if (items.length === 0) return null;
  const rows = items.map(parseWordLabel);
  const dot = tone === "ok" ? "bg-emerald-500" : "bg-amber-500";
  return (
    <div>
      <p className="mb-1.5 text-[11px] font-medium text-[#6B7280]">{title}</p>
      <ul className="divide-y divide-[#F0F0F0] rounded-lg border border-[#ECECEC] bg-[#FAFAFA]">
        {rows.map((row, i) => (
          <li
            key={`${tone}-${i}-${row.word}-${row.gloss}`}
            className="flex min-w-0 items-center gap-2 px-2.5 py-2"
          >
            <span className={`size-1.5 shrink-0 rounded-full ${dot}`} aria-hidden />
            <span className="shrink-0 text-[13px] font-semibold text-[#111827]">{row.word}</span>
            {row.gloss ? (
              <span className="min-w-0 flex-1 text-[12px] leading-snug text-[#6B7280]">
                {row.gloss}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function SessionReport() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { sessionId = "" } = useParams<{ sessionId: string }>();
  const [report, setReport] = useState<StudySessionReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [noteTarget, setNoteTarget] = useState("");
  const [noteShown, setNoteShown] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [typing, setTyping] = useState(false);
  const [aiError, setAiError] = useState("");
  const [savingImage, setSavingImage] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const posterRef = useRef<HTMLDivElement | null>(null);
  const noteBoxRef = useRef<HTMLDivElement | null>(null);

  const goNext = () => {
    navigate("/create-anti-forgetting", { replace: true });
  };

  useEffect(() => {
    if (!sessionId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await getStudySessionReport(sessionId);
        if (cancelled) return;
        if (res.code !== 200 || !res.data) {
          throw new Error(formatApiMessage(res.msg, "session_report.load_failed"));
        }
        setReport(res.data);
        if (res.data.reportSummary) {
          setNoteShown("");
          setNoteTarget(res.data.reportSummary);
        }
      } catch (e: unknown) {
        if (cancelled) return;
        const msg =
          e instanceof Error
            ? e.message
            : e && typeof e === "object" && "msg" in e
              ? formatApiMessage(String((e as { msg: string }).msg), "session_report.load_failed")
              : t("session_report.load_failed");
        showToast.error(msg);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId, t]);

  useEffect(() => {
    if (!report || !sessionId) return;
    if (report.reportSummary) return;
    if (!report.aiAvailable) {
      setAiError("llm_not_configured");
      setNoteShown("");
      setNoteTarget(buildCoachFallback(report, t));
      return;
    }

    const ac = new AbortController();
    abortRef.current = ac;
    setStreaming(true);
    setAiError("");
    setNoteShown("");
    setNoteTarget("");

    void streamStudySessionReport(
      sessionId,
      {
        onDelta: (delta) => setNoteTarget((prev) => prev + delta),
        onDone: (full) => {
          setNoteTarget(full);
          setStreaming(false);
        },
        onError: (code) => {
          setAiError(code);
          setStreaming(false);
          setNoteTarget((prev) => prev.trim() || buildCoachFallback(report, t));
        },
      },
      ac.signal
    ).catch(() => {
      if (!ac.signal.aborted) {
        setAiError("ai_generate_failed");
        setStreaming(false);
        setNoteTarget(buildCoachFallback(report, t));
      }
    });

    return () => {
      ac.abort();
      abortRef.current = null;
    };
  }, [report, sessionId, t]);

  useEffect(() => {
    const targetChars = Array.from(noteTarget);
    const shownChars = Array.from(noteShown);

    if (shownChars.length > targetChars.length) {
      setNoteShown(noteTarget);
      setTyping(false);
      return;
    }
    if (shownChars.length === targetChars.length) {
      if (noteShown !== noteTarget) setNoteShown(noteTarget);
      setTyping(false);
      return;
    }

    setTyping(true);
    const lag = targetChars.length - shownChars.length;
    const step = lag > 24 ? 3 : lag > 10 ? 2 : 1;
    const delay = lag > 24 ? 12 : lag > 10 ? 18 : 28;

    const timer = window.setTimeout(() => {
      setNoteShown(targetChars.slice(0, shownChars.length + step).join(""));
    }, delay);
    return () => window.clearTimeout(timer);
  }, [noteTarget, noteShown]);

  useEffect(() => {
    if (!noteBoxRef.current) return;
    if (!typing && !streaming) return;
    noteBoxRef.current.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [noteShown, typing, streaming]);

  const reportDate = useMemo(
    () => formatReportDate(report?.completedAt || report?.startedAt),
    [report]
  );
  const coachAt = useMemo(
    () => formatReportDateTime(report?.completedAt || report?.startedAt),
    [report]
  );

  const noteBusy = streaming || typing;
  // 完整展示本课全部词条（保存长图也要用全量）
  const forgotWords = report?.forgotWords ?? [];
  const studiedWords = report?.studiedWords ?? [];
  const studentName = report?.studentName || t("session_report.student_fallback");
  const coachName = report?.coachName || t("session_report.coach_fallback");
  const bookName = report?.wordBookName || t("session_report.wordbook_fallback");

  const copyAll = async () => {
    if (!report) return;
    const text = buildSessionReportCopyText(report, noteTarget || noteShown, t);
    try {
      await navigator.clipboard.writeText(text);
      showToast.success(t("session_report.copied"));
    } catch {
      showToast.error(t("session_report.copy_failed"));
    }
  };

  const saveImage = async () => {
    if (!posterRef.current || !report) return;
    setSavingImage(true);
    try {
      // 先展开词条区（去掉 max-height），再按完整高度导出长图
      await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
      await new Promise((r) => setTimeout(r, 80));
      const node = posterRef.current;
      if (!node) return;
      const width = Math.ceil(node.scrollWidth);
      const height = Math.ceil(node.scrollHeight);
      const dataUrl = await toPng(node, {
        cacheBust: true,
        pixelRatio: 2,
        backgroundColor: "#F5F5F5",
        width,
        height,
        // 跨域 Google Fonts 无法读 cssRules，跳过字体内联避免 SecurityError
        skipFonts: true,
        fontEmbedCSS: "",
        style: {
          height: `${height}px`,
          overflow: "visible",
          fontFamily:
            'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif',
        },
        filter: (el) => {
          if (el.tagName === "LINK") {
            const href = el.getAttribute("href") || "";
            if (href.includes("fonts.googleapis.com") || href.includes("fonts.gstatic.com")) {
              return false;
            }
          }
          return true;
        },
      });
      const link = document.createElement("a");
      const name = ["课堂报告", report.studentName || "", reportDate || ""]
        .filter(Boolean)
        .join("-");
      link.download = `${name || "session-report"}.png`;
      link.href = dataUrl;
      link.click();
      showToast.success(t("session_report.saved_image"));
    } catch {
      showToast.error(t("session_report.save_image_failed"));
    } finally {
      setSavingImage(false);
    }
  };

  return (
    <div className="relative flex h-dvh flex-col overflow-hidden bg-[#F5F5F5]">
      <header className="relative z-20 mx-auto flex h-10 w-full max-w-lg shrink-0 items-center justify-center px-3">
        <h1
          id="session-report-title"
          className="px-16 text-center text-[13px] font-medium tracking-wide text-[#6B7280]"
        >
          {t("session_report.feedback_title")}
        </h1>
        <button
          type="button"
          onClick={() => void saveImage()}
          disabled={!report || savingImage || loading}
          className="absolute right-3 top-1/2 z-10 inline-flex h-8 -translate-y-1/2 items-center gap-1 rounded-full bg-white px-2.5 text-[11px] font-medium text-[#5C574F] shadow-sm transition hover:bg-white disabled:opacity-50"
          aria-label={t("session_report.save_image")}
        >
          {savingImage ? (
            <Loader2 size={13} className="animate-spin" />
          ) : (
            <Download size={13} />
          )}
          {t("session_report.save_image")}
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-[calc(4.75rem+env(safe-area-inset-bottom))]">
        <div
          ref={posterRef}
          className="mx-auto w-full max-w-lg bg-[#F5F5F5] pb-3"
        >
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-[#8A857C]">
              <Loader2 className="animate-spin text-[var(--primary)]" size={18} />
              {t("session_report.loading")}
            </div>
          ) : !report ? (
            <p className="py-16 text-center text-sm text-[#8A857C]">
              {t("session_report.load_failed")}
            </p>
          ) : (
            <div className="flex flex-col gap-2.5">
              <section>
                <SectionLabel>{t("session_report.section.basic")}</SectionLabel>
                <Card>
                  <div className="flex items-center gap-2.5">
                    <CloudImageWithFallback
                      src={teacherAvatarSrc(report.studentAvatar)}
                      alt={studentName}
                      className="size-10 shrink-0 rounded-full object-cover bg-[#EEE]"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-[14px] font-semibold leading-tight text-[#1A1A1A]">
                        {studentName}
                      </p>
                      <p className="mt-0.5 truncate text-[11px] text-[#6B7280]">
                        {bookName}
                        <span className="mx-1 text-[#D1D5DB]">·</span>
                        {reportDate || "—"}
                        <span className="mx-1 text-[#D1D5DB]">·</span>
                        {t("session_report.duration_training", {
                          minutes: report.durationMinutes,
                        })}
                      </p>
                    </div>
                  </div>
                  <div className="mt-2 flex items-center gap-2 border-t border-[#F3F4F6] pt-2">
                    <CloudImageWithFallback
                      src={teacherAvatarSrc(report.coachAvatar)}
                      alt={coachName}
                      className="size-5 shrink-0 rounded-full object-cover bg-[#EEE]"
                    />
                    <p className="min-w-0 flex-1 truncate text-[11px] text-[#4B5563]">
                      {t("session_report.coach_line", { name: coachName })}
                    </p>
                    <p className="shrink-0 text-[10px] text-[#9CA3AF]">{coachAt || "—"}</p>
                  </div>
                </Card>
              </section>

              <section>
                <SectionLabel>{t("session_report.section.note")}</SectionLabel>
                <Card className="!bg-white !py-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[13px] font-semibold text-[#1A1A1A]">
                      {t("session_report.note_heading")}
                    </p>
                    {noteBusy ? (
                      <span className="inline-flex items-center gap-1 text-[10px] text-[#A4A097]">
                        <Loader2 size={11} className="animate-spin" />
                        {t("session_report.writing_note")}
                      </span>
                    ) : null}
                  </div>

                  <div className="mt-2 rounded-lg bg-[#F8F8F8] px-2.5 py-2.5 text-[12px] leading-relaxed text-[#4B5563]">
                    <p className="whitespace-pre-wrap">
                      {t("session_report.note_stats", {
                        screened: report.screenedKnownCount + report.screenedUnknownCount,
                        known: report.screenedKnownCount,
                        newWords: Math.max(report.screenedUnknownCount, report.wordCount),
                        studied: report.wordCount,
                        remembered: report.correctCount,
                        forgot: report.forgotCount,
                        accuracy: Math.round(report.accuracyPercent),
                      })}
                    </p>
                    <div ref={noteBoxRef} className="mt-2">
                      {noteShown.trim() ? (
                        <p className="whitespace-pre-wrap text-[#374151]">
                          {t("session_report.note_eval_prefix")}
                          {noteShown}
                          {noteBusy ? (
                            <span className="ml-0.5 inline-block h-[1em] w-[2px] translate-y-[2px] animate-pulse bg-[#37352F] align-baseline" />
                          ) : null}
                        </p>
                      ) : (
                        <p className="text-[#C2BDB3]">{t("session_report.note_placeholder")}</p>
                      )}
                    </div>
                  </div>

                  <div
                    className={
                      savingImage
                        ? "mt-3 space-y-3"
                        : "mt-3 max-h-[32vh] space-y-3 overflow-y-auto overscroll-contain"
                    }
                  >
                    <WordList
                      title={t("session_report.studied_list_title")}
                      items={studiedWords}
                      tone="ok"
                    />
                    <WordList
                      title={t("session_report.forgot_list_title")}
                      items={forgotWords}
                      tone="warn"
                    />
                  </div>

                  {aiError && aiError !== "llm_not_configured" ? (
                    <p className="mt-2 text-[10px] text-[var(--warning)]">
                      {t("session_report.ai_failed_hint")}
                    </p>
                  ) : null}
                </Card>
              </section>

              <section>
                <div className="inline-flex max-w-full items-center rounded-full bg-[#E8F8EF] px-3 py-1 text-[11px] font-medium text-[#1F8A4C]">
                  <span className="truncate">【{bookName}】</span>
                </div>
              </section>
            </div>
          )}
        </div>
      </div>

      <div
        className="absolute inset-x-0 bottom-0 z-20 px-3 pt-1"
        style={{ paddingBottom: "max(0.65rem, env(safe-area-inset-bottom))" }}
      >
        <div className="mx-auto flex max-w-lg items-center gap-2 rounded-xl bg-white p-1.5 shadow-[0_8px_24px_rgba(42,38,32,0.1)]">
          <CloudButton
            type="button"
            variant="ghost"
            className="h-10 shrink-0 rounded-lg px-3 text-[#5C574F] hover:bg-black/5"
            onClick={() => void copyAll()}
            disabled={!report}
          >
            <Copy size={15} />
            {t("session_report.copy_content")}
          </CloudButton>
          <CloudButton
            type="button"
            variant="brand"
            className="h-10 flex-1 rounded-lg text-[14px] font-medium"
            onClick={goNext}
          >
            {t("session_report.continue")}
          </CloudButton>
        </div>
      </div>
    </div>
  );
}
