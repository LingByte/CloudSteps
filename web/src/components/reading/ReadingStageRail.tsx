import type { ReactNode } from "react";
import { cn } from "../../utils/cn";
import {
  Check,
  CheckCircle2,
  Eye,
  Headphones,
  Lightbulb,
  ListChecks,
  RefreshCw,
  Search,
} from "lucide-react";

export type ReadingStageId =
  | "listen"
  | "answer"
  | "words"
  | "reanswer"
  | "analysis"
  | "knowledge"
  | "done";

/** Active stages (细学 removed). */
export const READING_ACTIVE_STAGES: ReadingStageId[] = [
  "listen",
  "answer",
  "words",
  "reanswer",
  "analysis",
  "knowledge",
  "done",
];

export const READING_STAGE_ORDER: ReadingStageId[] = [...READING_ACTIVE_STAGES];

const STAGE_ICONS: Record<ReadingStageId, ReactNode> = {
  listen: <Headphones size={14} />,
  answer: <ListChecks size={14} />,
  words: <Search size={14} />,
  reanswer: <RefreshCw size={14} />,
  analysis: <Eye size={14} />,
  knowledge: <Lightbulb size={14} />,
  done: <CheckCircle2 size={14} />,
};

type Props = {
  stages: { id: ReadingStageId; label: string }[];
  current: ReadingStageId;
  unlocked?: ReadingStageId[];
  completed?: ReadingStageId[];
  onSelect?: (id: ReadingStageId) => void;
  className?: string;
};

export function ReadingStageRail({
  stages,
  current,
  unlocked = READING_ACTIVE_STAGES,
  completed = [],
  onSelect,
  className,
}: Props) {
  const unlockedSet = new Set(unlocked);
  const completedSet = new Set(completed);

  return (
    <nav
      className={cn(
        "flex items-start gap-0 overflow-x-auto scrollbar-hide px-2 py-2",
        className
      )}
      aria-label="reading stages"
    >
      {stages.map((stage, idx) => {
        const isCurrent = stage.id === current;
        const isUnlocked = unlockedSet.has(stage.id);
        const isDone = completedSet.has(stage.id) && !isCurrent;
        const canClick = isUnlocked && Boolean(onSelect) && !isCurrent;
        return (
          <div key={stage.id} className="flex items-center shrink-0">
            {idx > 0 && (
              <div
                className={cn(
                  "h-px w-4 sm:w-6 mx-0.5",
                  isDone || isCurrent || unlockedSet.has(stages[idx - 1]?.id)
                    ? "bg-[var(--primary)]/40"
                    : "bg-[#E2E8F0]"
                )}
              />
            )}
            <button
              type="button"
              disabled={!canClick}
              onClick={() => canClick && onSelect?.(stage.id)}
              className={cn(
                "flex flex-col items-center gap-1 min-w-[3.25rem]",
                !isUnlocked && "opacity-45 cursor-not-allowed",
                canClick && "cursor-pointer"
              )}
            >
              <span
                className={cn(
                  "flex size-8 items-center justify-center rounded-full border transition-colors",
                  isCurrent
                    ? "bg-[var(--primary)] border-[var(--primary)] text-white shadow-sm"
                    : isDone
                      ? "bg-[#22C55E] border-[#22C55E] text-white"
                      : isUnlocked
                        ? "bg-white border-[var(--primary)]/35 text-[var(--primary)]"
                        : "bg-[#F8FAFC] border-[#E2E8F0] text-[#94A3B8]"
                )}
              >
                {isDone ? <Check size={14} strokeWidth={3} /> : STAGE_ICONS[stage.id]}
              </span>
              <span
                className={cn(
                  "text-[10px] font-medium whitespace-nowrap",
                  isCurrent
                    ? "text-[var(--primary-deep)]"
                    : isDone
                      ? "text-[#16A34A]"
                      : "text-[#64748B]"
                )}
              >
                {stage.label}
              </span>
            </button>
          </div>
        );
      })}
    </nav>
  );
}
