/** @vitest-environment jsdom */
import { describe, expect, it, beforeEach } from "vitest";
import {
  clearReadingSessionSnapshot,
  loadReadingSessionSnapshot,
  saveReadingSessionSnapshot,
  stableReadingWordId,
} from "./readingSessionSnapshot";

describe("readingSessionSnapshot", () => {
  beforeEach(() => sessionStorage.clear());

  it("round-trips a snapshot", () => {
    saveReadingSessionSnapshot({
      phase: "words",
      sourceTab: "system",
      isCustomPassage: false,
      passage: { id: 9, title: "T" },
      answers: { 1: "A" },
      optionOrder: {},
      firstResult: { score: 80 },
      secondResult: null,
      questionIndex: 0,
      maxStageIdx: 2,
      pickedWords: [{ word: "apple", key: "apple" }],
      startedAt: 1,
    });
    const loaded = loadReadingSessionSnapshot();
    expect(loaded?.phase).toBe("words");
    expect((loaded?.passage as { id: number }).id).toBe(9);
    expect(loaded?.pickedWords[0].word).toBe("apple");
  });

  it("returns null when empty", () => {
    expect(loadReadingSessionSnapshot()).toBeNull();
    clearReadingSessionSnapshot();
    expect(loadReadingSessionSnapshot()).toBeNull();
  });

  it("gives a stable positive id for the same word", () => {
    const a = stableReadingWordId("because");
    const b = stableReadingWordId("because");
    expect(a).toBe(b);
    expect(a).toBeGreaterThan(0);
    expect(stableReadingWordId("however")).not.toBe(a);
  });
});
