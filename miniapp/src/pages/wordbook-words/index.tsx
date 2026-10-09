import { useCallback, useEffect, useRef, useState } from 'react'
import { Input, ScrollView, Text, Textarea, View } from '@tarojs/components'
import Taro, { getCurrentInstance } from '@tarojs/taro'
import {
  ArrowLeft,
  ArrowRight,
  Close,
  Del,
  ArrowDown,
  Edit,
  Retweet,
  Right,
  Search,
  Setting,
  VolumeMax,
} from '@nutui/icons-react-taro'
import {
  deleteWordBookWord,
  getWordBook,
  getWordDetail,
  listWordBookWords,
  updateWordBookWord,
  type WordBookWord,
  type WordDetail,
} from '../../api/wordbooks'
import { CloudButton } from '../../components/button'
import { PageBackHeader } from '../../components/page-back-header/PageBackHeader'
import { resolveMediaUrl } from '../../utils/mediaUrl'
import { color } from '../../styles/tokens'
import './index.scss'

type MaskMode = 'none' | 'meaning' | 'word'
const MASK_STORAGE_KEY = 'wb_detail_mask_mode'
const pageSize = 40

const maskOptions: Array<{ key: MaskMode; label: string }> = [
  { key: 'none', label: '全部显示' },
  { key: 'meaning', label: '遮住释义' },
  { key: 'word', label: '遮住单词' },
]

function formatPhoneticBracket(w: WordBookWord): string {
  const parts = [w.phonetic, w.phoneticUs, w.phoneticUk]
    .map((x) => String(x || '').trim())
    .filter(Boolean)
    .map((p) => p.replace(/^\[|\]$/g, '').replace(/^\//, '').replace(/\/$/, ''))
  const uniq = Array.from(new Set(parts))
  return uniq.length ? uniq.map((p) => `[${p}]`).join(' / ') : ''
}

function displayTranslationFull(raw?: string): string {
  const text = String(raw || '').trim()
  if (!text) return ''
  try {
    const parsed = JSON.parse(text) as unknown
    if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean).join('；')
    if (typeof parsed === 'string') return parsed
  } catch {}
  return text
}

function meaningLines(w: WordBookWord): string[] {
  const short = (w.translationShort || '').trim()
  if (short) return short.split(/\n|；|;/).map((s) => s.trim()).filter(Boolean)
  const full = displayTranslationFull(w.translation)
  if (full) return full.split(/\n|；/).map((s) => s.trim()).filter(Boolean)
  const def = (w.definition || '').trim()
  if (def) return [def]
  if (w.partOfSpeech) return [w.partOfSpeech]
  return []
}

function shuffleArray<T>(arr: T[]): T[] {
  const next = [...arr]
  for (let i = next.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[next[i], next[j]] = [next[j], next[i]]
  }
  return next
}

function readMaskMode(): MaskMode {
  const v = Taro.getStorageSync(MASK_STORAGE_KEY)
  return v === 'meaning' || v === 'word' ? v : 'none'
}

function parseJSON<T>(raw?: string | null): T | null {
  if (!raw || raw === '[]' || raw === '') return null
  try {
    const v = JSON.parse(raw)
    return Array.isArray(v) && v.length === 0 ? null : v
  } catch {
    return null
  }
}

function stripTags(s: string): string {
  return s.replace(/<\/?b>/g, '').replace(/<\/?i>/g, '')
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View className="wbw__detail-section">
      <View className="wbw__detail-section-head"><View className="wbw__detail-dot" /><Text>{title}</Text></View>
      {children}
    </View>
  )
}

