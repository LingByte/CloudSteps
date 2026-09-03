import { describe, expect, it } from "vitest";
import {
  normalizeReadingWord,
  splitParagraphForTts,
  splitReadingParagraphs,
  tokenizeReadingText,
  TTS_MAX_RUNES,
} from "./readingParagraphs";

describe("splitReadingParagraphs", () => {
  it("returns empty for blank input", () => {
    expect(splitReadingParagraphs("")).toEqual([]);
    expect(splitReadingParagraphs("  \n\n  ")).toEqual([]);
  });

  it("keeps a single paragraph without blank lines", () => {
    const text = "First sentence. Second sentence.";
    expect(splitReadingParagraphs(text)).toEqual([text]);
  });

  it("splits on blank lines and trims", () => {
    const text = "Para one.\n\nPara two.\n\n\nPara three.";
    expect(splitReadingParagraphs(text)).toEqual([
      "Para one.",
      "Para two.",
      "Para three.",
    ]);
  });

  it("normalizes CRLF", () => {
    expect(splitReadingParagraphs("A\r\n\r\nB")).toEqual(["A", "B"]);
  });
});

describe("splitParagraphForTts", () => {
  it("returns one chunk when under limit", () => {
    expect(splitParagraphForTts("Hello world.")).toEqual(["Hello world."]);
  });

  it("splits on sentence boundaries when over limit", () => {
    const a = "A".repeat(200) + ".";
    const b = "B".repeat(200) + ".";
    const c = "C".repeat(200) + ".";
    const chunks = splitParagraphForTts(`${a} ${b} ${c}`, 450);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect([...chunk].length).toBeLessThanOrEqual(450);
    }
    expect(chunks.join(" ")).toContain("A");
    expect(chunks.join(" ")).toContain("C");
  });

  it("hard-splits a single oversized sentence", () => {
    const long = "X".repeat(TTS_MAX_RUNES + 50);
    const chunks = splitParagraphForTts(long);
    expect(chunks.length).toBe(2);
    expect(chunks[0].length).toBe(TTS_MAX_RUNES);
    expect(chunks[1].length).toBe(50);
  });
});

describe("tokenizeReadingText", () => {
  it("keeps words and punctuation", () => {
    const tokens = tokenizeReadingText("Hello, world!");
    expect(tokens).toEqual([
      { type: "word", value: "Hello" },
      { type: "other", value: ", " },
      { type: "word", value: "world" },
      { type: "other", value: "!" },
    ]);
  });

  it("keeps hyphenated and apostrophe forms as one word", () => {
    const tokens = tokenizeReadingText("don't well-known");
    expect(tokens.filter((t) => t.type === "word").map((t) => t.value)).toEqual([
      "don't",
      "well-known",
    ]);
  });
});

describe("normalizeReadingWord", () => {
  it("lowercases and strips edge punctuation", () => {
    expect(normalizeReadingWord("Hello")).toBe("hello");
    expect(normalizeReadingWord("(World!)")).toBe("world");
  });
});
