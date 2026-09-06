import { CloudButton } from "../components/cloudsteps";
import { normalizeSnowflakeId } from "../utils/json-snowflake";
import { AnnotationLayer } from "../components/AnnotationLayer";
import { PRACTICE_TRANS_CLASS, PRACTICE_WORD_CLASS, PRACTICE_CARD_WORD_CLASS } from "../components/PracticeFontSettings";
import { PracticeFlowToolbar } from "../components/PracticeFlowToolbar";
import { TopBar } from "../components/TopBar";
import { WordDetailPanel } from "../components/WordDetailPanel";
import { WordViewModeToggle, isWordCardTapped, markWordCardClass, markWordCardStyle, type WordViewMode } from "../components/WordMarkView";
import { Volume2, Scissors, Shuffle, BookOpen, ChevronLeft, ChevronRight } from "lucide-react";
import { useNavigate } from "react-router";
import { useState, useEffect, useMemo, useRef } from "react";
import confetti from "canvas-confetti";
import { playFirstWordAudio, playSecondWordAudio } from "../utils/audioPlayer";
import { displayTranslationFull, displayTranslationShort, pickPhoneticDisplay } from "../utils/wordFormat";
import { nextWordTapState, syncDetailWordWithTap } from "../utils/wordReveal";
import { applyUserWordView } from "../components/WordEditControls";
import { NoteSplitLayout } from "../components/NoteSplitLayout";
import { useNote } from "../components/NoteContext";
import { StudyNoteLauncher } from "../components/StudyNotePanel";

import {
  clearStudyRetryFlash,
  getStudyRetryWords,
  getTotalBatches,
  resolveCheckPhase,
  setStudyRecheckWords,
  shouldEnterPostTrainingCheck,
} from "../utils/studyBatchFlow";
import { getReviewReturnPath } from "../utils/reviewPractice";
import { useTranslation } from "react-i18next";
import { requestPracticePauseMenu } from "../utils/practiceFlowLock";

const CHECK_PHASE_KEY = "lb_study_check_phase";

type FlashWord = {
  uid: string;
  id: number;
  word: string;
  phonetic: string;
  translation: string;
  translationShort: string;
  audioUrl?: string;
  scissorCount: number;
  showTranslation: boolean;
  heard: boolean;
};

