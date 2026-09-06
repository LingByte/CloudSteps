import { useNavigate } from "react-router";
import { Volume2, Check, X, BookOpen, PanelTop, ArrowRight } from "lucide-react";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { getReviewToday, startReviewSession, completeReviewSession } from "../api/review";
import { getLighthouseReviewWords, submitLighthouseReview } from "../api/study";
import { playFirstWordAudio, playWordAudio } from "../utils/audioPlayer";
import {
  PracticeFontSettingsButton,
  PRACTICE_TRANS_CLASS,
  PRACTICE_WORD_CLASS,
} from "../components/PracticeFontSettings";
import { CloudButton } from "../components/cloudsteps";
import { FlowPageShell } from "../components/PageTransition";
import { TopBar } from "../components/TopBar";
import { AudioMuteToggleButton } from "../components/AudioMuteToggleButton";
import { AnnotationLayer, AnnotationToggleButton } from "../components/AnnotationLayer";
import {
  WordCardPanel,
  WordMarkStatsBar,
  WordViewModeToggle,
  type WordViewMode,
} from "../components/WordMarkView";
import { WordDetailPanel } from "../components/WordDetailPanel";
import { nextWordTapState, syncDetailWordWithTap } from "../utils/wordReveal";
import { getReviewReturnPath } from "../utils/reviewPractice";
import { useSplitScreenNote } from "../hooks/useSplitScreenNote";
import { StudyNoteLauncher, StudyNotePanel } from "../components/StudyNotePanel";
import { useTranslation } from "react-i18next";
import { formatApiMessage } from "../utils/apiMessage";
import { normalizeSnowflakeId } from "../utils/json-snowflake";
import { invalidateLighthouseCache } from "../utils/lighthouseCache";

type ReviewWordItem = {
  id: number;
  word: string;
  translation?: string;
  audioUrl?: string;
  status: null | "correct" | "wrong";
  showTranslation?: boolean;
  heard?: boolean;
};

/** 将 translation 字段（可能是 JSON 数组字符串如 ["你好"]）转为可读文本 */
const formatTranslation = (raw?: string): string => {
  if (!raw) return "";
  try {
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) return arr.join("；");
    return String(arr);
  } catch {
    return raw;
  }
};

