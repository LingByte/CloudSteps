import { StudyNotePanel } from "./StudyNotePanel";
import { useNote } from "./NoteContext";
import { useEffect, type ReactNode } from "react";
import { normalizeSnowflakeId } from "../utils/json-snowflake";

type Props = {
  children: ReactNode;
  defaultStorageKey?: string;
  defaultTitle?: string;
  /** 当前页正在练的单词。打开的笔记不属于这些词时关掉，避免上一轮笔记留在新词旁边。 */
  activeWordIds?: Array<string | number | null | undefined>;
};

export function NoteSplitLayout({ children, defaultStorageKey = "", defaultTitle = "随心记", activeWordIds }: Props) {
  const { open, setOpen, side, setSide, width, isDesktop, startResize, storageKey, setStorageKey, noteTitle } = useNote();

  useEffect(() => {
    if (!activeWordIds?.length || !storageKey.startsWith("study-note:word:")) return;
    const wordId = storageKey.slice(storageKey.lastIndexOf(":") + 1);
    const alive = activeWordIds.some((id) => normalizeSnowflakeId(id) === wordId);
    if (!alive) {
      setOpen(false);
      setStorageKey("");
    }
  }, [activeWordIds, setOpen, setStorageKey, storageKey]);

  const key = storageKey || defaultStorageKey;
  const title = noteTitle || defaultTitle;
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
              onPointerDown={startResize}
              title="拖动调整随心记宽度"
              aria-label="拖动调整随心记宽度"
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
                onClose={() => setOpen(false)}
                storageKey={key}
                title={title}
                side={side}
                split
                onSideChange={setSide}
              />
            </div>
          </>
        )}
      </div>
      {open && !isDesktop && (
        <StudyNotePanel
          open={open}
          onClose={() => setOpen(false)}
          storageKey={key}
          title={title}
          side={side}
          onSideChange={setSide}
        />
      )}
    </>
  );
}
