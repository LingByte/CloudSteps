// StudyNotePanel: 学习笔记面板（画板 + 文本 + 持久化）
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Bold,
  Download,
  Save,
  Trash2,
  Circle as CircleIcon,
  Eraser,
  Italic,
  MousePointer2,
  PaintBucket,
  Palette,
  Pencil,
  PanelLeft,
  Redo2,
  Square as SquareIcon,
  Type,
  Underline,
  Undo2,
  X,
} from "lucide-react";
import { LeaferCanvas, LeaferCanvasHandle, Tool } from "./LeaferCanvas";

type BrushStyle = "fountain" | "pencil" | "highlighter";

const PEN_COLORS = ["#25344a", "#ef4444", "#f97316", "#eab308", "#22c55e", "#14b8a6", "#3b82f6", "#a855f7", "#111827", "#ffffff"];
const BG_COLORS = ["#fff8e8", "#ffffff", "#f0f4f8", "#e8f5e9", "#fff3e0", "#fce4ec", "#f3e5f5", "#e0f7fa", "#1a1a2e", "#16213e"];

type NoteData = { json?: string; text: string; color: string; background: string };
type Props = { open: boolean; onClose: () => void; storageKey: string; title?: string; subtitle?: string; side?: "left" | "right"; split?: boolean; onSideChange?: (side: "left" | "right") => void };
const emptyNote: NoteData = { text: "", color: "#25344a", background: "#fff8e8" };
const initialPanelWidth = typeof window === "undefined" ? 420 : Math.min(640, Math.max(320, Math.round(window.innerWidth * 0.4)));

function loadNote(key: string): NoteData {
  try { return { ...emptyNote, ...JSON.parse(localStorage.getItem(key) || "{}") }; } catch { return emptyNote; }
}
export function readStudyNote(key: string) { return loadNote(key).text; }

type StudyNoteLauncherProps = {
  storageKey: string;
  title?: string;
  label?: string;
  className?: string;
  onOpen?: () => void;
};

export function StudyNoteLauncher({ storageKey, title, label, className = "", onOpen }: StudyNoteLauncherProps) {
  const { t } = useTranslation();
  const resolvedTitle = title ?? t("studyNote.title");
  const resolvedLabel = label ?? t("studyNote.title");
  const [open, setOpen] = useState(false);
  const [side, setSide] = useState<"left" | "right">("right");
  return (
    <>
      <button
        type="button"
        className={`inline-flex h-9 items-center justify-center rounded-full border border-[#d8cdb8] px-3 text-xs font-medium text-[#5f7890] hover:bg-[#e9dfce] hover:text-[#25344a] ${className}`}
        onClick={() => (onOpen ? onOpen() : setOpen(true))}
        title={t("studyNote.open", { label: resolvedLabel })}
      >
        <BookOpen size={15} />
        {resolvedLabel && <span className="hidden sm:inline">{resolvedLabel}</span>}
      </button>
      {!onOpen && open && (
        <StudyNotePanel
          open={open}
          onClose={() => setOpen(false)}
          storageKey={storageKey}
          title={resolvedTitle}
          side={side}
          onSideChange={setSide}
        />
      )}
    </>
  );
}

