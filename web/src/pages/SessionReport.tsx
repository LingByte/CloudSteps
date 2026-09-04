import { Copy, Download, Loader2 } from "lucide-react";
import { toPng } from "html-to-image";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { useTranslation } from "react-i18next";
import { CloudButton } from "../components/cloudsteps";
import {
  getStudySessionReport,
  streamStudySessionReport,
  type StudySessionReport,
} from "../api/study";
import { formatApiMessage } from "../utils/apiMessage";
import { showToast } from "../utils/toast";
import reportBg from "../assets/images/session-report-bg.jpg";
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

function Metric({
  label,
  value,
  emphasize,
}: {
  label: string;
  value: string | number;
  emphasize?: boolean;
}) {
  return (
    <div className="text-center">
      <p
        className={
          emphasize
            ? "text-[26px] font-semibold tabular-nums tracking-tight text-[#1A1A1A]"
            : "text-[22px] font-semibold tabular-nums tracking-tight text-[#1A1A1A]"
        }
      >
        {value}
      </p>
      <p className="mt-1 text-[11px] tracking-wide text-[#8A857C]">{label}</p>
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
    noteBoxRef.current.scrollTop = noteBoxRef.current.scrollHeight;
  }, [noteShown, typing, streaming]);

  const reportDate = useMemo(
    () => formatReportDate(report?.completedAt || report?.startedAt),
    [report]
  );

  const screenTotal = report
    ? report.screenedKnownCount + report.screenedUnknownCount
    : 0;
  const noteBusy = streaming || typing;
  const forgotWords = report?.forgotWords?.slice(0, 6) ?? [];

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
    const el = posterRef.current;
    const prev = {
      backgroundImage: el.style.backgroundImage,
      backgroundSize: el.style.backgroundSize,
      backgroundPosition: el.style.backgroundPosition,
      padding: el.style.padding,
    };
    try {
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      el.style.backgroundImage = `url(${reportBg})`;
      el.style.backgroundSize = "cover";
      el.style.backgroundPosition = "center";
      el.style.padding = "20px 16px";
      const dataUrl = await toPng(el, {
        cacheBust: true,
        pixelRatio: 2,
        backgroundColor: "#F4F1EA",
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
      el.style.backgroundImage = prev.backgroundImage;
      el.style.backgroundSize = prev.backgroundSize;
      el.style.backgroundPosition = prev.backgroundPosition;
      el.style.padding = prev.padding;
      setSavingImage(false);
    }
  };

  return (
    <div className="relative min-h-dvh bg-[#E8E4DC]">
      <img
        aria-hidden
        src={reportBg}
        alt=""
        className="pointer-events-none absolute inset-0 h-full w-full object-cover"
      />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/30 via-white/45 to-white/60" />

      <button
        type="button"
        onClick={() => void saveImage()}
        disabled={!report || savingImage || loading}
        className="absolute right-4 top-4 z-30 inline-flex h-9 items-center gap-1.5 rounded-full bg-white/75 px-3 text-[12px] font-medium text-[#5C574F] shadow-sm backdrop-blur-md transition hover:bg-white disabled:opacity-50"
        aria-label={t("session_report.save_image")}
      >
        {savingImage ? (
          <Loader2 size={14} className="animate-spin" />
        ) : (
          <Download size={14} />
        )}
        {t("session_report.save_image")}
      </button>

      <div className="relative z-10 mx-auto flex min-h-dvh w-full max-w-lg flex-col px-4 pb-[calc(5.25rem+env(safe-area-inset-bottom))] pt-5">
        <div ref={posterRef} className="relative flex-1">
          <div className="relative pb-6 pt-1">
            <div className="min-w-0 pr-16">
              <p className="text-[11px] tracking-[0.18em] text-[#8A857C] uppercase">
                CloudSteps
              </p>
              <h1
                id="session-report-title"
                className="mt-1 text-[24px] font-semibold tracking-tight text-[#1A1A1A]"
              >
                {t("session_report.feedback_title")}
              </h1>
              <p className="mt-1.5 text-[12px] text-[#8A857C]">
                {[reportDate, report?.studentName, report?.wordBookName]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>

            {loading ? (
              <div className="flex items-center justify-center gap-2 py-20 text-sm text-[#8A857C]">
                <Loader2 className="animate-spin text-[var(--primary)]" size={18} />
                {t("session_report.loading")}
              </div>
            ) : !report ? (
              <p className="py-16 text-center text-sm text-[#8A857C]">
                {t("session_report.load_failed")}
              </p>
            ) : (
              <div className="mt-6 space-y-4">
                <div className="grid grid-cols-3 gap-2 rounded-2xl bg-white/55 px-2 py-4 backdrop-blur-[2px]">
                  <Metric
                    label={t("session_report.stat.duration")}
                    value={`${report.durationMinutes}`}
                  />
                  <Metric
                    label={t("session_report.stat.accuracy")}
                    value={`${Math.round(report.accuracyPercent)}%`}
                    emphasize
                  />
                  <Metric
                    label={t("session_report.stat.studied")}
                    value={report.wordCount}
                  />
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div className="rounded-2xl bg-white/55 px-3.5 py-3.5">
                    <p className="text-[11px] text-[#8A857C]">{t("session_report.dim.screen")}</p>
                    <div className="mt-2.5 flex items-end justify-between gap-2">
                      <div>
                        <p className="text-[22px] font-semibold tabular-nums text-[#1A1A1A]">
                          {report.screenedKnownCount}
                        </p>
                        <p className="text-[11px] text-[#8A857C]">
                          {t("session_report.stat.screened_known")}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-[22px] font-semibold tabular-nums text-[#1A1A1A]">
                          {report.screenedUnknownCount}
                        </p>
                        <p className="text-[11px] text-[#8A857C]">
                          {t("session_report.stat.screened_unknown")}
                        </p>
                      </div>
                    </div>
                    <p className="mt-2 text-[11px] text-[#A4A097]">
                      {t("session_report.screen_total_inline", { total: screenTotal })}
                    </p>
                  </div>

                  <div className="rounded-2xl bg-white/55 px-3.5 py-3.5">
                    <p className="text-[11px] text-[#8A857C]">{t("session_report.dim.check")}</p>
                    <div className="mt-2.5 flex items-end justify-between gap-2">
                      <div>
                        <p className="text-[22px] font-semibold tabular-nums text-[#1A1A1A]">
                          {report.correctCount}
                        </p>
                        <p className="text-[11px] text-[#8A857C]">
                          {t("session_report.stat.remembered")}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-[22px] font-semibold tabular-nums text-[#1A1A1A]">
                          {report.forgotCount}
                        </p>
                        <p className="text-[11px] text-[#8A857C]">
                          {t("session_report.stat.forgot")}
                        </p>
                      </div>
                    </div>
                    <p className="mt-2 text-[11px] text-[#A4A097]">
                      {t("session_report.of_studied", { total: report.wordCount })}
                    </p>
                  </div>
                </div>

                {forgotWords.length > 0 ? (
                  <div className="rounded-2xl bg-white/50 px-3.5 py-3">
                    <p className="text-[11px] text-[#8A857C]">{t("session_report.dim.reinforce")}</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {forgotWords.map((w) => (
                        <span
                          key={w}
                          className="rounded-lg bg-white/75 px-2 py-1 text-[11px] text-[#37352F]"
                        >
                          {w}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}

                <div className="rounded-2xl bg-white/55 px-3.5 py-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[11px] text-[#8A857C]">{t("session_report.dim.note")}</p>
                    {noteBusy ? (
                      <span className="inline-flex items-center gap-1 text-[10px] text-[#A4A097]">
                        <Loader2 size={11} className="animate-spin" />
                        {t("session_report.writing_note")}
                      </span>
                    ) : null}
                  </div>
                  <div ref={noteBoxRef} className="mt-2 min-h-[72px]">
                    {noteShown.trim() ? (
                      <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-[#4A453C]">
                        {noteShown}
                        {noteBusy ? (
                          <span className="ml-0.5 inline-block h-[1em] w-[2px] translate-y-[2px] animate-pulse bg-[#37352F] align-baseline" />
                        ) : null}
                      </p>
                    ) : (
                      <p className="text-[13px] text-[#C2BDB3]">
                        {t("session_report.note_placeholder")}
                      </p>
                    )}
                  </div>
                  {aiError && aiError !== "llm_not_configured" ? (
                    <p className="mt-2 text-[11px] text-[var(--warning)]">
                      {t("session_report.ai_failed_hint")}
                    </p>
                  ) : null}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div
        className="fixed inset-x-0 bottom-0 z-20 px-4 pt-2"
        style={{ paddingBottom: "max(0.85rem, env(safe-area-inset-bottom))" }}
      >
        <div className="mx-auto flex max-w-lg items-center gap-3 rounded-2xl bg-white/85 p-2 shadow-[0_10px_30px_rgba(42,38,32,0.12)] backdrop-blur-md">
          <CloudButton
            type="button"
            variant="ghost"
            className="h-11 shrink-0 rounded-xl px-3.5 text-[#5C574F] hover:bg-black/5"
            onClick={() => void copyAll()}
            disabled={!report}
          >
            <Copy size={16} />
            {t("session_report.copy_content")}
          </CloudButton>
          <CloudButton
            type="button"
            variant="brand"
            className="h-11 flex-1 rounded-xl text-[15px] font-medium"
            onClick={goNext}
          >
            {t("session_report.continue")}
          </CloudButton>
        </div>
      </div>
    </div>
  );
}
