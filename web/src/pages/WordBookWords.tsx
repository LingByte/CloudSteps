import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Loader2,
  Pencil,
  Search,
  Settings2,
  Shuffle,
  Trash2,
  Volume2,
} from "lucide-react";
import { PageBackHeader } from "../components/PageBackHeader";
import { CloudButton } from "../components/cloudsteps";
import { CloudInput } from "../components/cloudsteps/arco";
import { Textarea } from "../components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";
import { WordDetailDialog } from "../components/WordDetailDialog";
import {
  deleteWordBookWord,
  getWordBook,
  listWordBookWords,
  updateWordBookWord,
  type WordBookWord,
} from "../api/wordbooks";
import { playWordAudio } from "../utils/audioPlayer";
import { displayTranslationFull, formatTranslation } from "../utils/wordFormat";
import { showToast } from "../utils/toast";
import { cn } from "../utils/cn";
import { useTranslation } from "react-i18next";
import { formatApiMessage } from "../utils/apiMessage";
import { isValidSnowflakeId, normalizeSnowflakeId } from "../utils/json-snowflake";

type MaskMode = "none" | "meaning" | "word";

function maskOptions(tr: (k: string) => string): { key: MaskMode; label: string }[] {
  return [
    { key: "none", label: tr("word_book_words.mask_none") },
    { key: "meaning", label: tr("word_book_words.mask_meaning") },
    { key: "word", label: tr("word_book_words.mask_word") },
  ];
}

const MASK_STORAGE_KEY = "wb_detail_mask_mode";

