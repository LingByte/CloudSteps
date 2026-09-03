import { Spin } from "@arco-design/web-react";
import { Volume2 } from "lucide-react";
import { cn } from "../../utils/cn";
import {
  normalizeReadingWord,
  tokenizeReadingText,
} from "../../utils/readingParagraphs";

type Props = {
  paragraphs: string[];
  mode?: "plain" | "words";
  activePara?: number | null;
  playingPara?: number | null;
  loadingPara?: number | null;
  selectedWord?: string | null;
  pickedWordKeys?: string[];
  onPlayParagraph?: (index: number) => void;
  onSelectWord?: (word: string) => void;
  playLabel?: (n: number) => string;
};

export function ReadingParagraphBlocks({
  paragraphs,
  mode = "plain",
  activePara = null,
  playingPara = null,
  loadingPara = null,
  selectedWord = null,
  pickedWordKeys = [],
  onPlayParagraph,
  onSelectWord,
  playLabel,
}: Props) {
  const selectedKey = selectedWord ? normalizeReadingWord(selectedWord) : "";
  const picked = new Set(pickedWordKeys.map((k) => normalizeReadingWord(k)));

  return (
    <div className="space-y-3">
      {paragraphs.map((para, idx) => {
        const isActive = activePara === idx || playingPara === idx;
        const isLoading = loadingPara === idx;
        return (
          <div
            key={idx}
            className={cn(
              "rounded-xl border px-3 py-3 transition-colors",
              isActive
                ? "border-[var(--primary)]/40 bg-[var(--primary-soft)]"
                : "border-[#E2E8F0] bg-white"
            )}
          >
            <div className="flex gap-2.5">
              <div className="flex flex-col items-center gap-1.5 shrink-0 pt-0.5">
                <span
                  className={cn(
                    "flex size-6 items-center justify-center rounded-full text-[11px] font-semibold",
                    isActive
                      ? "bg-[var(--primary)] text-white"
                      : "bg-[var(--primary-soft)] text-[var(--primary-deep)]"
                  )}
                >
                  {idx + 1}
                </span>
                {onPlayParagraph ? (
                  <button
                    type="button"
                    className={cn(
                      "flex size-7 items-center justify-center rounded-full border transition-colors",
                      isActive
                        ? "border-[var(--primary)] text-[var(--primary)] bg-white"
                        : "border-[#E2E8F0] text-[#64748B] hover:border-[var(--primary)] hover:text-[var(--primary)]"
                    )}
                    onClick={() => onPlayParagraph(idx)}
                    disabled={isLoading}
                    aria-label={playLabel?.(idx + 1) ?? `Play ${idx + 1}`}
                  >
                    {isLoading ? <Spin size={14} /> : <Volume2 size={14} />}
                  </button>
                ) : null}
              </div>
              {mode === "words" ? (
                <div className="flex flex-wrap gap-1 content-start text-sm leading-7">
                  {tokenizeReadingText(para).map((tok, ti) => {
                    if (tok.type !== "word") {
                      return (
                        <span key={`${idx}-${ti}`} className="whitespace-pre-wrap text-[#2D3748]">
                          {tok.value}
                        </span>
                      );
                    }
                    const key = normalizeReadingWord(tok.value);
                    const isPreview = key === selectedKey;
                    const isPicked = picked.has(key);
                    return (
                      <button
                        key={`${idx}-${ti}`}
                        type="button"
                        onClick={() => onSelectWord?.(tok.value)}
                        className={cn(
                          "rounded-md px-1.5 py-0.5 transition-colors",
                          isPreview
                            ? "bg-[var(--primary)] text-white"
                            : isPicked
                              ? "bg-[var(--primary-soft)] text-[var(--primary-deep)] ring-1 ring-[var(--primary)]/40"
                              : "bg-[#F1F5F9] text-[#2D3748] hover:bg-[var(--primary-soft)]"
                        )}
                      >
                        {tok.value}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p
                  className={cn(
                    "text-sm leading-7 whitespace-pre-line",
                    isActive ? "text-[var(--primary-deep)]" : "text-[#2D3748]"
                  )}
                >
                  {para}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
