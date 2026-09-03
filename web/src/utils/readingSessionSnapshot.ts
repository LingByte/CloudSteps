const SNAPSHOT_KEY = "lb_reading_session";

export type ReadingSessionSnapshot = {
  phase: string;
  sourceTab: string;
  isCustomPassage: boolean;
  passage: unknown;
  answers: Record<number, string>;
  optionOrder: Record<number, string[]>;
  firstResult: unknown;
  secondResult: unknown;
  questionIndex: number;
  maxStageIdx: number;
  pickedWords: Array<{ word: string; key: string; phonetic?: string; translation?: string }>;
  startedAt: number;
};

export function saveReadingSessionSnapshot(snap: ReadingSessionSnapshot) {
  sessionStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snap));
}

export function loadReadingSessionSnapshot(): ReadingSessionSnapshot | null {
  try {
    const raw = sessionStorage.getItem(SNAPSHOT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ReadingSessionSnapshot;
    if (!parsed?.passage) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearReadingSessionSnapshot() {
  sessionStorage.removeItem(SNAPSHOT_KEY);
}

export function stableReadingWordId(word: string): number {
  let h = 2166136261;
  for (let i = 0; i < word.length; i += 1) {
    h ^= word.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % 1_000_000_000 + 1;
}
