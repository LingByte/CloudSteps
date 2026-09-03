import { Volume2, Check, X, BookOpen, Shuffle, PanelTop, Type, ArrowRight } from "lucide-react";
import { useNavigate } from "react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { AnnotationLayer } from "../components/AnnotationLayer";
import { PRACTICE_TRANS_CLASS, PRACTICE_WORD_CLASS } from "../components/PracticeFontSettings";
import { PracticeFlowToolbar } from "../components/PracticeFlowToolbar";
import { CloudButton } from "../components/cloudsteps";
import { FlowPageShell } from "../components/PageTransition";
import { TopBar } from "../components/TopBar";
import {
  WordCardPanel,
  WordMarkStatsBar,
  WordViewModeToggle,
  isWordCardTapped,
  markWordCardClass,
  markWordCardStyle,
  type WordViewMode,
} from "../components/WordMarkView";
import { WordDetailPanel } from "../components/WordDetailPanel";

import { StudyNoteSplitLayout } from "../components/StudyNoteSplitLayout";
import { applyUserWordView } from "../components/WordEditControls";
import { useSplitScreenNote } from "../hooks/useSplitScreenNote";
import { completeStudySession } from "../api/study";
import { completeReviewSession } from "../api/review";
import { playFirstWordAudio, playWordAudio } from "../utils/audioPlayer";
import { formatTranslation, pickPhoneticDisplay } from "../utils/wordFormat";
import { nextWordTapState, syncDetailWordWithTap } from "../utils/wordReveal";
import { stampLessonPracticeWindow, finishPracticeBilling } from "../utils/practiceBilling";
import { allowPracticeLeaveOnce, requestPracticePauseMenu } from "../utils/practiceFlowLock";
import { normalizeSnowflakeId } from "../utils/json-snowflake";
import {
  clearStudyRecheck,
  getCheckPhaseLabel,
  getMilestoneCheckBatchRange,
  getStudyPendingAction,
  getStudyRecheckFrom,
  getStudyRecheckWords,
  getTotalBatches,
  needsFinalCheckAfterMilestone,
  setStudyRetryWords,
  sliceWordsByBatches,
  STUDY_RECHECK_WORDS_KEY,
  type StudyCheckPhase,
} from "../utils/studyBatchFlow";
import { clearReviewPracticeSession, getReviewReturnPath } from "../utils/reviewPractice";
import { formatApiMessage } from "../utils/apiMessage";
import { showToast } from "../utils/toast";

type CheckWord = {
  id: number;
  word: string;
  phonetic?: string;
  translation?: string;
  audioUrl?: string;
  status: null | "correct" | "wrong";
  showTranslation?: boolean;
  heard?: boolean;
};

const CHECK_PHASE_KEY = "lb_study_check_phase";

function getStudyBatchMeta(batchIdx: number) {
  let totalBatches = 1;
  try {
    const raw = sessionStorage.getItem("lb_study_words") || "[]";
    const arr = JSON.parse(raw);
    const total = Array.isArray(arr) ? arr.length : 0;
    totalBatches = getTotalBatches(total);
    sessionStorage.setItem("lb_study_total_batches", String(totalBatches));
  } catch {
    totalBatches = Math.max(1, Number(sessionStorage.getItem("lb_study_total_batches") || 1));
  }
  const safeBatchIdx = Math.min(Math.max(0, batchIdx), totalBatches - 1);
  if (safeBatchIdx !== batchIdx) {
    sessionStorage.setItem("lb_study_batch_idx", String(safeBatchIdx));
  }
  const currentBatch = safeBatchIdx + 1;
  const hasMoreBatches = currentBatch < totalBatches;
  return {
    totalBatches,
    batchIdx: safeBatchIdx,
    currentBatch,
    hasMoreBatches,
    isLastBatch: !hasMoreBatches,
  };
}

