import { App, Group } from "leafer-ui";
import "@leafer-in/export";
import i18n from "../i18n";
import { normalizeSnowflakeId } from "./json-snowflake";

export type StudyNoteSnapshot = {
  text: string;
  json?: string;
  background: string;
  hasDrawing: boolean;
};

type StoredNote = {
  json?: string;
  text?: string;
  background?: string;
};

const DRAW_TAGS = new Set(["Path", "Ellipse", "Rect", "Polygon", "Star", "Line"]);

function parseStored(raw: string | null): StoredNote | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as StoredNote;
    return data && typeof data === "object" ? data : null;
  } catch {
    return null;
  }
}

function walk(node: unknown, visit: (record: Record<string, unknown>) => void) {
  if (!node || typeof node !== "object") return;
  const record = node as Record<string, unknown>;
  visit(record);
  if (Array.isArray(record.children)) {
    for (const child of record.children) walk(child, visit);
  }
}

export function snapshotFromStored(data: StoredNote | null): StudyNoteSnapshot | null {
  if (!data) return null;
  const lines: string[] = [];
  if (typeof data.text === "string" && data.text.trim()) lines.push(data.text.trim());
  let parsed: unknown = null;
  if (typeof data.json === "string" && data.json.trim()) {
    try {
      parsed = JSON.parse(data.json);
    } catch {
      parsed = null;
    }
  }
  let hasDrawing = false;
  if (parsed && typeof parsed === "object") {
    const root = parsed as Record<string, unknown>;
    const strokes = root.strokePoints;
    if (strokes && typeof strokes === "object" && Object.keys(strokes).length > 0) {
      hasDrawing = true;
    }
    walk(parsed, (record) => {
      const tag = typeof record.tag === "string" ? record.tag : "";
      if (DRAW_TAGS.has(tag) || (typeof record.path === "string" && record.path.trim())) hasDrawing = true;
      if (typeof record.text === "string" && record.text.trim()) lines.push(record.text.trim());
    });
    const children = (parsed as { children?: unknown[] }).children;
    if (Array.isArray(children) && children.length > 0) hasDrawing = true;
  }
  const text = Array.from(new Set(lines)).join("\n");
  if (!text && !hasDrawing) return null;
  return {
    text,
    json: typeof data.json === "string" ? data.json : undefined,
    background: data.background || "#fff8e8",
    hasDrawing,
  };
}

export function wordStudyNoteKey(wordBookId: string | number | undefined, wordId: string | number | undefined) {
  const book = normalizeSnowflakeId(wordBookId);
  const word = normalizeSnowflakeId(wordId);
  if (!book || !word) return "";
  return `study-note:word:${book}:${word}`;
}

function storageKeysForWord(wordBookId: string | number | undefined, wordId: string | number | undefined) {
  const key = wordStudyNoteKey(wordBookId, wordId);
  return key ? [key] : [];
}

export function readWordStudyNote(
  wordBookId: string | number | undefined,
  wordId: string | number | undefined
): StudyNoteSnapshot | null {
  for (const key of storageKeysForWord(wordBookId, wordId)) {
    const note = snapshotFromStored(parseStored(localStorage.getItem(key)));
    if (note) return note;
  }
  return null;
}

export function readBookStudyNote(wordBookId: string | number | undefined): StudyNoteSnapshot | null {
  const book = normalizeSnowflakeId(wordBookId);
  if (!book || typeof localStorage === "undefined") return null;
  return snapshotFromStored(parseStored(localStorage.getItem(`study-note:global:${book}`)));
}

async function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

export async function renderStudyNoteImage(note: StudyNoteSnapshot): Promise<HTMLImageElement | null> {
  if (!note.json || typeof document === "undefined") return null;
  let parsed: { children?: unknown[]; width?: number; height?: number };
  try {
    parsed = JSON.parse(note.json);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed.children) || parsed.children.length === 0) return null;
  const width = Math.max(320, Number(parsed.width) || 800);
  const height = Math.max(240, Number(parsed.height) || 640);
  const view = document.createElement("div");
  view.style.cssText = `position:fixed;left:0;top:0;width:${width}px;height:${height}px;opacity:0;pointer-events:none;z-index:-1`;
  document.body.appendChild(view);
  const app = new App({
    view,
    width,
    height,
    fill: note.background || "#fff8e8",
  });
  try {
    const layer = new Group({ x: 0, y: 0, width, height });
    app.tree.add(layer);
    layer.set({ children: parsed.children as never });
    app.tree.forceUpdate();
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const exported = await (layer as unknown as {
      export: (name: string, options: { pixelRatio: number; fill: string }) => Promise<{ data?: unknown }>;
    }).export("png", {
      pixelRatio: 1.5,
      fill: note.background || "#fff8e8",
    });
    const data = exported?.data as unknown;
    let src = "";
    if (typeof data === "string") src = data;
    else if (data instanceof Blob) src = URL.createObjectURL(data);
    else if (data instanceof HTMLCanvasElement) src = data.toDataURL("image/png");
    if (!src) return null;
    const image = await loadImage(src);
    if (data instanceof Blob) URL.revokeObjectURL(src);
    if (!image || image.width < 8 || image.height < 8) return null;
    return image;
  } catch {
    return null;
  } finally {
    app.destroy();
    view.remove();
  }
}

export type PdfStudyNote = {
  title: string;
  text: string;
  image: HTMLImageElement | null;
};

export async function collectStudyNotesForExport(
  words: Array<{ id?: string | number; word?: string; wordBookId?: string | number }>
): Promise<{ texts: Map<string, string>; pages: PdfStudyNote[] }> {
  const texts = new Map<string, string>();
  const pages: PdfStudyNote[] = [];
  const seenBooks = new Set<string>();

  for (const word of words) {
    const bookId = normalizeSnowflakeId(word.wordBookId);
    if (bookId && !seenBooks.has(bookId)) {
      seenBooks.add(bookId);
      const globalNote = readBookStudyNote(bookId);
      if (globalNote) {
        pages.push({
          title: i18n.t("practice.free_note"),
          text: globalNote.text,
          image: await renderStudyNoteImage(globalNote),
        });
      }
    }
    const note = readWordStudyNote(word.wordBookId, word.id);
    const wordKey = normalizeSnowflakeId(word.id);
    if (!note || !wordKey) continue;
    const image = await renderStudyNoteImage(note);
    const text = note.text || (note.hasDrawing ? i18n.t("training_records.note_see_attachment") : "");
    if (text) texts.set(wordKey, text);
    if (image || text) {
      pages.push({
        title: word.word || "",
        text: note.text,
        image,
      });
    }
  }
  return { texts, pages };
}
