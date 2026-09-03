import { Button } from "@arco-design/web-react";
import { ChevronLeft, ChevronRight, Copy, Lightbulb } from "lucide-react";
import { cn } from "../../utils/cn";
import type { ReadingAnswerDetail, ReadingQuestionView } from "../../api/reading";

type Props = {
  questions: ReadingQuestionView[];
  firstDetails: ReadingAnswerDetail[];
  secondDetails: ReadingAnswerDetail[];
  firstScore: number;
  firstCorrect: number;
  secondScore: number;
  secondCorrect: number;
  currentIndex: number;
  onSelectIndex: (index: number) => void;
  onPrevStep: () => void;
  onNextStep: () => void;
  prevStepLabel: string;
  prevQuestionLabel: string;
  nextQuestionLabel: string;
  nextStepLabel: string;
  initialLabel: string;
  retryLabel: string;
  correctLabel: string;
  yourFirstLabel: string;
  yourRetryLabel: string;
  ideaTitle: string;
  ideaHint: string;
  copyLabel: string;
};

export function ReadingAnalysisPanel({
  questions,
  firstDetails,
  secondDetails,
  firstScore,
  firstCorrect,
  secondScore,
  secondCorrect,
  currentIndex,
  onSelectIndex,
  onPrevStep,
  onNextStep,
  prevStepLabel,
  prevQuestionLabel,
  nextQuestionLabel,
  nextStepLabel,
  initialLabel,
  retryLabel,
  correctLabel,
  yourFirstLabel,
  yourRetryLabel,
  ideaTitle,
  ideaHint,
  copyLabel,
}: Props) {
  const q = questions[currentIndex];
  const first = firstDetails.find((d) => d.questionId === q?.id);
  const second = secondDetails.find((d) => d.questionId === q?.id);
  const right = first?.rightAnswer || second?.rightAnswer || "";
  const explanation = first?.explanation || second?.explanation || "";
  const total = questions.length;

  const copyExplanation = async () => {
    if (!explanation) return;
    try {
      await navigator.clipboard.writeText(explanation);
    } catch {
      // ignore
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <span className="inline-flex items-center gap-1 rounded-full bg-[var(--primary-soft)] px-2.5 py-1 text-[11px] font-medium text-[var(--primary-deep)]">
          {initialLabel} {firstScore}% · {firstCorrect}/{total}
        </span>
        <span className="inline-flex items-center gap-1 rounded-full bg-[rgba(85,163,255,0.14)] px-2.5 py-1 text-[11px] font-medium text-[var(--secondary-brand)]">
          {retryLabel} {secondScore}% · {secondCorrect}/{total}
        </span>
      </div>

      <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide">
        {questions.map((item, idx) => {
          const f = firstDetails.find((d) => d.questionId === item.id);
          const s = secondDetails.find((d) => d.questionId === item.id);
          const ok = Boolean(s?.correct ?? f?.correct);
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
                  : ok
                    ? "bg-[#DCFCE7] border-[#BBF7D0] text-[#166534]"
                    : "bg-[#FEE2E2] border-[#FECACA] text-[#B91C1C]"
              )}
            >
              {idx + 1}
            </button>
          );
        })}
      </div>

      {q ? (
        <>
          <p className="text-sm font-medium text-[#2D3748]">{q.stem}</p>
          <div className="space-y-2">
            {(q.options || []).map((opt) => {
              const isRight = opt.key === right;
              return (
                <div
                  key={opt.key}
                  className={cn(
                    "rounded-xl border px-3 py-2.5 text-sm",
                    isRight
                      ? "border-[#86EFAC] bg-[#F0FDF4] text-[#166534]"
                      : "border-[#E2E8F0] bg-white text-[#2D3748]"
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span>
                      <span className="font-semibold mr-2">{opt.key}.</span>
                      {opt.text}
                    </span>
                    {isRight ? (
                      <span className="text-[10px] font-medium rounded bg-[#BBF7D0] px-1.5 py-0.5">
                        {correctLabel}
                      </span>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="text-xs text-[#64748B] space-y-1">
            <p>
              {yourFirstLabel}: {first?.answer || "—"}
              {first ? (first.correct ? " ✓" : " ✗") : ""}
            </p>
            <p>
              {yourRetryLabel}: {second?.answer || "—"}
              {second ? (second.correct ? " ✓" : " ✗") : ""}
            </p>
          </div>

          {explanation ? (
            <div className="relative rounded-xl border border-[var(--primary)]/25 bg-[var(--primary-soft)] px-3 py-3">
              <div className="flex items-start gap-2">
                <Lightbulb size={16} className="text-[var(--primary)] mt-0.5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-[#2D3748]">{ideaTitle}</p>
                  <p className="text-[11px] text-[#64748B] mt-0.5">{ideaHint}</p>
                  <p className="text-sm text-[#334155] mt-2 whitespace-pre-line">{explanation}</p>
                </div>
                <button
                  type="button"
                  className="text-[#64748B] hover:text-[var(--primary)]"
                  onClick={() => void copyExplanation()}
                  aria-label={copyLabel}
                >
                  <Copy size={14} />
                </button>
              </div>
            </div>
          ) : null}
        </>
      ) : null}

      <div className="flex items-center gap-2 pt-1">
        <Button
          className="flex-1 !inline-flex !items-center !justify-center !gap-1"
          onClick={() => {
            if (currentIndex > 0) onSelectIndex(currentIndex - 1);
            else onPrevStep();
          }}
        >
          <ChevronLeft size={16} className="shrink-0" />
          <span>{currentIndex > 0 ? prevQuestionLabel : prevStepLabel}</span>
        </Button>
        <Button
          className="flex-1 !inline-flex !items-center !justify-center !gap-1"
          type="primary"
          onClick={() => {
            if (currentIndex < questions.length - 1) onSelectIndex(currentIndex + 1);
            else onNextStep();
          }}
        >
          <span>
            {currentIndex < questions.length - 1 ? nextQuestionLabel : nextStepLabel}
          </span>
          <ChevronRight size={16} className="shrink-0" />
        </Button>
      </div>
    </div>
  );
}