function newUid(id: number): string {
  return `${id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function mapToFlashWord(w: Record<string, unknown>): FlashWord {
  const id = Number(w.id);
  return {
    uid: newUid(id),
    id,
    word: String(w.word || ""),
    phonetic: pickPhoneticDisplay(w as { phonetic?: string; phoneticUk?: string; phoneticUs?: string }),
    translation: displayTranslationFull(w.translation as string),
    translationShort: displayTranslationShort({
      translation: w.translation as string,
      translationShort: w.translationShort as string,
    }),
    audioUrl: w.audioUrl ? String(w.audioUrl) : undefined,
    scissorCount: 0,
    showTranslation: false,
    heard: false,
  };
}

export default function FlashReview() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const note = useNote();
  const [words, setWords] = useState<FlashWord[]>([]);
  const [showCompleteDialog, setShowCompleteDialog] = useState(false);
  const [annotationOpen, setAnnotationOpen] = useState(false);
  const [viewMode, setViewMode] = useState<WordViewMode>("list");
  const [cardIndex, setCardIndex] = useState(0);
  const [detailMode, setDetailMode] = useState(false);
  const [detailWord, setDetailWord] = useState<{ id: string | number; word: string } | null>(null);
  /** false=简译（默认），true=全部意思；与单词练习/听音辨义一致 */
  const [fullMeaning, setFullMeaning] = useState(false);

  const mode = useMemo(() => sessionStorage.getItem("lb_mode") || "study", []);
  const wordBookId = useMemo(() => normalizeSnowflakeId(sessionStorage.getItem("lb_wordbook_id")), []);
  const wordNoteKey = (wordId: string | number) => `study-note:word:${wordBookId}:${wordId}`;

  const batchIdx = useMemo(() => {
    const key = mode === "review" ? "lb_review_batch_idx" : "lb_study_batch_idx";
    return Number(sessionStorage.getItem(key) || 0);
  }, [mode]);

  const isRetryMode = useMemo(() => getStudyRetryWords() !== null, []);

  const handleBack = () => {
    if (isRetryMode) {
      // 错词重练中回课后检测：仍在练习锁路由内
      clearStudyRetryFlash();
      navigate("/post-training-check", { replace: true });
      return;
    }
    requestPracticePauseMenu();
  };

  useEffect(() => {
    try {
      const retryList = getStudyRetryWords();
      if (retryList) {
        setWords(retryList.map((w) => mapToFlashWord(w as Record<string, unknown>)));
        return;
      }
      const wordsKey = mode === "review" ? "lb_review_words" : "lb_study_words";
      const raw = sessionStorage.getItem(wordsKey) || "[]";
      const arr = JSON.parse(raw);
      const all: unknown[] = Array.isArray(arr) ? arr : [];
      const start = batchIdx * 5;
      const slice = all.slice(start, start + 5);
      setWords(slice.map((w) => mapToFlashWord(w as Record<string, unknown>)));
    } catch {
      // ignore
    }
  }, [batchIdx, mode, isRetryMode]);

  const [playingId, setPlayingId] = useState<number | null>(null);
  const abortRef = useRef<(() => void) | null>(null);

  const handleScissorClick = (word: FlashWord, action: "red" | "green") => {
    setWords((prev) =>
      prev.map((w) => {
        if (w.uid !== word.uid) return w;
        // 红/绿都会剪掉：红=不熟(1)，绿=掌握(2)
        return { ...w, scissorCount: action === "red" ? 1 : 2 };
      })
    );
  };

  const handlePlayAudio = (word: FlashWord) => {
    if (!word.audioUrl) return;
    abortRef.current?.();
    setPlayingId(word.id);
    // 快闪喇叭固定播第 2 段（连读）
    const abort = playSecondWordAudio(word.audioUrl, () => setPlayingId(null));
    abortRef.current = abort;
  };

  const handleShuffle = () => {
    setWords((prev) => [...prev].sort(() => Math.random() - 0.5));
    setCardIndex(0);
  };

  const handleWordTap = (word: FlashWord) => {
    const next = nextWordTapState({
      showTranslation: word.showTranslation,
      heard: word.heard,
    });
    if (next.shouldPlay && word.audioUrl) {
      abortRef.current?.();
      setPlayingId(word.id);
      const abort = playFirstWordAudio(word.audioUrl, () => setPlayingId(null));
      abortRef.current = abort;
    }
    setWords((prev) =>
      prev.map((w) => {
        if (w.uid === word.uid) {
          return { ...w, heard: next.heard, showTranslation: next.showTranslation };
        }
        return { ...w, heard: false, showTranslation: false };
      })
    );
    setDetailWord(syncDetailWordWithTap(detailMode, next, { id: word.id, word: word.word }));
  };

  const allCut = words.length > 0 && words.every((word) => word.scissorCount > 0);

  const [round, setRound] = useState(0);

  // 当所有词都剪完后，如果有红剪词（不熟），重新出现再来一轮
  useEffect(() => {
    if (!allCut || showCompleteDialog) return;
    const redWords = words.filter((w) => w.scissorCount === 1);
    if (redWords.length > 0) {
      // 有红剪词，重置它们再来一轮
      const timer = setTimeout(() => {
        setWords((prev) =>
          prev.map((w) =>
            w.scissorCount === 1 ? { ...w, scissorCount: 0, showTranslation: false, heard: false } : w
          )
        );
        setRound((r) => r + 1);
      }, 500);
      return () => clearTimeout(timer);
    }
    // 没有红剪词，全部掌握，显示完成
    handleComplete();
  }, [allCut, showCompleteDialog, words]);

  const continueAfterRetry = () => {
    const retried = getStudyRetryWords();
    clearStudyRetryFlash();
    if (retried) {
      setStudyRecheckWords(retried);
    }
    navigate("/post-training-check", { replace: true });
  };

  const proceedAfterFlash = () => {
    if (isRetryMode) {
      continueAfterRetry();
      return;
    }
    if (mode === "review") {
      try {
        const raw = sessionStorage.getItem("lb_review_words") || "[]";
        const all = JSON.parse(raw);
        const total = Array.isArray(all) ? all.length : 0;
        const reviewBatches = Math.max(1, Math.ceil(total / 5));
        if (batchIdx + 1 < reviewBatches) {
          sessionStorage.setItem("lb_review_batch_idx", String(batchIdx + 1));
          navigate("/word-practice", { replace: true });
          return;
        }
      } catch {
        // fall through
      }
      navigate("/post-training-check");
      return;
    }
    try {
      const raw = sessionStorage.getItem("lb_study_words") || "[]";
      const all = JSON.parse(raw);
      const total = Array.isArray(all) ? all.length : 0;
      const totalBatches =
        Number(sessionStorage.getItem("lb_study_total_batches") || 0) || getTotalBatches(total);

      if (!shouldEnterPostTrainingCheck(batchIdx, totalBatches)) {
        const nextIdx = batchIdx + 1;
        if (nextIdx >= totalBatches) {
          sessionStorage.setItem(CHECK_PHASE_KEY, "final");
          navigate("/post-training-check", { replace: true });
          return;
        }
        sessionStorage.setItem("lb_study_batch_idx", String(nextIdx));
        navigate("/word-practice", { replace: true });
        return;
      }
      sessionStorage.setItem(CHECK_PHASE_KEY, resolveCheckPhase(batchIdx, totalBatches));
      navigate("/post-training-check");
    } catch {
      navigate("/post-training-check");
    }
  };

  const handleComplete = () => {
    confetti({
      particleCount: 100,
      spread: 70,
      origin: { y: 0.6 },
    });
    setShowCompleteDialog(true);
  };

  const headerTitle = isRetryMode
    ? t("flash_review.retry_title")
    : t("flash_review.batch_title", { n: batchIdx + 1 });

  const totalBatches = Number(sessionStorage.getItem("lb_study_total_batches") || 1);

  const proceedLabel = isRetryMode
    ? t("flash_review.finish_retry")
    : mode === "review"
    ? t("flash_review.enter_post_training")
    : !shouldEnterPostTrainingCheck(
        batchIdx,
        Number(sessionStorage.getItem("lb_study_total_batches") || 1)
      )
    ? t("flash_review.next_batch")
    : resolveCheckPhase(batchIdx, totalBatches) === "final"
    ? t("flash_review.enter_post_training")
    : t("flash_review.enter_group_review");

  const uncutCount = words.filter((w) => w.scissorCount === 0).length;
  const visibleWords = words.filter((w) => w.scissorCount === 0);

  const meaningText = (word: FlashWord) =>
    fullMeaning ? word.translation || word.translationShort : word.translationShort || word.translation;

  const renderMeaning = (word: FlashWord, opts?: { centered?: boolean }) => {
    if (!word.showTranslation) return null;
    const meaning = meaningText(word);
    return (
      <div className={`animate-in fade-in slide-in-from-top-1 ${opts?.centered ? "text-center mt-2" : ""}`}>
        {word.phonetic ? (
          <div className={`text-sm text-[#718096] font-mono ${opts?.centered ? "mb-0.5" : "mb-0.5"}`}>
            {word.phonetic}
          </div>
        ) : null}
        {meaning ? <div className={PRACTICE_TRANS_CLASS}>{meaning}</div> : null}
        {(word.translation || word.translationShort) && (
          <button
            type="button"
            className="text-xs text-[#4ECDC4] hover:underline mt-1"
            onClick={(e) => {
              e.stopPropagation();
              setFullMeaning((v) => !v);
            }}
          >
            {fullMeaning ? t("practice.short_meaning") : t("practice.full_meaning")}
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <TopBar
        title={headerTitle}
        onBack={handleBack}
        rightSlot={
          <PracticeFlowToolbar
            annotationOpen={annotationOpen}
            onToggleAnnotation={() => setAnnotationOpen((v) => !v)}
            wordCount={words.length}
            onWordPatched={(view) =>
              setWords((prev) =>
                applyUserWordView(prev, view).map((w) =>
                  w.id === view.wordId
                    ? {
                        ...w,
                        translation: displayTranslationFull(view.effective.translation) || w.translation,
                        translationShort:
                          (view.effective.translationShort || "").trim() || w.translationShort,
                      }
                    : w
                )
              )
            }
          />
        }
      />

      <AnnotationLayer
        storageKey="flash-review"
        open={annotationOpen}
        onOpenChange={setAnnotationOpen}
      />

      <NoteSplitLayout
        defaultStorageKey={`study-note:global:${wordBookId}`}
        defaultTitle="随心记"
      >
        <p className="text-center text-sm text-[#718096] mb-6">
          {isRetryMode
            ? t("flash_review.retry_hint")
            : t("flash_review.pending_hint", { count: uncutCount, round: round > 0 ? t("flash_review.round_suffix", { n: round + 1 }) : "" })}
        </p>

        {viewMode === "card" && visibleWords.length > 0 ? (
          <div className="flex w-full flex-col gap-3">
            <div
              className={`relative flex w-full flex-col overflow-hidden rounded-2xl shadow-sm transition-colors ${markWordCardClass(
                null,
                isWordCardTapped(visibleWords[cardIndex], playingId, visibleWords[cardIndex].id)
              )}`}
              style={{
                ...markWordCardStyle(
                  null,
                  isWordCardTapped(visibleWords[cardIndex], playingId, visibleWords[cardIndex].id)
                ),
                minHeight: "min(62vh, calc(100dvh - 13.5rem))",
              }}
            >
              <p className="pointer-events-none absolute left-0 right-0 top-4 z-10 text-center text-xs text-[#718096]">
                {cardIndex + 1} / {visibleWords.length}
              </p>
              <div className="relative flex min-h-0 flex-1 items-center justify-center px-2">
                <CloudButton
                  type="button"
                  variant="ghost"
                  size="iconRound"
                  disabled={cardIndex <= 0}
                  onClick={() => setCardIndex((i) => Math.max(0, i - 1))}
                  className="absolute left-2 top-1/2 z-10 size-11 -translate-y-1/2 bg-muted/90 shadow-sm disabled:opacity-35"
                >
                  <ChevronLeft size={24} />
                </CloudButton>
                <button
                  type="button"
                  className="mx-auto flex w-full max-w-[calc(100%-6.5rem)] cursor-pointer flex-col items-center justify-center px-2 py-10 text-center"
                  onClick={() => handleWordTap(visibleWords[cardIndex])}
                >
                  <div className={`${PRACTICE_CARD_WORD_CLASS} hover:text-[#4ECDC4] transition-colors`}>
                    {visibleWords[cardIndex].word}
                  </div>
                  {renderMeaning(visibleWords[cardIndex], { centered: true })}
                </button>
                <CloudButton
                  type="button"
                  variant="ghost"
                  size="iconRound"
                  disabled={cardIndex >= visibleWords.length - 1}
                  onClick={() => setCardIndex((i) => Math.min(visibleWords.length - 1, i + 1))}
                  className="fixed sm:absolute right-2 top-1/2 z-50 sm:z-10 size-11 -translate-y-1/2 bg-muted/90 shadow-sm disabled:opacity-35"
                >
                  <ChevronRight size={24} />
                </CloudButton>
              </div>
              <div className="flex items-center justify-center gap-3 border-t border-border/60 px-4 py-4">
                <div onClick={(e) => e.stopPropagation()}>
                  <StudyNoteLauncher
                    storageKey={wordNoteKey(visibleWords[cardIndex].id)}
                    title={t("practice.note_title", { word: visibleWords[cardIndex].word })}
                    label={t("practice.note")}
                    className="h-9 px-2"
                    onOpen={() => note.openNote(wordNoteKey(visibleWords[cardIndex].id), t("practice.note_title", { word: visibleWords[cardIndex].word }))}
                  />
                </div>
                <CloudButton
                  type="button"
                  variant="ghost"
                  size="iconRound"
                  className="size-8 sm:size-9"
                  onClick={() => handlePlayAudio(visibleWords[cardIndex])}
                >
                  <Volume2
                    size={18}
                    className={
                      playingId === visibleWords[cardIndex].id
                        ? "text-[#4ECDC4] animate-pulse"
                        : "text-[#4ECDC4]"
                    }
                  />
                </CloudButton>
                <CloudButton
                  type="button"
                  variant="ghost"
                  size="iconRound"
                  className="size-8 sm:size-9"
                  onClick={() => handleScissorClick(visibleWords[cardIndex], "red")}
                  title={t("flash_review.red_scissor_tip")}
                >
                  <Scissors size={18} className="text-[#FF6B6B]" />
                </CloudButton>
                <CloudButton
                  type="button"
                  variant="ghost"
                  size="iconRound"
                  className="size-8 sm:size-9"
                  onClick={() => handleScissorClick(visibleWords[cardIndex], "green")}
                  title={t("flash_review.green_scissor_tip")}
                >
                  <Scissors size={18} className="text-[#4ECDC4]" />
                </CloudButton>
              </div>
            </div>
            {detailMode && visibleWords[cardIndex]?.showTranslation && (
              <div className="w-full">
                <WordDetailPanel
                  wordId={visibleWords[cardIndex].id}
                  wordText={visibleWords[cardIndex].word}
                  variant="inline"
                  onClose={() => setDetailWord(null)}
                />
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3 mb-6">
            {visibleWords.map((word) => (
              <div
                key={word.uid}
                className={`rounded-xl p-4 shadow-sm transition-all cursor-pointer ${markWordCardClass(
                  null,
                  isWordCardTapped(word, playingId, word.id)
                )}`}
                style={markWordCardStyle(null, isWordCardTapped(word, playingId, word.id))}
                onClick={() => handleWordTap(word)}
              >
                <div className="flex flex-row items-center justify-between gap-2">
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <div className="min-w-0">
                      <div className={`${PRACTICE_WORD_CLASS} mb-1 hover:text-[#4ECDC4] transition-colors`}>
                        {word.word}
                      </div>
                      {renderMeaning(word)}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1 sm:gap-2 -mr-1 sm:mr-0">
                    <div onClick={(e) => e.stopPropagation()}>
                      <StudyNoteLauncher
                        storageKey={wordNoteKey(word.id)}
                        title={t("practice.note_title", { word: word.word })}
                        label={t("practice.note")}
                        className="h-9 px-2"
                        onOpen={() => note.openNote(wordNoteKey(word.id), t("practice.note_title", { word: word.word }))}
                      />
                    </div>
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
                            w.uid === word.uid
                              ? { ...w, heard: true }
                              : { ...w, heard: false, showTranslation: false }
                          )
                        );
                      }}
                    >
                      <Volume2
                        size={18}
                        className={
                          playingId === word.id ? "text-[#4ECDC4] animate-pulse" : "text-[#4ECDC4]"
                        }
                      />
                    </CloudButton>
                    <CloudButton
                      type="button"
                      variant="ghost"
                      size="iconRound"
                      className="size-8 sm:size-9"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleScissorClick(word, "red");
                      }}
                      title={t("flash_review.red_scissor_tip")}
                    >
                      <Scissors size={18} className="text-[#FF6B6B]" />
                    </CloudButton>
                    <CloudButton
                      type="button"
                      variant="ghost"
                      size="iconRound"
                      className="size-8 sm:size-9"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleScissorClick(word, "green");
                      }}
                      title={t("flash_review.green_scissor_tip")}
                    >
                      <Scissors size={18} className="text-[#4ECDC4]" />
                    </CloudButton>
                  </div>
                </div>
                {detailMode && word.showTranslation && (
                  <div className="mt-3 pt-3 border-t border-[#E2E8F0]" onClick={(e) => e.stopPropagation()}>
                    <WordDetailPanel
                      wordId={word.id}
                      wordText={word.word}
                      variant="inline"
                      onClose={() => setDetailWord(null)}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </NoteSplitLayout>

      <div className="fixed bottom-0 left-0 right-0 z-20 bg-white border-t border-[#E2E8F0] px-3 sm:px-4 py-1.5 sm:py-2 shadow-lg">
        <div className="max-w-5xl mx-auto w-full">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between md:gap-3">
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
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
            </div>
          </div>
        </div>
      </div>

      {showCompleteDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full mx-auto">
            <h3 className="text-3xl font-bold text-center text-[#4ECDC4] mb-2">PERFECT</h3>
            <p className="text-center text-[#718096] mb-6">
              {isRetryMode ? t("flash_review.retry_done") : t("flash_review.batch_done")}
            </p>
            <div className="flex gap-3">
              {!isRetryMode && (
                <CloudButton
                  type="button"
                  variant="outline"
                  size="pill"
                  className="flex-1"
                  onClick={() => navigate("/word-practice")}
                >
                  {t("flash_review.back_practice")}
                </CloudButton>
              )}
              <CloudButton
                type="button"
                variant="brand"
                size="pill"
                className="flex-1"
                onClick={proceedAfterFlash}
              >
                {proceedLabel}
              </CloudButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
