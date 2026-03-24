import * as React from "react";

import { cn } from "../ui/utils";

export type CloudButtonProps = React.ComponentPropsWithoutRef<"button">;

export const CloudButton = React.forwardRef<HTMLButtonElement, CloudButtonProps>(
  ({ className, type = "button", ...props }, ref) => {
    return (
      <button
        ref={ref}
        type={type}
        className={cn(className)}
        {...props}
      />
    );
  },
);

CloudButton.displayName = "CloudButton";
