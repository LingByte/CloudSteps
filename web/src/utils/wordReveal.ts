/**
 * 点单词：第一次只发音，第二次显示释义，第三次收起（下一轮重新从发音开始）。
 */
export function nextWordTapState(opts: {
  showTranslation: boolean;
  heard: boolean;
}): { heard: boolean; showTranslation: boolean; shouldPlay: boolean } {
  if (opts.showTranslation) {
    return { heard: false, showTranslation: false, shouldPlay: false };
  }
  if (!opts.heard) {
    return { heard: true, showTranslation: false, shouldPlay: true };
  }
  return { heard: true, showTranslation: true, shouldPlay: false };
}

/**
 * 拓展模式不打断点词节奏：仅在「展示释义」时同步打开详情，收起释义时关掉。
 */
export function syncDetailWordWithTap(
  detailMode: boolean,
  next: { showTranslation: boolean },
  word: { id: string | number; word: string }
): { id: string | number; word: string } | null {
  if (!detailMode) return null;
  if (next.showTranslation) return { id: word.id, word: word.word };
  return null;
}
