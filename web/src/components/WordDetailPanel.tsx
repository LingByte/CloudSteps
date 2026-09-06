import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, Volume2, Pencil } from "lucide-react";
import { CloudButton } from "./cloudsteps";
import { getWordDetail, type WordDetail, type UserWordView } from "../api/wordbooks";
import { displayTranslationFull, displayTranslationShort, withPartOfSpeech } from "../utils/wordFormat";
import { playWordAudio } from "../utils/audioPlayer";
import { PRACTICE_TRANS_CLASS, PRACTICE_WORD_CLASS } from "./PracticeFontSettings";
import { UserWordEditor } from "./UserWordEditor";
import { PhonicsAudioPanel } from "./PhonicsAudioPanel";

function parseJSON<T>(raw?: string | null): T | null {
  if (!raw || raw === "[]" || raw === "") return null;
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) && v.length === 0 ? null : v;
  } catch {
    return null;
  }
}

function stripTags(s: string): string {
  return s.replace(/<\/?b>/gi, "").replace(/<\/?i>/gi, "");
}

type ExtKey =
  | "translation"
  | "examples"
  | "mnemonic"
  | "phrases"
  | "morphology"
  | "image"
  | "derivations"
  | "synonyms"
  | "antonyms"
  | "etymology"
  | "collins"
  | "definition"
  | "family";

/** 简易模式下保留的标签（约一半） */
const SIMPLE_KEYS = new Set<ExtKey>([
  "translation",
  "examples",
  "mnemonic",
  "phrases",
  "morphology",
  "image",
]);

type ParsedDetail = {
  examples: Array<{ en: string; cn: string }> | null;
  phrases: Array<{ phrase: string; meanings: string[] }> | null;
  derivations: Array<{ word: string; meanings: Array<{ pos: string; meaning: string }> }> | null;
  synonyms: Array<{ pos: string; trans: string; word: string }> | null;
  antonyms: Array<{ pos?: string; word: string; trans?: string }> | null;
  wordFamily: Array<{ pos: string; word: string; meaning: string }> | null;
  morphology: { forms?: string[]; inflections?: string[] } | null;
  collins: Array<{
    def: string;
    posp: string;
    tran: string;
    example?: Array<{ ex: string; tran: string }>;
  }> | null;
};

type ExtTab = { key: ExtKey; label: string };

type Props = {
  wordId: string | number;
  wordText?: string;
  /** 当后端返回的释义为空时，作为默认“释义”标签内容展示 */
  fallbackTranslation?: string;
  onClose?: () => void;
  /** tags：仅标签；inline：音标+释义+标签（词下展开）；full：含词头卡片 */
  variant?: "full" | "tags" | "inline";
  /** 简易：只展示部分拓展标签；默认 true */
  simpleMode?: boolean;
  onWordPatched?: (view: UserWordView) => void;
};

/**
 * 页内单词拓展：标签切换查看，非模态框。
 */