export default function WordBookWords() {
  const params = getCurrentInstance().router?.params || {}
  const bookId = Number(params.id)
  const bookNameParam = decodeURIComponent(params.name || '')

  const [bookName, setBookName] = useState(bookNameParam)
  const [isCustom, setIsCustom] = useState(false)
  const [keyword, setKeyword] = useState('')
  const [debouncedKw, setDebouncedKw] = useState('')
  const [list, setList] = useState<WordBookWord[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [playingId, setPlayingId] = useState<number | null>(null)
  const [maskMode, setMaskMode] = useState<MaskMode>(readMaskMode)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [detailWord, setDetailWord] = useState<WordBookWord | null>(null)
  const [detail, setDetail] = useState<WordDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState(false)
  const [editWord, setEditWord] = useState<WordBookWord | null>(null)
  const [editForm, setEditForm] = useState({ word: '', phonetic: '', translation: '' })
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [tappedReveal, setTappedReveal] = useState<Set<number>>(new Set())
  const audioCtxRef = useRef<Taro.InnerAudioContext | null>(null)

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedKw(keyword.trim()), 350)
    return () => clearTimeout(timer)
  }, [keyword])

  useEffect(() => setPage(1), [debouncedKw])
  useEffect(() => setTappedReveal(new Set()), [maskMode, page, debouncedKw])

  const load = useCallback(async () => {
    if (!Number.isFinite(bookId) || bookId <= 0) return
    setLoading(true)
    setErr(null)
    try {
      const [bookRes, wordsRes] = await Promise.all([
        getWordBook(bookId),
        listWordBookWords(bookId, { page, pageSize, keyword: debouncedKw || undefined }),
      ])
      if (bookRes.code === 200 && bookRes.data) {
        setBookName(bookRes.data.name || '')
        setIsCustom(Number(bookRes.data.ownerUserId || 0) > 0 || bookRes.data.category === 'custom')
      }
      if (wordsRes.code !== 200) {
        setErr(wordsRes.msg || '加载单词失败')
        setList([])
        return
      }
      setList(Array.isArray(wordsRes.data?.list) ? wordsRes.data.list : [])
      setTotal(Number(wordsRes.data?.total ?? 0))
    } catch (e: any) {
      setErr(e?.msg || '加载失败')
      setList([])
    } finally {
      setLoading(false)
    }
  }, [bookId, page, debouncedKw])

  useEffect(() => { void load() }, [load])

  useEffect(() => {
    if (!detailWord) return
    setDetail(null)
    setDetailError(false)
    setDetailLoading(true)
    getWordDetail(detailWord.id).then(
      (res) => {
        if (res.data) setDetail(res.data)
        else setDetailError(true)
        setDetailLoading(false)
      },
      () => {
        setDetailError(true)
        setDetailLoading(false)
      }
    )
  }, [detailWord])

  const play = (audioUrl?: string, id?: number) => {
    const urls = (audioUrl || '').split(';').map((u) => resolveMediaUrl(u.trim())).filter(Boolean)
    const src = urls[0]
    if (!src) {
      Taro.showToast({ title: '暂无发音音频', icon: 'none' })
      return
    }
    if (audioCtxRef.current) {
      try { audioCtxRef.current.stop(); audioCtxRef.current.destroy() } catch {}
      audioCtxRef.current = null
    }
    const ctx = Taro.createInnerAudioContext()
    ctx.src = src
    ctx.autoplay = true
    ctx.onEnded(() => setPlayingId(null))
    ctx.onError(() => {
      setPlayingId(null)
      Taro.showToast({ title: '音频播放失败', icon: 'none' })
    })
    audioCtxRef.current = ctx
    if (id != null) setPlayingId(id)
  }

  useEffect(() => () => {
    if (audioCtxRef.current) {
      try { audioCtxRef.current.destroy() } catch {}
    }
  }, [])

  const changeMask = (mode: MaskMode) => {
    setMaskMode(mode)
    setSettingsOpen(false)
    Taro.setStorageSync(MASK_STORAGE_KEY, mode)
  }

  const handleShuffle = () => {
    setList((prev) => shuffleArray(prev))
    Taro.showToast({ title: '已打乱', icon: 'none' })
  }

  const handleExport = () => {
    if (!list.length) {
      Taro.showToast({ title: '当前页没有可导出的单词', icon: 'none' })
      return
    }
    const lines = list.map((w) => [w.word, formatPhoneticBracket(w), meaningLines(w).join('；')].filter(Boolean).join('\t'))
    Taro.setClipboardData({ data: lines.join('\n'), success: () => Taro.showToast({ title: '已复制当前页', icon: 'success' }) })
  }

  const openEdit = (w: WordBookWord) => {
    setEditWord(w)
    setEditForm({ word: w.word, phonetic: w.phonetic || w.phoneticUs || w.phoneticUk || '', translation: meaningLines(w).join('；') || w.translation || '' })
  }

  const saveEdit = async () => {
    if (!editWord) return
    const word = editForm.word.trim()
    if (!word) {
      Taro.showToast({ title: '请输入单词', icon: 'none' })
      return
    }
    setSaving(true)
    try {
      const trans = editForm.translation.trim()
      const res = await updateWordBookWord(bookId, editWord.id, { word, phonetic: editForm.phonetic.trim(), translation: trans, translationShort: trans })
      if (res.code !== 200) {
        Taro.showToast({ title: res.msg || '保存失败', icon: 'none' })
        return
      }
      Taro.showToast({ title: '已保存', icon: 'success' })
      setEditWord(null)
      void load()
    } catch (e: any) {
      Taro.showToast({ title: e?.msg || '保存失败', icon: 'none' })
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = (w: WordBookWord) => {
    Taro.showModal({
      title: '删除单词',
      content: `确定删除 “${w.word}”？`,
      confirmText: '删除',
      confirmColor: color.destructive,
      success: async (r) => {
        if (!r.confirm) return
        setDeletingId(w.id)
        try {
          const res = await deleteWordBookWord(bookId, w.id)
          if (res.code !== 200) {
            Taro.showToast({ title: res.msg || '删除失败', icon: 'none' })
            return
          }
          Taro.showToast({ title: '已删除', icon: 'success' })
          void load()
        } catch (e: any) {
          Taro.showToast({ title: e?.msg || '删除失败', icon: 'none' })
        } finally {
          setDeletingId(null)
        }
      },
    })
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const title = bookName || `词库 #${bookId}`
  const toggleReveal = (id: number) => {
    if (maskMode === 'none') return
    setTappedReveal((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const detailExamples = parseJSON<Array<{ en: string; cn: string; pos?: string }>>(detail?.exampleSentences)
  const detailPhrases = parseJSON<Array<{ phrase: string; meanings: string[] }>>(detail?.collocations)
  const detailSynonyms = parseJSON<Array<{ pos: string; trans: string; word: string }>>(detail?.synonyms)

  if (!Number.isFinite(bookId) || bookId <= 0) {
    return <View className="wbw wbw--invalid"><Text>无效词库</Text></View>
  }

  return (
    <View className="wbw">
      <PageBackHeader title={title} fallbackTo="/pages/wordbooks/index" />

      <View className="wbw__toolbar">
        <View className="wbw__toolbar-row">
          <Text className="wbw__count">共 {total} 个单词{debouncedKw ? '（已筛选）' : ''}</Text>
          <View className="wbw__actions">
            <View className="wbw__tool" onClick={handleExport}><ArrowDown size={18} color={color.primary} /></View>
            <View className="wbw__tool" onClick={handleShuffle}><Retweet size={18} color={color.primary} /></View>
            <View className="wbw__settings-wrap">
              <View className={`wbw__tool ${settingsOpen ? 'wbw__tool--active' : ''}`} onClick={() => setSettingsOpen((o) => !o)}><Setting size={18} color={color.primary} /></View>
              {settingsOpen ? (
                <View className="wbw__settings-menu">
                  {maskOptions.map((opt) => (
                    <View key={opt.key} className={`wbw__settings-option ${maskMode === opt.key ? 'wbw__settings-option--active' : ''}`} onClick={() => changeMask(opt.key)}>
                      <Text>{opt.label}</Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
          </View>
        </View>
        <View className="wbw__search">
          <Search size={16} color={color.mutedForeground} />
          <Input className="wbw__search-input" value={keyword} onInput={(e) => setKeyword(e.detail.value)} placeholder="搜索单词或释义…" placeholderClass="wbw__search-ph" confirmType="search" />
        </View>
      </View>

      <ScrollView className="wbw__list" scrollY enableFlex>
        {err ? <View className="wbw__error"><Text>{err}</Text></View> : null}
        {loading ? (
          <View className="wbw__state"><Text>加载中…</Text></View>
        ) : list.length === 0 ? (
          <View className="wbw__state"><Text>暂无单词</Text></View>
        ) : (
          list.map((w) => {
            const ipa = formatPhoneticBracket(w)
            const lines = meaningLines(w)
            const revealedCard = maskMode === 'none' || tappedReveal.has(w.id)
            const hideWord = maskMode === 'word' && !revealedCard
            const hideMeaning = maskMode === 'meaning' && !revealedCard
            const hasAudio = Boolean((w.audioUrl || '').split(';').some((u) => resolveMediaUrl(u.trim())))
            return (
              <View key={w.id} className="wbw__card">
                <View className="wbw__card-main" onClick={() => toggleReveal(w.id)}>
                  <View className="wbw__word-row">
                    <View className="wbw__word-wrap">
                      <Text className={`wbw__word ${hideWord ? 'wbw__word--hidden' : ''}`}>{hideWord ? '████' : w.word}</Text>
                      {ipa && !hideWord ? <Text className="wbw__phonetic">{ipa}</Text> : null}
                    </View>
                    <View className={`wbw__play ${!hasAudio ? 'wbw__play--disabled' : ''} ${playingId === w.id ? 'wbw__play--active' : ''}`} onClick={(e) => { e.stopPropagation(); play(w.audioUrl, w.id) }}>
                      <VolumeMax size={18} color={hasAudio ? color.primary : color.mutedSoft} />
                    </View>
                  </View>
                  <View className="wbw__meaning-area">
                    {hideMeaning ? <View className="wbw__meaning-mask" /> : lines.length ? (
                      <View className="wbw__meaning-lines">{lines.map((line, i) => <Text key={i} className="wbw__meaning">{line}</Text>)}</View>
                    ) : <Text className="wbw__no-meaning">暂无释义</Text>}
                  </View>
                </View>
                <View className="wbw__card-footer">
                  {isCustom ? (
                    <>
                      <View className="wbw__mini-action" onClick={() => openEdit(w)}><Edit size={13} color={color.mutedForeground} /><Text>编辑</Text></View>
                      <View className="wbw__mini-action wbw__mini-action--danger" onClick={() => handleDelete(w)}><Del size={13} color={color.mutedForeground} /><Text>{deletingId === w.id ? '删除中' : '删除'}</Text></View>
                    </>
                  ) : null}
                  <View className="wbw__mini-action wbw__mini-action--detail" onClick={() => setDetailWord(w)}>
                    <Text>单词详情</Text><Right size={14} color={color.primary} />
                  </View>
                </View>
              </View>
            )
          })
        )}

        {total > pageSize ? (
          <View className="wbw__pager">
            <CloudButton variant="outline" disabled={loading || page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}><ArrowLeft size={16} /> 上一页</CloudButton>
            <Text className="wbw__pager-text">{page} / {totalPages}</Text>
            <CloudButton variant="outline" disabled={loading || page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>下一页 <ArrowRight size={16} /></CloudButton>
          </View>
        ) : null}
      </ScrollView>

      {detailWord ? (
        <View className="wbw__mask" onClick={() => setDetailWord(null)}>
          <View className="wbw__dialog" onClick={(e) => e.stopPropagation()}>
            <View className="wbw__dialog-head">
              <Text className="wbw__dialog-title"><VolumeMax size={20} color={color.primary} /> 单词详情</Text>
              <View className="wbw__dialog-close" onClick={() => setDetailWord(null)}><Close size={18} color={color.mutedForeground} /></View>
            </View>
            <ScrollView className="wbw__dialog-body" scrollY>
              {detailLoading ? <View className="wbw__state"><Text>加载中…</Text></View> : detailError || !detail ? (
                <View className="wbw__state"><Text>加载失败，请稍后重试</Text></View>
              ) : (
                <View>
                  <View className="wbw__detail-head">
                    <View className="wbw__detail-word-area">
                      <Text className="wbw__detail-word">{detail.word || detailWord.word}</Text>
                      <View className="wbw__detail-meta">
                        {detail.phoneticUk ? <Text>英 {detail.phoneticUk}</Text> : null}
                        {detail.phoneticUs ? <Text>美 {detail.phoneticUs}</Text> : null}
                        {detail.partOfSpeech ? <Text className="wbw__detail-pos">{detail.partOfSpeech}</Text> : null}
                        {detail.syllables ? <Text>音节：{detail.syllables}</Text> : null}
                      </View>
                    </View>
                    {detail.audioUrl ? <View className="wbw__tool" onClick={() => play(detail.audioUrl, detail.id)}><VolumeMax size={20} color={color.primary} /></View> : null}
                  </View>

                  {detail.translation ? <DetailSection title="释义"><Text className="wbw__detail-text">{displayTranslationFull(detail.translation)}</Text></DetailSection> : null}
                  {detail.definition ? <DetailSection title="英文释义"><Text className="wbw__detail-text wbw__detail-text--muted">{detail.definition}</Text></DetailSection> : null}
                  {detailExamples?.length ? (
                    <DetailSection title={`例句（${detailExamples.length}）`}>
                      {detailExamples.slice(0, 6).map((ex, i) => (
                        <View key={i} className="wbw__detail-example">
                          <Text className="wbw__detail-en">{stripTags(ex.en)}</Text>
                          <Text className="wbw__detail-cn">{ex.cn}</Text>
                        </View>
                      ))}
                    </DetailSection>
                  ) : null}
                  {detailPhrases?.length ? (
                    <DetailSection title={`短语搭配（${detailPhrases.length}）`}>
                      {detailPhrases.map((p, i) => <View key={i} className="wbw__detail-phrase"><Text className="wbw__detail-phrase-name">{p.phrase}</Text><Text>{p.meanings.join('；')}</Text></View>)}
                    </DetailSection>
                  ) : null}
                  {detailSynonyms?.length ? (
                    <DetailSection title="同义词">
                      <View className="wbw__detail-tags">{detailSynonyms.map((s, i) => <Text key={i} className="wbw__detail-tag">{s.word} {s.trans}</Text>)}</View>
                    </DetailSection>
                  ) : null}
                  {detail.etymology ? <DetailSection title="词源"><Text className="wbw__detail-text wbw__detail-text--muted">{detail.etymology}</Text></DetailSection> : null}
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      ) : null}

      {editWord ? (
        <View className="wbw__mask" onClick={() => setEditWord(null)}>
          <View className="wbw__dialog wbw__dialog--edit" onClick={(e) => e.stopPropagation()}>
            <View className="wbw__dialog-head"><Text className="wbw__dialog-title">编辑单词</Text></View>
            <View className="wbw__edit-fields">
              <View className="wbw__edit-field"><Text className="wbw__edit-label">单词</Text><Input className="wbw__edit-input" value={editForm.word} onInput={(e) => setEditForm((f) => ({ ...f, word: e.detail.value }))} /></View>
              <View className="wbw__edit-field"><Text className="wbw__edit-label">音标</Text><Input className="wbw__edit-input" value={editForm.phonetic} onInput={(e) => setEditForm((f) => ({ ...f, phonetic: e.detail.value }))} placeholder="/ˈæpl/" /></View>
              <View className="wbw__edit-field"><Text className="wbw__edit-label">释义</Text><Textarea className="wbw__edit-textarea" value={editForm.translation} onInput={(e) => setEditForm((f) => ({ ...f, translation: e.detail.value }))} placeholder="一行一个释义，或用；分隔" /></View>
            </View>
            <View className="wbw__dialog-footer">
              <CloudButton variant="ghost" onClick={() => setEditWord(null)}>取消</CloudButton>
              <CloudButton variant="brand" loading={saving} loadingText="保存中" disabled={saving} onClick={() => void saveEdit()}>保存</CloudButton>
            </View>
          </View>
        </View>
      ) : null}
    </View>
  )
}
