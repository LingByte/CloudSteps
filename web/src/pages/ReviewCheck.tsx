import { Volume2, Check, X, Shuffle, BookOpen, PanelTop, ArrowRight } from "lucide-react";
import { normalizeSnowflakeId } from "../utils/json-snowflake";
import { useNavigate } from "react-router";
import { useEffect, useMemo, useState } from "react";
import { AnnotationLayer } from "../components/AnnotationLayer";
import { PRACTICE_WORD_CLASS } from "../components/PracticeFontSettings";
import { PracticeFlowToolbar } from "../components/PracticeFlowToolbar";
import { CloudButton } from "../components/cloudsteps";
import { FlowPageShell } from "../components/PageTransition";
import { TopBar } from "../components/TopBar";
import { requestPracticePauseMenu, allowPracticeLeaveOnce } from "../utils/practiceFlowLock";
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
import { StudyNoteLauncher } from "../components/StudyNotePanel";

import { NoteSplitLayout } from "../components/NoteSplitLayout";
import { useNote } from "../components/NoteContext";
import { applyUserWordView } from "../components/WordEditControls";

import { startReviewSession } from "../api/review";
import { nextWordTapState, syncDetailWordWithTap } from "../utils/wordReveal";
import { beginReviewPractice, type ReviewPracticeWord } from "../utils/reviewPractice";
import { useTranslation } from "react-i18next";
import { formatApiMessage } from "../utils/apiMessage";

type ReviewWord = {
  id: string | number;
  word: string;
  phonetic?: string;
  phoneticUk?: string;
  phoneticUs?: string;
  translation?: string;
  audioUrl?: string;
  showTranslation?: boolean;
  heard?: boolean;
  status: null | "correct" | "wrong";
};

type StartReviewData = {
  sessionId?: number;
  words?: ReviewPracticeWord[];
  finished?: boolean;
};

