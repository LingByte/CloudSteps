export type WordTapState = {
  heard: boolean
  showTranslation: boolean
  shouldPlay: boolean
}

export function nextWordTapState(opts: { showTranslation: boolean; heard: boolean }): WordTapState {
  if (opts.showTranslation) return { heard: false, showTranslation: false, shouldPlay: false }
  if (!opts.heard) return { heard: true, showTranslation: false, shouldPlay: true }
  return { heard: true, showTranslation: true, shouldPlay: false }
}

export function getPracticeTapState(
  index: number,
  lastTappedIndex: number | null,
  state: { heard: boolean; showTranslation: boolean },
): WordTapState {
  const isContinuation = lastTappedIndex === index
  return nextWordTapState({
    heard: isContinuation ? state.heard : false,
    showTranslation: isContinuation ? state.showTranslation : false,
  })
}