export default function PostTrainingCheck() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [words, setWords] = useState<CheckWord[]>([]);
  const [annotationOpen, setAnnotationOpen] = useState(false);
  const [viewMode, setViewMode] = useState<WordViewMode>("list");
  const [cardIndex, setCardIndex] = useState(0);
  const [detailMode, setDetailMode] = useState(false);
  const [detailWord, setDetailWord] = useState<{ id: number; word: string } | null>(null);
  const [spellMode, setSpellMode] = useState(false);
  const [spellRevealed, setSpellRevealed] = useState<Set<number>>(new Set());
  const [spellTarget, setSpellTarget] = useState<CheckWord | null>(null);
  const [spellInput, setSpellInput] = useState("");
  const [spellResult, setSpellResult] = useState<"correct" | "wrong" | null>(null);

  const mode = useMemo(() => sessionStorage.getItem("lb_mode") || "study", []);
  const wordBookId = useMemo(() => Number(sessionStorage.getItem("lb_wordbook_id") || 0), []);
  const note = useSplitScreenNote("lb_posttraining_note_width");

  const batchIdx = useMemo(() => {
    const key = mode === "review" ? "lb_review_batch_idx" : "lb_study_batch_idx";
    return Number(sessionStorage.getItem(key) || 0);
  }, [mode]);

  const readCheckPhase = (): StudyCheckPhase => {
    if (mode === "review") return "milestone";
    const p = sessionStorage.getItem(CHECK_PHASE_KEY);
    return p === "final" ? "final" : "milestone";
  };

  const [checkPhase, setCheckPhase] = useState<StudyCheckPhase>(readCheckPhase);

  const sessionId = useMemo(() => {
    const key = mode === "review" ? "lb_review_session_id" : "lb_study_session_id";
    return normalizeSnowflakeId(sessionStorage.getItem(key));
  }, [mode]);

  const [submitting, setSubmitting] = useState(false);
  const [playingId, setPlayingId] = useState<number | null>(null);
  const abortRef = useRef<(() => void) | null>(null);

  const batchInfo = useMemo(() => {
    if (mode === "review") {
      return {
        totalBatches: 1,
        batchIdx: 0,
        hasMoreBatches: false,
        isLastBatch: true,
        currentBatch: 1,
      };
    }
    return getStudyBatchMeta(batchIdx);
  }, [batchIdx, mode]);

  const effectiveBatchIdx = mode === "review" ? batchIdx : batchInfo.batchIdx;
  const isRecheckMode = getStudyRecheckWords() !== null;

  const phaseLabels = useMemo(() => {
    if (isRecheckMode) {
      const n = getStudyRecheckWords()?.length ?? 0;
      return {
        title: t("practice.recheck_title"),
        hint: t("practice.recheck_hint", { count: n }),
      };
    }
    return getCheckPhaseLabel(checkPhase, effectiveBatchIdx, batchInfo.totalBatches);
  }, [checkPhase, effectiveBatchIdx, batchInfo.totalBatches, isRecheckMode]);

  const handlePlayAudio = (word: CheckWord) => {
    if (!word.audioUrl) return;
    abortRef.current?.();
    setPlayingId(word.id);
    const abort = playWordAudio(word.audioUrl, 300, () => setPlayingId(null));
    abortRef.current = abort;
  };

  const openSpellDialog = (word: CheckWord) => {
    setSpellTarget(word);
    setSpellInput("");
    setSpellResult(null);
  };

  const toggleSpellRevealed = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setSpellRevealed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const closeSpellDialog = () => {
    setSpellTarget(null);
    setSpellInput("");
    setSpellResult(null);
  };

  const handleSpellSubmit = () => {
    if (!spellTarget) return;
    const isCorrect = spellInput.trim().toLowerCase() === spellTarget.word.trim().toLowerCase();
    setSpellResult(isCorrect ? "correct" : "wrong");
    if (isCorrect) {
      setSpellRevealed((prev) => new Set(prev).add(spellTarget.id));
      handleStatusClick(spellTarget.id, "correct");
    } else {
      handleStatusClick(spellTarget.id, "wrong");
    }
  };

  const handleBack = () => {
    if (mode === "review") {
      requestPracticePauseMenu();
      return;
    }
    requestPracticePauseMenu();
  };

  useEffect(() => {
    try {
      const recheckList = mode === "study" ? getStudyRecheckWords() : null;
      let slice: any[];
      if (recheckList) {
        slice = recheckList;
      } else {
        const wordsKey = mode === "review" ? "lb_review_words" : "lb_study_words";
        const raw = sessionStorage.getItem(wordsKey) || "[]";
        const parsed = JSON.parse(raw);
        const all: any[] = Array.isArray(parsed) ? parsed : [];
        if (mode === "review") {
          slice = all;
        } else if (checkPhase === "final") {
          slice = all;
        } else {
          const { startBatch, endBatch } = getMilestoneCheckBatchRange(
            effectiveBatchIdx,
            batchInfo.totalBatches
          );
          slice = sliceWordsByBatches(all, startBatch, endBatch);
        }
      }
      const mapped: CheckWord[] = slice.map((w: any) => ({
        id: Number(w.id),
        word: String(w.word || ""),
        phonetic: pickPhoneticDisplay(w),
        translation: w.translation ? formatTranslation(String(w.translation)) : undefined,
        audioUrl: w.audioUrl ? String(w.audioUrl) : undefined,
        status: null,
        showTranslation: false,
        heard: false,
      }));
      setWords(mapped);
    } catch {
      // ignore
    }
  }, [effectiveBatchIdx, batchInfo.totalBatches, mode, checkPhase, isRecheckMode]);

  const handleStatusClick = (id: number, newStatus: "correct" | "wrong") => {
    setWords((prev) =>
      prev.map((word) => {
        if (word.id !== id) return word;
        // 已选状态再次点击同一按钮：保持选中，避免误触取消导致无法提交
        if (word.status === newStatus) return word;
        return { ...word, status: newStatus };
      })
    );
  };

  const handleWordClick = (word: CheckWord) => {
    if (spellMode) {
      openSpellDialog(word);
      return;
    }
    const next = nextWordTapState({
      showTranslation: !!word.showTranslation,
      heard: !!word.heard,
    });
    if (next.shouldPlay && word.audioUrl) {
      abortRef.current?.();
      setPlayingId(word.id);
      const abort = playFirstWordAudio(word.audioUrl, () => setPlayingId(null));
      abortRef.current = abort;
    }
    setWords((prev) =>
      prev.map((w) => {
        if (w.id === word.id) {
          return { ...w, heard: next.heard, showTranslation: next.showTranslation };
        }
        // 只亮当前点的词：清掉其它词的点词状态
        return { ...w, heard: false, showTranslation: false };
      })
    );
    setDetailWord(syncDetailWordWithTap(detailMode, next, word));
  };

  const handleShuffle = () => {
    setWords((prev) => [...prev].sort(() => Math.random() - 0.5));
    setCardIndex(0);
  };

  const markNextFive = (status: "correct" | "wrong") => {
    setWords((prev) => {
      let remaining = 5;
      return prev.map((word) => {
        if (remaining <= 0 || word.status !== null) return word;
        remaining -= 1;
        return { ...word, status };
      });
    });
  };

  const appendMilestoneResults = (results: { wordId: number; remembered: boolean }[]) => {
    try {
      const raw = sessionStorage.getItem("lb_study_batch_results") || "[]";
      const prev = Array.isArray(JSON.parse(raw)) ? JSON.parse(raw) : [];
      const byId = new Map<number, { wordId: number; remembered: boolean }>();
      for (const r of prev) byId.set(r.wordId, r);
      for (const r of results) byId.set(r.wordId, r);
      sessionStorage.setItem("lb_study_batch_results", JSON.stringify([...byId.values()]));
    } catch {
      sessionStorage.setItem("lb_study_batch_results", JSON.stringify(results));
    }
  };

  const goToFinalCheck = () => {
    sessionStorage.setItem(CHECK_PHASE_KEY, "final");
    setCheckPhase("final");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const goNextBatch = () => {
    const nextIdx = effectiveBatchIdx + 1;
    if (nextIdx >= batchInfo.totalBatches) {
      goToFinalCheck();
      return;
    }
    sessionStorage.setItem("lb_study_batch_idx", String(nextIdx));
    navigate("/word-practice", { replace: true });
  };

  const finishTrainingAndCreateReview = () => {
    sessionStorage.removeItem("lb_study_batch_idx");
    sessionStorage.removeItem("lb_study_batch_results");
    sessionStorage.removeItem("lb_study_total_batches");
    sessionStorage.removeItem(CHECK_PHASE_KEY);
    clearStudyRecheck();
    // 整段识记练完 → 抗遗忘；并结算本段练习额度
    stampLessonPracticeWindow();
    allowPracticeLeaveOnce();
    void finishPracticeBilling().finally(() => {
      navigate("/create-anti-forgetting", { replace: true });
    });
  };

  const wrongWords = useMemo(() => words.filter((w) => w.status === "wrong"), [words]);
  const allMarked = useMemo(() => words.length > 0 && words.every((w) => w.status !== null), [words]);

  const submitLabel = useMemo(() => {
    if (mode === "review") return t("practice.complete_review");
    if (wrongWords.length > 0) return t("practice.retry_wrong", { count: wrongWords.length });
    if (isRecheckMode) {
      const pending = getStudyPendingAction();
      if (pending === "final_check" && getStudyRecheckFrom() === "milestone") {
        return t("practice.submit_post_check");
      }
      if (pending === "next_batch") return t("practice.submit_next_batch");
      if (checkPhase === "final") return t("practice.submit_finish");
      return t("practice.submit_continue");
    }
    if (checkPhase === "final") return t("practice.submit_finish");
    if (needsFinalCheckAfterMilestone(effectiveBatchIdx, batchInfo.totalBatches)) {
      return t("practice.submit_post_check");
    }
    return t("practice.submit_next_batch");
  }, [mode, checkPhase, effectiveBatchIdx, batchInfo.totalBatches, wrongWords.length, isRecheckMode]);

  const sendWrongWordsToFlashRetry = (pending: "next_batch" | "final_check") => {
    try {
      const raw = sessionStorage.getItem("lb_study_words") || "[]";
      const all: unknown[] = JSON.parse(raw);
      const list = Array.isArray(all) ? all : [];
      const wrongIds = new Set(wrongWords.map((w) => Number(w.id)));
      const retryPayload = list.filter((w) => {
        const id = typeof w === "object" && w && "id" in w ? Number((w as { id?: number | string }).id) : NaN;
        return wrongIds.has(id);
      });
      if (retryPayload.length === 0) {
        console.error("错词重练列表为空，请检查单词 ID", wrongWords);
        alert(t("practice.wrong_data_error"));
        return;
      }
      const from = checkPhase === "final" || isRecheckMode && getStudyRecheckFrom() === "final"
        ? "final"
        : "milestone";
      sessionStorage.removeItem(STUDY_RECHECK_WORDS_KEY);
      setStudyRetryWords(retryPayload, pending, from);
      navigate("/flash-review", { replace: true });
    } catch {
      navigate("/flash-review", { replace: true });
    }
  };

  const finishRecheckAndContinue = () => {
    const pending = getStudyPendingAction();
    const from = getStudyRecheckFrom();
    clearStudyRecheck();
    const shouldFinal =
      pending === "final_check" ||
      needsFinalCheckAfterMilestone(effectiveBatchIdx, batchInfo.totalBatches);
    if (shouldFinal && from !== "final") {
      goToFinalCheck();
      return;
    }
    if (pending === "next_batch" && !shouldFinal) {
      goNextBatch();
      return;
    }
    if (shouldFinal && from === "final") {
      finishTrainingAndCreateReview();
      return;
    }
    goToFinalCheck();
  };

  const handleSubmit = () => {
    if (!allMarked) return;

    const results = words.map((w) => ({
      wordId: w.id,
      remembered: w.status === "correct",
    }));

    (async () => {
      setSubmitting(true);
      try {
        if (mode === "review") {
          if (sessionId && sessionId !== "0") {
            const res = await completeReviewSession(sessionId, results);
            if (res.code !== 200) {
              throw new Error(formatApiMessage(res.msg, "practice.submit_failed"));
            }
          }
          const returnPath = getReviewReturnPath("/word-training");
          clearReviewPracticeSession();
          allowPracticeLeaveOnce();
          navigate(returnPath, { replace: true });
          return;
        }

        if (wrongWords.length > 0) {
          appendMilestoneResults(results);
          if (isRecheckMode) {
            const pending = getStudyPendingAction() ?? "next_batch";
            sendWrongWordsToFlashRetry(pending);
            return;
          }
          if (checkPhase === "final") {
            sendWrongWordsToFlashRetry("final_check");
            return;
          }
          const pending = needsFinalCheckAfterMilestone(effectiveBatchIdx, batchInfo.totalBatches)
            ? "final_check"
            : "next_batch";
          sendWrongWordsToFlashRetry(pending);
          return;
        }

        if (isRecheckMode) {
          appendMilestoneResults(results);
          if (sessionId && getStudyRecheckFrom() === "final") {
            try {
              const raw = sessionStorage.getItem("lb_study_batch_results") || "[]";
              const allResults = JSON.parse(raw);
              await completeStudySession(
                sessionId,
                Array.isArray(allResults) ? allResults : results
              );
            } catch {
              await completeStudySession(sessionId, results);
            }
          }
          finishRecheckAndContinue();
          return;
        }

        if (checkPhase === "milestone") {
          appendMilestoneResults(results);
          if (needsFinalCheckAfterMilestone(effectiveBatchIdx, batchInfo.totalBatches)) {
            goToFinalCheck();
            return;
          }
          goNextBatch();
          return;
        }

        if (sessionId) {
          const res = await completeStudySession(sessionId, results);
          if (res.code !== 200) {
            throw new Error(formatApiMessage(res.msg, "practice.submit_failed"));
          }
        } else {
          throw new Error(t("practice.session_not_ready"));
        }
        finishTrainingAndCreateReview();
      } catch (e: unknown) {
        const msg =
          e instanceof Error
            ? e.message
            : e && typeof e === "object" && "msg" in e
              ? formatApiMessage(String((e as { msg: string }).msg), "practice.submit_failed")
              : t("practice.submit_failed");
        showToast.error(msg);
      } finally {
        setSubmitting(false);
      }
    })();
  };

  const correctCount = words.filter((word) => word.status === "correct").length;
  const wrongCount = words.filter((word) => word.status === "wrong").length;

  return (
    <FlowPageShell>
      <TopBar
        title={mode === "review" ? t("practice.start_review") : phaseLabels.title}
        onBack={handleBack}
        rightSlot={
          <PracticeFlowToolbar
            annotationOpen={annotationOpen}
            onToggleAnnotation={() => setAnnotationOpen((v) => !v)}
            wordCount={words.length}
            onWordPatched={(view) => setWords((prev) => applyUserWordView(prev, view))}
          />
        }
      />

      <AnnotationLayer
        storageKey={`post-check:${mode}:${checkPhase}:${batchIdx}`}
        open={annotationOpen}
        onOpenChange={setAnnotationOpen}
      />

      <StudyNoteSplitLayout
        open={note.open}
        isDesktop={note.isDesktop}
        side={note.side}
        width={note.width}
        storageKey={`study-note:global:${wordBookId}`}
        onClose={() => note.setOpen(false)}
        onSideChange={note.setSide}
        onResize={note.startResize}
      >
        <div className="pb-28 md:pb-20">
        <WordMarkStatsBar
          correctCount={correctCount}
          wrongCount={wrongCount}
          total={words.length}
        />
        {viewMode === "card" ? (
          <WordCardPanel
            words={words}
            index={cardIndex}
            onIndexChange={setCardIndex}
            playingId={playingId}
            onPlay={handlePlayAudio}
            onWordClick={handleWordClick}
            onStatus={handleStatusClick}
            amplifyDetail={detailMode}
            onDetailClose={() => setDetailWord(null)}
            noteStorageKey={(word) => `study-note:word:${wordBookId}:${word.id}`}
          />
        ) : (
          <div className="space-y-3 mb-6">
            {words.map((word) => (
              <div
                key={word.id}
                className={`rounded-xl p-4 shadow-sm transition-all cursor-pointer ${markWordCardClass(
                  word.status,
                  isWordCardTapped(word, playingId, word.id)
                )}`}
                style={markWordCardStyle(word.status, isWordCardTapped(word, playingId, word.id))}
                onClick={() => handleWordClick(word)}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="min-w-0">
                    {spellMode ? (
                      <span
                        className="inline-block"
                        onClick={(e) => toggleSpellRevealed(word.id, e)}
                      >
                        {spellRevealed.has(word.id) ? (
                          <span className={`${PRACTICE_WORD_CLASS} hover:text-[#4ECDC4] transition-colors`}>
                            {word.word}
                          </span>
                        ) : (
                          <span
                            className={`${PRACTICE_WORD_CLASS} inline-block select-none rounded-sm bg-[#4ECDC4] align-text-bottom`}
                            style={{
                              width: `${Math.max(3, Math.min(12, word.word.length))}ch`,
                              height: "1.1em",
                            }}
                          />
                        )}
                      </span>
                    ) : (
                      <span className={`${PRACTICE_WORD_CLASS} hover:text-[#4ECDC4] transition-colors`}>
                        {word.word}
                      </span>
                    )}
                    {word.showTranslation && (
                      <div className="mt-1 animate-in fade-in slide-in-from-top-1">
                        {word.phonetic ? (
                          <p className="text-sm text-[#718096] font-mono">{word.phonetic}</p>
                        ) : null}
                        {word.translation ? (
                          <p className={PRACTICE_TRANS_CLASS}>{word.translation}</p>
                        ) : null}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 sm:gap-3 -mr-1 sm:mr-0">
                  <CloudButton
                    type="button"
                    variant="ghost"
                    size="iconRound"
                    className="size-8 sm:size-9"
                    onClick={(e) => {
                      e.stopPropagation();
                      handlePlayAudio(word);
                      setWords((prev) =>
                        prev.map((w) =>
                          w.id === word.id
                            ? { ...w, heard: true }
                            : { ...w, heard: false, showTranslation: false }
                        )
                      );
                    }}
                  >
                    <Volume2
                      size={18}
                      className={playingId === word.id ? "text-[#4ECDC4] animate-pulse" : "text-[#4ECDC4]"}
                    />
                  </CloudButton>
                  <CloudButton
                    type="button"
                    variant={word.status === "correct" ? "mint" : "ghost"}
                    size="iconRound"
                    className="size-8 sm:size-9"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleStatusClick(word.id, "correct");
                    }}
                  >
                    <Check size={18} />
                  </CloudButton>
                  <CloudButton
                    type="button"
                    variant={word.status === "wrong" ? "destructive" : "ghost"}
                    size="iconRound"
                    className="size-8 sm:size-9"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleStatusClick(word.id, "wrong");
                    }}
                  >
                    <X size={18} />
                  </CloudButton>
                </div>
                </div>
                {detailMode && word.showTranslation && (
                  <WordDetailPanel
                    wordId={word.id}
                    wordText={word.word}
                    variant="inline"
                    onClose={() => setDetailWord(null)}
                  />
                )}
              </div>
            ))}
          </div>
        )}
        </div>
      </StudyNoteSplitLayout>

      <div className="fixed bottom-0 left-0 right-0 z-20 bg-white border-t border-[#E2E8F0] px-3 sm:px-4 py-1.5 sm:py-2 shadow-lg">
        <div className="max-w-2xl lg:max-w-5xl mx-auto w-full">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between md:gap-3">
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
              <CloudButton
                type="button"
                variant={note.open ? "brand" : "outline"}
                size="pill"
                onClick={() => note.setOpen((value) => !value)}
                aria-label={t("practice.open_free_note")}
                title={t("practice.open_free_note")}
                className="max-sm:px-2 max-sm:text-xs"
              >
                <PanelTop size={15} className={note.open ? "text-white" : "text-[#c45c78]"} />
              <span className="hidden sm:inline">{t("practice.free_note")}</span>
              </CloudButton>
              <WordViewModeToggle mode={viewMode} onChange={setViewMode} />
              <CloudButton variant="outline" size="pill" onClick={handleShuffle} className="max-sm:px-2 max-sm:text-xs">
                <Shuffle size={15} />
              <span className="hidden sm:inline">{t("practice.shuffle")}</span>
              </CloudButton>
              <CloudButton
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
              <CloudButton
                type="button"
                variant={spellMode ? "brand" : "outline"}
                size="pill"
                onClick={() => setSpellMode((v) => !v)}
                className="max-sm:px-2 max-sm:text-xs"
              >
                <Type size={15} />
                {t("practice.spell")}
              </CloudButton>
            </div>
            <div className="flex items-center gap-1.5 sm:gap-2 w-full md:w-auto min-w-0 shrink-0">
              <CloudButton
                variant="mint"
                size="pill"
                className="shrink-0 max-sm:px-2 max-sm:text-xs"
                onClick={() => markNextFive("correct")}
              >
                <Check size={15} />
                <span className="hidden sm:inline">{t("practice.mark_five_correct")}</span>
                <span className="sm:hidden">5✓</span>
              </CloudButton>
              <CloudButton
                variant="destructive"
                size="pill"
                className="shrink-0 max-sm:px-2 max-sm:text-xs"
                onClick={() => markNextFive("wrong")}
              >
                <X size={15} />
                <span className="hidden sm:inline">{t("practice.mark_five_wrong")}</span>
                <span className="sm:hidden">5✗</span>
              </CloudButton>
              <CloudButton
                type="button"
                variant="brand"
                size="pill"
                className="hidden sm:flex flex-1 min-w-0 truncate md:flex-none"
                onClick={handleSubmit}
                disabled={!allMarked || submitting}
                loading={submitting}
                loadingText={t("practice.submitting")}
              >
                {submitLabel}
              </CloudButton>
            </div>
          </div>
        </div>
      </div>

      <CloudButton
        type="button"
        variant="brand"
        size="iconRound"
        onClick={handleSubmit}
        disabled={!allMarked || submitting}
        className="fixed right-3 bottom-16 z-50 size-11 shadow-lg sm:hidden"
        aria-label={t("practice.submit")}
      >
        <ArrowRight size={20} />
      </CloudButton>

      {spellTarget && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={closeSpellDialog}
        >
          <div
            className="bg-white rounded-2xl p-6 max-w-md w-full mx-auto space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-center">
              <h3 className="text-lg font-semibold text-foreground">{t("practice.spell_title")}</h3>
              {spellTarget.translation && (
                <p className="text-sm text-muted-foreground mt-1">{spellTarget.translation}</p>
              )}
              {spellTarget.phonetic && (
                <p className="text-sm text-[#718096] font-mono mt-0.5">{spellTarget.phonetic}</p>
              )}
            </div>

            {spellTarget.audioUrl && (
              <div className="flex justify-center">
                <CloudButton
                  type="button"
                  variant="ghost"
                  size="iconRound"
                  onClick={() => handlePlayAudio(spellTarget)}
                >
                  <Volume2
                    size={24}
                    className={playingId === spellTarget.id ? "text-[#4ECDC4] animate-pulse" : "text-[#4ECDC4]"}
                  />
                </CloudButton>
              </div>
            )}

            {spellResult === null ? (
              <>
                <input
                  type="text"
                  value={spellInput}
                  onChange={(e) => setSpellInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSpellSubmit();
                  }}
                  placeholder={t("practice.spell_input_placeholder")}
                  autoFocus
                  className="w-full rounded-xl border border-border bg-card px-4 py-3 text-base text-foreground focus:outline-none focus:border-primary"
                />
                <div className="flex gap-3 mt-4">
                  <CloudButton
                    type="button"
                    variant="outline"
                    size="pill"
                    className="flex-1"
                    onClick={closeSpellDialog}
                  >
                    {t("practice.cancel")}
                  </CloudButton>
                  <CloudButton
                    type="button"
                    variant="brand"
                    size="pill"
                    className="flex-1"
                    onClick={handleSpellSubmit}
                    disabled={!spellInput.trim()}
                  >
                    {t("practice.spell_confirm")}
                  </CloudButton>
                </div>
              </>
            ) : (
              <>
                <div
                  className={`text-center rounded-xl py-4 ${
                    spellResult === "correct"
                      ? "bg-[#4ECDC4]/10 text-[#4ECDC4]"
                      : "bg-[#FF6B6B]/10 text-[#FF6B6B]"
                  }`}
                >
                  <p className="text-2xl font-bold mb-1">
                    {spellResult === "correct" ? t("practice.spell_correct") : t("practice.spell_wrong")}
                  </p>
                  <p className="text-sm text-foreground">
                    {t("practice.spell_correct_answer", { answer: spellTarget.word })}
                  </p>
                  {spellResult === "wrong" && spellInput.trim() && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {t("practice.spell_your_input", { input: spellInput.trim() })}
                    </p>
                  )}
                </div>
                <CloudButton
                  type="button"
                  variant="brand"
                  size="pill"
                  className="w-full"
                  onClick={closeSpellDialog}
                >
                  {t("practice.spell_continue")}
                </CloudButton>
              </>
            )}
          </div>
        </div>
      )}
    </FlowPageShell>
  );
}
