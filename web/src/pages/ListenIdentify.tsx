import { CloudButton } from "../components/cloudsteps";
import { normalizeSnowflakeId } from "../utils/json-snowflake";
import { AnnotationLayer } from "../components/AnnotationLayer";
import { PRACTICE_TRANS_CLASS, PRACTICE_WORD_CLASS, PRACTICE_CARD_WORD_CLASS } from "../components/PracticeFontSettings";
import { PracticeFlowToolbar } from "../components/PracticeFlowToolbar";
import { TopBar } from "../components/TopBar";
import { WordDetailPanel } from "../components/WordDetailPanel";
import {
  WordViewModeToggle,
  markWordCardClass,
  markWordCardStyle,
  type WordViewMode,
} from "../components/WordMarkView";
import { ArrowRight, Volume2, Shuffle, BookOpen, ChevronLeft, ChevronRight, PanelTop } from "lucide-react";
import { useNavigate } from "react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { playFirstWordAudio } from "../utils/audioPlayer";
import { displayTranslationFull, displayTranslationShort, pickPhoneticDisplay } from "../utils/wordFormat";
import { getReviewReturnPath } from "../utils/reviewPractice";
import { applyUserWordView } from "../components/WordEditControls";
import { StudyNoteLauncher } from "../components/StudyNotePanel";
import { NoteSplitLayout } from "../components/NoteSplitLayout";
import { useNote } from "../components/NoteContext";

import { useTranslation } from "react-i18next";
import { requestPracticePauseMenu } from "../utils/practiceFlowLock";

type ListenWord = {
  id: number;
  word: string;
  phonetic?: string;
  translation?: string;
  translationShort?: string;
  audioUrl?: string;
  /** idle=未听 / played=已发音 / revealed=已显示释义 */
  state: "idle" | "played" | "revealed";
};