export default function ReviewWordList() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [words, setWords] = useState<ReviewWordItem[]>([]);
  const [annotationOpen, setAnnotationOpen] = useState(false);
  const [viewMode, setViewMode] = useState<WordViewMode>("list");
  const [cardIndex, setCardIndex] = useState(0);
  const [detailMode, setDetailMode] = useState(false);
  const [detailWord, setDetailWord] = useState<{ id: number; word: string } | null>(null);
  const {
    open: globalNoteOpen,
    setOpen: setGlobalNoteOpen,
    side: noteSide,
    setSide: setNoteSide,
    width: noteWidth,
    isDesktop,
    startResize: startNoteResize,
  } = useSplitScreenNote("lb_review_note_width");

  const wordBookId = useMemo(() => {
    const url = new URL(window.location.href);
    const qp = normalizeSnowflakeId(url.searchParams.get("wordBookId"));
    if (qp) return qp;
    return normalizeSnowflakeId(sessionStorage.getItem("lb_review_wordbook_id"));
  }, []);

  const reviewAll = useMemo(() => {
    const url = new URL(window.location.href);
    const v = url.searchParams.get("all");
    return v === "1" || v === "true";
  }, []);

  const lighthouseReview = useMemo(() => {
    const url = new URL(window.location.href);
    const v = url.searchParams.get("lighthouse");
    return v === "1" || v === "true";
  }, []);

  const [activeNoteKey, setActiveNoteKey] = useState(`study-note:global:${wordBookId}`);
  const [activeNoteTitle, setActiveNoteTitle] = useState(t("practice.free_note"));

  const openGlobalNote = () => {
    setActiveNoteKey(`study-note:global:${wordBookId}`);
    setActiveNoteTitle(t("practice.free_note"));
    setGlobalNoteOpen(true);
  };
  const openWordNote = (key: string, title: string) => {
    setActiveNoteKey(key);
    setActiveNoteTitle(title);
    setGlobalNoteOpen(true);
  };

  const reviewDate = useMemo(() => {
    const url = new URL(window.location.href);
    const qp = url.searchParams.get("date") || "";
    if (qp) return qp;
    return sessionStorage.getItem("lb_review_date") || "";
  }, []);

  const studySessionId = useMemo(() => {
    const url = new URL(window.location.href);
    const qp = Number(url.searchParams.get("studySessionId") || 0);
    if (qp > 0) return qp;
    return Number(sessionStorage.getItem("lb_review_study_session_id") || 0);
  }, []);

  const reviewStudentId = useMemo(() => {
    const url = new URL(window.location.href);
    const qp = url.searchParams.get("studentId") || "";
    if (qp) return qp;
    return sessionStorage.getItem("lb_review_student_id") || "";
  }, []);

  const viewOnly = useMemo(() => {
    const url = new URL(window.location.href);
    return url.searchParams.get("view") === "1";
  }, []);

  const [playingId, setPlayingId] = useState<number | null>(null);
  const abortRef = useRef<(() => void) | null>(null);

  const handlePlayAudio = (item: ReviewWordItem) => {
    if (!item.audioUrl) return;
    abortRef.current?.();
    setPlayingId(item.id);
    const abort = playWordAudio(item.audioUrl, 300, () => setPlayingId(null));
    abortRef.current = abort;
  };

  useEffect(() => {
    if (viewOnly) return;
    sessionStorage.setItem("lb_mode", "review");
  }, [viewOnly]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = lighthouseReview
          ? await getLighthouseReviewWords(wordBookId, {
              pageSize: 200,
              ...(reviewStudentId ? { studentId: reviewStudentId } : {}),
            })
          : await getReviewToday(wordBookId, {
              date: reviewDate || undefined,
              limit: 200,
              studySessionId: studySessionId > 0 ? studySessionId : undefined,
              all: reviewAll || undefined,
              ...(reviewStudentId ? { studentId: reviewStudentId } : {}),
            });
        const ws = Array.isArray(res.data?.words)
          ? (res.data.words as Array<{
              id: number;
              word: string;
              translation?: string;
              audioUrl?: string;
            }>)
          : [];
        const mapped: ReviewWordItem[] = ws.map((w) => ({
          id: Number(w.id),
          word: String(w.word || ""),
          translation: w.translation ? formatTranslation(String(w.translation)) : undefined,
          audioUrl: w.audioUrl ? String(w.audioUrl) : undefined,
          status: null,
          showTranslation: false,
          heard: false,
        }));
        if (!mounted) return;
        setWords(mapped);
      } catch {
        if (!mounted) return;
        setWords([]);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [wordBookId, reviewDate, studySessionId, reviewAll, reviewStudentId, lighthouseReview]);

  const handleBack = () => {
    if (window.history.length > 1) navigate(-1);
    else navigate(getReviewReturnPath("/word-training"));
  };

  const handleStatusClick = useCallback((id: number, newStatus: "correct" | "wrong") => {
    setHint(null);
    setWords((prev) =>
      prev.map((word) => {
        if (word.id !== id) return word;
        // 再点同一状态则取消勾选
        if (word.status === newStatus) return { ...word, status: null };
        return { ...word, status: newStatus };
      })
    );
  }, []);

  const handleWordClick = (item: ReviewWordItem) => {
    const next = nextWordTapState({
      showTranslation: !!item.showTranslation,
      heard: !!item.heard,
    });
    if (next.shouldPlay && item.audioUrl) {
      abortRef.current?.();
      setPlayingId(item.id);
      const abort = playFirstWordAudio(item.audioUrl, () => setPlayingId(null));
      abortRef.current = abort;
    }
    setWords((prev) =>
      prev.map((word) => {
        if (word.id === item.id) {
          return { ...word, heard: next.heard, showTranslation: next.showTranslation };
        }
        if (next.showTranslation) {
          return { ...word, showTranslation: false };
        }
        return word;
      })
    );
    setDetailWord(syncDetailWordWithTap(detailMode, next, { id: item.id, word: item.word }));
  };

  /** 批量：全部认识 */
  const markAllCorrect = () => {
    setHint(null);
    setWords((prev) => prev.map((w) => ({ ...w, status: "correct" as const })));
  };

  /** 清空标记 */
  const clearMarks = () => {
    setHint(null);
    setWords((prev) => prev.map((w) => ({ ...w, status: null })));
  };

  const [submitting, setSubmitting] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const markedWords = useMemo(() => words.filter((w) => w.status !== null), [words]);
  const markedCount = markedWords.length;
  const unmarkedCount = words.length - markedCount;
  const allMarked = words.length > 0 && unmarkedCount === 0;

  const handleSubmit = () => {
    if (submitting) return;
    if (words.length === 0) {
      setHint(t("practice.no_reviewable"));
      return;
    }
    if (!allMarked) {
      setHint(t("practice.unmarked_hint", { count: unmarkedCount }));
      return;
    }
    setHint(null);

    (async () => {
      setSubmitting(true);
      try {
        const results = markedWords.map((w) => ({
          wordId: w.id,
          remembered: w.status === "correct",
        }));

        if (lighthouseReview) {
          const res = await submitLighthouseReview(wordBookId, results, {
            ...(reviewStudentId ? { studentId: reviewStudentId } : {}),
          });
          if (res.code !== 200) {
            throw new Error(formatApiMessage(res.msg, "practice.submit_failed"));
          }
          invalidateLighthouseCache(wordBookId, reviewStudentId || undefined);
          navigate("/word-training", { replace: true });
          return;
        }

        const wordIds = markedWords.map((w) => w.id);
        const startRes = await startReviewSession({
          wordBookId,
          wordIds,
          ...(reviewStudentId ? { studentId: reviewStudentId } : {}),
        });
        const sid = Number(startRes.data?.sessionId || 0);
        if (!sid) {
          setHint(t("practice.no_review_return"));
          setSubmitting(false);
          handleBack();
          return;
        }

        const res = await completeReviewSession(sid, results);
        if (res.code !== 200) {
          throw new Error(formatApiMessage(res.msg, "practice.submit_failed"));
        }
        const returnPath = getReviewReturnPath("/word-training");
        sessionStorage.removeItem("lb_review_return");
        if (sessionStorage.getItem("lb_mode") === "review") {
          sessionStorage.removeItem("lb_mode");
        }
        navigate(returnPath, { replace: true });
      } catch {
        setHint(t("practice.submit_review_failed"));
        setSubmitting(false);
      }
    })();
  };

  const correctCount = words.filter((word) => word.status === "correct").length;
  const wrongCount = words.filter((word) => word.status === "wrong").length;

  return (
    <FlowPageShell className="min-h-dvh bg-[#F7F9FC] pb-[max(7.5rem,env(safe-area-inset-bottom))]">
      <TopBar
        title={viewOnly ? t("practice.view") : t("practice.start_review")}
        onBack={handleBack}
        rightSlot={
          <div className="flex items-center gap-0.5">
            <CloudButton type="button" variant="ghost" size="iconRound" onClick={() => setGlobalNoteOpen(true)} aria-label={t("practice.open_free_note")} title={t("practice.open_free_note")}><PanelTop size={18} className="text-[#c45c78]" /></CloudButton>
            <AudioMuteToggleButton />
            <AnnotationToggleButton
              active={annotationOpen}
              onClick={() => setAnnotationOpen((v) => !v)}
            />
            <PracticeFontSettingsButton />
          </div>
        }
      />

      <AnnotationLayer
        storageKey={`review-list:${wordBookId}`}
        open={annotationOpen}
        onOpenChange={setAnnotationOpen}
      />

      {/* Split container: word content + note panel on the same layer. */}
      <div className={`box-border min-h-[calc(100dvh-11rem)] px-4 mt-6 w-full ${globalNoteOpen && isDesktop ? "pb-4 lg:flex lg:gap-2 lg:max-w-none lg:px-2" : "pb-28 max-w-2xl lg:max-w-5xl mx-auto"}`} style={globalNoteOpen && isDesktop ? { height: "calc(100dvh - 3.5rem - 7.5rem)" } : undefined}>
        {/* Word content pane */}
        <div className={`${globalNoteOpen && isDesktop ? "lg:flex lg:flex-1 lg:min-w-0 lg:flex-col lg:overflow-y-auto" : ""} ${globalNoteOpen && isDesktop && noteSide === "right" ? "" : globalNoteOpen && isDesktop ? "lg:order-2" : ""}`}>
          <div className="mb-3">
            <p className="text-[#718096] text-sm">
              {lighthouseReview
                ? t("practice.lighthouse_review_hint", { count: words.length })
                : viewOnly
                  ? t("lighthouse_words.total_words", { count: words.length })
                  : t("practice.optional_words", { count: words.length })}
            </p>
            {words.length === 0 && (
              <p className="text-xs text-amber-600 mt-1">
                {lighthouseReview ? t("practice.no_learned_words") : t("practice.no_words_today")}
              </p>
            )}
          </div>

        {!viewOnly && (
          <WordMarkStatsBar
            correctCount={correctCount}
            wrongCount={wrongCount}
            total={words.length}
          />
        )}

        {viewMode === "card" ? (
          <div className="mt-3">
            <WordCardPanel
              words={words}
              index={cardIndex}
              onIndexChange={setCardIndex}
              playingId={playingId}
              onPlay={handlePlayAudio}
              onWordClick={handleWordClick}
              onStatus={handleStatusClick}
              hideStatus={viewOnly}
              amplifyDetail={detailMode}
              onDetailClose={() => setDetailWord(null)}
              noteStorageKey={(word) => `study-note:word:${wordBookId}:${word.id}`}
            />
          </div>
        ) : (
          <div className={globalNoteOpen && isDesktop ? "min-h-0 flex-1 overflow-y-auto space-y-2.5 mt-3" : "space-y-2.5 mt-3"}>
            {words.map((item, index) => {
              return (
                <div
                  key={item.id}
                  className={`bg-white rounded-xl p-3.5 shadow-sm border border-transparent transition-all hover:shadow-md hover:border-[#4ECDC4]/35 ${
                    item.status === "correct"
                      ? "border-2 border-[#4ECDC4] bg-[#4ECDC4]/[0.06] hover:border-[#4ECDC4]"
                      : item.status === "wrong"
                      ? "border-2 border-[#FF6B6B] bg-[#FF6B6B]/5 hover:border-[#FF6B6B]"
                      : ""
                  }`}
                >
                  <div className="flex flex-row items-center justify-between gap-2">
                    <div className="flex min-w-0 flex-1 items-start gap-2.5">
                      <span className="text-[#A0AEC0] text-xs mt-1 tabular-nums w-5 shrink-0">
                        {index + 1}
                      </span>
                      <div
                        className="flex-1 min-w-0 cursor-pointer"
                        onClick={() => handleWordClick(item)}
                      >
                        <h3
                          className={`${PRACTICE_WORD_CLASS} !font-semibold hover:text-[#4ECDC4] transition-colors break-all`}
                        >
                          {item.word}
                        </h3>
                        {item.showTranslation && item.translation && (
                          <p
                            className={`${PRACTICE_TRANS_CLASS} mt-1.5 animate-in fade-in slide-in-from-top-1`}
                          >
                            {item.translation}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1 sm:gap-2 -mr-1 sm:mr-0">
                      <div onClick={(e) => e.stopPropagation()}>
                        <StudyNoteLauncher
                          storageKey={`study-note:word:${wordBookId}:${item.id}`}
                          title={t("practice.note_title", { word: item.word })}
                          label={t("practice.note")}
                          className="h-9 px-2"
                          onOpen={() => openWordNote(`study-note:word:${wordBookId}:${item.id}`, t("practice.note_title", { word: item.word }))}
                        />
                      </div>
                      <CloudButton
                        type="button"
                        variant="ghost"
                        size="iconRound"
                        onClick={() => handlePlayAudio(item)}
                        className={`size-8 sm:size-9 ${playingId === item.id ? "text-[#4ECDC4]" : "text-[#55A3FF]"}`}
                      >
                        <Volume2 size={18} className={playingId === item.id ? "animate-pulse" : ""} />
                      </CloudButton>
                      {!viewOnly && (
                        <>
                          <CloudButton
                            type="button"
                            variant={item.status === "correct" ? "mint" : "ghost"}
                            size="iconRound"
                            className="size-8 sm:size-9"
                            onClick={() => handleStatusClick(item.id, "correct")}
                          >
                            <Check size={18} />
                          </CloudButton>
                          <CloudButton
                            type="button"
                            variant={item.status === "wrong" ? "destructive" : "ghost"}
                            size="iconRound"
                            className="size-8 sm:size-9"
                            onClick={() => handleStatusClick(item.id, "wrong")}
                          >
                            <X size={18} />
                          </CloudButton>
                        </>
                      )}
                    </div>
                  </div>
                  {detailMode && item.showTranslation && (
                    <div className="mt-3 pt-3 border-t border-[#E2E8F0]" onClick={(e) => e.stopPropagation()}>
                      <WordDetailPanel
                        wordId={item.id}
                        wordText={item.word}
                        variant="inline"
                        onClose={() => setDetailWord(null)}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        </div>

        {/* Note panel pane — same layer as word content (desktop split only) */}
        {globalNoteOpen && isDesktop && (
          <>
            {/* Drag handle between word content and note panel */}
            <div
              className={`group hidden lg:flex lg:items-center lg:justify-center lg:cursor-ew-resize lg:touch-none lg:select-none ${noteSide === "right" ? "lg:order-2" : "lg:order-1"}`}
              style={{ width: "10px", flexShrink: 0 }}
              onPointerDown={startNoteResize}
              title={t("practice.resize_free_note")}
              aria-label={t("practice.resize_free_note")}
            >
              <span className="h-16 w-1 rounded-full bg-[#A0AEC0]/30 group-hover:bg-[#4ECDC4]/60 group-hover:w-1.5 transition-all" />
            </div>
            <div
              className={`lg:flex lg:flex-col ${noteSide === "right" ? "lg:order-3" : "lg:order-1"}`}
              style={{ width: `${noteWidth}px`, flexShrink: 0 }}
            >
              <StudyNotePanel
                open={globalNoteOpen}
                onClose={() => setGlobalNoteOpen(false)}
                storageKey={activeNoteKey}
                title={activeNoteTitle}
                side={noteSide}
                split
                onSideChange={setNoteSide}
              />
            </div>
          </>
        )}
      </div>

      {/* Mobile: note panel as floating overlay */}
      {globalNoteOpen && !isDesktop && (
        <StudyNotePanel
          open={globalNoteOpen}
          onClose={() => setGlobalNoteOpen(false)}
          storageKey={activeNoteKey}
          title={activeNoteTitle}
          side={noteSide}
          onSideChange={setNoteSide}
        />
      )}
      <div className="fixed bottom-0 left-0 right-0 z-20 bg-white border-t border-[#E2E8F0] px-3 sm:px-4 py-1.5 sm:py-2 shadow-lg">
        <div className="max-w-2xl lg:max-w-5xl mx-auto w-full space-y-2.5">
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            {!viewOnly && (
              <>
                <CloudButton type="button" variant="outline" size="pill" onClick={markAllCorrect} className="max-sm:px-2 max-sm:text-xs">
                  {t("practice.mark_all_known")}
                </CloudButton>
                <CloudButton
                  type="button"
                  variant="ghost"
                  size="pill"
                  onClick={clearMarks}
                  disabled={markedCount === 0}
                  className="max-sm:px-2 max-sm:text-xs"
                >
                  {t("practice.clear")}
                </CloudButton>
              </>
            )}
            <div className="flex-1" />
            <CloudButton
              type="button"
              variant={globalNoteOpen ? "brand" : "outline"}
              size="pill"
              onClick={() => (globalNoteOpen ? setGlobalNoteOpen(false) : openGlobalNote())}
              aria-label={t("practice.open_free_note")}
              className="max-sm:px-2 max-sm:text-xs"
            >
              <PanelTop size={15} className={globalNoteOpen ? "text-white" : "text-[#c45c78]"} />
              <span className="hidden sm:inline">{t("practice.free_note")}</span>
            </CloudButton>
            <WordViewModeToggle mode={viewMode} onChange={setViewMode} />
            <CloudButton
              type="button"
              variant={detailMode ? "brand" : "outline"}
              size="pill"
              onClick={() => {
                setDetailMode((v) => {
                  if (v) setDetailWord(null);
                  return !v;
                });
              }}
              className="max-sm:px-2 max-sm:text-xs"
            >
              <BookOpen size={15} />
              <span className="hidden sm:inline">{t("practice.expand")}</span>
            </CloudButton>
          </div>
          {!viewOnly && (
            <>
              <div className="flex items-center gap-1.5 sm:gap-2 w-full">
                <CloudButton
                  type="button"
                  variant="brand"
                  size="pill"
                  onClick={handleSubmit}
                  disabled={submitting || !allMarked}
                  loading={submitting}
                  loadingText={t("practice.submitting")}
                  className={`hidden sm:flex flex-1 min-w-0 truncate ${!allMarked && words.length > 0 ? "opacity-80" : ""}`}
                >
                  {t("practice.submit_review")}
                  {words.length > 0 ? ` (${markedCount}/${words.length})` : ""}
                </CloudButton>
              </div>
              {hint && (
                <p className="text-center text-xs text-amber-600 px-1 animate-in fade-in">{hint}</p>
              )}
              {!hint && !allMarked && words.length > 0 && (
                <p className="text-center text-xs text-[#FF6B6B]">
                  {t("practice.unmarked_hint", { count: unmarkedCount })}
                </p>
              )}
              {!hint && allMarked && words.length > 0 && (
                <p className="text-center text-xs text-[#A0AEC0]">
                  {t("practice.all_marked_submit")}
                </p>
              )}
            </>
          )}
        </div>
      </div>

      {!viewOnly && (
        <CloudButton
          type="button"
          variant="brand"
          size="iconRound"
          onClick={handleSubmit}
          disabled={!allMarked || submitting}
          className="fixed right-3 bottom-16 z-50 size-11 shadow-lg sm:hidden"
          aria-label={t("practice.submit_review")}
        >
          <ArrowRight size={20} />
        </CloudButton>
      )}

    </FlowPageShell>
  );
}