export function WordDetailPanel({
  wordId,
  wordText,
  fallbackTranslation,
  variant = "full",
  simpleMode = true,
  onWordPatched,
}: Props) {
  const { t } = useTranslation();
  const [detail, setDetail] = useState<WordDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [active, setActive] = useState<ExtKey | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setDetail(null);
    setError(false);
    setActive(null);
    getWordDetail(wordId)
      .then((res) => {
        if (!mounted) return;
        if (res.data) {
          setDetail(res.data);
          // 默认展开"释义"标签
          if (res.data.translation?.trim() || fallbackTranslation?.trim()) setActive("translation");
        } else {
          setError(true);
        }
      })
      .catch(() => {
        if (mounted) setError(true);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [wordId]);

  // 切回简易时，若当前标签被隐藏则收起
  useEffect(() => {
    if (!simpleMode || !active) return;
    if (!SIMPLE_KEYS.has(active)) setActive(null);
  }, [simpleMode, active]);

  const parsed: ParsedDetail | null = useMemo(() => {
    if (!detail) return null;
    return {
      examples: parseJSON(detail.exampleSentences),
      phrases: parseJSON(detail.collocations),
      derivations: parseJSON(detail.derivations),
      synonyms: parseJSON(detail.synonyms),
      antonyms: parseJSON(detail.antonyms),
      wordFamily: parseJSON(detail.wordFamily),
      morphology: parseJSON(detail.morphology),
      collins: parseJSON(detail.usageNotes),
    };
  }, [detail]);

  const word = detail?.word || wordText || "";
  const phonetic = detail?.phoneticUk || detail?.phoneticUs || detail?.phonetic || "";
  const detailTranslation = detail?.translation?.trim() || fallbackTranslation;
  const shortMeaning = detail
    ? withPartOfSpeech(detail.partOfSpeech, detailTranslation ? displayTranslationShort({ ...detail, translation: detailTranslation }) : "")
    : (fallbackTranslation ? withPartOfSpeech("", displayTranslationShort({ translation: fallbackTranslation })) : "");
  const fullMeaning = detail
    ? withPartOfSpeech(detail.partOfSpeech, detailTranslation ? displayTranslationFull(detailTranslation) : "")
    : (fallbackTranslation ? withPartOfSpeech("", displayTranslationFull(fallbackTranslation)) : "");
  const showFullInline = active === "translation";
  const tabs: ExtTab[] = useMemo(() => {
    if (!detail || !parsed) return [];
    const list: ExtTab[] = [];
    if (detailTranslation?.trim()) list.push({ key: "translation", label: t("word.tab.translation") });
    if (parsed.examples?.length) list.push({ key: "examples", label: t("word.tab.examples") });
    if (detail.mnemonic?.trim()) list.push({ key: "mnemonic", label: t("word.tab.mnemonic") });
    if (parsed.phrases?.length) list.push({ key: "phrases", label: t("word.tab.phrases") });
    if (parsed.morphology?.forms?.length) list.push({ key: "morphology", label: t("word.tab.morphology") });
    if (detail.imageUrl?.trim()) list.push({ key: "image", label: t("word.tab.image") });
    if (parsed.derivations?.length) list.push({ key: "derivations", label: t("word.tab.derivations") });
    if (parsed.synonyms?.length) list.push({ key: "synonyms", label: t("word.tab.synonyms") });
    if (parsed.antonyms?.length) list.push({ key: "antonyms", label: t("word.tab.antonyms") });
    if (detail.etymology?.trim()) list.push({ key: "etymology", label: t("word.tab.etymology") });
    if (parsed.collins?.length) list.push({ key: "collins", label: t("word.tab.collins") });
    if (detail.definition?.trim()) list.push({ key: "definition", label: t("word.tab.definition") });
    if (parsed.wordFamily?.length) list.push({ key: "family", label: t("word.tab.family") });
    if (!simpleMode) return list;
    return list.filter((t) => SIMPLE_KEYS.has(t.key));
  }, [detail, parsed, simpleMode, detailTranslation, t]);

  const tagsBlock = (
    <>
      {loading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : error ? (
        <p className="px-3 pb-4 text-center text-sm text-muted-foreground">{t("error.load_failed_retry")}</p>
      ) : !detail || !parsed ? (
        <p className="px-3 pb-4 text-center text-sm text-muted-foreground">{t("ui.empty")}</p>
      ) : (
        <>
          <div className="flex items-start gap-2 px-1 pb-1">
            {tabs.length > 0 ? (
              <div className="flex flex-wrap gap-1.5 flex-1 min-w-0">
                {tabs.map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => setActive(t.key === active ? null : t.key)}
                    className={`px-2.5 py-1 rounded-lg text-xs transition-colors ${
                      active === t.key
                        ? "bg-primary text-primary-foreground font-medium"
                        : "bg-muted text-foreground hover:bg-muted/80"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground flex-1">{t("word.no_extension")}</p>
            )}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setEditorOpen(true);
              }}
              className="shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <Pencil size={12} />
              {t("word.edit")}
            </button>
          </div>

          <PhonicsAudioPanel
            word={word}
            syllables={detail.syllables}
            phonetic={phonetic}
            audioUrl={detail.audioUrl}
          />

          {active && active !== "translation" && (
            <div className="pt-2 border-t border-border max-h-[36vh] overflow-y-auto">
              <ExtContent active={active} detail={detail} parsed={parsed} />
            </div>
          )}
          {active === "translation" && (
            <div className="pt-2 border-t border-border max-h-[36vh] overflow-y-auto">
              <p className={`${PRACTICE_TRANS_CLASS} leading-relaxed`}>{fullMeaning}</p>
            </div>
          )}
        </>
      )}
    </>
  );

  const editor = (
    <UserWordEditor
      wordId={wordId}
      open={editorOpen}
      onOpenChange={setEditorOpen}
      onSaved={async (view) => {
        onWordPatched?.(view);
        try {
          const res = await getWordDetail(wordId);
          if (res.data) setDetail(res.data);
        } catch {
          /* keep current detail */
        }
      }}
    />
  );

  if (variant === "tags") {
    return (
      <div className="w-full" onClick={(event) => event.stopPropagation()}>
        {tagsBlock}
        {editor}
      </div>
    );
  }

  if (variant === "inline") {
    // inline 只出拓展标签，音标/释义由父级卡片展示，避免拓展开关后重复叠两层
    return (
      <div
        className="w-full pt-2 mt-2 border-t border-border"
        onClick={(event) => event.stopPropagation()}
      >
        {tagsBlock}
        {editor}
      </div>
    );
  }

  return (
    <div
      className="bg-card rounded-xl border border-border shadow-sm overflow-hidden"
      onClick={(event) => event.stopPropagation()}
    >
      <div className="flex items-start justify-between gap-3 px-4 pt-4 pb-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className={`${PRACTICE_WORD_CLASS} !font-bold break-all`}>{word}</h2>
            {detail?.audioUrl && (
              <CloudButton
                type="button"
                variant="ghost"
                size="iconRound"
                onClick={() => playWordAudio(detail.audioUrl!, 200)}
                aria-label={t("word.play_pronunciation")}
              >
                <Volume2 size={18} className="text-primary" />
              </CloudButton>
            )}
          </div>
          {phonetic && (
            <p className="text-sm text-muted-foreground mt-1 font-mono">
              [{phonetic.replace(/^\[|\]$/g, "")}]
            </p>
          )}
          {(detail?.partOfSpeech || detail?.translation) && (
            <p className={`${PRACTICE_TRANS_CLASS} mt-2`}>
              {showFullInline ? fullMeaning : shortMeaning}
            </p>
          )}
          <div className="mt-3">
            <PhonicsAudioPanel
              word={word}
              syllables={detail?.syllables}
              phonetic={phonetic}
              audioUrl={detail?.audioUrl}
            />
          </div>
        </div>
      </div>
      <div className="px-3 pb-4">{tagsBlock}</div>
      {editor}
    </div>
  );
}

function ExtContent({
  active,
  detail,
  parsed,
}: {
  active: ExtKey;
  detail: WordDetail;
  parsed: ParsedDetail;
}) {
  switch (active) {
    case "examples":
      return (
        <div className="space-y-3">
          {(parsed.examples || []).slice(0, 8).map((ex, i) => (
            <div key={i} className="pl-3 border-l-2 border-primary/35">
              <p className="text-sm leading-relaxed">{stripTags(ex.en)}</p>
              <p className="text-xs text-muted-foreground mt-1">{ex.cn}</p>
            </div>
          ))}
        </div>
      );
    case "mnemonic":
      return <p className="text-sm leading-relaxed whitespace-pre-wrap">{detail.mnemonic}</p>;
    case "phrases":
      return (
        <div className="space-y-2">
          {(parsed.phrases || []).map((p, i) => (
            <div key={i} className="text-sm">
              <span className="font-medium text-foreground">{p.phrase}</span>
              <span className="text-muted-foreground ml-2">{(p.meanings || []).join("；")}</span>
            </div>
          ))}
        </div>
      );
    case "morphology":
      return (
        <div className="flex flex-wrap gap-2">
          {(parsed.morphology?.forms || []).map((f, i) => (
            <span
              key={i}
              className="px-2 py-1 rounded-md bg-primary-soft text-primary text-xs font-medium"
            >
              {f}
            </span>
          ))}
        </div>
      );
    case "image":
      return detail.imageUrl ? (
        <img
          src={detail.imageUrl}
          alt={detail.word}
          className="max-h-48 rounded-lg mx-auto object-contain"
        />
      ) : null;
    case "derivations":
      return (
        <div className="space-y-2">
          {(parsed.derivations || []).map((d, i) => (
            <div key={i} className="text-sm">
              <span className="font-medium text-foreground">{d.word}</span>
              <span className="text-muted-foreground ml-2">
                {(d.meanings || []).map((m) => `${m.pos} ${m.meaning}`).join("；")}
              </span>
            </div>
          ))}
        </div>
      );
    case "synonyms":
      return (
        <div className="flex flex-wrap gap-2">
          {(parsed.synonyms || []).map((s, i) => (
            <span key={i} className="px-2 py-1 rounded-md bg-muted text-xs">
              <span className="font-medium">{s.word}</span>
              {s.trans && <span className="text-muted-foreground ml-1">{s.trans}</span>}
            </span>
          ))}
        </div>
      );
    case "antonyms":
      return (
        <div className="flex flex-wrap gap-2">
          {(parsed.antonyms || []).map((s, i) => (
            <span key={i} className="px-2 py-1 rounded-md bg-muted text-xs">
              <span className="font-medium">{s.word}</span>
              {s.trans && <span className="text-muted-foreground ml-1">{s.trans}</span>}
            </span>
          ))}
        </div>
      );
    case "etymology":
      return (
        <p className="text-sm leading-relaxed text-muted-foreground whitespace-pre-wrap">{detail.etymology}</p>
      );
    case "collins":
      return (
        <div className="space-y-3">
          {(parsed.collins || []).slice(0, 4).map((c, i) => (
            <div key={i} className="pl-3 border-l-2 border-[#f8b4c4]/50">
              <p className="text-sm leading-relaxed">{c.def}</p>
              <p className="text-xs text-[#c45c78] mt-0.5">
                {c.posp} {c.tran}
              </p>
            </div>
          ))}
        </div>
      );
    case "definition":
      return <p className="text-sm leading-relaxed text-muted-foreground">{detail.definition}</p>;
    case "family":
      return (
        <div className="space-y-1.5">
          {(parsed.wordFamily || []).map((w, i) => (
            <div key={i} className="text-sm">
              <span className="text-xs text-muted-soft mr-1">{w.pos}</span>
              <span className="font-medium text-foreground">{w.word}</span>
              <span className="text-muted-foreground ml-2">{w.meaning}</span>
            </div>
          ))}
        </div>
      );
    default:
      return null;
  }
}
