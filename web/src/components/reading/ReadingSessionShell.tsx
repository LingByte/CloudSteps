import type { ReactNode } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "../../utils/cn";

type Props = {
  title: string;
  subtitle?: string;
  collapsed: boolean;
  onToggleCollapse?: () => void;
  collapseLabel?: string;
  expandLabel?: string;
  /** Show collapse control on mobile only (PC keeps side panel). */
  collapsible?: boolean;
  passage: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
};

/** Passage + session panel: bottom sheet on mobile, right rail on PC. */
export function ReadingSessionShell({
  title,
  subtitle,
  collapsed,
  onToggleCollapse,
  collapseLabel = "收起",
  expandLabel = "展开",
  collapsible = true,
  passage,
  children,
  footer,
  className,
}: Props) {
  return (
    <div className={cn("flex-1 min-h-0 flex flex-col lg:flex-row", className)}>
      <div className="flex-1 min-h-0 overflow-auto px-3 pt-3 pb-3">{passage}</div>

      <aside className="shrink-0 bg-white border-t border-[#E2E8F0] shadow-[0_-8px_24px_rgba(15,23,42,0.06)] lg:shadow-none lg:border-t-0 lg:border-l lg:w-[min(420px,42vw)] lg:flex lg:flex-col lg:min-h-0">
        <div className="flex items-start justify-between gap-2 px-3 py-2.5 border-b border-[#F1F5F9]">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-[#2D3748]">{title}</h3>
            {subtitle ? (
              <p className="text-[11px] text-[#64748B] mt-0.5">{subtitle}</p>
            ) : null}
          </div>
          {collapsible && onToggleCollapse ? (
            <button
              type="button"
              onClick={onToggleCollapse}
              className="lg:hidden inline-flex items-center gap-1 text-xs font-medium text-[var(--primary)] shrink-0"
            >
              {collapsed ? expandLabel : collapseLabel}
              {collapsed ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
          ) : null}
        </div>

        <div
          className={cn(
            "overflow-hidden transition-[max-height] duration-300 ease-in-out",
            "lg:flex-1 lg:min-h-0 lg:overflow-y-auto lg:!max-h-none",
            collapsed ? "max-lg:max-h-0" : "max-lg:max-h-[48vh]"
          )}
        >
          <div className="px-3 py-2 max-lg:overflow-y-auto max-lg:max-h-[48vh] lg:h-full lg:overflow-y-auto">
            {children}
          </div>
        </div>

        {footer ? (
          <div className="border-t border-[#F1F5F9] bg-white px-3 py-2.5">{footer}</div>
        ) : null}
      </aside>
    </div>
  );
}
