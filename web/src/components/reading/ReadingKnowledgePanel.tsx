import { Button, Spin } from "@arco-design/web-react";
import { BookOpen, ChevronLeft, Copy, Pin } from "lucide-react";
import { cn } from "../../utils/cn";

export type ReadingKnowledgeItem =
  | {
      kind: "point";
      id: string;
      title: string;
      body: string;
      tag?: string;
    }
  | {
      kind: "word";
      id: string;
      word: string;
      phonetic?: string;
      translation?: string;
    };

type Props = {
  items: ReadingKnowledgeItem[];
  loading?: boolean;
  onPrevStep: () => void;
  onFinish: () => void;
  prevLabel: string;
  finishLabel: string;
  emptyLabel: string;
  pointTag: string;
  wordTag: string;
  copyLabel: string;
};

export function ReadingKnowledgePanel({
  items,
  loading,
  onPrevStep,
  onFinish,
  prevLabel,
  finishLabel,
  emptyLabel,
  pointTag,
  wordTag,
  copyLabel,
}: Props) {
  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // ignore
    }
  };

  return (
    <div className="space-y-3">
      {loading ? (
        <div className="flex justify-center py-8">
          <Spin />
        </div>
      ) : items.length === 0 ? (
        <p className="text-sm text-[#94A3B8] py-4">{emptyLabel}</p>
      ) : (
        items.map((item) =>
          item.kind === "point" ? (
            <div
              key={item.id}
              className="rounded-xl border border-[#E2E8F0] bg-white px-3 py-3"
            >
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[#475569]">
                  <Pin size={12} className="text-[var(--primary)]" />
                  {pointTag}
                </span>
                <div className="flex items-center gap-2">
                  {item.tag ? (
                    <span className="text-[10px] rounded bg-[#F1F5F9] px-1.5 py-0.5 text-[#64748B]">
                      {item.tag}
                    </span>
                  ) : null}
                  <button
                    type="button"
                    aria-label={copyLabel}
                    className="text-[#94A3B8] hover:text-[var(--primary)]"
                    onClick={() => void copyText(`${item.title}\n${item.body}`)}
                  >
                    <Copy size={14} />
                  </button>
                </div>
              </div>
              <p className="text-sm font-semibold text-[#2D3748]">{item.title}</p>
              <p className="text-sm text-[#475569] mt-1.5 leading-6 whitespace-pre-line">
                {item.body}
              </p>
            </div>
          ) : (
            <div
              key={item.id}
              className={cn(
                "rounded-xl border border-[#FDE68A]/80 bg-[#FFFBEB] px-3 py-3"
              )}
            >
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[#92400E]">
                  <BookOpen size={12} />
                  {wordTag}
                </span>
                <button
                  type="button"
                  aria-label={copyLabel}
                  className="text-[#92400E]/70 hover:text-[#92400E]"
                  onClick={() =>
                    void copyText(
                      [item.word, item.phonetic, item.translation].filter(Boolean).join(" ")
                    )
                  }
                >
                  <Copy size={14} />
                </button>
              </div>
              <p className="text-sm font-semibold text-[#2D3748]">{item.word}</p>
              {item.phonetic ? (
                <p className="text-xs text-[#64748B] mt-0.5">{item.phonetic}</p>
              ) : null}
              <p className="text-sm text-[#475569] mt-1.5">
                {item.translation || "—"}
              </p>
            </div>
          )
        )
      )}

      <div className="flex items-center gap-2 pt-1">
        <Button className="flex-1 !inline-flex !items-center !justify-center !gap-1" onClick={onPrevStep}>
          <ChevronLeft size={16} className="shrink-0" />
          <span>{prevLabel}</span>
        </Button>
        <Button className="flex-1 !inline-flex !items-center !justify-center" type="primary" onClick={onFinish}>
          {finishLabel}
        </Button>
      </div>
    </div>
  );
}
