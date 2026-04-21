import { resolveMediaUrl } from './mediaUrl'

/**
 * 解析分号分隔的音频URL字符串，返回有效URL数组
 */
export function parseAudioUrls(audioUrl?: string | null): string[] {
  if (!audioUrl?.trim()) return []
  return audioUrl
    .split(';')
    .map(u => u.trim())
    .filter(Boolean)
    .map(u => resolveMediaUrl(u))
    .filter((u): u is string => u !== null)
}

/**
 * 仅播放单个音频URL
 * @returns 一个 abort 函数，调用可中断播放
 */
export function playSingleAudio(url: string, onDone?: () => void): () => void {
  let aborted = false
  const audio = new Audio(url)

  const finish = () => {
    if (aborted) return
    onDone?.()
  }

  audio.onended = finish
  audio.onerror = () => {
    console.warn(`音频播放失败: ${url}`)
    finish()
  }
  audio.play().catch(finish)

  return () => {
    aborted = true
    audio.pause()
    onDone?.()
  }
}

/**
 * 记录每个音频串下一次要播放的索引，实现“每次点击播一个，下次播下一个”
 */
const nextAudioIndexByKey = new Map<string, number>()

/**
 * 便捷函数：解析 audioUrl 字符串并单次播放
 * @returns abort 函数
 */
export function playWordAudio(
  audioUrl: string | undefined | null,
  _gapMs: number = 300,
  onDone?: () => void
): () => void {
  const urls = parseAudioUrls(audioUrl)
  if (urls.length === 0) {
    onDone?.()
    return () => {}
  }

  const key = urls.join(";")
  const nextIndex = nextAudioIndexByKey.get(key) ?? 0
  const index = ((nextIndex % urls.length) + urls.length) % urls.length
  const selectedUrl = urls[index]

  nextAudioIndexByKey.set(key, (index + 1) % urls.length)
  return playSingleAudio(selectedUrl, onDone)
}

/**
 * 播放第一个音频，并把下次顺序播放位置推进到第二个
 */
export function playFirstWordAudio(
  audioUrl: string | undefined | null,
  onDone?: () => void
): () => void {
  const urls = parseAudioUrls(audioUrl)
  if (urls.length === 0) {
    onDone?.()
    return () => {}
  }

  const key = urls.join(";")
  nextAudioIndexByKey.set(key, urls.length > 1 ? 1 : 0)
  return playSingleAudio(urls[0], onDone)
}