export default function ReviewCheck() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [words, setWords] = useState<ReviewWord[]>([]);
  const [loading, setLoading] = useState(true);
  /** 无词可复习时后端返回 finished + msg */
  const [emptyMessage, setEmptyMessage] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const handleBack = () => {
    requestPracticePauseMenu();
  };

  const wordBookId = useMemo(() => normalizeSnowflakeId(sessionStorage.getItem("lb_wordbook_id")), []);
  const note = useNote();
  const [sessionId, setSessionId] = useState<number>(0);
  const [annotationOpen, setAnnotationOpen] = useState(false);
  const [viewMode, setViewMode] = useState<WordViewMode>("list");
  const [cardIndex, setCardIndex] = useState(0);
  const [detailMode, setDetailMode] = useState(false);
  const [detailWord, setDetailWord] = useState<{ id: string | number; word: string } | null>(null);

  useEffect(() => {
    sessionStorage.setItem("lb_mode", "review");
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      setEmptyMessage(null);
      setLoadError(null);
      try {
        const res = await startReviewSession({ wordBookId });
        if (!mounted) return;

        const data = res.data as StartReviewData | undefined;
        if (res.code === 200 && data?.finished) {
          setSessionId(0);
          setWords([]);
          setEmptyMessage(formatApiMessage(res.msg, "practice.no_review_words"));
          return;
        }

        const sid = Number(data?.sessionId || 0);
        const ws = Array.isArray(data?.words) ? data!.words! : [];
        setSessionId(sid);
        setWords(
          ws.map((w) => ({
            id: Number(w.id),
            word: String(w.word || ""),
            phonetic: w.phonetic ? String(w.phonetic) : undefined,
            phoneticUk: w.phoneticUk ? String(w.phoneticUk) : undefined,
            phoneticUs: w.phoneticUs ? String(w.phoneticUs) : undefined,
            translation: w.translation ? String(w.translation) : undefined,
            audioUrl: w.audioUrl ? String(w.audioUrl) : undefined,
            status: null,
          }))
        );
        if (ws.length === 0 && !data?.finished) {
          setEmptyMessage(formatApiMessage(res.msg, "practice.no_review_content"));
        }
      } catch (e: unknown) {
        const msg = e && typeof e === "object" && "msg" in e ? String((e as { msg: string }).msg) : formatApiMessage(undefined, "common.query_failed");
        if (mounted) setLoadError(msg);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [wordBookId]);

  const handleStatusClick = (id: string | number, newStatus: "correct" | "wrong") => {
    setWords((prev) =>
      prev.map((word) => {
        if (word.id !== id) return word;
        if (word.status === newStatus) return word;
        return { ...word, status: newStatus };
      })
    );
  };

  const handleWordClick = (word: ReviewWord) => {
    const next = nextWordTapState({
      showTranslation: !!word.showTranslation,
      heard: !!word.heard,
    });
    if (next.shouldPlay && word.audioUrl) {
      // 有音频时按同一节奏发音
    }
    setWords((prev) =>
      prev.map((w) => {
        if (w.id === word.id) {
          return { ...w, heard: next.heard, showTranslation: next.showTranslation };
        }
        return { ...w, heard: false, showTranslation: false };
      })
    );
    setDetailWord(syncDetailWordWithTap(detailMode, next, word));
  };

  const handlePlayAudio = (_word: ReviewWord) => {
    // ReviewCheck 当前无音频源
  };

  const handleShuffle = () => {
    const shuffled = [...words];
    for (let i = shuffled.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    if (shuffled.length > 1 && shuffled.every((word, index) => word.id === words[index].id)) {
      [shuffled[0], shuffled[1]] = [shuffled[1], shuffled[0]];
    }
    setWords(shuffled);
  };

  const handleSelectAll = () => {
    const allSelected = words.every((word) => word.status !== null);
    if (allSelected) {
      setWords(words.map((word) => ({ ...word, status: null })));
    } else {
      setWords(words.map((word) => ({ ...word, status: "correct" })));
    }
  };

  const markedWords = words.filter((w) => w.status !== null);
  const [submitting, setSubmitting] = useState(false);
  const [hint, setHint] = useState<string | null>(null);

  const handleSubmit = () => {
    if (submitting) return;
    if (markedWords.length === 0) {
      setHint(t("practice.mark_before_study"));
      return;
    }
    if (!sessionId) {
      setHint(t("practice.session_not_ready"));
      return;
    }
    setHint(null);
    setSubmitting(true);
    try {
      // 与课前检测一致：勾选后进入练习链路；最终对错在组内/训后检测提交
      const practiceWords: ReviewPracticeWord[] = markedWords.map((w) => ({
        id: w.id,
        word: w.word,
        phonetic: w.phonetic,
        phoneticUk: w.phoneticUk,
        phoneticUs: w.phoneticUs,
        translation: w.translation,
        audioUrl: w.audioUrl,
      }));
      beginReviewPractice({
        sessionId,
        wordBookId,
        words: practiceWords,
        returnPath: "/word-training",
      });
      navigate("/word-practice", { replace: true });
    } catch {
      setHint(t("practice.cannot_start"));
      setSubmitting(false);
    }
  };

  const correctCount = words.filter((word) => word.status === "correct").length;
  const wrongCount = words.filter((word) => word.status === "wrong").length;

  const showList = !loading && !loadError && !emptyMessage && words.length > 0;

  return (
    <FlowPageShell>
      <TopBar
        title={t("review_check.title")}
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
        storageKey={`review-check:${wordBookId}:${sessionId}`}
        open={annotationOpen}
        onOpenChange={setAnnotationOpen}
      />

      <NoteSplitLayout
        defaultStorageKey={`study-note:global:${wordBookId}`}
        defaultTitle="随心记"
      >
        {loading && (
          <p className="text-center text-[#718096] py-12">{t("practice.loading")}</p>
        )}

        {loadError && (
          <div className="rounded-xl bg-white border border-[#E2E8F0] p-6 text-center space-y-4">
            <p className="text-[#FF6B6B]">{loadError}</p>
            <CloudButton type="button" variant="brand" size="pill" onClick={() => {
              allowPracticeLeaveOnce();
              navigate("/word-training", { replace: true });
            }}>
              {t("practice.back")}
            </CloudButton>
          </div>
        )}

        {!loading && !loadError && emptyMessage && (
          <div className="rounded-xl bg-white border border-[#E2E8F0] p-8 text-center space-y-4 shadow-sm">
            <BookOpen className="mx-auto text-[#4ECDC4]" size={40} />
            <p className="text-[#2D3748] font-medium">{emptyMessage}</p>
            <p className="text-sm text-[#718096]">{t("practice.empty_review_hint")}</p>
            <CloudButton
              type="button"
              variant="brand"
              size="pill"
              className="w-full max-w-xs mx-auto"
              onClick={() => {
                allowPracticeLeaveOnce();
                navigate("/word-training", { replace: true });
              }}
            >
              {t("practice.back")}
            </CloudButton>
          </div>
        )}

        {showList && (
          <>
            <p className="text-center text-[#718096] mb-4">
              {t("practice.optional_words", { count: words.length })}
            </p>
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
                playingId={null}
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
                      isWordCardTapped(word)
                    )}`}
                    style={markWordCardStyle(word.status, isWordCardTapped(word))}
                    onClick={() => handleWordClick(word)}
                  >
                    <div className="flex flex-row items-center justify-between gap-2">
                      <div className="flex min-w-0 flex-1 items-center gap-2">
                        <div className="min-w-0">
                          <span className={`${PRACTICE_WORD_CLASS} hover:text-[#4ECDC4] transition-colors`}>{word.word}</span>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1 sm:gap-2 -mr-1 sm:mr-0">
                        <div onClick={(e) => e.stopPropagation()}>
                          <StudyNoteLauncher
                            storageKey={`study-note:word:${wordBookId}:${word.id}`}
                            title={t("practice.note_title", { word: word.word })}
                            label={t("practice.note")}
                            className="h-9 px-2"
                            onOpen={() => note.openNote(`study-note:word:${wordBookId}:${word.id}`, t("practice.note_title", { word: word.word }))}
                          />
                        </div>
                        <CloudButton
                          type="button"
                          variant="ghost"
                          size="iconRound"
                          className="size-8 sm:size-9"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Volume2 size={18} className="text-[#4ECDC4]" />
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
                      <div onClick={(event) => event.stopPropagation()}>
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
          </>
        )}
      </NoteSplitLayout>

      {showList && (
        <div className="fixed bottom-0 left-0 right-0 z-20 bg-white border-t border-[#E2E8F0] px-3 sm:px-4 py-1.5 sm:py-2 shadow-lg">
          <div className="max-w-2xl lg:max-w-5xl mx-auto w-full space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 sm:gap-2 flex-1 min-w-0 overflow-x-auto">
                <WordViewModeToggle mode={viewMode} onChange={setViewMode} />
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
              <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                <CloudButton variant="outline" size="pill" onClick={handleShuffle} className="max-sm:px-2 max-sm:text-xs">
                  <Shuffle size={15} />
                  <span className="hidden sm:inline">{t("practice.shuffle")}</span>
                </CloudButton>
                <CloudButton variant="outline" size="pill" onClick={handleSelectAll} className="max-sm:px-2 max-sm:text-xs">
                  {t("practice.select_all")}
                </CloudButton>
                <CloudButton
                  type="button"
                  variant="brand"
                  size="iconRound"
                  onClick={handleSubmit}
                  disabled={markedWords.length === 0 || submitting}
                  loading={submitting}
                  aria-label={t("practice.start_study")}
                >
                  <ArrowRight size={20} />
                </CloudButton>
              </div>
            </div>
            {hint && (
              <p className="text-center text-xs text-amber-600 mt-2">{hint}</p>
            )}
            {!hint && markedWords.length === 0 && (
              <p className="text-center text-xs text-[#A0AEC0] mt-2">
                {t("practice.hint_select_review")}
              </p>
            )}
          </div>
        </div>
      )}
    </FlowPageShell>
  );
}
