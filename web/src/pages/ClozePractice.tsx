import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router";
import {
  Button,
  Card,
  Progress,
  Radio,
  Result,
  Space,
  Spin,
  Tag,
  Typography,
} from "@arco-design/web-react";
import { IconLeft, IconPlus, IconSearch } from "@arco-design/web-react/icon";
import { ArrowRight } from "lucide-react";
import { CloudButton } from "../components/cloudsteps";
import { CloudEmpty } from "../components/cloudsteps/arco";
import {
  getCustomClozePassage,
  listCustomClozePassages,
  submitCustomClozePassage,
} from "../api/customCloze";
import {
  getClozePassage,
  listClozePassages,
  listClozeTags,
  submitClozePassage,
  type ClozePassageDetail,
  type ClozePassageListItem,
  type ClozeSubmitResult,
} from "../api/cloze";
import { formatApiMessage } from "../utils/apiMessage";
import { cn } from "../utils/cn";

type Phase = "list" | "practice" | "result";
type SourceTab = "system" | "custom";

type PassageItem = ClozePassageListItem & { isCustom?: boolean };

function renderPassageWithBlanks(
  content: string,
  answers: Record<number, string>,
  blankNoToId: Record<number, number>
) {
  const parts = content.split(/(\{\{\d+\}\})/g);
  return parts.map((part, idx) => {
    const m = part.match(/^\{\{(\d+)\}\}$/);
    if (!m) {
      return (
        <span key={idx} className="whitespace-pre-wrap">
          {part}
        </span>
      );
    }
    const blankNo = Number(m[1]);
    const blankId = blankNoToId[blankNo];
    const selected = blankId ? answers[blankId] : "";
    return (
      <span
        key={idx}
        className={`inline-flex items-center justify-center min-w-[2.5rem] mx-0.5 px-1.5 py-0.5 rounded border text-sm font-semibold align-baseline ${
          selected
            ? "border-[#4ECDC4] bg-[#4ECDC4]/10 text-[#2D3748]"
            : "border-dashed border-[#CBD5E0] bg-white text-[#A0AEC0]"
        }`}
      >
        {selected || blankNo}
      </span>
    );
  });
}

