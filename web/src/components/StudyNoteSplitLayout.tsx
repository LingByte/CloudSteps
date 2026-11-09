import type { PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { StudyNotePanel } from "./StudyNotePanel";

type NoteSide = "left" | "right";

type Props = {
  children: ReactNode;
  open: boolean;
  isDesktop: boolean;
  side: NoteSide;
  width: number;
  storageKey: string;
  onClose: () => void;
  onSideChange: (side: NoteSide) => void;
  onResize: (event: ReactPointerEvent<HTMLDivElement>) => void;
};

export function StudyNoteSplitLayout({
  children,
  open,
  isDesktop,
  side,
  width,
  storageKey,
  onClose,
  onSideChange,
  onResize,
}: Props) {
  const { t } = useTranslation();
  const split = open && isDesktop;

  return (
    <>
      <div
        className={`box-border w-full ${
          split
            ? "flex min-h-0 flex-1 items-stretch gap-2 max-w-none px-2 py-2"
            : "mt-6 pb-20 min-h-[calc(100dvh-11rem)] max-w-2xl lg:max-w-5xl mx-auto px-4"
        }`}
        style={split ? { height: "calc(100dvh - 3.5rem - 7.5rem)" } : undefined}
      >
        <div
          className={`${
            split
              ? "lg:flex-1 lg:min-w-0 lg:max-h-full lg:overflow-y-auto lg:overscroll-contain lg:px-2"
              : ""
          } ${split && side === "left" ? "lg:order-2" : ""}`}
        >
          {children}
        </div>
        {split && (
          <>
            <div
              className={`group hidden lg:flex lg:self-stretch lg:items-center lg:justify-center lg:cursor-ew-resize lg:touch-none lg:select-none ${
                side === "right" ? "lg:order-2" : "lg:order-1"
              }`}
              style={{ width: "10px", flexShrink: 0 }}
              onPointerDown={onResize}
              title={t("studyNote.resizeWidth")}
              aria-label={t("studyNote.resizeWidth")}
            >
              <span className="h-16 w-1 rounded-full bg-[#A0AEC0]/30 transition-all group-hover:w-1.5 group-hover:bg-[#4ECDC4]/60" />
            </div>
            <div
              className={`lg:flex lg:flex-col lg:self-stretch lg:min-h-0 lg:h-full ${
                side === "right" ? "lg:order-3" : "lg:order-1"
              }`}
              style={{ width: `${width}px`, flexShrink: 0 }}
            >
              <StudyNotePanel
                open={open}
                onClose={onClose}
                storageKey={storageKey}
                title={t("studyNote.title")}
                side={side}
                split
                onSideChange={onSideChange}
              />
            </div>
          </>
        )}
      </div>
      {open && !isDesktop && (
        <StudyNotePanel
          open={open}
          onClose={onClose}
          storageKey={storageKey}
          title={t("studyNote.title")}
          side={side}
          onSideChange={onSideChange}
        />
      )}
    </>
  );
}
