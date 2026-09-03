import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import {
  Button,
  Card,
  Empty,
  Spin,
  Tag,
  Typography,
} from "@arco-design/web-react";
import { IconLeft, IconPlus } from "@arco-design/web-react/icon";
import { ReadingAnalysisPanel } from "../components/reading/ReadingAnalysisPanel";
import {
  ReadingAnswerSheet,
  type QuestionFeedback,
} from "../components/reading/ReadingAnswerSheet";
import {
  ReadingKnowledgePanel,
  type ReadingKnowledgeItem,
} from "../components/reading/ReadingKnowledgePanel";
import { ReadingParagraphBlocks } from "../components/reading/ReadingParagraphBlocks";
import { ReadingSessionShell } from "../components/reading/ReadingSessionShell";
import {
  READING_STAGE_ORDER,
  ReadingStageRail,
  type ReadingStageId,
} from "../components/reading/ReadingStageRail";
import {
  ReadingWordsPanel,
  type ReadingWordPreview,
} from "../components/reading/ReadingWordsPanel";
import {
  checkCustomReadingAnswer,
  getCustomReadingKnowledge,
  getCustomReadingPassage,
  listCustomReadingPassages,
  submitCustomReadingPassage,
} from "../api/customReading";
import {
  checkReadingAnswer,
  getReadingKnowledge,
  getReadingPassage,
  listReadingPassages,
  submitReadingPassage,
  type ReadingPassageDetail,
  type ReadingPassageListItem,
  type ReadingSubmitResult,
} from "../api/reading";
import { synthesizeTts } from "../api/tts";
import {
  enrichCustomWordBookWords,
  type CustomParsedWord,
} from "../api/wordbooks";
import { playSingleAudio } from "../utils/audioPlayer";
import { formatApiMessage } from "../utils/apiMessage";
import { cn } from "../utils/cn";
import {
  normalizeReadingWord,
  splitParagraphForTts,
  splitReadingParagraphs,
} from "../utils/readingParagraphs";

type Phase =
  | "list"
  | "listen"
  | "practice"
  | "words"
  | "reanswer"
  | "analysis"
  | "knowledge";
type SourceTab = "system" | "custom";
type LevelFilter = "" | "初阶" | "中阶" | "高阶";

const LEVELS: LevelFilter[] = ["", "初阶", "中阶", "高阶"];

type PassageItem = ReadingPassageListItem & { isCustom?: boolean };

function formatElapsed(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function phaseToStage(phase: Phase): ReadingStageId {
  switch (phase) {
    case "practice":
      return "answer";
    case "words":
      return "words";
    case "reanswer":
      return "reanswer";
    case "analysis":
      return "analysis";
    case "knowledge":
      return "knowledge";
    default:
      return "listen";
  }
}

function shuffleKeys(keys: string[]): string[] {
  const a = [...keys];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = a[i];
    a[i] = a[j];
    a[j] = tmp;
  }
  return a;
}

