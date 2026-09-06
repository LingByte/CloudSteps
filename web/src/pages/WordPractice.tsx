import { Shuffle, ArrowRight, BookOpen, ChevronLeft, ChevronRight, PanelTop } from "lucide-react";
import { normalizeSnowflakeId } from "../utils/json-snowflake";
import { useNavigate } from "react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnnotationLayer } from "../components/AnnotationLayer";
import { PRACTICE_TRANS_CLASS, PRACTICE_WORD_CLASS, PRACTICE_CARD_WORD_CLASS } from "../components/PracticeFontSettings";
import { PracticeFlowToolbar } from "../components/PracticeFlowToolbar";
import { CloudButton } from "../components/cloudsteps";
import { FlowPageShell } from "../components/PageTransition";
import { TopBar } from "../components/TopBar";
import { SequenceNextMark } from "../components/SequenceNextMark";
import { WordDetailPanel } from "../components/WordDetailPanel";
import { StudyNoteLauncher, StudyNotePanel } from "../components/StudyNotePanel";
import { WordViewModeToggle, type WordViewMode } from "../components/WordMarkView";
import { playFirstWordAudio, playWordAudio, playAudioAtIndex, parseAudioUrls, WORD_AUDIO_SLOT_COUNT } from "../utils/audioPlayer";
import { displayTranslationFull, displayTranslationShort, pickPhoneticDisplay } from "../utils/wordFormat";
import { syncDetailWordWithTap } from "../utils/wordReveal";
import { getReviewReturnPath } from "../utils/reviewPractice";
import { buildWordPracticeSequence } from "../utils/wordPracticeSequence";
import { getPracticeTapState } from "../utils/wordPracticeTap";
import { useSplitScreenNote } from "../hooks/useSplitScreenNote";
import type { UserWordView } from "../api/wordbooks";
import { useTranslation } from "react-i18next";
import { requestPracticePauseMenu } from "../utils/practiceFlowLock";

type PracticeWord = {
  id: number;
  word: string;
  phonetic: string;
  translation: string;
  translationShort: string;
  audioUrl?: string;
  count: number;
  completed: boolean;
  showTranslation: boolean;
  heard: boolean;
};

