import type { ReactNode } from "react";
import { MarkdownView } from "./MarkdownView";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "./ui/drawer";
import { cn } from "../utils/cn";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  subtitle?: string;
  content?: string;
  emptyText?: string;
  footer?: ReactNode;
};

/**
 * 移动端优先的内容预览抽屉：标题区 + 可滚动正文，统一内边距与安全区。
 */
export function ContentPreviewDrawer({
  open,
  onOpenChange,
  title,
  subtitle,
  content,
  emptyText,
  footer,
}: Props) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent
        className={cn(
          "max-h-[min(88dvh,720px)] flex flex-col gap-0 rounded-t-2xl border-t px-0",
          "pb-[max(1rem,env(safe-area-inset-bottom))]",
        )}
      >
        <DrawerHeader className="shrink-0 gap-1 border-b border-border px-5 pt-4 pb-3 text-left">
          <DrawerTitle className="text-base font-semibold leading-snug pr-8">{title}</DrawerTitle>
          {subtitle ? (
            <DrawerDescription className="text-xs text-muted-foreground">{subtitle}</DrawerDescription>
          ) : null}
        </DrawerHeader>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
          {content?.trim() ? (
            <MarkdownView content={content} className="text-[15px] leading-relaxed" />
          ) : (
            <p className="text-sm text-muted-foreground">{emptyText}</p>
          )}
        </div>

        {footer ? (
          <div className="shrink-0 border-t border-border px-5 py-3">{footer}</div>
        ) : null}
      </DrawerContent>
    </Drawer>
  );
}