export default function ClozePractice() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const initialTab =
    (location.state as { tab?: SourceTab } | null)?.tab === "custom" ? "custom" : "system";

  const [phase, setPhase] = useState<Phase>("list");
  const [sourceTab, setSourceTab] = useState<SourceTab>(initialTab);
  const [tagFilter, setTagFilter] = useState<string>("");
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [searchInput, setSearchInput] = useState("");
  const [keyword, setKeyword] = useState("");
  const [loadingList, setLoadingList] = useState(true);
  const [loadingPassage, setLoadingPassage] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [passages, setPassages] = useState<PassageItem[]>([]);
  const [passage, setPassage] = useState<ClozePassageDetail | null>(null);
  const [isCustomPassage, setIsCustomPassage] = useState(false);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [activeBlankId, setActiveBlankId] = useState<number | null>(null);
  const [result, setResult] = useState<ClozeSubmitResult | null>(null);
  const startedAtRef = useRef<number>(Date.now());
  const [nextCursor, setNextCursor] = useState<string | undefined>();
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const loadingMoreRef = useRef(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const PAGE_LIMIT = 30;

  const blankNoToId = useMemo(() => {
    const map: Record<number, number> = {};
    passage?.blanks?.forEach((b) => {
      map[b.blankNo] = b.id;
    });
    return map;
  }, [passage]);

  const fetchPage = useCallback(
    async (opts: { cursor?: string; append: boolean }) => {
      if (opts.append) {
        if (loadingMoreRef.current) return;
        loadingMoreRef.current = true;
        setLoadingMore(true);
      } else {
        setLoadingList(true);
      }
      setErr(null);
      try {
        const params: Record<string, unknown> = {
          limit: PAGE_LIMIT,
          ...(opts.cursor ? { cursor: opts.cursor } : {}),
          ...(keyword ? { keyword } : {}),
          ...(sourceTab === "system" && tagFilter ? { tag: tagFilter } : {}),
        };
        const res =
          sourceTab === "custom"
            ? await listCustomClozePassages(params)
            : await listClozePassages(params);
        if (res.code !== 200) {
          setErr(formatApiMessage(res.msg, "cloze.load_list_failed"));
          if (!opts.append) setPassages([]);
          return;
        }
        const list = Array.isArray(res.data?.list) ? res.data.list : [];
        const items = list.map((p) => ({ ...p, isCustom: sourceTab === "custom" }));
        setPassages((prev) => (opts.append ? [...prev, ...items] : items));
        setNextCursor(res.data?.nextCursor || undefined);
        setHasMore(Boolean(res.data?.hasMore));
      } catch (e: unknown) {
        const apiMsg =
          e && typeof e === "object" && "msg" in e ? String((e as { msg: string }).msg) : undefined;
        setErr(formatApiMessage(apiMsg, "cloze.load_list_failed"));
        if (!opts.append) setPassages([]);
      } finally {
        setLoadingList(false);
        setLoadingMore(false);
        loadingMoreRef.current = false;
      }
    },
    [keyword, sourceTab, tagFilter]
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setKeyword(searchInput.trim());
    }, 350);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    if (phase === "list") void fetchPage({ append: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, sourceTab, tagFilter, keyword]);

  // 无限滚动
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        if (!hasMore || loadingList || loadingMoreRef.current || !nextCursor) return;
        void fetchPage({ cursor: nextCursor, append: true });
      },
      { rootMargin: "120px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, nextCursor, loadingList, fetchPage]);

  // 加载标签列表
  useEffect(() => {
    if (sourceTab !== "system") {
      setAvailableTags([]);
      return;
    }
    void listClozeTags().then((res) => {
      if (res.code === 200 && res.data?.tags) {
        setAvailableTags(res.data.tags);
      }
    }).catch(() => {});
  }, [sourceTab]);

  const answeredCount = useMemo(
    () => Object.keys(answers).filter((k) => answers[Number(k)]).length,
    [answers]
  );
  const totalBlanks = passage?.blanks?.length ?? 0;
  const allAnswered = totalBlanks > 0 && answeredCount === totalBlanks;
  const percent = totalBlanks > 0 ? Math.round((answeredCount / totalBlanks) * 100) : 0;

  const activeBlank = useMemo(
    () => passage?.blanks?.find((b) => b.id === activeBlankId) ?? passage?.blanks?.[0] ?? null,
    [passage, activeBlankId]
  );

  const openPassage = async (id: number, isCustom: boolean) => {
    setLoadingPassage(true);
    setErr(null);
    try {
      const res = isCustom ? await getCustomClozePassage(id) : await getClozePassage(id);
      if (res.code !== 200 || !res.data) {
        setErr(formatApiMessage(res.msg, "cloze.load_passage_failed"));
        return;
      }
      setPassage(res.data);
      setIsCustomPassage(isCustom);
      setAnswers({});
      setResult(null);
      setActiveBlankId(res.data.blanks?.[0]?.id ?? null);
      startedAtRef.current = Date.now();
      setPhase("practice");
    } catch (e: unknown) {
      const apiMsg =
        e && typeof e === "object" && "msg" in e ? String((e as { msg: string }).msg) : undefined;
      setErr(formatApiMessage(apiMsg, "cloze.load_passage_failed"));
    } finally {
      setLoadingPassage(false);
    }
  };

  const onPickAnswer = (blankId: number, key: string) => {
    setAnswers((prev) => ({ ...prev, [blankId]: key }));
    if (!passage) return;
    const idx = passage.blanks.findIndex((b) => b.id === blankId);
    const next = passage.blanks[idx + 1];
    if (next) setActiveBlankId(next.id);
  };

  const onSubmit = async () => {
    if (!passage || !allAnswered) return;
    setSubmitting(true);
    setErr(null);
    try {
      const durationSec = Math.max(
        1,
        Math.round((Date.now() - startedAtRef.current) / 1000)
      );
      const res = isCustomPassage
        ? await submitCustomClozePassage(passage.id, {
            answers: passage.blanks.map((b) => ({
              blankId: b.id,
              answer: answers[b.id] || "",
            })),
            durationSec,
          })
        : await submitClozePassage(passage.id, {
            answers: passage.blanks.map((b) => ({
              blankId: b.id,
              answer: answers[b.id] || "",
            })),
            durationSec,
          });
      if (res.code !== 200 || !res.data) {
        setErr(formatApiMessage(res.msg, "practice.submit_failed"));
        return;
      }
      setResult(res.data);
      setPhase("result");
      void fetchPage({ append: false });
    } catch (e: unknown) {
      const apiMsg =
        e && typeof e === "object" && "msg" in e ? String((e as { msg: string }).msg) : undefined;
      setErr(formatApiMessage(apiMsg, "practice.submit_failed"));
    } finally {
      setSubmitting(false);
    }
  };

  const backToList = () => {
    setPhase("list");
    setPassage(null);
    setIsCustomPassage(false);
    setAnswers({});
    setResult(null);
    setActiveBlankId(null);
    setErr(null);
  };

  const headerBack = () => {
    if (phase === "list") navigate(-1);
    else backToList();
  };

  return (
    <div className="h-dvh overflow-hidden bg-[#F7F9FC] flex flex-col">
      <header className="shrink-0 bg-white border-b border-[#E2E8F0]">
        <div className="flex items-center h-12 px-2 sm:px-3 gap-1.5">
          <Button type="text" shape="circle" size="small" icon={<IconLeft />} onClick={headerBack} />
          <div className="min-w-0 flex-1">
            <Typography.Text className="!font-medium !text-sm !text-[#2D3748]">{t("cloze.title")}</Typography.Text>
            {phase === "practice" && passage && (
              <Typography.Text type="secondary" className="block !text-[11px] truncate leading-tight">
                {passage.title} · {passage.level}
              </Typography.Text>
            )}
          </div>
          {phase === "list" && (
            <div className="flex items-center gap-1.5 shrink-0">
              <div className="relative">
                <input
                  type="text"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder={t("cloze.search_placeholder")}
                  className="w-32 sm:w-40 h-7 pl-7 pr-2 rounded-md bg-[#F1F5F9] text-[12px] text-[#2D3748] placeholder:text-[#A0AEC0] border border-transparent focus:border-[#4ECDC4] focus:bg-white outline-none transition-colors"
                />
                <IconSearch
                  className="absolute left-2 top-1/2 -translate-y-1/2 text-[#A0AEC0]"
                  style={{ fontSize: 14 }}
                />
              </div>
              <div className="flex rounded-lg bg-[#F1F5F9] p-1">
                {(["system", "custom"] as SourceTab[]).map((key) => (
                  <button
                    key={key}
                    type="button"
                    className={cn(
                      "px-3 py-1.5 rounded-md text-[13px] font-medium transition-all whitespace-nowrap",
                      sourceTab === key
                        ? "bg-white text-[#2D3748] shadow-sm"
                        : "text-[#718096] hover:text-[#2D3748]"
                    )}
                    onClick={() => {
                      setSourceTab(key);
                      setTagFilter("");
                    }}
                  >
                    {key === "system" ? t("cloze.tab_system") : t("cloze.tab_custom")}
                  </button>
                ))}
              </div>
              {sourceTab === "custom" && (
                <Button
                  type="primary"
                  size="small"
                  icon={<IconPlus />}
                  className="!h-9 !w-9 !p-0 !rounded-lg"
                  onClick={() => navigate("/cloze-practice/custom/new")}
                />
              )}
            </div>
          )}
          {phase === "practice" && (
            <Typography.Text type="secondary" className="!text-[11px] shrink-0">
              {answeredCount}/{totalBlanks}
            </Typography.Text>
          )}
        </div>
        {phase === "practice" && <Progress percent={percent} showText={false} size="small" className="!mb-0" />}
      </header>

      {phase === "list" && sourceTab === "system" && availableTags.length > 0 && (
        <div className="shrink-0 bg-white border-b border-[#E2E8F0]">
          <div className="px-3 py-2 flex gap-1.5 overflow-x-auto scrollbar-hide items-center max-w-2xl mx-auto w-full">
            <button
              type="button"
              className={cn(
                "shrink-0 px-3 py-1.5 rounded-md text-[12px] font-medium transition-colors",
                !tagFilter
                  ? "bg-[#2D3748] text-white"
                  : "bg-[#F1F5F9] text-[#718096] hover:bg-[#E2E8F0]"
              )}
              onClick={() => setTagFilter("")}
            >
              {t("cloze.tag_all")}
            </button>
            {availableTags.map((tag) => (
              <button
                key={tag}
                type="button"
                className={cn(
                  "shrink-0 px-3 py-1.5 rounded-md text-[12px] font-medium transition-colors",
                  tagFilter === tag
                    ? "bg-[#2D3748] text-white"
                    : "bg-[#F1F5F9] text-[#718096] hover:bg-[#E2E8F0]"
                )}
                onClick={() => setTagFilter(tagFilter === tag ? "" : tag)}
              >
                {tag}
              </button>
            ))}
          </div>
        </div>
      )}

      {err && (
        <div className="mx-3 mt-3 shrink-0 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
          {err}
        </div>
      )}

      {phase === "list" && (
        <div className="flex-1 min-h-0 flex flex-col">
          <div className="flex-1 min-h-0 overflow-y-auto w-full max-w-2xl mx-auto px-4 py-3 pb-6">
            {loadingList || loadingPassage ? (
              <div className="flex justify-center py-16">
                <Spin tip={t("common.loading")} />
              </div>
            ) : passages.length === 0 ? (
              <div className="rounded-xl border border-[#E2E8F0] bg-white px-4 py-8">
                <CloudEmpty
                  description={
                    keyword
                      ? t("cloze.empty_search")
                      : sourceTab === "custom"
                        ? t("custom_cloze.empty")
                        : t("cloze.empty_list")
                  }
                />
                {sourceTab === "custom" && !keyword && (
                  <div className="flex justify-center mt-3">
                    <Button type="primary" onClick={() => navigate("/cloze-practice/custom/new")}>
                      {t("custom_cloze.create_btn")}
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-2.5">
                {passages.map((p) => {
                  const tags = (p.tags || "")
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean);
                  return (
                  <button
                    key={`${p.isCustom ? "c" : "s"}-${p.id}`}
                    type="button"
                    onClick={() => void openPassage(p.id, !!p.isCustom)}
                    className="w-full text-left bg-white border border-[#E2E8F0] rounded-xl px-4 py-3.5 hover:border-[#4ECDC4] transition-colors active:bg-[#F7FAFC] shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[15px] font-medium text-[#2D3748] leading-snug">
                            {p.title}
                          </span>
                          <Tag size="small" color="arcoblue">{p.level}</Tag>
                          {p.isCustom && (
                            <Tag size="small" color="purple">
                              {t("reading.custom_tag")}
                            </Tag>
                          )}
                        </div>
                        {tags.length > 0 ? (
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {tags.map((tag) => (
                              <span
                                key={tag}
                                className="inline-flex items-center rounded-md bg-[#F1F5F9] px-1.5 py-0.5 text-[10px] font-medium text-[#718096]"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        ) : null}
                        {p.summary ? (
                          <p className="text-xs text-[#718096] mt-1.5 line-clamp-2 leading-relaxed">
                            {p.summary}
                          </p>
                        ) : null}
                        <p className="text-xs text-[#A0AEC0] mt-1.5">
                          {t("practice.blanks_meta", {
                            count: p.blankCount ?? 0,
                            minutes: p.estimatedMinutes ?? 5,
                          })}
                        </p>
                      </div>
                      {typeof p.lastScore === "number" && (
                        <Tag size="small" color={p.lastScore >= 80 ? "green" : "orangered"} className="shrink-0 mt-0.5">
                          {t("practice.last_score", { score: p.lastScore })}
                        </Tag>
                      )}
                    </div>
                  </button>
                  );
                })}
                {loadingMore && (
                  <div className="flex justify-center py-4">
                    <Spin />
                  </div>
                )}
                <div ref={sentinelRef} className="h-1" />
              </div>
            )}
          </div>
        </div>
      )}

      {phase === "result" && result && (
        <div className="flex-1 min-h-0 overflow-auto px-4 mt-6 flex items-start justify-center">
          <Card className="w-full max-w-md !rounded-2xl shadow-sm">
            <Result
              status={result.score === 100 ? "success" : "info"}
              title={`${result.correctCount} / ${result.blankCount}`}
              subTitle={t("practice.score_subtitle", {
                score: result.score,
                seconds: result.durationSec,
              })}
            />
            <div className="space-y-3 mt-2">
              {(result.details || []).map((d) => (
                <div
                  key={d.blankId}
                  className={`rounded-xl border px-3 py-2.5 text-sm ${
                    d.correct ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"
                  }`}
                >
                  <div className="font-medium text-[#2D3748] mb-1">
                    {t("cloze.blank_no", { no: d.blankNo })}
                  </div>
                  <div className="text-[#718096]">
                    {t("practice.your_answer", {
                      answer: d.answer || t("practice.no_answer"),
                    })}
                    {!d.correct && (
                      <span className="ml-2 text-[#4ECDC4]">
                        {t("practice.correct_answer", { answer: d.rightAnswer })}
                      </span>
                    )}
                  </div>
                  {d.explanation && (
                    <div className="text-xs text-[#A0AEC0] mt-1">
                      {t("practice.explanation", { text: d.explanation })}
                    </div>
                  )}
                </div>
              ))}
            </div>
            <Space className="mt-5 w-full justify-center">
              <Button onClick={backToList}>{t("practice.back_to_list")}</Button>
              <Button
                type="primary"
                onClick={() => {
                  if (result.passageId) void openPassage(result.passageId, isCustomPassage);
                }}
              >
                {t("practice.try_again")}
              </Button>
            </Space>
          </Card>
        </div>
      )}

      {phase === "practice" && passage && (
        <>
          <div className="flex-1 min-h-0 overflow-auto px-3 mt-6 pb-28">
            <Card className="!rounded-xl shadow-sm !mb-3" title={t("practice.passage")}>
              <div className="text-[#2D3748] leading-8 text-[15px]">
                {renderPassageWithBlanks(passage.content, answers, blankNoToId)}
              </div>
            </Card>

            <div className="flex flex-wrap gap-2 mb-3">
              {passage.blanks.map((b) => (
                <Button
                  key={b.id}
                  size="small"
                  type={activeBlank?.id === b.id ? "primary" : "outline"}
                  status={answers[b.id] ? undefined : undefined}
                  onClick={() => setActiveBlankId(b.id)}
                >
                  {b.blankNo}
                  {answers[b.id] ? ` · ${answers[b.id]}` : ""}
                </Button>
              ))}
            </div>

            {activeBlank && (
              <Card
                className="!rounded-xl shadow-sm"
                title={t("cloze.blank_no", { no: activeBlank.blankNo })}
              >
                <Radio.Group
                  direction="vertical"
                  value={answers[activeBlank.id]}
                  onChange={(v) => onPickAnswer(activeBlank.id, String(v))}
                >
                  {(activeBlank.options || []).map((opt) => (
                    <Radio key={opt.key} value={opt.key} className="!mb-2 !mr-0">
                      <span className="text-sm">
                        {opt.key}. {opt.text}
                      </span>
                    </Radio>
                  ))}
                </Radio.Group>
              </Card>
            )}
          </div>

          <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-[#E2E8F0] px-4 py-3 hidden sm:block">
            <Button
              type="primary"
              long
              size="large"
              loading={submitting}
              disabled={!allAnswered}
              onClick={() => void onSubmit()}
            >
              {allAnswered
                ? t("practice.submit")
                : t("practice.complete_all_blanks", {
                    answered: answeredCount,
                    total: totalBlanks,
                  })}
            </Button>
          </div>

          <CloudButton
            type="button"
            variant="brand"
            size="iconRound"
            onClick={() => void onSubmit()}
            disabled={!allAnswered || submitting}
            loading={submitting}
            className="fixed right-3 bottom-20 z-50 size-11 shadow-lg sm:hidden"
            aria-label={t("practice.submit")}
          >
            <ArrowRight size={20} />
          </CloudButton>
        </>
      )}
    </div>
  );
}
