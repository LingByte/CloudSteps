import * as React from "react";
import { Loader2 } from "lucide-react";

import { cn } from "../ui/utils";

export type CloudButtonProps = React.ComponentPropsWithoutRef<"button"> & {
  loading?: boolean;
  loadingText?: React.ReactNode;
};

export const CloudButton = React.forwardRef<HTMLButtonElement, CloudButtonProps>(
  ({ className, type = "button", loading = false, loadingText, disabled, children, ...props }, ref) => {
    const isDisabled = disabled || loading;

    return (
      <button
        ref={ref}
        type={type}
        disabled={isDisabled}
        className={cn(
          "relative inline-flex items-center justify-center gap-2 select-none",
          "transition-all duration-200 ease-out",
          "hover:-translate-y-[1px] hover:shadow-md",
          "active:translate-y-0 active:scale-[0.98]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4ECDC4]/40 focus-visible:ring-offset-1",
          "disabled:pointer-events-none disabled:opacity-60",
          className
        )}
        {...props}
      >
        {loading && <Loader2 size={16} className="animate-spin shrink-0" aria-hidden="true" />}
        {loading && loadingText ? loadingText : children}
      </button>
    );
  },
);

CloudButton.displayName = "CloudButton";