export function StudyNotePanel({ open, onClose, storageKey, title, subtitle = "", side = "right", split = false, onSideChange }: Props) {
  const { t } = useTranslation();
  const resolvedTitle = title ?? t("studyNote.title");
  const leaferRef = useRef<LeaferCanvasHandle>(null);
  const [note, setNote] = useState<NoteData>(() => loadNote(storageKey));
  const sidePos = side;
  const [width, setWidth] = useState(initialPanelWidth);
  const [fontSize, setFontSize] = useState(20);
  const [color, setColor] = useState("#25344a");
  const [fill, setFill] = useState("#fff8e8");
  const [tool, setTool] = useState<Tool>("select");
  const [brushWidth, setBrushWidth] = useState(4);
  const [brushStyle, setBrushStyle] = useState<BrushStyle>("fountain");
  const [penPopupOpen, setPenPopupOpen] = useState(false);
  const [eraserPopupOpen, setEraserPopupOpen] = useState(false);
  const [eraserWidth, setEraserWidth] = useState(20);
  const [eraserTrailColor, setEraserTrailColor] = useState("#788291");
  const [eraserTrailOpacity, setEraserTrailOpacity] = useState(0.25);
  const [bgPopupOpen, setBgPopupOpen] = useState(false);
  const [fontPopupOpen, setFontPopupOpen] = useState(false);
  const [fontPopupPos, setFontPopupPos] = useState({ x: 0, y: 0 });
  const [penPopupPos, setPenPopupPos] = useState({ x: 0, y: 0 });
  const [eraserPopupPos, setEraserPopupPos] = useState({ x: 0, y: 0 });
  const [bgPopupPos, setBgPopupPos] = useState({ x: 0, y: 0 });
  const [toolbarVisible, setToolbarVisible] = useState(true);

  const closePopups = () => {
    setPenPopupOpen(false);
    setEraserPopupOpen(false);
    setBgPopupOpen(false);
    setFontPopupOpen(false);
  };

  const activateTool = (next: Tool) => {
    closePopups();
    setTool(next);
  };

  const openPopupAt = (
    e: React.MouseEvent<HTMLButtonElement>,
    setOpen: (v: boolean) => void,
    setPos: (p: { x: number; y: number }) => void,
    isOpen: boolean,
  ) => {
    const rect = e.currentTarget.getBoundingClientRect();
    if (isOpen) {
      setOpen(false);
      return;
    }
    const x = Math.min(rect.left, window.innerWidth - 240);
    const y = Math.min(rect.bottom + 4, window.innerHeight - 200);
    setPos({ x, y });
    setOpen(true);
  };

  // 笔记只写回「当前画板打开时」的那一个单词。换词后的重绘不能把上一份笔记写到新单词上。
  const boundKeyRef = useRef(storageKey);
  const acceptPersistRef = useRef(false);

  useEffect(() => {
    if (!open) {
      acceptPersistRef.current = false;
      return;
    }
    acceptPersistRef.current = false;
    boundKeyRef.current = storageKey;
    const stored = loadNote(storageKey);
    const saved = stored.background === "#175b37" ? { ...stored, background: "#fff8e8" } : stored;
    setNote(saved);
    setColor(saved.color);
    setFill(saved.background);
    if (saved.json && leaferRef.current) {
      leaferRef.current.importJSON(saved.json);
    } else {
      leaferRef.current?.clear();
    }
    acceptPersistRef.current = true;
  }, [open, storageKey]);

  const persist = useCallback(() => {
    const key = boundKeyRef.current;
    if (!acceptPersistRef.current || !key || !leaferRef.current) return;
    const json = leaferRef.current.exportJSON();
    const next = { ...note, json, text: "", color, background: fill };
    setNote(next);
    localStorage.setItem(key, JSON.stringify(next));
  }, [note, color, fill]);

  const setBackground = (value: string) => {
    setFill(value);
    leaferRef.current?.setBackground(value);
    persist();
  };

  const clearCanvas = () => {
    leaferRef.current?.clear();
    persist();
  };

  const addText = () => {
    leaferRef.current?.addTextAtCenter();
    persist();
  };

  const undo = () => {
    leaferRef.current?.undo();
    persist();
  };

  const redo = () => {
    leaferRef.current?.redo();
    persist();
  };

  const button = (activeState = false) => `flex h-7 w-7 items-center justify-center rounded-lg ${activeState ? "bg-[#d8cdb8] text-[#25344a]" : "text-[#5f7890] hover:bg-[#e9dfce] hover:text-[#25344a]"}`;

  const startEdgeResize = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = width;
    const move = (next: PointerEvent) => {
      const delta = next.clientX - startX;
      setWidth(Math.max(200, startWidth + (sidePos === "right" ? -delta : delta)));
    };
    const stop = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", stop); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
  };

  if (!open) return null;

  // Inner board content shared by both modes.
  const board = (
    <>
      {/* Binder rings sit outside the paper, centered on its outer edge. */}
      <div className={`${sidePos === "left" ? "-right-4 left-auto" : "-left-4"} pointer-events-none absolute top-6 bottom-6 z-30 flex flex-col justify-between py-1`}>
        {Array.from({ length: 8 }).map((_, index) => (
          <span
            key={index}
            className="block h-7 w-10 rounded-full border-2 border-[#172033] bg-[#a9d9f7] shadow-[4px_0_0_#5c9bd7]"
          />
        ))}
      </div>

      {/* Single rounded board clips its own background at every corner. */}
      <div
        className="relative z-10 h-full w-full overflow-hidden rounded-[24px] border-2 border-[#1f2937] shadow-[0_10px_24px_rgba(38,91,115,0.18)]"
        style={{ background: fill }}
      >
        <div className="relative z-10 flex h-full w-full flex-col overflow-hidden rounded-[22px]">
          {/* Title bar */}
          <div className="flex h-9 shrink-0 items-center gap-1.5 border-b border-[#d8cdb8] pl-10 pr-0 text-[#25344a] sm:h-10 sm:gap-2 sm:pl-11 sm:pr-0">
            <span className="truncate text-base font-bold sm:text-lg">{resolvedTitle}</span>
            <span className="hidden truncate text-xs text-[#9b927f] sm:inline">{t("studyNote.subtitle")}</span>
            <button
              type="button"
              className="flex h-7 w-7 items-center justify-center rounded-lg text-[#5f7890] hover:bg-[#e9dfce]"
              onClick={() => setToolbarVisible((v) => !v)}
              title={toolbarVisible ? t("annotation.collapseTools") : t("annotation.expandTools")}
              aria-label={toolbarVisible ? t("annotation.collapseTools") : t("annotation.expandTools")}
            >
              <PanelLeft size={16} />
            </button>
            <button
              type="button"
              className="ml-auto flex h-8 w-8 -mr-1 items-center justify-center rounded-lg text-[#5f7890] hover:bg-[#e9dfce] hover:text-[#c45c78] sm:-mr-1"
              onClick={onClose}
              title={t("annotation.close")}
              aria-label={t("annotation.close")}
            >
              <X size={18} />
            </button>
          </div>

          {/* Toolbar */}
          <div className={`shrink-0 overflow-hidden transition-[max-height] duration-200 ease-out ${toolbarVisible ? "max-h-64" : "max-h-0"}`}>
            {toolbarVisible && (
              <div className="mx-1 mt-1 flex flex-wrap items-center gap-0.5 pl-10 pr-0 py-0.5 text-[#25344a] sm:mx-2 sm:mt-1.5 sm:gap-1 sm:pl-11 sm:pr-0 sm:py-1">
                <button className={button()} onClick={() => { closePopups(); setFontPopupOpen(true); }} title={t("studyNote.fontSettings")}><Bold size={16} /></button>
                <button className={button()} onClick={() => { closePopups(); setFontPopupOpen(true); }} title={t("studyNote.fontSettings")}><Italic size={16} /></button>
                <button className={button()} onClick={() => { closePopups(); setFontPopupOpen(true); }} title={t("studyNote.fontSettings")}><Underline size={16} /></button>
                <div className="mx-1 h-5 w-px bg-[#d8cdb8]" />
                <div className="relative">
                  <button
                    className={button(bgPopupOpen)}
                    onClick={(e) => {
                      const wasOpen = bgPopupOpen;
                      closePopups();
                      if (!wasOpen) openPopupAt(e, setBgPopupOpen, setBgPopupPos, false);
                    }}
                    title={t("studyNote.bgColor")}
                  >
                    <PaintBucket size={14} />
                  </button>
                  {bgPopupOpen && (
                    <>
                      <div className="fixed inset-0 z-[9998]" onClick={() => setBgPopupOpen(false)} />
                      <div className="fixed z-[9999] w-48 rounded-xl border border-[#c4b89f] bg-[#fffdf5] p-3.5 shadow-2xl" style={{ left: bgPopupPos.x, top: bgPopupPos.y }}>
                        <div className="mb-3 flex items-center justify-between">
                          <span className="text-xs font-bold text-[#25344a]">{t("studyNote.bgColor")}</span>
                          <button
                            type="button"
                            onClick={() => setBgPopupOpen(false)}
                            className="flex h-5 w-5 items-center justify-center rounded text-[#9b927f] hover:bg-[#e9dfce] hover:text-[#25344a]"
                            aria-label={t("annotation.close")}
                          >
                            <X size={12} />
                          </button>
                        </div>
                        <div className="grid grid-cols-5 gap-1.5">
                          {BG_COLORS.map((c) => (
                            <button
                              key={c}
                              type="button"
                              onClick={() => { setBackground(c); setBgPopupOpen(false); }}
                              className={`h-7 w-7 rounded-lg border-2 transition-transform ${fill.toLowerCase() === c.toLowerCase() ? "border-[#25344a] scale-110 shadow-sm" : "border-[#d8cdb8] hover:scale-105"}`}
                              style={{ backgroundColor: c }}
                              aria-label={t("annotation.customColorAria", { color: c })}
                            />
                          ))}
                        </div>
                        <div className="mt-2.5 flex items-center gap-2">
                          <label className="flex h-7 cursor-pointer items-center gap-1.5 rounded-md border border-[#d8cdb8] px-2 text-[10px] text-[#5f7890] hover:bg-[#e9dfce]">
                            <Palette size={12} />
                            {t("ui.custom")}
                            <input
                              className="sr-only"
                              type="color"
                              value={fill}
                              onChange={(e) => setBackground(e.target.value)}
                            />
                          </label>
                          <span className="text-[10px] tabular-nums text-[#9b927f]">{fill}</span>
                        </div>
                      </div>
                    </>
                  )}
                </div>
                <button className={button(tool === "select")} onClick={() => activateTool("select")} title={t("annotation.select")}><MousePointer2 size={16} /></button>
                <div className="relative">
                  <button
                    className={button(tool === "pen" || penPopupOpen)}
                    onClick={(e) => {
                      const wasOpen = penPopupOpen;
                      setTool("pen");
                      setEraserPopupOpen(false);
                      setBgPopupOpen(false);
                      setFontPopupOpen(false);
                      if (!wasOpen) openPopupAt(e, setPenPopupOpen, setPenPopupPos, false);
                      else setPenPopupOpen(false);
                    }}
                    title={t("annotation.pen")}
                  >
                    <Pencil size={14} />
                  </button>
                  {penPopupOpen && (
                    <>
                      {/* 点击外部关闭 */}
                      <div className="fixed inset-0 z-[9998]" onClick={() => setPenPopupOpen(false)} />
                      {/* PS 风格画笔设置弹窗 — 最顶层 */}
                      <div className="fixed z-[9999] w-56 rounded-xl border border-[#c4b89f] bg-[#fffdf5] p-3.5 shadow-2xl" style={{ left: penPopupPos.x, top: penPopupPos.y }}>
                        {/* 标题栏 */}
                        <div className="mb-3 flex items-center justify-between">
                          <span className="text-xs font-bold text-[#25344a]">{t("annotation.brush")}</span>
                          <button
                            type="button"
                            onClick={() => setPenPopupOpen(false)}
                            className="flex h-5 w-5 items-center justify-center rounded text-[#9b927f] hover:bg-[#e9dfce] hover:text-[#25344a]"
                            aria-label={t("annotation.close")}
                          >
                            <X size={12} />
                          </button>
                        </div>

                        {/* 颜色选择 */}
                        <div className="mb-3">
                          <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-[#9b927f]">{t("annotation.color")}</div>
                          <div className="grid grid-cols-5 gap-1.5">
                            {PEN_COLORS.map((c) => (
                              <button
                                key={c}
                                type="button"
                                onClick={() => setColor(c)}
                                className={`h-6 w-6 rounded-full border-2 transition-transform ${color.toLowerCase() === c.toLowerCase() ? "border-[#25344a] scale-110 shadow-sm" : "border-[#d8cdb8] hover:scale-105"}`}
                                style={{ backgroundColor: c }}
                                aria-label={t("annotation.customColorAria", { color: c })}
                              />
                            ))}
                          </div>
                          <div className="mt-2 flex items-center gap-2">
                            <label className="flex h-7 cursor-pointer items-center gap-1.5 rounded-md border border-[#d8cdb8] px-2 text-[10px] text-[#5f7890] hover:bg-[#e9dfce]">
                              <Palette size={12} />
                              {t("ui.custom")}
                              <input
                                className="sr-only"
                                type="color"
                                value={color.length === 7 ? color : "#25344a"}
                                onChange={(e) => setColor(e.target.value)}
                              />
                            </label>
                            <span className="text-[10px] tabular-nums text-[#9b927f]">{color}</span>
                          </div>
                        </div>

                        {/* 分隔线 */}
                        <div className="my-2 h-px bg-[#e9dfce]" />

                        {/* 笔迹粗细 */}
                        <div className="mb-3">
                          <div className="mb-1.5 flex items-center justify-between">
                            <span className="text-[10px] font-semibold uppercase tracking-wide text-[#9b927f]">{t("annotation.width", { width: brushWidth })}</span>
                          </div>
                          <input
                            type="range"
                            min={1}
                            max={40}
                            value={brushWidth}
                            onChange={(e) => setBrushWidth(Number(e.target.value))}
                            className="w-full cursor-pointer accent-[#25344a]"
                          />
                        </div>

                        {/* 笔迹样式 */}
                        <div className="mb-3">
                          <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-[#9b927f]">{t("studyNote.style")}</div>
                          <div className="flex gap-1.5">
                            <button
                              type="button"
                              onClick={() => { setBrushStyle("fountain"); setTool("pen"); }}
                              className={`flex-1 rounded-md border px-2 py-1.5 text-xs transition-colors ${tool === "pen" && brushStyle === "fountain" ? "border-[#25344a] bg-[#d8cdb8] text-[#25344a] font-semibold" : "border-[#d8cdb8] text-[#5f7890] hover:bg-[#e9dfce]"}`}
                            >
                              {t("annotation.brushFountain")}
                            </button>
                            <button
                              type="button"
                              onClick={() => { setBrushStyle("pencil"); setTool("pen"); }}
                              className={`flex-1 rounded-md border px-2 py-1.5 text-xs transition-colors ${tool === "pen" && brushStyle === "pencil" ? "border-[#25344a] bg-[#d8cdb8] text-[#25344a] font-semibold" : "border-[#d8cdb8] text-[#5f7890] hover:bg-[#e9dfce]"}`}
                            >
                              {t("annotation.brushPencil")}
                            </button>
                            <button
                              type="button"
                              onClick={() => { setBrushStyle("highlighter"); setTool("pen"); }}
                              className={`flex-1 rounded-md border px-2 py-1.5 text-xs transition-colors ${tool === "pen" && brushStyle === "highlighter" ? "border-[#25344a] bg-[#d8cdb8] text-[#25344a] font-semibold" : "border-[#d8cdb8] text-[#5f7890] hover:bg-[#e9dfce]"}`}
                            >
                              {t("annotation.brushHighlighter")}
                            </button>
                          </div>
                        </div>

                        {/* 实时预览 */}
                        <div className="rounded-md bg-white/70 p-2">
                          <div className="mb-1 text-[9px] text-[#9b927f]">{t("studyNote.preview")}</div>
                          <svg className="w-full" height="36" viewBox="0 0 200 36">
                            <path
                              d="M 10 28 Q 50 8 100 18 T 190 14"
                              fill="none"
                              stroke={brushStyle === "highlighter" ? `${color}55` : brushStyle === "pencil" ? `${color}88` : color}
                              strokeWidth={brushStyle === "highlighter" ? Math.max(brushWidth * 3, 12) : brushWidth}
                              opacity={brushStyle === "highlighter" ? 0.5 : 1}
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </div>
                      </div>
                    </>
                  )}
                </div>
                <div className="relative">
                  <button
                    className={button(tool === "eraser" || eraserPopupOpen)}
                    onClick={(e) => {
                      const wasOpen = eraserPopupOpen;
                      setTool("eraser");
                      setPenPopupOpen(false);
                      setBgPopupOpen(false);
                      setFontPopupOpen(false);
                      if (!wasOpen) openPopupAt(e, setEraserPopupOpen, setEraserPopupPos, false);
                      else setEraserPopupOpen(false);
                    }}
                    title={t("annotation.eraser")}
                  >
                    <Eraser size={14} />
                  </button>
                  {eraserPopupOpen && (
                    <>
                      <div className="fixed inset-0 z-[9998]" onClick={() => setEraserPopupOpen(false)} />
                      <div className="fixed z-[9999] w-48 rounded-xl border border-[#c4b89f] bg-[#fffdf5] p-3.5 shadow-2xl" style={{ left: eraserPopupPos.x, top: eraserPopupPos.y }}>
                        <div className="mb-3 flex items-center justify-between">
                          <span className="text-xs font-bold text-[#25344a]">{t("annotation.eraserSize", { size: eraserWidth })}</span>
                          <button
                            type="button"
                            onClick={() => setEraserPopupOpen(false)}
                            className="flex h-5 w-5 items-center justify-center rounded text-[#9b927f] hover:bg-[#e9dfce] hover:text-[#25344a]"
                            aria-label={t("annotation.close")}
                          >
                            <X size={12} />
                          </button>
                        </div>
                        <div className="mb-3">
                          <div className="mb-1.5 flex items-center justify-between">
                            <span className="text-[10px] font-semibold uppercase tracking-wide text-[#9b927f]">{t("annotation.width", { width: eraserWidth })}</span>
                          </div>
                          <input
                            type="range"
                            min={4}
                            max={80}
                            value={eraserWidth}
                            onChange={(e) => setEraserWidth(Number(e.target.value))}
                            className="w-full cursor-pointer accent-[#25344a]"
                          />
                        </div>
                        <div className="mb-3">
                          <div className="mb-1.5 flex items-center justify-between">
                            <span className="text-[10px] font-semibold uppercase tracking-wide text-[#9b927f]">{t("studyNote.eraserTrailColor")}</span>
                            <label className="flex h-6 w-8 cursor-pointer items-center justify-center rounded border border-[#d8cdb8]" style={{ backgroundColor: eraserTrailColor }}>
                              <input
                                className="sr-only"
                                type="color"
                                value={eraserTrailColor}
                                onChange={(e) => setEraserTrailColor(e.target.value)}
                                aria-label={t("studyNote.eraserTrailColor")}
                              />
                            </label>
                          </div>
                          <div className="mb-1.5 flex items-center justify-between">
                            <span className="text-[10px] font-semibold uppercase tracking-wide text-[#9b927f]">{t("studyNote.eraserTrailOpacity")}</span>
                            <span className="text-[10px] tabular-nums font-bold text-[#25344a]">{Math.round(eraserTrailOpacity * 100)}%</span>
                          </div>
                          <input
                            type="range"
                            min={0}
                            max={100}
                            value={Math.round(eraserTrailOpacity * 100)}
                            onChange={(e) => setEraserTrailOpacity(Number(e.target.value) / 100)}
                            className="w-full cursor-pointer accent-[#25344a]"
                          />
                        </div>
                        {/* 预览圆 */}
                        <div className="flex h-12 items-center justify-center rounded-md bg-white/70">
                          <span
                            className="rounded-full"
                            style={{
                              width: `${Math.min(eraserWidth, 40)}px`,
                              height: `${Math.min(eraserWidth, 40)}px`,
                              backgroundColor: eraserTrailColor,
                              opacity: eraserTrailOpacity,
                            }}
                          />
                        </div>
                      </div>
                    </>
                  )}
                </div>
                <button className={button(tool === "circle")} onClick={() => activateTool("circle")} title={t("annotation.circle")}><CircleIcon size={16} /></button>
                <button className={button(tool === "rect")} onClick={() => activateTool("rect")} title={t("annotation.rect")}><SquareIcon size={16} /></button>
                <button className={button()} onClick={() => { closePopups(); addText(); }} title={t("studyNote.addTextCentered")}><Type size={16} /></button>
                <div className="mx-1 h-5 w-px bg-[#d8cdb8]" />
                <button className={button()} onClick={undo} title={t("annotation.undo")} aria-label={t("annotation.undo")}><Undo2 size={16} /></button>
                <button className={button()} onClick={redo} title={t("annotation.redo")} aria-label={t("annotation.redo")}><Redo2 size={16} /></button>
                <button className={button()} onClick={persist} title={t("annotation.save")} aria-label={t("annotation.save")}><Save size={16} /></button>
                <button className={button()} onClick={() => leaferRef.current?.exportImage(`${resolvedTitle}.png`)} title={t("studyNote.downloadImage")} aria-label={t("studyNote.downloadImage")}><Download size={16} /></button>
                <div className="contents">
                  <button className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#a9d9f7] text-[#25344a] hover:bg-[#8fc8ed]" onClick={() => { const next = sidePos === "right" ? "left" : "right"; onSideChange?.(next); }} title={sidePos === "right" ? t("annotation.dockLeft") : t("annotation.dockRight")} aria-label={sidePos === "right" ? t("annotation.dockLeftShort") : t("annotation.dockRightShort")}>{sidePos === "right" ? <ArrowLeft size={16} /> : <ArrowRight size={16} />}</button>
                  <button className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#a9d9f7] text-[#25344a] hover:bg-[#8fc8ed]" onClick={() => { closePopups(); clearCanvas(); }} title={t("annotation.clear")} aria-label={t("annotation.clear")}><Trash2 size={16} /></button>
                </div>
              </div>
            )}
          </div>

          {/* Canvas host: LeaferCanvas fills remaining space. */}
          <div className="relative min-h-0 flex-1 overflow-hidden">
            <LeaferCanvas
              ref={leaferRef}
              tool={tool}
              color={color}
              brushWidth={brushWidth}
              eraserWidth={eraserWidth}
              eraserTrailColor={eraserTrailColor}
              eraserTrailOpacity={eraserTrailOpacity}
              brushStyle={brushStyle}
              background={fill}
              fontSize={fontSize}
              storageKey={storageKey}
              onContentChange={persist}
            />
            {subtitle && <div className="pointer-events-none absolute left-4 top-1 text-lg text-[#b8c9be]">{subtitle}</div>}
          </div>
        </div>
      </div>

      {/* Edge resize handle — only in standalone floating mode.
          In split mode the parent (ReviewWordList) controls width via its own drag handle. */}
      {!split && (
        <div
          className={`${sidePos === "right" ? "-left-1.5" : "-right-1.5"} absolute top-0 bottom-0 z-50 flex w-3 touch-none cursor-ew-resize items-center justify-center`}
          onPointerDown={startEdgeResize}
          aria-label={t("studyNote.resizeWidth")}
          title={t("annotation.resizePanelTitle")}
        >
          <span className="h-10 w-0.5 rounded-full bg-[#5f7890]/40" />
        </div>
      )}
    </>
  );

  // Font settings popup (Word-style, triggered by right-click on text or toolbar button)
  const fontPopup = fontPopupOpen && (
    <>
      <div className="fixed inset-0 z-[9998]" onClick={() => setFontPopupOpen(false)} />
      <div
        className="fixed z-[9999] w-52 rounded-xl border border-[#c4b89f] bg-[#fffdf5] p-3.5 shadow-2xl"
        style={{ left: Math.min(fontPopupPos.x || window.innerWidth / 2, window.innerWidth - 220), top: Math.min(fontPopupPos.y || 100, window.innerHeight - 200) }}
      >
        <div className="mb-3 flex items-center justify-between">
          <span className="text-xs font-bold text-[#25344a]">{t("studyNote.fontSettings")}</span>
          <button
            type="button"
            onClick={() => setFontPopupOpen(false)}
            className="flex h-5 w-5 items-center justify-center rounded text-[#9b927f] hover:bg-[#e9dfce] hover:text-[#25344a]"
            aria-label={t("annotation.close")}
          >
            <X size={12} />
          </button>
        </div>
        {/* 字号 */}
        <div className="mb-3">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-[#9b927f]">{t("studyNote.fontSize")}</span>
            <span className="text-[10px] tabular-nums font-bold text-[#25344a]">{fontSize}px</span>
          </div>
          <input
            type="range"
            min={12}
            max={72}
            value={fontSize}
            onChange={(e) => setFontSize(Number(e.target.value))}
            className="w-full cursor-pointer accent-[#25344a]"
          />
        </div>
        {/* 快捷字号 */}
        <div className="mb-3 flex flex-wrap gap-1">
          {[16, 20, 24, 28, 32, 36, 48].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setFontSize(s)}
              className={`rounded-md border px-1.5 py-0.5 text-[10px] ${fontSize === s ? "border-[#25344a] bg-[#d8cdb8] text-[#25344a] font-semibold" : "border-[#d8cdb8] text-[#5f7890] hover:bg-[#e9dfce]"}`}
            >
              {s}
            </button>
          ))}
        </div>
        <div className="my-2 h-px bg-[#e9dfce]" />
        {/* 文字颜色 */}
        <div>
          <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-[#9b927f]">{t("annotation.color")}</div>
          <div className="flex items-center gap-2">
            <label className="flex h-7 cursor-pointer items-center gap-1.5 rounded-md border border-[#d8cdb8] px-2 text-[10px] text-[#5f7890] hover:bg-[#e9dfce]">
              <Palette size={12} />
              {t("ui.custom")}
              <input
                className="sr-only"
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
              />
            </label>
            <div className="flex gap-1">
              {PEN_COLORS.slice(0, 6).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`h-5 w-5 rounded-full border ${color.toLowerCase() === c.toLowerCase() ? "border-[#25344a] scale-110" : "border-[#d8cdb8]"}`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );

  if (split) {
    // In split mode, render as a flex child (same layer as word content).
    return (
      <div className="relative h-full w-full box-border">
        {board}
        {fontPopup}
      </div>
    );
  }

  // Standalone floating mode.
  return (
    <aside
      className="fixed z-50 box-border max-w-[calc(100vw-16px)]"
      style={{
        top: "3.5rem",
        bottom: "5.5rem",
        [sidePos]: 0,
        width: `min(${width}px, calc(100vw - 16px))`,
        maxWidth: "calc(100vw - 16px)",
        minWidth: "min(280px, calc(100vw - 16px))",
      }}
    >
      {board}
      {fontPopup}
    </aside>
  );
}
