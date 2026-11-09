import type { ReactNode } from "react";
import { cn } from "../utils/cn";

type HomeFeatureCardProps = {
  index: number;
  title: string;
  description: string;
  tags?: string[];
  meta?: string;
  onClick: () => void;
  className?: string;
  "data-coach"?: string;
};

export function HomeFeatureCard({
  index,
  title,
  description,
  tags = [],
  meta,
  onClick,
  className,
  "data-coach": dataCoach,
}: HomeFeatureCardProps) {
  return (
    <button
      type="button"
      data-coach={dataCoach}
      onClick={onClick}
      className={cn(
        "group relative flex w-full flex-col gap-1.5 overflow-hidden rounded-xl border border-border/70 bg-card px-3 py-2.5 text-left shadow-[var(--shadow-rest)]",
        "transition-[transform,box-shadow,border-color] duration-200",
        "hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-[0_10px_22px_-14px_rgba(61,184,176,0.45)]",
        "active:translate-y-0 active:scale-[0.99]",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="truncate text-[14px] font-semibold tracking-tight text-foreground">{title}</h3>
        {meta ? (
          <span className="shrink-0 text-[11px] text-muted-soft transition-colors group-hover:text-primary">
            {meta}
          </span>
        ) : null}
      </div>

      <div className="flex min-w-0 items-center gap-1.5">
        <span className="inline-flex h-4 min-w-4 shrink-0 items-center justify-center rounded bg-muted px-1 text-[10px] font-semibold tabular-nums text-muted-foreground">
          {String(index).padStart(2, "0")}
        </span>
        <p className="min-w-0 truncate text-[12px] leading-none text-muted-foreground">{description}</p>
      </div>

      {tags.length > 0 ? (
        <div className="flex flex-nowrap gap-1 overflow-hidden">
          {tags.map((tag) => (
            <span
              key={tag}
              className="shrink-0 rounded bg-muted/80 px-1.5 py-px text-[10px] leading-4 text-muted-foreground transition-colors group-hover:bg-primary-soft group-hover:text-primary-deep"
            >
              {tag}
            </span>
          ))}
        </div>
      ) : null}
    </button>
  );
}

export function HomeSectionHeader({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children?: ReactNode;
}) {
  return (
    <div className="mb-2.5 flex items-end justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold tracking-tight text-foreground sm:text-base">{title}</h2>
        {subtitle ? (
          <p className="mt-px text-[10px] font-medium uppercase tracking-[0.16em] text-muted-soft">
            {subtitle}
          </p>
        ) : null}
      </div>
      {children}
    </div>
  );
}

/** 首页淡字母底纹，参考语法学习页的氛围，不抢内容 */
export function HomeLetterWatermark() {
  const letters = [
    { ch: "A", className: "left-[4%] top-[8%] text-[7.5rem] rotate-[-8deg]" },
    { ch: "B", className: "right-[6%] top-[18%] text-[6.5rem] rotate-[10deg]" },
    { ch: "C", className: "left-[12%] top-[42%] text-[8rem] rotate-[6deg]" },
    { ch: "D", className: "right-[10%] top-[52%] text-[7rem] rotate-[-12deg]" },
    { ch: "E", className: "left-[40%] bottom-[8%] text-[6rem] rotate-[4deg]" },
    { ch: "G", className: "right-[28%] top-[72%] text-[5.5rem] rotate-[-6deg]" },
  ];

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden select-none"
    >
      {letters.map((item) => (
        <span
          key={item.ch}
          className={cn(
            "absolute font-serif font-bold leading-none text-primary/[0.07]",
            item.className,
          )}
        >
          {item.ch}
        </span>
      ))}
    </div>
  );
}
