import { Spin } from "@arco-design/web-react";
import { Button } from "@arco-design/web-react";
import { ChevronLeft, ChevronRight, Copy, Volume2 } from "lucide-react";
import { cn } from "../../utils/cn";

export type ReadingWordPreview = {
  word: string;
  key: string;
  phonetic?: string;
  translation?: string;
};

type Props = {
  hint: string;
  preview: ReadingWordPreview | null;
  previewLoading?: boolean;
  picked: ReadingWordPreview[];
  drillLoading?: boolean;
  onUnpick?: (key: string) => void;
  onDrill?: () => void;
  onSpeak?: () => void;
  onCopy?: () => void;
  onPrevStep: () => void;
  onNextStep: () => void;
  prevLabel: string;
  nextLabel: string;
  copyLabel: string;
  speakLabel: string;
  previewTag: string;
  pickedLabel: string;
  drillLabel: string;
  unpickLabel: string;
};

export function ReadingWordsPanel({
  hint,
  preview,
  previewLoading,
  picked,
  drillLoading,
  onUnpick,
  onDrill,
  onSpeak,
  onCopy,
  onPrevStep,
  onNextStep,
  prevLabel,
  nextLabel,
  copyLabel,
  speakLabel,
  previewTag,
  pickedLabel,
  drillLabel,
  unpickLabel,
}: Props) {
  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-3">
        {previewLoading ? (
          <div className="flex justify-center py-4">
            <Spin />
          </div>
        ) : preview ? (
          <>
            <div className="flex items-center gap-2">
              <span className="text-base font-semibold text-[#2D3748]">{preview.word}</span>
              <span className="text-[10px] font-medium text-[var(--primary-deep)] bg-[var(--primary-soft)] rounded px-1.5 py-0.5">
                {previewTag}
              </span>
            </div>
            {preview.phonetic ? (
              <p className="text-xs text-[#64748B] mt-0.5">{preview.phonetic}</p>
            ) : null}
            <p className="text-sm text-[#334155] mt-2">{preview.translation || "—"}</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {onSpeak ? (
                <button
                  type="button"
                  onClick={onSpeak}
                  className={cn(
                    "flex flex-col items-center justify-center gap-1 rounded-xl border border-[#E2E8F0] bg-white py-2.5 text-[#2D3748] hover:border-[var(--primary)]/40"
                  )}
                >
                  <Volume2 size={18} className="text-[var(--primary)]" />
                  <span className="text-xs">{speakLabel}</span>
                </button>
              ) : null}
              {onCopy ? (
                <button
                  type="button"
                  onClick={onCopy}
                  className="flex flex-col items-center justify-center gap-1 rounded-xl border border-[#E2E8F0] bg-white py-2.5 text-[#2D3748] hover:border-[var(--primary)]/40"
                >
                  <Copy size={18} className="text-[var(--primary)]" />
                  <span className="text-xs">{copyLabel}</span>
                </button>
              ) : null}
            </div>
          </>
        ) : (
          <p className="text-sm text-[#94A3B8] py-2">{hint}</p>
        )}
      </div>

      {picked.length > 0 ? (
        <div className="rounded-xl border border-[#E2E8F0] bg-white px-3 py-2.5">
          <p className="text-[11px] text-[#64748B] mb-2">{pickedLabel}</p>
          <div className="flex flex-wrap gap-1.5">
            {picked.map((w) => (
              <button
                key={w.key}
                type="button"
                onClick={() => onUnpick?.(w.key)}
                className="rounded-full bg-[var(--primary-soft)] text-[var(--primary-deep)] text-[11px] px-2 py-0.5 hover:bg-[#FEE2E2] hover:text-[#B91C1C]"
                title={unpickLabel}
              >
                {w.word} ×
              </button>
            ))}
          </div>
          {onDrill ? (
            <Button
              className="mt-2.5 w-full"
              type="primary"
              loading={drillLoading}
              onClick={onDrill}
            >
              {drillLabel}
            </Button>
          ) : null}
        </div>
      ) : null}

      <div className="flex items-center gap-2">
        <Button className="flex-1 !inline-flex !items-center !justify-center !gap-1" onClick={onPrevStep}>
          <ChevronLeft size={16} className="shrink-0" />
          <span>{prevLabel}</span>
        </Button>
        <Button className="flex-1 !inline-flex !items-center !justify-center !gap-1" type="primary" onClick={onNextStep}>
          <span>{nextLabel}</span>
          <ChevronRight size={16} className="shrink-0" />
        </Button>
      </div>
    </div>
  );
}