export default function WordPractice() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [words, setWords] = useState<PracticeWord[]>([]);
  const [manualReadMode, setManualReadMode] = useState(false);
  const [annotationOpen, setAnnotationOpen] = useState(false);
  const [frameIdx, setFrameIdx] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const lastTappedIndexRef = useRef<number | null>(null);
  const [playingId, setPlayingId] = useState<number | null>(null);
  const [detailMode, setDetailMode] = useState(false);
  const [detailWord, setDetailWord] = useState<{ id: string | number; word: string } | null>(null);
  const [viewMode, setViewMode] = useState<WordViewMode>("list");
  const [cardIndex, setCardIndex] = useState(0);
  const [fullMeaning, setFullMeaning] = useState(false);
  const abortRef = useRef<(() => void) | null>(null);

  const [audioIndexMap, setAudioIndexMap] = useState<Map<number, number>>(new Map());

  const {
    open: globalNoteOpen,
    setOpen: setGlobalNoteOpen,
    side: noteSide,
    setSide: setNoteSide,
    width: noteWidth,
    isDesktop,
    startResize: startNoteResize,
  } = useSplitScreenNote("lb_practice_note_width");

  const mode = useMemo(() => sessionStorage.getItem("lb_mode") || "study", []);
  const wordBookId = useMemo(() => normalizeSnowflakeId(sessionStorage.getItem("lb_wordbook_id")), []);
  const wordNoteKey = (wordId: string | number) => `study-note:word:${wordBookId}:${wordId}`;

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

  const handlePlayNextAudio = (word: PracticeWord) => {
    if (!word.audioUrl) return;
    const urls = parseAudioUrls(word.audioUrl);
    if (urls.length === 0) return;
    abortRef.current?.();
    setPlayingId(word.id);
    const prev = audioIndexMap.get(word.id) ?? 0;
    const n = Math.min(urls.length, WORD_AUDIO_SLOT_COUNT);
    const index = prev % n;
    const abort = playAudioAtIndex(word.audioUrl, index, () => setPlayingId(null));
    abortRef.current = abort;
    // 初始显示 0；点一次 1、再点 2，然后回到 1（两段音频）
    const next = prev >= n ? 1 : prev + 1;
    setAudioIndexMap(new Map(audioIndexMap).set(word.id, next));
  };

  const applyPatchedWord = (view: UserWordView) => {
    const e = view.effective;
    setWords((prev) =>
      prev.map((w) =>
        w.id !== view.wordId
          ? w
          : {
              ...w,
              word: e.word || w.word,
              phonetic:
                pickPhoneticDisplay({
                  phonetic: e.phonetic,
                  phoneticUk: e.phoneticUk,
                  phoneticUs: e.phoneticUs,
                }) || w.phonetic,
              translation: displayTranslationFull(e.translation) || w.translation,
              translationShort: (e.translationShort || "").trim() || w.translationShort,
            }
      )
    );
    const wordsKey = mode === "review" ? "lb_review_words" : "lb_study_words";
    try {
      const raw = sessionStorage.getItem(wordsKey) || "[]";
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return;
      const next = arr.map((item: Record<string, unknown>) =>
        Number(item.id) === view.wordId
          ? {
              ...item,
              word: e.word || item.word,
              phonetic: e.phonetic ?? item.phonetic,
              phoneticUk: e.phoneticUk ?? item.phoneticUk,
              phoneticUs: e.phoneticUs ?? item.phoneticUs,
              translation: e.translation ?? item.translation,
              partOfSpeech: e.partOfSpeech ?? item.partOfSpeech,
              definition: e.definition ?? item.definition,
            }
          : item
      );
      sessionStorage.setItem(wordsKey, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };

  const handleBack = () => {
    requestPracticePauseMenu();
  };

  const batchIdx = useMemo(() => {
    const key = mode === "review" ? "lb_review_batch_idx" : "lb_study_batch_idx";
    return Number(sessionStorage.getItem(key) || 0);
  }, [mode]);

  const totalBatches = useMemo(() => {
    const wordsKey = mode === "review" ? "lb_review_words" : "lb_study_words";
    if (mode === "review") {
      try {
        const raw = sessionStorage.getItem(wordsKey) || "[]";
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

  useEffect(() => {
    try {
      const wordsKey = mode === "review" ? "lb_review_words" : "lb_study_words";
      const raw = sessionStorage.getItem(wordsKey) || "[]";
      const arr = JSON.parse(raw);
      const all: any[] = Array.isArray(arr) ? arr : [];
      const start = batchIdx * 5;
      const slice = all.slice(start, start + 5);

      const shuffledSlice = [...slice];
      for (let i = shuffledSlice.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffledSlice[i], shuffledSlice[j]] = [shuffledSlice[j], shuffledSlice[i]];
      }

      const mapped: PracticeWord[] = shuffledSlice.map((w: any) => ({
        id: Number(w.id),
        word: String(w.word || ""),
        phonetic: pickPhoneticDisplay(w),
        translation: displayTranslationFull(w.translation),
        translationShort: displayTranslationShort(w),
        audioUrl: w.audioUrl ? String(w.audioUrl) : undefined,
        count: 0,
        completed: false,
        showTranslation: false,
        heard: false,
      }));
      setWords(mapped);
      setCardIndex(0);
      setFrameIdx(0);
      setSelectedIndex(null);
      lastTappedIndexRef.current = null;
    } catch {
      // ignore
    }
  }, [batchIdx, mode]);

  const sequence = useMemo(() => buildWordPracticeSequence(words.length), [words.length]);

  const activeIndex = sequence.length > 0 ? sequence[Math.min(frameIdx, sequence.length - 1)] : -1;
  const nextGuideIndex = activeIndex;

  /** 连续点击同一个词时，第一次发音、第二次显示音标和释义。 */
  const handleWordTap = (word: PracticeWord) => {
    const idx = words.findIndex((w) => w.id === word.id);
    if (idx < 0) return;
    const followsGuide = sequence.length > 0 && idx === activeIndex;
    const isContinuation = lastTappedIndexRef.current === idx;
    const next = getPracticeTapState(idx, lastTappedIndexRef.current, word);
    lastTappedIndexRef.current = idx;
    if (next.shouldPlay && word.audioUrl) {
      abortRef.current?.();
      setPlayingId(word.id);
      const abort = playFirstWordAudio(word.audioUrl, () => setPlayingId(null));
      abortRef.current = abort;
    }
    setSelectedIndex(idx);
    setWords((prev) =>
      prev.map((w) => {
        if (w.id === word.id) {
          return { ...w, heard: next.heard, showTranslation: next.showTranslation, count: followsGuide ? (w.count + 1) % 4 : w.count };
        }
        if (!isContinuation) return { ...w, heard: false, showTranslation: false };
        return next.showTranslation ? { ...w, showTranslation: false } : w;
      })
    );
    setDetailWord(syncDetailWordWithTap(detailMode, next, word));
    if (followsGuide && frameIdx < sequence.length - 1) setFrameIdx((f) => f + 1);
  };

  const handleShuffle = () => {
    const shuffled = [...words].sort(() => Math.random() - 0.5);
    setWords(shuffled);
    setSelectedIndex(null);
    lastTappedIndexRef.current = null;
    setCardIndex(0);
    setFrameIdx(0);
  };

  const handleNext = () => {
    navigate("/listen-identify");
  };

  const meaningText = (word: PracticeWord) =>
    fullMeaning ? word.translation || word.translationShort : word.translationShort || word.translation;

  const renderReveal = (word: PracticeWord) => {
    if (!word.showTranslation) return null;
    return (
      <div className="mt-1 space-y-1 animate-in fade-in">
        {word.phonetic ? (
          <div className="text-sm text-[#718096] font-mono">{word.phonetic}</div>
        ) : null}
        {meaningText(word) ? (
          <div className={PRACTICE_TRANS_CLASS}>{meaningText(word)}</div>
        ) : null}
        {(word.translation || word.translationShort) && (
          <button
            type="button"
            className="text-xs text-[#4ECDC4] hover:underline"
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

  if (words.length === 0) {
    return (
      <FlowPageShell>
        <TopBar title={mode === "review" ? t("practice.start_review") : t("practice.title")} onBack={handleBack} />
        <div className="flex flex-col items-center gap-4 text-center text-[#718096] py-16 px-4">
          <p>{mode === "review" ? t("practice.no_review_words_back") : t("practice.no_words_to_practice")}</p>
          <CloudButton variant="brand" size="pillLg" onClick={handleBack}>
            {t("practice.back_select_words")}
          </CloudButton>
        </div>
      </FlowPageShell>
    );
  }

  const cardWord = words[Math.min(Math.max(0, cardIndex), Math.max(0, words.length - 1))];

  return (
    <FlowPageShell>
      <TopBar
        title={mode === "review" ? t("practice.start_review") : t("practice.title")}
        onBack={handleBack}
        rightSlot={
          <PracticeFlowToolbar
            annotationOpen={annotationOpen}
            onToggleAnnotation={() => setAnnotationOpen((v) => !v)}
            pauseContinueLabel={t("practice.continue_practice")}
            wordCount={words.length}
            onWordPatched={applyPatchedWord}
          />
        }
      />

      <AnnotationLayer
        storageKey="word-practice"
        open={annotationOpen}
        onOpenChange={setAnnotationOpen}
      />

      {/* Split container: word content + note panel on the same layer (desktop). */}
      <div
        className={`box-border min-h-[calc(100dvh-11rem)] px-4 mt-6 w-full ${globalNoteOpen && isDesktop ? "pb-4 lg:flex lg:gap-2 lg:max-w-none lg:px-2 lg:mx-0" : "pb-28 max-w-2xl lg:max-w-5xl mx-auto"}`}
        style={globalNoteOpen && isDesktop ? { height: "calc(100dvh - 3.5rem - 7.5rem)" } : undefined}
      >
        {/* Word content pane */}
        <div className={`${globalNoteOpen && isDesktop ? "lg:flex lg:flex-1 lg:min-w-0 lg:flex-col lg:overflow-y-auto" : ""} ${globalNoteOpen && isDesktop && noteSide === "left" ? "lg:order-2" : ""}`}>
        <div className="text-center text-sm text-[#718096] mb-6">{t("practice.batch_group", { current: batchIdx + 1, total: totalBatches })}</div>

        {viewMode === "card" && cardWord ? (
          <div className="flex w-full flex-col gap-3">
            <div
              className={`relative flex w-full flex-col overflow-hidden rounded-2xl border-2 bg-white shadow-sm transition-colors ${
                !manualReadMode && words.findIndex((w) => w.id === cardWord.id) === selectedIndex
                  ? "border-[#4ECDC4] bg-[#4ECDC4]/10"
                  : "border-[#E2E8F0]"
              }`}
              style={{ minHeight: "min(62vh, calc(100dvh - 13.5rem))" }}
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
                >
                  <ChevronLeft size={24} />
                </CloudButton>
                <button
                  type="button"
                  className="mx-auto flex w-full max-w-[calc(100%-6.5rem)] cursor-pointer flex-col items-center justify-center px-2 py-10 text-center"
                  onClick={() => handleWordTap(cardWord)}
                >
                  <div className={PRACTICE_CARD_WORD_CLASS}>{cardWord.word}</div>
                  {renderReveal(cardWord)}
                </button>
                <CloudButton
                  type="button"
                  variant="ghost"
                  size="iconRound"
                  disabled={cardIndex >= words.length - 1}
                  onClick={() => setCardIndex((i) => Math.min(words.length - 1, i + 1))}
                  className="fixed sm:absolute right-2 top-1/2 z-50 sm:z-10 size-11 -translate-y-1/2 bg-muted/90 shadow-sm disabled:opacity-35"
                >
                  <ChevronRight size={24} />
                </CloudButton>
              </div>
              <div className="flex items-center justify-center gap-3 border-t border-[#E2E8F0] px-4 py-4">
                <div onClick={(e) => e.stopPropagation()}>
                  <StudyNoteLauncher
                    storageKey={wordNoteKey(cardWord.id)}
                    title={t("practice.note_title", { word: cardWord.word })}
                    label={t("practice.note")}
                    className="h-9 px-2"
                    onOpen={() => openWordNote(wordNoteKey(cardWord.id), t("practice.note_title", { word: cardWord.word }))}
                  />
                </div>
                {!manualReadMode && parseAudioUrls(cardWord.audioUrl).length > 0 && (
                  <CloudButton
                    variant={playingId === cardWord.id ? "mint" : "mintOutline"}
                    size="iconRound"
                    className="size-8 sm:size-9 text-xs sm:text-sm font-bold"
                    onClick={() => handlePlayNextAudio(cardWord)}
                  >
                    {audioIndexMap.get(cardWord.id) ?? 0}
                  </CloudButton>
                )}
              </div>
            </div>
            {detailMode && (cardWord.showTranslation || cardIndex === words.findIndex((w) => w.id === cardWord.id)) && (
              <div className="w-full">
                <WordDetailPanel
                  wordId={cardWord.id}
                  wordText={cardWord.word}
                  fallbackTranslation={meaningText(cardWord)}
                  variant="inline"
                  onClose={() => setDetailWord(null)}
                  onWordPatched={applyPatchedWord}
                />
              </div>
            )}
          </div>
        ) : (
          <div
            className={
              globalNoteOpen && isDesktop
                ? "flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain pr-1"
                : "mb-6 space-y-3"
            }
          >
            {words.map((word, index) => (
              <div key={word.id} className="shrink-0">
                <div
                  className={`relative bg-white rounded-xl p-4 pl-5 shadow-sm transition-all border-2 ${
                    !manualReadMode && index === selectedIndex
                      ? "bg-[#4ECDC4]/10 border-[#4ECDC4]"
                      : "border-transparent"
                  }`}
                >
                  <SequenceNextMark
                    show={!manualReadMode && nextGuideIndex >= 0 && index === nextGuideIndex}
                  />
                  <div className="flex flex-row items-center justify-between gap-2">
                    <div
                      onClick={() => handleWordTap(word)}
                      className="min-w-0 flex-1 cursor-pointer"
                    >
                      <div className="min-w-0">
                        <div className={`${PRACTICE_WORD_CLASS} mb-1`}>{word.word}</div>
                        {renderReveal(word)}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1 sm:gap-2 -mr-1 sm:mr-0">
                      <div onClick={(e) => e.stopPropagation()}>
                        <StudyNoteLauncher
                          storageKey={wordNoteKey(word.id)}
                          title={t("practice.note_title", { word: word.word })}
                          label={t("practice.note")}
                          className="h-9 px-2"
                          onOpen={() =>
                            openWordNote(
                              wordNoteKey(word.id),
                              t("practice.note_title", { word: word.word })
                            )
                          }
                        />
                      </div>
                      {!manualReadMode && parseAudioUrls(word.audioUrl).length > 0 && (
                        <CloudButton
                          variant={playingId === word.id ? "mint" : "mintOutline"}
                          size="iconRound"
                          className="size-8 sm:size-9 text-xs sm:text-sm font-bold"
                          onClick={() => handlePlayNextAudio(word)}
                        >
                          {audioIndexMap.get(word.id) ?? 0}
                        </CloudButton>
                      )}
                    </div>
                  </div>
                  {detailMode && word.showTranslation && (
                    <WordDetailPanel
                      wordId={word.id}
                      wordText={word.word}
                      fallbackTranslation={meaningText(word)}
                      variant="inline"
                      onClose={() => setDetailWord(null)}
                      onWordPatched={applyPatchedWord}
                    />
                  )}
                </div>
              </div>
            ))}
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
        <div className="max-w-2xl lg:max-w-5xl mx-auto w-full">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 sm:gap-2 flex-1 min-w-0 overflow-x-auto">
              <WordViewModeToggle mode={viewMode} onChange={setViewMode} />
              <CloudButton variant="outline" size="pill" onClick={handleShuffle} className="max-sm:px-2 max-sm:text-xs">
                <Shuffle size={15} />
                <span className="hidden sm:inline">{t("practice.shuffle")}</span>
              </CloudButton>
              <CloudButton
                variant={manualReadMode ? "brand" : "outline"}
                size="pill"
                onClick={() => {
                  setManualReadMode(!manualReadMode);
                  setWords((prev) =>
                    prev.map((w) => ({ ...w, showTranslation: false, heard: false }))
                  );
                }}
                className="max-sm:px-2 max-sm:text-xs"
              >
                {t("practice.manual_read")}
              </CloudButton>
              <CloudButton
                variant={detailMode ? "brand" : "outline"}
                size="pill"
                onClick={() => {
                  setDetailMode((v) => {
                    const next = !v;
                    if (next) {
                      const targetIndex = viewMode === "card" ? cardIndex : (selectedIndex ?? activeIndex);
                      if (targetIndex >= 0 && words[targetIndex]) {
                        setWords((prev) =>
                          prev.map((w, i) => (i === targetIndex ? { ...w, showTranslation: true } : w))
                        );
                      }
                    } else {
                      setDetailWord(null);
                    }
                    return next;
                  });
                }}
                className="max-sm:px-2 max-sm:text-xs"
              >
                <BookOpen size={15} />
                <span className="hidden sm:inline">{t("practice.expand")}</span>
              </CloudButton>
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
            </div>
            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              <CloudButton variant="brand" size="iconRound" onClick={handleNext} aria-label={t("practice.next")}>
                <ArrowRight size={20} />
              </CloudButton>
            </div>
          </div>
        </div>
      </div>
    </FlowPageShell>
  );
}
