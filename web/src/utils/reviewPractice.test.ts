/** @vitest-environment jsdom */
import { describe, expect, it, beforeEach } from "vitest";
import { beginReviewPractice, clearReviewPracticeSession, getReviewReturnPath } from "./reviewPractice";

describe("beginReviewPractice", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("stores an ad-hoc drill when sessionId is 0", () => {
    beginReviewPractice({
      sessionId: 0,
      wordBookId: 0,
      words: [{ id: 1, word: "apple", translation: "苹果" }],
      returnPath: "/reading-comprehension",
    });
    expect(sessionStorage.getItem("lb_mode")).toBe("review");
    expect(sessionStorage.getItem("lb_review_session_id")).toBe("0");
    expect(getReviewReturnPath()).toBe("/reading-comprehension");
    const words = JSON.parse(sessionStorage.getItem("lb_review_words") || "[]");
    expect(words).toHaveLength(1);
    expect(words[0].word).toBe("apple");
  });

  it("rejects an empty word list", () => {
    expect(() =>
      beginReviewPractice({
        sessionId: 1,
        wordBookId: 1,
        words: [],
        returnPath: "/word-training",
      })
    ).toThrow();
  });

  it("clears the ad-hoc session", () => {
    beginReviewPractice({
      sessionId: 0,
      wordBookId: 0,
      words: [{ id: 2, word: "cat" }],
      returnPath: "/reading-comprehension",
    });
    clearReviewPracticeSession();
    expect(sessionStorage.getItem("lb_mode")).toBeNull();
    expect(sessionStorage.getItem("lb_review_words")).toBeNull();
  });
});
