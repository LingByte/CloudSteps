import { BookOpen, Check, ChevronLeft, ChevronRight, LayoutGrid, List, Volume2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { PRACTICE_TRANS_CLASS, PRACTICE_CARD_WORD_CLASS } from "./PracticeFontSettings";
import { CloudButton } from "./cloudsteps";
import { WordDetailPanel } from "./WordDetailPanel";
import { StudyNoteLauncher } from "./StudyNotePanel";

export type MarkableWord = {
  id: string | number;
  word: string;
  phonetic?: string;
  translation?: string;
  audioUrl?: string;
  showTranslation?: boolean;
  /** 是否已点过发音（用于：第一次发音，第二次显示释义） */
  heard?: boolean;
  status: null | "correct" | "wrong";
};

export type WordViewMode = "list" | "card";

/** 勾选态优先；正确/点中均用青绿色，错误仍为红 */
export function markWordCardClass(
  status: MarkableWord["status"],
  tapped?: boolean
): string {
  if (status === "correct") return "bg-[#4ECDC4]/[0.06]";
  if (status === "wrong") return "bg-[#FF6B6B]/10";
  if (tapped) return "bg-[#4ECDC4]/[0.03]";
  return "bg-white";
}

/** 完整 inline 边框，避免被 theme 里 `* { border-color }` 盖掉 */
export function markWordCardStyle(
  status: MarkableWord["status"],
  tapped?: boolean
): {
  borderWidth: number;
  borderStyle: "solid";
  borderColor: string;
  backgroundColor: string;
} {
  if (status === "correct") {
    return {
      borderWidth: 2,
      borderStyle: "solid",
      borderColor: "#4ECDC4",
      backgroundColor: "rgba(78, 205, 196, 0.06)",
    };
  }
  if (status === "wrong") {
    return {
      borderWidth: 2,
      borderStyle: "solid",
      borderColor: "#FF6B6B",
      backgroundColor: "rgba(255, 107, 107, 0.1)",
    };
  }
  if (tapped) {
    return {
      borderWidth: 2,
      borderStyle: "solid",
      borderColor: "#4ECDC4",
      backgroundColor: "rgba(78, 205, 196, 0.03)",
    };
  }
  return {
    borderWidth: 2,
    borderStyle: "solid",
    borderColor: "#E2E8F0",
    backgroundColor: "#ffffff",
  };
}

/** 仅当前交互中的词高亮（heard / 释义 / 正在播放），不累积多张 */
export function isWordCardTapped(
  word: Pick<MarkableWord, "heard" | "showTranslation">,
  playingId?: string | number | null,
  wordId?: string | number
): boolean {
  return !!(word.heard || word.showTranslation || (playingId != null && playingId === wordId));
}

type StatsBarProps = {
  correctCount: number;
  wrongCount: number;
  total: number;
};

export function WordMarkStatsBar({ correctCount, wrongCount, total }: StatsBarProps) {
  const { t } = useTranslation();
  const marked = correctCount + wrongCount;
  const rate = marked > 0 ? Math.round((correctCount / marked) * 100) : 0;
  const progress = total > 0 ? Math.min(100, Math.round((marked / total) * 100)) : 0;

  return (
    <div className="bg-card border border-border rounded-xl px-3 py-2.5 mb-4">
      <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
        <span>
          {t("word.correct")}: <span className="text-[#4ECDC4] font-semibold">{correctCount}</span>
          {" / "}
          {t("word.wrong")}: <span className="text-[#FF6B6B] font-semibold">{wrongCount}</span>
        </span>
        <span>
          {t("word.accuracy")}: <span className="text-foreground font-semibold">{rate}%</span>
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress}%` }} />
      </div>
    </div>
  );
}

type CardProps = {
  words: MarkableWord[];
  index: number;
  onIndexChange: (index: number) => void;
  playingId: string | number | null;
  onPlay: (word: MarkableWord) => void;
  onWordClick: (word: MarkableWord) => void;
  onStatus: (id: string | number, status: "correct" | "wrong") => void;
  /** 外部控制：展开该词的拓展面板（页内，非模态） */
  detailWordId?: string | number | null;
  onDetailClose?: () => void;
  simpleMode?: boolean;
  /**
   * 拓展增幅：跟点词节奏联动，仅在 showTranslation 时展示详情，
   * 不单独劫持第一次读音。
   */
  amplifyDetail?: boolean;
  /** 只看单词，不显示 ✓ / ✗ */
  hideStatus?: boolean;
  /** 单词级笔记存储 key 生成器 */
  noteStorageKey?: (word: MarkableWord) => string;
};

export function WordCardPanel({
  words,
  index,
  onIndexChange,
  playingId,
  onPlay,
  onWordClick,
  onStatus,
  detailWordId,
  onDetailClose,
  simpleMode = true,
  amplifyDetail = false,
  hideStatus = false,
  noteStorageKey,
}: CardProps) {
  const { t } = useTranslation();
  const safeIndex = words.length ? Math.min(Math.max(0, index), words.length - 1) : 0;
  const word = words[safeIndex];
  const [localDetail, setLocalDetail] = useState(false);
  const detailControlled = detailWordId !== undefined;
  const detailOpen = amplifyDetail
    ? !!word?.showTranslation
    : detailControlled
      ? detailWordId === word?.id
      : localDetail;

  // 切换单词时收起本地详情
  useEffect(() => {
    setLocalDetail(false);
  }, [safeIndex]);

  if (!word) {
    return (
      <div className="py-16 text-center text-sm text-muted-foreground">{t("word.no_words")}</div>
    );
  }

  const tapped = isWordCardTapped(word, playingId, word.id);

  return (
    <div className="flex w-full flex-col gap-3">
      <div
        className={`relative flex w-full flex-col overflow-hidden rounded-2xl shadow-sm transition-colors ${markWordCardClass(
          word.status,
          tapped
        )}`}
        style={{
          ...markWordCardStyle(word.status, tapped),
          minHeight: "min(62vh, calc(100dvh - 13.5rem))",
        }}
      >
        <p className="pointer-events-none absolute left-0 right-0 top-4 z-10 text-center text-xs text-muted-foreground">
          {safeIndex + 1} / {words.length}
        </p>

        <div className="relative flex min-h-0 flex-1 items-center justify-center px-2 sm:px-3">
          <CloudButton
            type="button"
            variant="ghost"
            size="iconRound"
            disabled={safeIndex <= 0}
            onClick={() => onIndexChange(safeIndex - 1)}
            aria-label={t("practice.prev")}
            className="absolute left-2 top-1/2 z-10 size-11 shrink-0 -translate-y-1/2 bg-muted/90 shadow-sm disabled:opacity-35 sm:left-3"
          >
            <ChevronLeft size={24} />
          </CloudButton>

          <button
            type="button"
            className="mx-auto flex w-full max-w-[calc(100%-6.5rem)] cursor-pointer flex-col items-center justify-center px-2 py-10 text-center outline-none"
            onClick={() => onWordClick(word)}
          >
            <h2 className={`${PRACTICE_CARD_WORD_CLASS} text-center hover:text-[#4ECDC4] transition-colors`}>
              {word.word}
            </h2>
            {word.showTranslation && (
              <>
                {word.phonetic ? (
                  <p className="mt-4 text-sm text-[#718096] font-mono">{word.phonetic}</p>
                ) : null}
                {word.translation ? (
                  <p className={`${PRACTICE_TRANS_CLASS} mt-3 animate-in fade-in`}>
                    {word.translation}
                  </p>
                ) : null}
              </>
            )}
          </button>

          <CloudButton
            type="button"
            variant="ghost"
            size="iconRound"
            disabled={safeIndex >= words.length - 1}
            onClick={() => onIndexChange(safeIndex + 1)}
            aria-label={t("practice.next")}
            className="absolute right-2 top-1/2 z-10 size-11 shrink-0 -translate-y-1/2 bg-muted/90 shadow-sm disabled:opacity-35 sm:right-3"
          >
            <ChevronRight size={24} />
          </CloudButton>
        </div>

        <div className="flex items-center justify-center gap-4 border-t border-border/60 px-4 py-4">
          {noteStorageKey && (
            <StudyNoteLauncher
              storageKey={noteStorageKey(word)}
              title={t("word.note_title", { word: word.word })}
              label={t("word.note")}
              className="h-9 px-2"
            />
          )}
          <CloudButton type="button" variant="ghost" size="iconRound" className="size-12" onClick={() => onPlay(word)}>
            <Volume2
              size={22}
              className={playingId === word.id ? "text-[#4ECDC4] animate-pulse" : "text-[#4ECDC4]"}
            />
          </CloudButton>
          <CloudButton
            type="button"
            variant="ghost"
            size="iconRound"
            className={`size-12 text-[#4ECDC4] hover:bg-[#4ECDC4]/10 ${amplifyDetail ? "opacity-60" : ""}`}
            onClick={() => {
              if (amplifyDetail) return;
              if (detailControlled) {
                if (detailOpen) onDetailClose?.();
                else onWordClick(word);
              } else {
                setLocalDetail((v) => !v);
              }
            }}
            aria-label={t("word.detail_aria")}
            title={amplifyDetail ? t("word.detail_auto_expand") : t("word.detail_aria")}
          >
            <BookOpen size={22} />
          </CloudButton>
          {!hideStatus && (
            <>
              <CloudButton
                type="button"
                variant={word.status === "correct" ? "mint" : "ghost"}
                size="iconRound"
                className="size-12"
                onClick={() => onStatus(word.id, "correct")}
              >
                <Check size={22} />
              </CloudButton>
              <CloudButton
                type="button"
                variant={word.status === "wrong" ? "destructive" : "ghost"}
                size="iconRound"
                className="size-12"
                onClick={() => onStatus(word.id, "wrong")}
              >
                <X size={22} />
              </CloudButton>
            </>
          )}
        </div>
      </div>

      {detailOpen && (
        <div className="w-full">
          <WordDetailPanel
            wordId={word.id}
            wordText={word.word}
            variant="inline"
            simpleMode={simpleMode}
            onClose={() => {
              setLocalDetail(false);
              onDetailClose?.();
            }}
          />
        </div>
      )}
    </div>
  );
}

export function WordViewModeToggle({
  mode,
  onChange,
}: {
  mode: WordViewMode;
  onChange: (mode: WordViewMode) => void;
}) {
  const { t } = useTranslation();
  const isCard = mode === "card";
  return (
    <CloudButton
      type="button"
      variant="outline"
      size="pill"
      className="shrink-0 max-sm:px-2 max-sm:text-xs"
      onClick={() => onChange(isCard ? "list" : "card")}
      aria-label={isCard ? t("word.switch_list") : t("word.switch_card")}
    >
      {isCard ? <List size={16} /> : <LayoutGrid size={16} />}
      {isCard ? t("word.view_list") : t("word.view_card")}
    </CloudButton>
  );
}
