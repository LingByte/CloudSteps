/** Max runes per TTS request (matches backend ttsMaxRunes). */
export const TTS_MAX_RUNES = 500;

/** Split passage content into natural paragraphs (blank-line separated). */
export function splitReadingParagraphs(content: string): string[] {
  const normalized = String(content ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim();
  if (!normalized) return [];
  return normalized
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}

/**
 * Split a long paragraph into TTS-sized chunks on sentence boundaries.
 * Short paragraphs are returned as a single chunk.
 */
export function splitParagraphForTts(
  paragraph: string,
  maxRunes = TTS_MAX_RUNES
): string[] {
  const text = String(paragraph ?? "").trim();
  if (!text) return [];
  if ([...text].length <= maxRunes) return [text];

  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  let buf = "";
  const flush = () => {
    const t = buf.trim();
    if (t) chunks.push(t);
    buf = "";
  };

  for (const sentence of sentences) {
    const sRunes = [...sentence].length;
    if (sRunes > maxRunes) {
      flush();
      // Hard-split oversized sentence by rune count.
      const runes = [...sentence];
      for (let i = 0; i < runes.length; i += maxRunes) {
        chunks.push(runes.slice(i, i + maxRunes).join(""));
      }
      continue;
    }
    const next = buf ? `${buf} ${sentence}` : sentence;
    if ([...next].length > maxRunes) {
      flush();
      buf = sentence;
    } else {
      buf = next;
    }
  }
  flush();
  return chunks;
}

export type ReadingToken = { type: "word" | "other"; value: string };

/** Tokenize paragraph text into clickable words and intervening punctuation/space. */
export function tokenizeReadingText(text: string): ReadingToken[] {
  const src = String(text ?? "");
  if (!src) return [];
  const tokens: ReadingToken[] = [];
  const re = /[A-Za-z]+(?:['’-][A-Za-z]+)*|[^A-Za-z]+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    const value = m[0];
    if (/^[A-Za-z]/.test(value)) {
      tokens.push({ type: "word", value });
    } else {
      tokens.push({ type: "other", value });
    }
  }
  return tokens;
}

/** Normalize a surface form for dictionary lookup / notebook keys. */
export function normalizeReadingWord(word: string): string {
  return String(word ?? "")
    .trim()
    .toLowerCase()
    .replace(/^[^\p{L}]+|[^\p{L}]+$/gu, "");
}