function formatPhoneticBracket(w: WordBookWord): string {
  const parts = [w.phonetic, w.phoneticUs, w.phoneticUk]
    .map((x) => String(x || "").trim())
    .filter(Boolean)
    .map((p) => p.replace(/^\[|\]$/g, "").replace(/^\//, "").replace(/\/$/, ""));
  const uniq = Array.from(new Set(parts));
  if (!uniq.length) return "";
  return uniq.map((p) => `[${p}]`).join(" / ");
}

function meaningLines(w: WordBookWord): string[] {
  const short = (w.translationShort || "").trim();
  if (short) {
    return short
      .split(/\n|；|;/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  const full = displayTranslationFull(w.translation) || formatTranslation(w.translation);
  if (full) {
    return full
      .split(/\n|；/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  const def = (w.definition || "").trim();
  if (def) return [def];
  if (w.partOfSpeech) return [`${w.partOfSpeech}`];
  return [];
}

function shuffleArray<T>(arr: T[]): T[] {
  const next = [...arr];
  for (let i = next.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

function readMaskMode(): MaskMode {
  try {
    const v = localStorage.getItem(MASK_STORAGE_KEY);
    if (v === "none" || v === "meaning" || v === "word") return v;
  } catch {
    /* ignore */
  }
  return "none";
}

export default function WordBookWords() {
  const { t } = useTranslation();
  const { id: idParam } = useParams<{ id: string }>();
  // 雪花 ID 超过 Number.MAX_SAFE_INTEGER，Number() 会把末尾精度抹掉，请求打到不存在的词库。
  const bookId = normalizeSnowflakeId(idParam);
  const bookIdOk = isValidSnowflakeId(bookId);

  const [bookName, setBookName] = useState("");
  const [isCustom, setIsCustom] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [debouncedKw, setDebouncedKw] = useState("");
  const [list, setList] = useState<WordBookWord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 40;
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [playingId, setPlayingId] = useState<number | null>(null);
  const [maskMode, setMaskMode] = useState<MaskMode>(readMaskMode);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);
  const [detailWord, setDetailWord] = useState<WordBookWord | null>(null);
  const [editWord, setEditWord] = useState<WordBookWord | null>(null);
  const [editForm, setEditForm] = useState({ word: "", phonetic: "", translation: "" });
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedKw(keyword.trim()), 350);
    return () => window.clearTimeout(t);
  }, [keyword]);

  useEffect(() => {
    setPage(1);
  }, [debouncedKw]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!settingsRef.current?.contains(e.target as Node)) setSettingsOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const load = useCallback(async () => {
    if (!bookIdOk) return;
    setLoading(true);
    setErr(null);
    try {
      const [bookRes, wordsRes] = await Promise.all([
        getWordBook(bookId),
        listWordBookWords(bookId, { page, pageSize, keyword: debouncedKw || undefined }),
      ]);
      if (bookRes.code === 200 && bookRes.data) {
        setBookName(bookRes.data.name || "");
        setIsCustom(Number(bookRes.data.ownerUserId || 0) > 0 || bookRes.data.category === "custom");
      }
      if (wordsRes.code !== 200) {
        setErr(formatApiMessage(wordsRes.msg, "word_book_words.load_words_failed"));
        setList([]);
        return;
      }
      const d = wordsRes.data;
      setList(Array.isArray(d?.list) ? d.list : []);
      setTotal(Number(d?.total ?? 0));
    } catch (e: unknown) {
      const msg =
        e && typeof e === "object" && "msg" in e ? String((e as { msg: string }).msg) : formatApiMessage(undefined, "common.query_failed");
      setErr(msg);
      setList([]);
    } finally {
      setLoading(false);
    }
  }, [bookId, bookIdOk, page, debouncedKw, pageSize]);

  useEffect(() => {
    void load();
  }, [load]);

  const play = (w: WordBookWord) => {
    if (!w.audioUrl?.trim()) {
      showToast.info(t("word_book_words.no_audio"));
      return;
    }
    setPlayingId(w.id);
    playWordAudio(w.audioUrl, 300, () => setPlayingId(null));
  };

  const changeMask = (mode: MaskMode) => {
    setMaskMode(mode);
    setSettingsOpen(false);
    try {
      localStorage.setItem(MASK_STORAGE_KEY, mode);
    } catch {
      /* ignore */
    }
  };

  const handleShuffle = () => {
    setList((prev) => shuffleArray(prev));
    showToast.success(t("word_book_words.shuffled"));
  };

  const handleExport = () => {
    if (!list.length) {
      showToast.info(t("word_book_words.no_export"));
      return;
    }
    const lines = list.map((w) => {
      const ipa = formatPhoneticBracket(w);
      const mean = meaningLines(w).join("；");
      return [w.word, ipa, mean].filter(Boolean).join("\t");
    });
    const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${bookName || t("word_book_words.fallback")}-p${page}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    showToast.success(t("word_book_words.exported_page"));
  };

  const openEdit = (w: WordBookWord) => {
    setEditWord(w);
    setEditForm({
      word: w.word,
      phonetic: w.phonetic || w.phoneticUs || w.phoneticUk || "",
      translation: meaningLines(w).join("；") || w.translation || "",
    });
  };

  const saveEdit = async () => {
    if (!editWord) return;
    const word = editForm.word.trim();
    if (!word) {
      showToast.info(t("word_book_words.enter_word"));
      return;
    }
    setSaving(true);
    try {
      const trans = editForm.translation.trim();
      const res = await updateWordBookWord(bookId, editWord.id, {
        word,
        phonetic: editForm.phonetic.trim(),
        translation: trans,
        translationShort: trans,
      });
      if (res.code !== 200) {
        showToast.error(formatApiMessage(res.msg, "common.operation_failed"));
        return;
      }
      showToast.success(t("word_book_words.saved"));
      setEditWord(null);
      void load();
    } catch (e: unknown) {
      const msg =
        e && typeof e === "object" && "msg" in e ? String((e as { msg: string }).msg) : formatApiMessage(undefined, "common.operation_failed");
      showToast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (w: WordBookWord) => {
    if (!window.confirm(t("word_book_words.delete_confirm", { word: w.word }))) return;
    setDeletingId(w.id);
    try {
      const res = await deleteWordBookWord(bookId, w.id);
      if (res.code !== 200) {
        showToast.error(formatApiMessage(res.msg, "common.operation_failed"));
        return;
      }
      showToast.success(t("word_book_words.deleted"));
      void load();
    } catch (e: unknown) {
      const msg =
        e && typeof e === "object" && "msg" in e ? String((e as { msg: string }).msg) : formatApiMessage(undefined, "common.operation_failed");
      showToast.error(msg);
    } finally {
      setDeletingId(null);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const title = bookName || (bookIdOk ? t("word_book_words.fallback_title", { id: bookId }) : t("word_book_words.fallback"));

  const [tappedReveal, setTappedReveal] = useState<Set<number>>(new Set());
  useEffect(() => {
    setTappedReveal(new Set());
  }, [maskMode, page, debouncedKw]);

  const toggleReveal = (id: number) => {
    if (maskMode === "none") return;
    setTappedReveal((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (!bookIdOk) {
    return (
      <div className="px-4 py-8 text-muted-foreground">
        {t("word_book_words.invalid")}{" "}
        <Link to="/" className="text-primary underline">
          {t("practice.back")}
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-full flex flex-col bg-muted/40">
      <PageBackHeader title={title} fallbackTo="/" maxWidthClass="max-w-none" />

      <div className="sticky top-11 z-40 bg-card border-b border-border -mx-3 sm:-mx-4 px-3 sm:px-4">
        <div className="flex items-center gap-2 py-2.5">
          <p className="min-w-0 flex-1 text-sm text-muted-foreground truncate">
            {t("word_book_words.total_filtered", { total, filtered: debouncedKw ? t("word_book_words.filtered") : "" })}
          </p>
          <div className="flex items-center gap-0.5 shrink-0">
            <button
              type="button"
              aria-label={t("word_book_words.export")}
              onClick={handleExport}
              className="size-9 inline-flex items-center justify-center rounded-lg text-primary hover:bg-primary-soft"
            >
              <Download size={18} />
            </button>
            <button
              type="button"
              aria-label={t("word_book_words.shuffle")}
              onClick={handleShuffle}
              className="size-9 inline-flex items-center justify-center rounded-lg text-primary hover:bg-primary-soft"
            >
              <Shuffle size={18} />
            </button>
            <div className="relative" ref={settingsRef}>
              <button
                type="button"
                aria-label={t("word_book_words.display_settings")}
                onClick={() => setSettingsOpen((o) => !o)}
                className={cn(
                  "size-9 inline-flex items-center justify-center rounded-lg text-primary hover:bg-primary-soft",
                  settingsOpen && "bg-primary-soft",
                )}
              >
                <Settings2 size={18} />
              </button>
              {settingsOpen ? (
                <div className="absolute right-0 top-full mt-1 z-50 min-w-[8.5rem] rounded-xl border border-border bg-card py-1 shadow-lg">
                  {maskOptions(t).map((opt) => (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => changeMask(opt.key)}
                      className={cn(
                        "w-full px-3 py-2 text-left text-sm transition-colors",
                        maskMode === opt.key
                          ? "bg-primary text-primary-foreground"
                          : "text-foreground hover:bg-muted",
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </div>
        <div className="pb-2.5">
          <div className="relative">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
              size={16}
            />
            <input
              type="search"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder={t("word_book_words.search_placeholder")}
              className="w-full h-9 pl-9 pr-3 rounded-lg border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary focus:ring-[3px] focus:ring-primary/20"
            />
          </div>
        </div>
      </div>

      <div className="flex-1 py-3 space-y-3 pb-8">
        {err ? (
          <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {err}
          </div>
        ) : null}

        {loading ? (
          <div className="rounded-xl bg-card border border-border px-4 py-10 text-center text-sm text-muted-foreground">
            {t("practice.loading")}
          </div>
        ) : list.length === 0 ? (
          <div className="rounded-xl bg-card border border-border px-4 py-10 text-center text-sm text-muted-foreground">
            {t("word_book_words.no_words")}
          </div>
        ) : (
          <ul className="space-y-3">
            {list.map((w) => {
              const ipa = formatPhoneticBracket(w);
              const lines = meaningLines(w);
              const revealedCard = maskMode === "none" || tappedReveal.has(w.id);
              const hideWord = maskMode === "word" && !revealedCard;
              const hideMeaning = maskMode === "meaning" && !revealedCard;
              const hasAudio = Boolean(w.audioUrl?.trim());

              return (
                <li
                  key={w.id}
                  className="rounded-2xl bg-card border border-border overflow-hidden"
                >
                  <div
                    className="p-4"
                    onClick={() => toggleReveal(w.id)}
                    role={maskMode === "none" ? undefined : "button"}
                  >
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                          <span
                            className={cn(
                              "text-lg font-semibold text-foreground leading-snug",
                              hideWord && "select-none rounded-md bg-muted text-transparent",
                            )}
                          >
                            {hideWord ? "████" : w.word}
                          </span>
                          {ipa && !hideWord ? (
                            <span className="text-sm text-muted-foreground font-normal">{ipa}</span>
                          ) : null}
                        </div>
                      </div>
                      <button
                        type="button"
                        aria-label={t("practice.play_audio")}
                        disabled={!hasAudio}
                        onClick={(e) => {
                          e.stopPropagation();
                          play(w);
                        }}
                        className={cn(
                          "shrink-0 size-8 inline-flex items-center justify-center rounded-lg",
                          hasAudio
                            ? playingId === w.id
                              ? "text-primary bg-primary-soft"
                              : "text-primary hover:bg-primary-soft"
                            : "text-muted-soft cursor-not-allowed",
                        )}
                      >
                        <Volume2 size={18} />
                      </button>
                    </div>

                    <div className="mt-3">
                      {hideMeaning ? (
                        <div className="h-14 rounded-lg bg-muted" />
                      ) : lines.length ? (
                        <div className="space-y-1 text-sm text-muted-foreground leading-relaxed">
                          {lines.map((line, i) => (
                            <p key={i}>{line}</p>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-soft">{t("word_book_words.no_meaning")}</p>
                      )}
                    </div>
                  </div>

                  <div className="border-t border-border px-4 py-2 flex items-center justify-end gap-1">
                    {isCustom ? (
                      <>
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 px-2 py-1.5 text-xs text-muted-foreground hover:text-primary"
                          onClick={() => openEdit(w)}
                        >
                          <Pencil size={13} />
                          {t("word_book_words.edit")}
                        </button>
                        <button
                          type="button"
                          disabled={deletingId === w.id}
                          className="inline-flex items-center gap-1 px-2 py-1.5 text-xs text-muted-foreground hover:text-destructive disabled:opacity-50"
                          onClick={() => void handleDelete(w)}
                        >
                          <Trash2 size={13} />
                          {deletingId === w.id ? t("word_book_words.deleting") : t("word_book_words.delete")}
                        </button>
                      </>
                    ) : null}
                    <button
                      type="button"
                      className="inline-flex items-center gap-0.5 px-2 py-1.5 text-xs font-medium text-primary"
                      onClick={() => setDetailWord(w)}
                    >
                      {t("word_book_words.word_detail")}
                      <ChevronRight size={14} />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {total > pageSize ? (
          <div className="flex items-center justify-between gap-2 pt-1 text-sm text-muted-foreground">
            <CloudButton
              type="button"
              variant="outline"
              disabled={loading || page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="gap-1"
            >
              {loading && page > 1 ? <Loader2 size={16} className="animate-spin" /> : <ChevronLeft size={16} />}
              {t("practice.prev_page")}
            </CloudButton>
            <span className="tabular-nums">
              {page} / {totalPages}
            </span>
            <CloudButton
              type="button"
              variant="outline"
              disabled={loading || page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="gap-1"
            >
              {t("practice.next_page")}
              {loading && page < totalPages ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <ChevronRight size={16} />
              )}
            </CloudButton>
          </div>
        ) : null}
      </div>

      <WordDetailDialog
        wordId={detailWord?.id ?? null}
        wordText={detailWord?.word}
        open={detailWord != null}
        onOpenChange={(open) => {
          if (!open) setDetailWord(null);
        }}
      />

      <Dialog
        open={editWord != null}
        onOpenChange={(open) => {
          if (!open) setEditWord(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("word_book_words.edit_word")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t("word_book_words.word_label")}</label>
              <CloudInput
                value={editForm.word}
                onChange={(v: string) => setEditForm((f) => ({ ...f, word: v }))}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t("word_book_words.phonetic_label")}</label>
              <CloudInput
                value={editForm.phonetic}
                onChange={(v: string) => setEditForm((f) => ({ ...f, phonetic: v }))}
                placeholder="/ˈæpl/"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t("word_book_words.meaning_label")}</label>
              <Textarea
                value={editForm.translation}
                onChange={(e) => setEditForm((f) => ({ ...f, translation: e.target.value }))}
                className="min-h-24 text-sm resize-none"
                placeholder={t("word_book_words.meaning_placeholder")}
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <CloudButton type="button" variant="ghost" onClick={() => setEditWord(null)}>
              {t("practice.cancel")}
            </CloudButton>
            <CloudButton type="button" disabled={saving} onClick={() => void saveEdit()}>
              {saving ? t("practice.saving") : t("practice.save")}
            </CloudButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