export default function ListenIdentify() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const note = useNote();
  const [words, setWords] = useState<ListenWord[]>([]);
  const [annotationOpen, setAnnotationOpen] = useState(false);
  const [viewMode, setViewMode] = useState<WordViewMode>("list");
  const [cardIndex, setCardIndex] = useState(0);
  const [detailMode, setDetailMode] = useState(false);

  const mode = useMemo(() => sessionStorage.getItem("lb_mode") || "study", []);
  const wordBookId = useMemo(() => normalizeSnowflakeId(sessionStorage.getItem("lb_wordbook_id")), []);
  const wordNoteKey = (wordId: string | number) => `study-note:word:${wordBookId}:${wordId}`;

  const batchIdx = useMemo(() => {
    const key = mode === "review" ? "lb_review_batch_idx" : "lb_study_batch_idx";
    return Number(sessionStorage.getItem(key) || 0);
  }, [mode]);

  const totalBatches = useMemo(() => {
    if (mode === "review") {
      try {
        const raw = sessionStorage.getItem("lb_review_words") || "[]";
        const arr = JSON.parse(raw);
        const total = Array.isArray(arr) ? arr.length : 0;
        return Math.max(1, Math.ceil(total / 5));
      } catch {
        return 1;
      }
    }
    const stored = Number(sessionStorage.getItem("lb_study_total_batches") || 0);
    if (stored > 0) return stored;
    try {
      const raw = sessionStorage.getItem("lb_study_words") || "[]";
      const arr = JSON.parse(raw);
      const total = Array.isArray(arr) ? arr.length : 0;
      return Math.max(1, Math.ceil(total / 5));
    } catch {
      return 1;
    }
  }, [mode]);

  const [playingId, setPlayingId] = useState<number | null>(null);
  const [fullMeaning, setFullMeaning] = useState(false);
  const abortRef = useRef<(() => void) | null>(null);

  const handleBack = () => {
    requestPracticePauseMenu();
  };

  useEffect(() => {
    try {
      const wordsKey = mode === "review" ? "lb_review_words" : "lb_study_words";
      const raw = sessionStorage.getItem(wordsKey) || "[]";
      const arr = JSON.parse(raw);
      const all: any[] = Array.isArray(arr) ? arr : [];
      const start = batchIdx * 5;
      const slice = all.slice(start, start + 5);
      const mapped: ListenWord[] = slice.map((w: any) => ({
        id: Number(w.id),
        word: String(w.word || ""),
        phonetic: pickPhoneticDisplay(w),
        translation: displayTranslationFull(w.translation),
        translationShort: displayTranslationShort(w),
        audioUrl: w.audioUrl ? String(w.audioUrl) : "",
        state: "idle",
      }));
      setWords(mapped);
      setCardIndex(0);
    } catch {
      // ignore
    }
  }, [batchIdx, mode]);

  const handlePlayFirstAudio = (w: ListenWord) => {
    if (!w.audioUrl) return;
    abortRef.current?.();
    setPlayingId(w.id);
    const abort = playFirstWordAudio(w.audioUrl, () => setPlayingId(null));
    abortRef.current = abort;
  };

  const handleCardClick = (word: ListenWord) => {
    const current = words.find((w) => w.id === word.id);
    if (current?.state === "idle") {
      handlePlayFirstAudio(current);
    }
    setWords((prev) =>
      prev.map((w) => {
        if (w.id !== word.id) return w;
        if (w.state === "idle") {
          return { ...w, state: "played" };
        }
        if (w.state === "played") {
          return { ...w, state: "revealed" };
        }
        return { ...w, state: "idle" };
      })
    );
  };

  const handleShuffle = () => {
    const shuffled = [...words].sort(() => Math.random() - 0.5);
    setWords(shuffled);
    setCardIndex(0);
  };

  const meaningText = (w: ListenWord) =>
    fullMeaning ? w.translation || w.translationShort : w.translationShort || w.translation;

  const renderRevealed = (w: ListenWord, opts?: { card?: boolean }) => (
    <>
      <div className={`${opts?.card ? PRACTICE_CARD_WORD_CLASS : PRACTICE_WORD_CLASS} hover:text-[#4ECDC4] transition-colors ${opts?.card ? "" : "mb-1"}`}>
        {w.word}
      </div>
      {w.phonetic ? (
        <div className={`text-sm text-[#718096] font-mono ${opts?.card ? "mt-4" : "mb-0.5"}`}>{w.phonetic}</div>
      ) : null}
      <div className={`${PRACTICE_TRANS_CLASS} ${opts?.card ? "mt-3" : ""}`}>{meaningText(w)}</div>
      {(w.translation || w.translationShort) && (
        <button
          type="button"
          className={`text-xs text-[#4ECDC4] hover:underline ${opts?.card ? "mt-3" : "mt-1"}`}
          onClick={(e) => {
            e.stopPropagation();
            setFullMeaning((v) => !v);
          }}
        >
          {fullMeaning ? t("practice.short_meaning") : t("practice.full_meaning")}
        </button>
      )}
    </>
  );

  const tapped = (w: ListenWord) => w.state !== "idle" || playingId === w.id;

  const renderWordCard = (w: ListenWord) => {
    const showAnswer = w.state === "revealed";
    return (
      <div
        onClick={() => handleCardClick(w)}
        className={`rounded-xl p-4 shadow-sm transition-all cursor-pointer select-none ${markWordCardClass(
          null,
          tapped(w)
        )}`}
        style={markWordCardStyle(null, tapped(w))}
      >
        <div className="flex items-center gap-3">
          <div
            className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
              w.state === "idle" ? "bg-gray-100" : "bg-[#4ECDC4]/15"
            }`}
          >
            <Volume2
              size={18}
              className={
                playingId === w.id
                  ? "text-[#4ECDC4] animate-pulse"
                  : w.state === "idle"
                    ? "text-[#718096]"
                    : "text-[#4ECDC4]"
              }
            />
          </div>
          <div className="flex-1 min-w-0">
            {!showAnswer && (
              <div className="text-sm text-[#718096]">
                {w.state === "idle" ? t("practice.tap_play") : t("practice.tap_reveal")}
              </div>
            )}
            {showAnswer && renderRevealed(w)}
          </div>
          <div onClick={(e) => e.stopPropagation()}>
            <StudyNoteLauncher
              storageKey={wordNoteKey(w.id)}
              title={t("practice.note_title", { word: w.word })}
              label={t("practice.note")}
              className="h-9 px-2"
              onOpen={() => note.openNote(wordNoteKey(w.id), t("practice.note_title", { word: w.word }))}
            />
          </div>
        </div>
        {detailMode && showAnswer && (
          <div className="mt-3" onClick={(e) => e.stopPropagation()}>
            <WordDetailPanel
              wordId={w.id}
              wordText={w.word}
              variant="inline"
              onClose={() => {}}
            />
          </div>
        )}
      </div>
    );
  };

  const cardWord = words[Math.min(Math.max(0, cardIndex), Math.max(0, words.length - 1))];

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <TopBar
        title={t("listen_identify.title")}
        onBack={handleBack}
        rightSlot={
          <PracticeFlowToolbar
            annotationOpen={annotationOpen}
            onToggleAnnotation={() => setAnnotationOpen((v) => !v)}
            pauseContinueLabel={t("practice.continue_practice")}
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
        storageKey="listen-identify"
        open={annotationOpen}
        onOpenChange={setAnnotationOpen}
      />

      <NoteSplitLayout
        defaultStorageKey={`study-note:global:${wordBookId}`}
        defaultTitle={t("practice.free_note")}
      >
      <div className="px-4 mt-6 max-w-5xl mx-auto w-full pb-28">
        <div className="text-center text-sm text-[#718096] mb-6">{t("practice.batch_group", { current: batchIdx + 1, total: totalBatches })}</div>

        {viewMode === "card" && cardWord ? (
          <div className="flex w-full flex-col gap-3">
            <div
              className={`relative flex w-full flex-col overflow-hidden rounded-2xl shadow-sm transition-colors ${markWordCardClass(
                null,
                tapped(cardWord)
              )}`}
              style={{
                ...markWordCardStyle(null, tapped(cardWord)),
                minHeight: "min(62vh, calc(100dvh - 13.5rem))",
              }}
            >
              <p className="pointer-events-none absolute left-0 right-0 top-4 z-10 text-center text-xs text-[#718096]">
                {cardIndex + 1} / {words.length}
              </p>
              <div className="relative flex min-h-0 flex-1 items-center justify-center px-2">
                <CloudButton
                  type="button"
                  variant="ghost"
                  size="iconRound"
                  disabled={cardIndex <= 0}
                  onClick={() => setCardIndex((i) => Math.max(0, i - 1))}
                  className="absolute left-2 top-1/2 z-10 size-11 -translate-y-1/2 bg-muted/90 shadow-sm disabled:opacity-35"
                  aria-label={t("practice.prev")}
                >
                  <ChevronLeft size={24} />
                </CloudButton>
                <button
                  type="button"
                  className="mx-auto flex w-full max-w-[calc(100%-6.5rem)] cursor-pointer flex-col items-center justify-center px-2 py-10 text-center"
                  onClick={() => handleCardClick(cardWord)}
                >
                  {cardWord.state === "revealed" ? (
                    renderRevealed(cardWord, { card: true })
                  ) : (
                    <>
                      <Volume2
                        size={48}
                        className={
                          playingId === cardWord.id
                            ? "text-[#4ECDC4] animate-pulse"
                            : cardWord.state === "played"
                              ? "text-[#4ECDC4]"
                              : "text-[#A0AEC0]"
                        }
                      />
                      <p className="mt-4 text-sm text-[#718096]">
                        {cardWord.state === "idle" ? t("practice.tap_play") : t("practice.tap_reveal")}
                      </p>
                    </>
                  )}
                </button>
                <CloudButton
                  type="button"
                  variant="ghost"
                  size="iconRound"
                  disabled={cardIndex >= words.length - 1}
                  onClick={() => setCardIndex((i) => Math.min(words.length - 1, i + 1))}
                  className="fixed sm:absolute right-2 top-1/2 z-50 sm:z-10 size-11 -translate-y-1/2 bg-muted/90 shadow-sm disabled:opacity-35"
                  aria-label={t("practice.next")}
                >
                  <ChevronRight size={24} />
                </CloudButton>
              </div>
              <div className="flex items-center justify-center gap-3 border-t border-border/60 px-4 py-4">
                <div onClick={(e) => e.stopPropagation()}>
                  <StudyNoteLauncher
                    storageKey={wordNoteKey(cardWord.id)}
                    title={t("practice.note_title", { word: cardWord.word })}
                    label={t("practice.note")}
                    className="h-9 px-2"
                    onOpen={() => note.openNote(wordNoteKey(cardWord.id), t("practice.note_title", { word: cardWord.word }))}
                  />
                </div>
                <CloudButton
                  type="button"
                  variant="ghost"
                  size="iconRound"
                  className="size-8 sm:size-9"
                  onClick={() => handlePlayFirstAudio(cardWord)}
                  aria-label={t("practice.play_audio")}
                >
                  <Volume2
                    size={18}
                    className={
                      playingId === cardWord.id ? "text-[#4ECDC4] animate-pulse" : "text-[#4ECDC4]"
                    }
                  />
                </CloudButton>
              </div>
            </div>
            {detailMode && cardWord.state === "revealed" && (
              <div className="w-full">
                <WordDetailPanel
                  wordId={cardWord.id}
                  wordText={cardWord.word}
                  variant="inline"
                  onClose={() => {}}
                />
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3 mb-6">
            {words.map((w) => (
              <div key={w.id}>{renderWordCard(w)}</div>
            ))}
          </div>
        )}
      </div>
      </NoteSplitLayout>

      <div className="fixed bottom-0 left-0 right-0 z-20 bg-white border-t border-[#E2E8F0] px-3 sm:px-4 py-1.5 sm:py-2 shadow-lg">
        <div className="max-w-5xl mx-auto w-full">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 sm:gap-2 flex-1 min-w-0 overflow-x-auto">
              <WordViewModeToggle mode={viewMode} onChange={setViewMode} />
              <CloudButton variant="outline" size="pill" onClick={handleShuffle} className="max-sm:px-2 max-sm:text-xs">
                <Shuffle size={15} />
                <span className="hidden sm:inline">{t("practice.shuffle")}</span>
              </CloudButton>
              <CloudButton
                variant={detailMode ? "brand" : "outline"}
                size="pill"
                onClick={() => setDetailMode((v) => !v)}
                className="max-sm:px-2 max-sm:text-xs"
              >
                <BookOpen size={15} />
                <span className="hidden sm:inline">{t("practice.expand")}</span>
              </CloudButton>
              <CloudButton
                type="button"
                variant={note.open ? "brand" : "outline"}
                size="pill"
                onClick={() => (note.open ? note.setOpen(false) : note.openNote(`study-note:global:${wordBookId}`, t("practice.free_note")))}
                aria-label={t("practice.open_free_note")}
                className="max-sm:px-2 max-sm:text-xs"
              >
                <PanelTop size={15} className={note.open ? "text-white" : "text-[#c45c78]"} />
                <span className="hidden sm:inline">{t("practice.free_note")}</span>
              </CloudButton>
            </div>
            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              <CloudButton
                variant="brand"
                size="iconRound"
                onClick={() => navigate("/flash-review")}
                aria-label={t("practice.next")}
              >
                <ArrowRight size={20} />
              </CloudButton>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
