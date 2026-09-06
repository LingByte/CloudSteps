/** 抗遗忘 / 训前复习：勾选后进入与课前检测相同的练习链路 */

import i18n from "../i18n";

export type ReviewPracticeWord = {
  id: string | number;
  word: string;
  phonetic?: string;
  phoneticUk?: string;
  phoneticUs?: string;
  translation?: string;
  audioUrl?: string;
  [key: string]: unknown;
};

/**
 * 将已选复习词写入 session，并进入单词练习 → 听音 → 快闪 → 组内检测。
 * @param returnPath 复习结束后回跳路径（如 /anti-forgetting、/word-training）
 */
export function beginReviewPractice(opts: {
  sessionId: string | number;
  wordBookId: string | number;
  words: ReviewPracticeWord[];
  returnPath: string;
}) {
  const { sessionId, wordBookId, words, returnPath } = opts;
  if (words.length === 0) {
    throw new Error(i18n.t("review.empty_session"));
  }
  sessionStorage.setItem("lb_mode", "review");
  // sessionId 0 = ad-hoc drill (e.g. reading pick-words); skip server complete on finish
  sessionStorage.setItem("lb_review_session_id", String(sessionId || 0));
  sessionStorage.setItem("lb_review_wordbook_id", String(wordBookId));
  sessionStorage.setItem("lb_review_words", JSON.stringify(words));
  sessionStorage.setItem("lb_review_batch_idx", "0");
  sessionStorage.setItem("lb_review_return", returnPath);
  sessionStorage.removeItem("lb_review_results");
  sessionStorage.removeItem("lb_study_check_phase");
  sessionStorage.removeItem("lb_study_retry_words");
  sessionStorage.removeItem("lb_study_pending_action");
  sessionStorage.removeItem("lb_study_recheck_words");
  sessionStorage.removeItem("lb_study_recheck_from");
}

export function getReviewReturnPath(fallback = "/word-training") {
  return sessionStorage.getItem("lb_review_return") || fallback;
}

export function clearReviewPracticeSession() {
  sessionStorage.removeItem("lb_review_batch_idx");
  sessionStorage.removeItem("lb_review_results");
  sessionStorage.removeItem("lb_review_words");
  sessionStorage.removeItem("lb_review_session_id");
  sessionStorage.removeItem("lb_review_return");
  // 结束复习后清掉 review 模式，避免后续页面误判
  if (sessionStorage.getItem("lb_mode") === "review") {
    sessionStorage.removeItem("lb_mode");
  }
}
