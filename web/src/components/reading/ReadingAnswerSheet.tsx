import { useMemo } from "react";
import { Button } from "@arco-design/web-react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "../../utils/cn";
import type { ReadingOption, ReadingQuestionView } from "../../api/reading";

export type QuestionFeedback = {
  correct: boolean;
  rightAnswer: string;
  explanation?: string;
};

type Props = {
  questions: ReadingQuestionView[];
  answers: Record<number, string>;
  feedback: Record<number, QuestionFeedback>;
  /** questionId → option keys in display order (for 再答乱序). */
  optionOrder?: Record<number, string[]>;
  /** When false (初答), only show ✓/✗ for the pick — never reveal the right key/explanation. */
  revealAnswer?: boolean;
  currentIndex: number;
  answeredCount: number;
  onSelectIndex: (index: number) => void;
  onAnswer: (questionId: number, key: string) => void;
  onPrevStep: () => void;
  onNextStep: () => void;
  prevStepLabel: string;
  prevQuestionLabel: string;
  nextQuestionLabel: string;
  nextStepLabel: string;
  answeredLabel: string;
  correctTag: string;
  yourAnswerLabel: string;
  rightAnswerLabel: string;
  nextDisabled?: boolean;
  nextLoading?: boolean;
};

function orderedOptions(
  options: ReadingOption[] | undefined,
  order?: string[]
): ReadingOption[] {
  const list = options || [];
  if (!order?.length) return list;
  const map = new Map(list.map((o) => [o.key, o]));
  const out: ReadingOption[] = [];
  for (const key of order) {
    const hit = map.get(key);
    if (hit) out.push(hit);
  }
  for (const o of list) {
    if (!order.includes(o.key)) out.push(o);
  }
  return out;
}

export function ReadingAnswerSheet({
  questions,
  answers,
  feedback,
  optionOrder,
  revealAnswer = false,
  currentIndex,
  answeredCount,
  onSelectIndex,
  onAnswer,
  onPrevStep,
  onNextStep,
  prevStepLabel,
  prevQuestionLabel,
  nextQuestionLabel,
  nextStepLabel,
  answeredLabel,
  correctTag,
  yourAnswerLabel,
  rightAnswerLabel,
  nextDisabled,
  nextLoading,
}: Props) {
  const q = questions[currentIndex];
  const total = questions.length;
  const hasPrevQuestion = currentIndex > 0;
  const hasNextQuestion = currentIndex < total - 1;
  const fb = q ? feedback[q.id] : undefined;

  const options = useMemo(
    () => orderedOptions(q?.options, q ? optionOrder?.[q.id] : undefined),
    [q, optionOrder]
  );

  return (
    <div className="space-y-3">
      {q ? (
        <>
          <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide">
            <span className="text-[11px] text-[#64748B] shrink-0">
              {answeredLabel} {answeredCount}/{total}
            </span>
            {questions.map((item, idx) => {
              const answered = Boolean(answers[item.id]);
              const itemFb = feedback[item.id];
              const active = idx === currentIndex;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelectIndex(idx)}
                  className={cn(
                    "shrink-0 rounded-md px-2 py-1 text-[11px] font-medium border",
                    active
                      ? "bg-[var(--primary)] border-[var(--primary)] text-white"
                      : itemFb
                        ? itemFb.correct
                          ? "bg-[#DCFCE7] border-[#BBF7D0] text-[#166534]"
                          : "bg-[#FEE2E2] border-[#FECACA] text-[#B91C1C]"
                        : answered
                          ? "bg-[var(--primary-soft)] border-[var(--primary)]/30 text-[var(--primary-deep)]"
                          : "bg-white border-[#E2E8F0] text-[#64748B]"
                  )}
                >
                  {idx + 1}
                </button>
              );
            })}
          </div>

          <p className="text-sm font-medium text-[#2D3748]">{q.stem}</p>
          <div className="space-y-2">
            {options.map((opt) => {
              const selected = answers[q.id] === opt.key;
              const showRightMark = Boolean(revealAnswer && fb && opt.key === fb.rightAnswer);
              const isWrongPick = Boolean(fb && selected && !fb.correct);
              const isRightPick = Boolean(fb && selected && fb.correct);
              return (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => onAnswer(q.id, opt.key)}
                  disabled={Boolean(fb)}
                  className={cn(
                    "w-full text-left rounded-xl border px-3 py-2.5 text-sm transition-colors",
                    showRightMark || isRightPick
                      ? "border-[#86EFAC] bg-[#F0FDF4] text-[#166534]"
                      : isWrongPick
                        ? "border-[#FCA5A5] bg-[#FEF2F2] text-[#B91C1C]"
                        : selected
                          ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary-deep)]"
                          : "border-[#E2E8F0] bg-white text-[#2D3748] hover:border-[var(--primary)]/50",
                    fb && "cursor-default"
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span>
                      <span className="font-semibold mr-2">{opt.key}.</span>
                      {opt.text}
                    </span>
                    {showRightMark ? (
                      <span className="text-[10px] font-medium rounded bg-[#BBF7D0] px-1.5 py-0.5 shrink-0">
                        {correctTag}
                      </span>
                    ) : null}
                  </div>
                </button>
              );
            })}
          </div>

          {fb ? (
            <div
              className={cn(
                "rounded-xl border px-3 py-2.5 text-sm",
                fb.correct
                  ? "border-[#BBF7D0] bg-[#F0FDF4] text-[#166534]"
                  : "border-[#FECACA] bg-[#FEF2F2] text-[#B91C1C]"
              )}
            >
              <p>
                {yourAnswerLabel}: {answers[q.id] || "—"}{" "}
                {fb.correct ? "✓" : "✗"}
              </p>
              {revealAnswer && !fb.correct ? (
                <p className="mt-1">
                  {rightAnswerLabel}: {fb.rightAnswer}
                </p>
              ) : null}
              {revealAnswer && fb.explanation ? (
                <p className="mt-1.5 text-[#475569] whitespace-pre-line">{fb.explanation}</p>
              ) : null}
            </div>
          ) : null}
        </>
      ) : null}

      <div className="flex items-center gap-2 pt-1">
        <Button
          className="flex-1 !inline-flex !items-center !justify-center !gap-1"
          onClick={() => {
            if (hasPrevQuestion) onSelectIndex(currentIndex - 1);
            else onPrevStep();
          }}
        >
          <ChevronLeft size={16} className="shrink-0" />
          <span>{hasPrevQuestion ? prevQuestionLabel : prevStepLabel}</span>
        </Button>
        <Button
          className="flex-1 !inline-flex !items-center !justify-center !gap-1"
          type="primary"
          loading={!hasNextQuestion && nextLoading}
          disabled={!hasNextQuestion && nextDisabled}
          onClick={() => {
            if (hasNextQuestion) onSelectIndex(currentIndex + 1);
            else onNextStep();
          }}
        >
          <span>{hasNextQuestion ? nextQuestionLabel : nextStepLabel}</span>
          <ChevronRight size={16} className="shrink-0" />
        </Button>
      </div>
    </div>
  );
}