export default function ReadingComprehension() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>("list");
  const [sourceTab, setSourceTab] = useState<SourceTab>("system");
  const [levelFilter, setLevelFilter] = useState<LevelFilter>("");
  const [loadingList, setLoadingList] = useState(true);
  const [loadingPassage, setLoadingPassage] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [passages, setPassages] = useState<PassageItem[]>([]);
  const [passage, setPassage] = useState<ReadingPassageDetail | null>(null);
  const [isCustomPassage, setIsCustomPassage] = useState(false);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [feedback, setFeedback] = useState<Record<number, QuestionFeedback>>({});
  const [optionOrder, setOptionOrder] = useState<Record<number, string[]>>({});
  const [firstResult, setFirstResult] = useState<ReadingSubmitResult | null>(null);
  const [secondResult, setSecondResult] = useState<ReadingSubmitResult | null>(null);
  const startedAtRef = useRef<number>(Date.now());
  const listenStartedAtRef = useRef<number>(Date.now());

  const [activePara, setActivePara] = useState<number | null>(null);
  const [playingPara, setPlayingPara] = useState<number | null>(null);
  const [loadingPara, setLoadingPara] = useState<number | null>(null);
  const audioCacheRef = useRef<Record<string, string>>({});
  const [elapsedSec, setElapsedSec] = useState(0);
  const abortPlayRef = useRef<(() => void) | null>(null);

  const [panelCollapsed, setPanelCollapsed] = useState(false);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [maxStageIdx, setMaxStageIdx] = useState(0);

  const [preview, setPreview] = useState<ReadingWordPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const glossCacheRef = useRef<Record<string, CustomParsedWord>>({});
  const advanceTimerRef = useRef<number | null>(null);

  const [knowledgeItems, setKnowledgeItems] = useState<ReadingKnowledgeItem[]>([]);
  const [knowledgeLoading, setKnowledgeLoading] = useState(false);

  const clearAdvanceTimer = useCallback(() => {
    if (advanceTimerRef.current != null) {
      window.clearTimeout(advanceTimerRef.current);
      advanceTimerRef.current = null;
    }
  }, []);

  useEffect(() => () => clearAdvanceTimer(), [clearAdvanceTimer]);

  useEffect(() => {
    clearAdvanceTimer();
  }, [phase, clearAdvanceTimer]);

  const scheduleAdvanceToQuestion = useCallback(
    (nextIndex: number, delayMs: number) => {
      clearAdvanceTimer();
      advanceTimerRef.current = window.setTimeout(() => {
        advanceTimerRef.current = null;
        setQuestionIndex(nextIndex);
      }, delayMs);
    },
    [clearAdvanceTimer]
  );

  const stageDefs = useMemo(
    () =>
      [
        { id: "listen" as const, label: t("reading.stage_listen") },
        { id: "answer" as const, label: t("reading.stage_answer") },
        { id: "words" as const, label: t("reading.stage_words") },
        { id: "reanswer" as const, label: t("reading.stage_reanswer") },
        { id: "analysis" as const, label: t("reading.stage_analysis") },
        { id: "knowledge" as const, label: t("reading.stage_knowledge") },
        { id: "done" as const, label: t("reading.stage_done") },
      ] satisfies { id: ReadingStageId; label: string }[],
    [t]
  );

  const paragraphs = useMemo(
    () => (passage ? splitReadingParagraphs(passage.content) : []),
    [passage]
  );

  const advanceMaxStage = useCallback((stage: ReadingStageId) => {
    const idx = READING_STAGE_ORDER.indexOf(stage);
    if (idx >= 0) setMaxStageIdx((prev) => Math.max(prev, idx));
  }, []);

  const unlockedStages = useMemo(() => {
    return READING_STAGE_ORDER.slice(0, maxStageIdx + 1);
  }, [maxStageIdx]);

  const completedStages = useMemo(() => {
    const current = phaseToStage(phase);
    const curIdx = READING_STAGE_ORDER.indexOf(current);
    return READING_STAGE_ORDER.filter((_, i) => i < curIdx && i <= maxStageIdx);
  }, [phase, maxStageIdx]);

  const loadList = useCallback(async () => {
    setLoadingList(true);
    setErr(null);
    try {
      const params = {
        page: 1,
        pageSize: 30,
        ...(levelFilter ? { level: levelFilter } : {}),
      };
      const res =
        sourceTab === "custom"
          ? await listCustomReadingPassages(params)
          : await listReadingPassages(params);
      if (res.code !== 200) {
        setErr(formatApiMessage(res.msg, "reading.load_list_failed"));
        setPassages([]);
        return;
      }
      const list = Array.isArray(res.data?.list) ? res.data.list : [];
      setPassages(
        list.map((p) => ({
          ...p,
          isCustom: sourceTab === "custom",
        }))
      );
    } catch (e: unknown) {
      const apiMsg =
        e && typeof e === "object" && "msg" in e ? String((e as { msg: string }).msg) : undefined;
      setErr(formatApiMessage(apiMsg, "reading.load_list_failed"));
      setPassages([]);
    } finally {
      setLoadingList(false);
    }
  }, [levelFilter, sourceTab]);

  useEffect(() => {
    if (phase === "list") void loadList();
  }, [phase, loadList]);

  useEffect(() => {
    if (phase !== "listen") return;
    setElapsedSec(0);
    const timer = window.setInterval(() => {
      setElapsedSec(Math.max(0, Math.floor((Date.now() - listenStartedAtRef.current) / 1000)));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [phase, passage?.id]);

  useEffect(() => {
    return () => {
      abortPlayRef.current?.();
      abortPlayRef.current = null;
    };
  }, []);

  const answeredCount = useMemo(
    () => Object.keys(answers).filter((k) => answers[Number(k)]).length,
    [answers]
  );
  const totalQuestions = passage?.questions?.length ?? 0;
  const allAnswered = totalQuestions > 0 && answeredCount === totalQuestions;

  const stopPlayback = () => {
    abortPlayRef.current?.();
    abortPlayRef.current = null;
    setPlayingPara(null);
  };

  const resolveChunkUrl = async (chunk: string): Promise<string> => {
    const cached = audioCacheRef.current[chunk];
    if (cached) return cached;
    const res = await synthesizeTts(chunk, { lang: "en" });
    if (res.code !== 200 || !res.data?.url) {
      throw new Error(formatApiMessage(res.msg, "reading.tts_failed"));
    }
    const url = res.data.url;
    audioCacheRef.current[chunk] = url;
    return url;
  };

  const playParagraph = async (index: number) => {
    const para = paragraphs[index];
    if (!para) return;
    stopPlayback();
    setActivePara(index);
    setLoadingPara(index);
    setErr(null);
    try {
      const chunks = splitParagraphForTts(para);
      const urls: string[] = [];
      for (const chunk of chunks) {
        urls.push(await resolveChunkUrl(chunk));
      }
      setLoadingPara(null);
      setPlayingPara(index);
      let i = 0;
      const playNext = () => {
        if (i >= urls.length) {
          setPlayingPara(null);
          abortPlayRef.current = null;
          return;
        }
        const url = urls[i++];
        abortPlayRef.current = playSingleAudio(url, playNext);
      };
      playNext();
    } catch (e: unknown) {
      setLoadingPara(null);
      setPlayingPara(null);
      const apiMsg =
        e && typeof e === "object" && "msg" in e
          ? String((e as { msg: string }).msg)
          : e instanceof Error
            ? e.message
            : undefined;
      setErr(formatApiMessage(apiMsg, "reading.tts_failed"));
    }
  };

  const openPassage = async (id: number, isCustom: boolean) => {
    setLoadingPassage(true);
    setErr(null);
    stopPlayback();
    try {
      const res = isCustom ? await getCustomReadingPassage(id) : await getReadingPassage(id);
      if (res.code !== 200 || !res.data) {
        setErr(formatApiMessage(res.msg, "reading.load_passage_failed"));
        return;
      }
      setPassage(res.data);
      setIsCustomPassage(isCustom);
      setAnswers({});
      setFeedback({});
      setOptionOrder({});
      setFirstResult(null);
      setSecondResult(null);
      setActivePara(null);
      audioCacheRef.current = {};
      glossCacheRef.current = {};
      setPreview(null);
      setQuestionIndex(0);
      setPanelCollapsed(false);
      setKnowledgeItems([]);
      setMaxStageIdx(0);
      startedAtRef.current = Date.now();
      listenStartedAtRef.current = Date.now();
      setPhase("listen");
      advanceMaxStage("listen");
      advanceMaxStage("answer");
    } catch (e: unknown) {
      const apiMsg =
        e && typeof e === "object" && "msg" in e ? String((e as { msg: string }).msg) : undefined;
      setErr(formatApiMessage(apiMsg, "reading.load_passage_failed"));
    } finally {
      setLoadingPassage(false);
    }
  };

  const goToPractice = () => {
    stopPlayback();
    startedAtRef.current = Date.now();
    setPanelCollapsed(false);
    setPhase("practice");
    advanceMaxStage("answer");
  };

  const goToWords = () => {
    stopPlayback();
    setPreview(null);
    setPanelCollapsed(false);
    setPhase("words");
    advanceMaxStage("words");
  };

  const goToReanswer = () => {
    stopPlayback();
    setAnswers({});
    setFeedback({});
    setQuestionIndex(0);
    setPanelCollapsed(false);
    startedAtRef.current = Date.now();
    if (passage) {
      const next: Record<number, string[]> = {};
      for (const q of passage.questions) {
        next[q.id] = shuffleKeys((q.options || []).map((o) => o.key));
      }
      setOptionOrder(next);
    } else {
      setOptionOrder({});
    }
    setPhase("reanswer");
    advanceMaxStage("reanswer");
  };

  const goToAnalysis = () => {
    setQuestionIndex(0);
    setPanelCollapsed(false);
    setPhase("analysis");
    advanceMaxStage("analysis");
  };

  const buildKnowledge = async () => {
    if (!passage) return;
    setKnowledgeLoading(true);
    setKnowledgeItems([]);
    setErr(null);
    try {
      const res = isCustomPassage
        ? await getCustomReadingKnowledge(passage.id)
        : await getReadingKnowledge(passage.id);
      if (res.code !== 200 || !res.data) {
        setErr(formatApiMessage(res.msg, "reading.knowledge_failed"));
        return;
      }
      const items: ReadingKnowledgeItem[] = (res.data.items || [])
        .filter((p) => (p.title || p.body || "").trim())
        .map((p, i) => ({
          kind: "point" as const,
          id: `p-${i}`,
          title: (p.title || "").trim() || t("reading.knowledge_point_fallback", { n: i + 1 }),
          body: (p.body || "").trim(),
        }));
      setKnowledgeItems(items);
    } catch (e: unknown) {
      const apiMsg =
        e && typeof e === "object" && "msg" in e ? String((e as { msg: string }).msg) : undefined;
      setErr(formatApiMessage(apiMsg, "reading.knowledge_failed"));
    } finally {
      setKnowledgeLoading(false);
    }
  };

  const goToKnowledge = () => {
    setPanelCollapsed(false);
    setPhase("knowledge");
    advanceMaxStage("knowledge");
    advanceMaxStage("done");
    void buildKnowledge();
  };

  const submitAnswers = async (
    attempt: "first" | "second"
  ): Promise<ReadingSubmitResult | null> => {
    if (!passage || !allAnswered) return null;
    setSubmitting(true);
    setErr(null);
    try {
      const durationSec = Math.max(
        1,
        Math.round((Date.now() - startedAtRef.current) / 1000)
      );
      const payload = {
        answers: passage.questions.map((q) => ({
          questionId: q.id,
          answer: answers[q.id] || "",
        })),
        durationSec,
      };
      const res = isCustomPassage
        ? await submitCustomReadingPassage(passage.id, payload)
        : await submitReadingPassage(passage.id, payload);
      if (res.code !== 200 || !res.data) {
        setErr(formatApiMessage(res.msg, "practice.submit_failed"));
        return null;
      }
      if (attempt === "first") setFirstResult(res.data);
      else setSecondResult(res.data);
      void loadList();
      return res.data;
    } catch (e: unknown) {
      const apiMsg =
        e && typeof e === "object" && "msg" in e ? String((e as { msg: string }).msg) : undefined;
      setErr(formatApiMessage(apiMsg, "practice.submit_failed"));
      return null;
    } finally {
      setSubmitting(false);
    }
  };

  const finishFirstAnswer = async () => {
    if (!allAnswered) {
      setErr(
        t("practice.complete_all_questions", {
          answered: answeredCount,
          total: totalQuestions,
        })
      );
      return;
    }
    if (!firstResult) {
      const submitted = await submitAnswers("first");
      if (!submitted) return;
    }
    goToWords();
  };

  const finishReanswer = async () => {
    if (!allAnswered) {
      setErr(
        t("practice.complete_all_questions", {
          answered: answeredCount,
          total: totalQuestions,
        })
      );
      return;
    }
    if (!secondResult) {
      const submitted = await submitAnswers("second");
      if (!submitted) return;
    }
    goToAnalysis();
  };

  const backToList = () => {
    stopPlayback();
    setPhase("list");
    setPassage(null);
    setIsCustomPassage(false);
    setAnswers({});
    setFeedback({});
    setOptionOrder({});
    setFirstResult(null);
    setSecondResult(null);
    setErr(null);
    setActivePara(null);
    setPreview(null);
    setKnowledgeItems([]);
    setMaxStageIdx(0);
  };

  const finishSession = () => {
    advanceMaxStage("done");
    backToList();
  };

  const headerBack = () => {
    if (phase === "list") {
      navigate(-1);
      return;
    }
    if (phase === "practice") {
      setPhase("listen");
      listenStartedAtRef.current = Date.now();
      return;
    }
    if (phase === "words") {
      setPhase("practice");
      return;
    }
    if (phase === "reanswer") {
      setPhase("words");
      return;
    }
    if (phase === "analysis") {
      setPhase("reanswer");
      return;
    }
    if (phase === "knowledge") {
      setPhase("analysis");
      return;
    }
    backToList();
  };

  const onStageSelect = (id: ReadingStageId) => {
    if (id === "done") {
      if (unlockedStages.includes("done") || secondResult) finishSession();
      return;
    }
    if (id === "listen") {
      setPhase("listen");
      listenStartedAtRef.current = Date.now();
      return;
    }
    if (id === "answer") {
      goToPractice();
      return;
    }
    if (id === "words" && firstResult) {
      goToWords();
      return;
    }
    if (id === "reanswer" && firstResult) {
      goToReanswer();
      return;
    }
    if (id === "analysis" && secondResult) {
      goToAnalysis();
      return;
    }
    if (id === "knowledge" && secondResult) {
      goToKnowledge();
    }
  };

  const selectWord = async (raw: string) => {
    const key = normalizeReadingWord(raw);
    if (!key) return;
    const surface = raw.trim();
    setErr(null);
    const cached = glossCacheRef.current[key];
    if (cached) {
      setPreview({
        word: surface,
        key,
        phonetic: cached.phonetic,
        translation: cached.translationShort || cached.translation,
      });
      return;
    }
    setPreviewLoading(true);
    setPreview({ word: surface, key });
    try {
      const res = await enrichCustomWordBookWords([{ word: key }]);
      const hit = res.data?.list?.[0];
      if (res.code === 200 && hit) {
        glossCacheRef.current[key] = hit;
        setPreview({
          word: surface,
          key,
          phonetic: hit.phonetic,
          translation: hit.translationShort || hit.translation,
        });
      } else {
        setPreview({ word: surface, key, translation: t("reading.word_no_gloss") });
      }
    } catch {
      setPreview({ word: surface, key, translation: t("reading.word_no_gloss") });
    } finally {
      setPreviewLoading(false);
    }
  };

  const speakPreview = async () => {
    if (!preview?.word) return;
    try {
      const url = await resolveChunkUrl(preview.word);
      stopPlayback();
      abortPlayRef.current = playSingleAudio(url);
    } catch {
      setErr(formatApiMessage(undefined, "reading.tts_failed"));
    }
  };

  const copyPreview = async () => {
    if (!preview) return;
    const text = [preview.word, preview.phonetic, preview.translation].filter(Boolean).join(" ");
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // ignore
    }
  };

  const levelLabel = (lv: LevelFilter) =>
    lv === "" ? t("reading.level_all") : lv;

  const currentStage = phaseToStage(phase);
  const inSession = phase !== "list";
  const showSidePanel = phase !== "listen" && phase !== "list";

  const passageCard = passage ? (
    <Card className="!rounded-2xl shadow-sm">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <Typography.Title heading={5} className="!mb-1 !text-[#2D3748]">
            {passage.title}
          </Typography.Title>
          <Typography.Text type="secondary" className="!text-sm">
            {phase === "practice" || phase === "reanswer"
              ? t("reading.answer_sheet_hint")
              : phase === "words"
                ? t("reading.words_hint")
                : phase === "analysis"
                  ? t("reading.analysis_hint")
                  : phase === "knowledge"
                    ? t("reading.knowledge_hint")
                    : t("reading.listen_hint")}
          </Typography.Text>
        </div>
        <div className="shrink-0 rounded-full bg-[#FFF7ED] border border-[#FED7AA] px-2.5 py-1 text-[11px] font-medium text-[#EA580C]">
          {phase === "listen" ? `${formatElapsed(elapsedSec)} · ` : null}
          {t("reading.paragraph_count", { count: paragraphs.length })}
        </div>
      </div>
      <ReadingParagraphBlocks
        paragraphs={paragraphs}
        mode={phase === "words" ? "words" : "plain"}
        activePara={activePara}
        playingPara={playingPara}
        loadingPara={loadingPara}
        selectedWord={preview?.word}
        onPlayParagraph={(idx) => void playParagraph(idx)}
        onSelectWord={(w) => void selectWord(w)}
        playLabel={(n) => t("reading.play_paragraph", { n })}
      />
    </Card>
  ) : null;

  return (
    <div className="h-dvh overflow-hidden bg-[#F7F9FC] flex flex-col">
      <header className="shrink-0 bg-white border-b border-[#E2E8F0]">
        <div className="flex items-center h-11 px-2 sm:px-3 gap-1.5">
          <Button type="text" shape="circle" size="small" icon={<IconLeft />} onClick={headerBack} />
          <div className="min-w-0 flex-1">
            <Typography.Text className="!font-medium !text-sm !text-[#2D3748]">
              {t("reading.title")}
            </Typography.Text>
            {inSession && passage && (
              <Typography.Text type="secondary" className="block !text-[11px] truncate leading-tight">
                {passage.title} · {passage.level}
                {isCustomPassage && (
                  <Tag size="small" className="ml-1 scale-90 origin-left">
                    {t("reading.custom_tag")}
                  </Tag>
                )}
              </Typography.Text>
            )}
          </div>
          {phase === "list" && (
            <div className="flex items-center gap-1.5 shrink-0">
              <div className="flex rounded-md bg-[#F1F5F9] p-0.5">
                {(["system", "custom"] as SourceTab[]).map((key) => (
                  <button
                    key={key}
                    type="button"
                    className={cn(
                      "px-2 py-0.5 rounded text-[11px] font-medium transition-all whitespace-nowrap",
                      sourceTab === key
                        ? "bg-white text-[#2D3748] shadow-sm"
                        : "text-[#718096] hover:text-[#2D3748]"
                    )}
                    onClick={() => setSourceTab(key)}
                  >
                    {key === "system" ? t("reading.tab_system") : t("reading.tab_custom")}
                  </button>
                ))}
              </div>
              {sourceTab === "custom" && (
                <Button
                  type="primary"
                  size="mini"
                  icon={<IconPlus />}
                  onClick={() => navigate("/reading-comprehension/custom/new")}
                />
              )}
            </div>
          )}
          {(phase === "practice" || phase === "reanswer") && (
            <Typography.Text type="secondary" className="!text-[11px] shrink-0">
              {answeredCount}/{totalQuestions}
            </Typography.Text>
          )}
        </div>
        {inSession && (
          <ReadingStageRail
            stages={stageDefs}
            current={currentStage}
            unlocked={unlockedStages}
            completed={completedStages}
            onSelect={onStageSelect}
          />
        )}
        {phase === "list" && (
          <div className="px-3 pb-2 flex gap-1 overflow-x-auto scrollbar-hide">
            {LEVELS.map((lv) => (
              <button
                key={lv || "all"}
                type="button"
                className={cn(
                  "shrink-0 px-2.5 py-0.5 rounded-md text-[11px] font-medium transition-colors",
                  levelFilter === lv
                    ? "bg-[#2D3748] text-white"
                    : "bg-[#F1F5F9] text-[#718096] hover:bg-[#E2E8F0]"
                )}
                onClick={() => setLevelFilter(lv)}
              >
                {levelLabel(lv)}
              </button>
            ))}
          </div>
        )}
      </header>

      {err && (
        <div className="mx-3 mt-3 shrink-0 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
          {err}
        </div>
      )}

      {phase === "list" && (
        <div className="flex-1 min-h-0 overflow-y-auto px-2 py-2">
          {loadingList || loadingPassage ? (
            <div className="flex justify-center py-12">
              <Spin tip={t("common.loading")} />
            </div>
          ) : passages.length === 0 ? (
            <Card className="!rounded-xl">
              <Empty
                description={
                  sourceTab === "custom"
                    ? t("reading.empty_custom")
                    : t("reading.empty_list")
                }
              />
              {sourceTab === "custom" && (
                <div className="flex justify-center mt-3">
                  <Button
                    type="primary"
                    onClick={() => navigate("/reading-comprehension/custom/new")}
                  >
                    {t("reading.import_custom")}
                  </Button>
                </div>
              )}
            </Card>
          ) : (
            <div className="space-y-1.5">
              {passages.map((p) => (
                <button
                  key={`${p.isCustom ? "c" : "s"}-${p.id}`}
                  type="button"
                  onClick={() => void openPassage(p.id, !!p.isCustom)}
                  className="w-full text-left bg-white border border-[#E2E8F0] rounded-lg px-3 py-2.5 hover:border-[var(--primary)] transition-colors active:bg-[#F7FAFC]"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-sm font-medium text-[#2D3748] truncate">{p.title}</span>
                        <Tag size="small" color="arcoblue" className="!scale-90 shrink-0">
                          {p.level}
                        </Tag>
                        {p.isCustom && (
                          <Tag size="small" color="purple" className="!scale-90 shrink-0">
                            {t("reading.custom_tag")}
                          </Tag>
                        )}
                      </div>
                      <p className="text-[11px] text-[#718096] mt-0.5 truncate">
                        {typeof p.wordCount === "number"
                          ? t("practice.questions_meta_words", {
                              count: p.questionCount ?? 0,
                              minutes: p.estimatedMinutes ?? 5,
                              words: p.wordCount,
                            })
                          : t("practice.questions_meta", {
                              count: p.questionCount ?? 0,
                              minutes: p.estimatedMinutes ?? 5,
                            })}
                      </p>
                    </div>
                    {typeof p.lastScore === "number" && (
                      <Tag size="small" color={p.lastScore >= 80 ? "green" : "orangered"} className="shrink-0">
                        {t("practice.last_score", { score: p.lastScore })}
                      </Tag>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {phase === "listen" && passage && (
        <>
          <div className="flex-1 min-h-0 overflow-auto px-3 pt-3 pb-3">{passageCard}</div>
          <div className="shrink-0 border-t border-[#E2E8F0] bg-white px-4 py-3">
            <Button type="primary" long size="large" onClick={goToPractice}>
              {t("reading.start_answer")}
            </Button>
          </div>
        </>
      )}

      {showSidePanel && passage && (
        <ReadingSessionShell
          title={
            phase === "practice"
              ? t("reading.answer_sheet_title")
              : phase === "reanswer"
                ? t("reading.reanswer_sheet_title")
                : phase === "words"
                  ? t("reading.stage_words")
                  : phase === "analysis"
                    ? t("reading.analysis_title", { count: totalQuestions })
                    : t("reading.knowledge_title", { count: knowledgeItems.length })
          }
          subtitle={
            phase === "practice" || phase === "reanswer"
              ? t("reading.answer_sheet_hint")
              : phase === "words"
                ? t("reading.words_hint")
                : phase === "analysis"
                  ? t("reading.analysis_sub")
                  : t("reading.knowledge_sub", { count: knowledgeItems.length })
          }
          collapsed={panelCollapsed}
          onToggleCollapse={() => setPanelCollapsed((v) => !v)}
          collapseLabel={t("reading.collapse_answer")}
          expandLabel={t("reading.expand_answer")}
          passage={passageCard}
        >
          {(phase === "practice" || phase === "reanswer") && (
            <ReadingAnswerSheet
              questions={passage.questions}
              answers={answers}
              feedback={feedback}
              optionOrder={phase === "reanswer" ? optionOrder : undefined}
              revealAnswer={phase === "reanswer"}
              currentIndex={questionIndex}
              answeredCount={answeredCount}
              onSelectIndex={(i) => {
                clearAdvanceTimer();
                setQuestionIndex(i);
              }}
              onAnswer={(qid, key) => {
                void (async () => {
                  clearAdvanceTimer();
                  setAnswers((prev) => ({ ...prev, [qid]: key }));
                  setErr(null);
                  if (phase === "practice") setFirstResult(null);
                  if (phase === "reanswer") setSecondResult(null);
                  if (!passage) return;
                  try {
                    const res = isCustomPassage
                      ? await checkCustomReadingAnswer(passage.id, {
                          questionId: qid,
                          answer: key,
                        })
                      : await checkReadingAnswer(passage.id, {
                          questionId: qid,
                          answer: key,
                        });
                    if (res.code !== 200 || !res.data) {
                      setErr(formatApiMessage(res.msg, "reading.check_failed"));
                      return;
                    }
                    setFeedback((prev) => ({
                      ...prev,
                      [qid]: {
                        correct: res.data.correct,
                        rightAnswer: res.data.rightAnswer,
                        explanation: res.data.explanation,
                      },
                    }));
                    const idx = passage.questions.findIndex((q) => q.id === qid);
                    if (idx >= 0 && idx < passage.questions.length - 1) {
                      scheduleAdvanceToQuestion(
                        idx + 1,
                        phase === "reanswer" ? 1400 : 900
                      );
                    }
                  } catch (e: unknown) {
                    const apiMsg =
                      e && typeof e === "object" && "msg" in e
                        ? String((e as { msg: string }).msg)
                        : undefined;
                    setErr(formatApiMessage(apiMsg, "reading.check_failed"));
                  }
                })();
              }}
              onPrevStep={() => {
                if (phase === "practice") {
                  setPhase("listen");
                  listenStartedAtRef.current = Date.now();
                } else {
                  setPhase("words");
                }
              }}
              onNextStep={() =>
                void (phase === "practice" ? finishFirstAnswer() : finishReanswer())
              }
              prevStepLabel={t("reading.prev_step")}
              prevQuestionLabel={t("reading.prev_question")}
              nextQuestionLabel={t("reading.next_question")}
              nextStepLabel={t("reading.next_step")}
              answeredLabel={t("reading.answered_progress")}
              correctTag={t("reading.correct_tag")}
              yourAnswerLabel={t("reading.your_answer_short")}
              rightAnswerLabel={t("reading.right_answer_short")}
              nextDisabled={!allAnswered}
              nextLoading={submitting}
            />
          )}

          {phase === "words" && (
            <ReadingWordsPanel
              hint={t("reading.words_hint")}
              preview={preview}
              previewLoading={previewLoading}
              onSpeak={() => void speakPreview()}
              onCopy={() => void copyPreview()}
              onPrevStep={() => setPhase("practice")}
              onNextStep={goToReanswer}
              prevLabel={t("reading.prev_step")}
              nextLabel={t("reading.next_step")}
              copyLabel={t("reading.copy_word")}
              speakLabel={t("reading.speak_word")}
              previewTag={t("reading.preview_tag")}
            />
          )}

          {phase === "analysis" && firstResult && secondResult && (
            <ReadingAnalysisPanel
              questions={passage.questions}
              firstDetails={firstResult.details || []}
              secondDetails={secondResult.details || []}
              firstScore={firstResult.score}
              firstCorrect={firstResult.correctCount}
              secondScore={secondResult.score}
              secondCorrect={secondResult.correctCount}
              currentIndex={questionIndex}
              onSelectIndex={setQuestionIndex}
              onPrevStep={() => setPhase("reanswer")}
              onNextStep={goToKnowledge}
              prevStepLabel={t("reading.prev_step")}
              prevQuestionLabel={t("reading.prev_question")}
              nextQuestionLabel={t("reading.next_question")}
              nextStepLabel={t("reading.next_step")}
              initialLabel={t("reading.score_initial")}
              retryLabel={t("reading.score_retry")}
              correctLabel={t("reading.correct_tag")}
              yourFirstLabel={t("reading.your_first_answer")}
              yourRetryLabel={t("reading.your_retry_answer")}
              ideaTitle={t("reading.idea_title")}
              ideaHint={t("reading.idea_hint")}
              copyLabel={t("reading.copy_word")}
            />
          )}

          {phase === "knowledge" && (
            <ReadingKnowledgePanel
              items={knowledgeItems}
              loading={knowledgeLoading}
              onPrevStep={() => setPhase("analysis")}
              onFinish={finishSession}
              prevLabel={t("reading.prev_step")}
              finishLabel={t("reading.finish_session")}
              emptyLabel={t("reading.knowledge_empty")}
              pointTag={t("reading.knowledge_point_tag")}
              wordTag={t("reading.knowledge_word_tag")}
              copyLabel={t("reading.copy_word")}
            />
          )}
        </ReadingSessionShell>
      )}
    </div>
  );
}
