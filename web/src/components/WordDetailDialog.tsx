import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { BookOpen, Loader2, Volume2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { CloudButton } from "./cloudsteps";
import { getWordDetail, type WordDetail } from "../api/wordbooks";
import { formatTranslation } from "../utils/wordFormat";
import { playWordAudio } from "../utils/audioPlayer";

// JSON 字段解析辅助
function parseJSON<T>(raw?: string | null): T | null {
  if (!raw || raw === "[]" || raw === "") return null;
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) && v.length === 0 ? null : v;
  } catch {
    return null;
  }
}

// 去除例句中的 <b> 标签
function stripTags(s: string): string {
  return s.replace(/<\/?b>/g, "").replace(/<\/?i>/g, "");
}

type Props = {
  wordId: string | number | null;
  wordText?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function WordDetailDialog({ wordId, wordText, open, onOpenChange }: Props) {
  const { t } = useTranslation();
  const [detail, setDetail] = useState<WordDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!open || !wordId) return;
    setLoading(true);
    setDetail(null);
    setError(false);
    getWordDetail(wordId)
      .then((res) => {
        if (res.data) {
          setDetail(res.data);
        } else {
          setError(true);
        }
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [open, wordId]);

  const word = detail?.word || wordText || "";

  // 解析各字段
  const examples = parseJSON<Array<{ en: string; cn: string; pos?: string; para?: string }>>(
    detail?.exampleSentences
  );
  const phrases = parseJSON<Array<{ phrase: string; meanings: string[] }>>(detail?.collocations);
  const derivations = parseJSON<Array<{ word: string; meanings: Array<{ pos: string; meaning: string }> }>>(
    detail?.derivations
  );
  const synonyms = parseJSON<Array<{ pos: string; trans: string; word: string }>>(detail?.synonyms);
  const wordFamily = parseJSON<Array<{ pos: string; word: string; meaning: string }>>(detail?.wordFamily);
  const morphology = parseJSON<{ forms?: string[]; inflections?: string[] }>(detail?.morphology);
  const collins = parseJSON<
    Array<{ def: string; posp: string; tran: string; example?: Array<{ ex: string; tran: string }> }>
  >(detail?.usageNotes);

  const hasAny =
    examples || phrases || derivations || synonyms || wordFamily || morphology || detail?.etymology || collins;

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <BookOpen size={20} className="text-[#4ECDC4]" />
            {t("word.detail_title")}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-[#4ECDC4]" />
          </div>
        ) : error ? (
          <div className="py-8 text-center text-sm text-muted-foreground">{t("error.load_failed_retry")}</div>
        ) : !detail ? (
          <div className="py-8 text-center text-sm text-muted-foreground">{t("ui.empty")}</div>
        ) : (
          <div className="space-y-5">
            {/* 单词头部 */}
            <div className="flex items-start justify-between gap-3 pb-4 border-b border-border">
              <div className="flex-1">
                <h2 className="text-3xl font-bold text-[#1e3a5f]">{word}</h2>
                <div className="flex items-center flex-wrap gap-x-3 gap-y-1 mt-2 text-sm text-muted-foreground">
                  {detail.phoneticUk && <span>{t("word.phonetic_uk", { phonetic: detail.phoneticUk })}</span>}
                  {detail.phoneticUs && <span>{t("word.phonetic_us", { phonetic: detail.phoneticUs })}</span>}
                  {detail.partOfSpeech && (
                    <span className="px-1.5 py-0.5 rounded bg-muted text-xs">{detail.partOfSpeech}</span>
                  )}
                  {detail.syllables && <span className="text-xs">{t("word.syllables", { syllables: detail.syllables })}</span>}
                </div>
              </div>
              {detail.audioUrl && (
                <CloudButton
                  type="button"
                  variant="ghost"
                  size="iconRound"
                  onClick={() => playWordAudio(detail.audioUrl!, 200)}
                  aria-label={t("word.play_pronunciation")}
                >
                  <Volume2 size={20} className="text-[#4ECDC4]" />
                </CloudButton>
              )}
            </div>

            {/* 释义 */}
            {detail.translation && (
              <Section title={t("word.section.translation")}>
                <p className="text-sm leading-relaxed">{formatTranslation(detail.translation)}</p>
              </Section>
            )}

            {/* 英文释义 */}
            {detail.definition && (
              <Section title={t("word.section.definition_en")}>
                <p className="text-sm leading-relaxed text-muted-foreground">{detail.definition}</p>
              </Section>
            )}

            {/* 词形变化 */}
            {morphology?.forms && morphology.forms.length > 0 && (
              <Section title={t("word.section.morphology")}>
                <div className="flex flex-wrap gap-2">
                  {morphology.forms.map((f, i) => (
                    <span key={i} className="px-2 py-1 rounded-md bg-[#4ECDC4]/10 text-[#0d9488] text-xs font-medium">
                      {f}
                    </span>
                  ))}
                </div>
              </Section>
            )}

            {/* 例句 */}
            {examples && examples.length > 0 && (
              <Section title={t("word.section.examples", { count: examples.length })}>
                <div className="space-y-3">
                  {examples.slice(0, 6).map((ex, i) => (
                    <div key={i} className="pl-3 border-l-2 border-[#4ECDC4]/30">
                      <p className="text-sm text-foreground leading-relaxed">{stripTags(ex.en)}</p>
                      <p className="text-xs text-muted-foreground mt-1">{ex.cn}</p>
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {/* 短语搭配 */}
            {phrases && phrases.length > 0 && (
              <Section title={t("word.section.phrases", { count: phrases.length })}>
                <div className="space-y-1.5">
                  {phrases.map((p, i) => (
                    <div key={i} className="flex items-baseline gap-2 text-sm">
                      <span className="font-medium text-[#1e3a5f]">{p.phrase}</span>
                      <span className="text-muted-foreground">{p.meanings.join("；")}</span>
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {/* 派生词 */}
            {derivations && derivations.length > 0 && (
              <Section title={t("word.section.derivations")}>
                <div className="space-y-2">
                  {derivations.map((d, i) => (
                    <div key={i} className="text-sm">
                      <span className="font-medium text-[#1e3a5f]">{d.word}</span>
                      <span className="text-muted-foreground ml-2">
                        {d.meanings.map((m) => `${m.pos} ${m.meaning}`).join("；")}
                      </span>
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {/* 同义词 */}
            {synonyms && synonyms.length > 0 && (
              <Section title={t("word.section.synonyms")}>
                <div className="flex flex-wrap gap-2">
                  {synonyms.map((s, i) => (
                    <span key={i} className="px-2 py-1 rounded-md bg-muted text-xs">
                      <span className="font-medium">{s.word}</span>
                      <span className="text-muted-foreground ml-1">{s.trans}</span>
                    </span>
                  ))}
                </div>
              </Section>
            )}

            {/* 词族 */}
            {wordFamily && wordFamily.length > 0 && (
              <Section title={t("word.section.family")}>
                <div className="space-y-1">
                  {wordFamily.map((w, i) => (
                    <div key={i} className="text-sm">
                      <span className="text-xs text-muted-foreground mr-1">{w.pos}</span>
                      <span className="font-medium text-[#1e3a5f]">{w.word}</span>
                      <span className="text-muted-foreground ml-2">{w.meaning}</span>
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {/* 柯林斯释义 */}
            {collins && collins.length > 0 && (
              <Section title={t("word.section.collins", { count: collins.length })}>
                <div className="space-y-3">
                  {collins.slice(0, 3).map((c, i) => (
                    <div key={i} className="pl-3 border-l-2 border-[#f8b4c4]/40">
                      <p className="text-sm text-foreground leading-relaxed">{c.def}</p>
                      <p className="text-xs text-[#c45c78] mt-0.5">{c.posp} {c.tran}</p>
                      {c.example && c.example.length > 0 && (
                        <div className="mt-1.5 space-y-1">
                          {c.example.slice(0, 2).map((ex, j) => (
                            <div key={j} className="text-xs text-muted-foreground">
                              <p>{ex.ex}</p>
                              <p className="text-foreground/70">{ex.tran}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {/* 词源 */}
            {detail.etymology && (
              <Section title={t("word.section.etymology")}>
                <p className="text-sm leading-relaxed text-muted-foreground">{detail.etymology}</p>
              </Section>
            )}

            {/* 无数据提示 */}
            {!hasAny && (
              <div className="py-8 text-center text-sm text-muted-foreground">
                {t("word.no_dict_data")}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
        <span className="inline-block w-1 h-3 rounded-full bg-[#4ECDC4]" />
        {title}
      </h3>
      {children}
    </div>
  );
}
