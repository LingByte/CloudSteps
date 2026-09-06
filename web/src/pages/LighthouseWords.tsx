import { Volume2, Loader2 } from "lucide-react";
import { normalizeSnowflakeId } from "../utils/json-snowflake";
import { useNavigate, useSearchParams } from "react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { getLighthouseWords, type StudyWordItem } from "../api/study";
import { AnnotationLayer, AnnotationToggleButton } from "../components/AnnotationLayer";
import { PracticeFontSettingsButton, PRACTICE_TRANS_CLASS, PRACTICE_WORD_CLASS } from "../components/PracticeFontSettings";
import { CloudButton } from "../components/cloudsteps";
import { TopBar } from "../components/TopBar";
import { AudioMuteToggleButton } from "../components/AudioMuteToggleButton";
import { FlowPageShell } from "../components/PageTransition";
import { playFirstWordAudio } from "../utils/audioPlayer";
import { nextWordTapState } from "../utils/wordReveal";
import { getTrainingStudent } from "../utils/trainingStudent";
import { useAuthStore } from "../stores/authStore";

const STEP_KEY_MAP: Record<string, string> = {
  today: "lighthouse_words.step.today",
  "1": "lighthouse_words.step.01",
  "01": "lighthouse_words.step.01",
  "2": "lighthouse_words.step.02",
  "02": "lighthouse_words.step.02",
  "3": "lighthouse_words.step.03",
  "03": "lighthouse_words.step.03",
  "4": "lighthouse_words.step.04",
  "04": "lighthouse_words.step.04",
  "5": "lighthouse_words.step.05",
  "05": "lighthouse_words.step.05",
  "6": "lighthouse_words.step.06",
  "06": "lighthouse_words.step.06",
  "7": "lighthouse_words.step.07",
  "07": "lighthouse_words.step.07",
  pending: "lighthouse_words.step.pending",
  mastered: "lighthouse_words.step.mastered",
};

export default function LighthouseWords() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const step = searchParams.get("step") || "1";
  const label = t(STEP_KEY_MAP[step] || step);

  const wordBookId = useMemo(
    () => normalizeSnowflakeId(sessionStorage.getItem("lb_wordbook_id")),
    []
  );
  const role = (useAuthStore((s) => s.user) as { role?: string } | null)?.role || "user";
  const studentId = useMemo(() => {
    if (role === "student") return "";
    const fromUrl = normalizeSnowflakeId(searchParams.get("studentId"));
    if (fromUrl) return fromUrl;
    const fromReview = normalizeSnowflakeId(sessionStorage.getItem("lb_review_student_id"));
    if (fromReview) return fromReview;
    return normalizeSnowflakeId(getTrainingStudent()?.id);
  }, [role, searchParams]);

  const [words, setWords] = useState<StudyWordItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showTranslationMap, setShowTranslationMap] = useState<
    Map<string | number, boolean>
  >(new Map());
  const [heardIds, setHeardIds] = useState<Set<string | number>>(new Set());
  const [annotationOpen, setAnnotationOpen] = useState(false);
  const [playingId, setPlayingId] = useState<string | number | null>(null);
  const abortRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!wordBookId) return;
    let mounted = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await getLighthouseWords(wordBookId, step, 1, 50, {
          ...(studentId ? { studentId } : {}),
        });
        if (!mounted) return;
        const list = Array.isArray(res.data?.words)
          ? (res.data.words as StudyWordItem[])
          : [];
        setWords(list);
        setTotal(res.data?.total ?? list.length);
      } catch {
        if (!mounted) return;
        setError(t("practice.load_words_failed"));
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [wordBookId, step, studentId, t]);

  const handleWordClick = (word: StudyWordItem) => {
    const next = nextWordTapState({
      showTranslation: !!showTranslationMap.get(word.id),
      heard: heardIds.has(word.id),
    });
    if (next.shouldPlay && word.audioUrl) {
      abortRef.current?.();
      setPlayingId(word.id);
      const abort = playFirstWordAudio(word.audioUrl, () => setPlayingId(null));
      abortRef.current = abort;
    }
    setHeardIds((prev) => {
      const s = new Set(prev);
      if (next.heard) s.add(word.id);
      else s.delete(word.id);
      return s;
    });
    setShowTranslationMap((prev) => {
      const map = new Map(next.showTranslation ? [] : prev);
      if (next.showTranslation) {
        map.set(word.id, true);
      } else {
        map.delete(word.id);
      }
      return map;
    });
  };

  const handlePlayAudio = (word: StudyWordItem) => {
    if (!word.audioUrl) return;
    abortRef.current?.();
    setPlayingId(word.id);
    const abort = playFirstWordAudio(word.audioUrl, () => setPlayingId(null));
    abortRef.current = abort;
  };

  const handleBack = () => {
    navigate("/word-training");
  };

  return (
    <FlowPageShell className="min-h-screen bg-gray-50 pb-8">
      <TopBar
        title={label}
        onBack={handleBack}
        rightSlot={
          <div className="flex items-center gap-0.5">
            <AudioMuteToggleButton />
            <AnnotationToggleButton
              active={annotationOpen}
              onClick={() => setAnnotationOpen((v) => !v)}
            />
            <PracticeFontSettingsButton />
          </div>
        }
      />

      <AnnotationLayer
        storageKey={`lighthouse:${wordBookId}:${step}:${studentId || "self"}`}
        open={annotationOpen}
        onOpenChange={setAnnotationOpen}
      />

      <div className="px-4 mt-6 max-w-2xl mx-auto w-full">
        <div className="text-center text-sm text-[#718096] mb-4">
          {t("lighthouse_words.total_words", { count: total })}
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-600 text-sm mb-4">
            {error}
          </div>
        )}

        {loading && (
          <div className="flex justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-[#4ECDC4]" />
          </div>
        )}

        {!loading && !error && (
          <div className="space-y-3">
            {words.length === 0 ? (
              <div className="text-center py-12 text-[#718096]">
                {t("lighthouse_words.no_words")}
              </div>
            ) : (
              words.map((word) => (
                <div
                  key={word.id}
                  className="bg-white rounded-xl p-4 flex items-center justify-between shadow-sm transition-all"
                >
                  <div
                    className="flex items-center gap-3 flex-1 cursor-pointer"
                    onClick={() => handleWordClick(word)}
                  >
                    <div>
                      <span className={`${PRACTICE_WORD_CLASS} hover:text-[#4ECDC4] transition-colors`}>
                        {word.word}
                      </span>
                      {showTranslationMap.get(word.id) && word.translation && (
                        <p className={`${PRACTICE_TRANS_CLASS} mt-1`}>
                          {word.translation}
                        </p>
                      )}
                    </div>
                  </div>
                  {word.audioUrl && (
                    <CloudButton
                      type="button"
                      variant="ghost"
                      size="iconRound"
                      onClick={() => handlePlayAudio(word)}
                    >
                      <Volume2
                        size={20}
                        className={
                          playingId === word.id
                            ? "text-[#4ECDC4] animate-pulse"
                            : "text-[#4ECDC4]"
                        }
                      />
                    </CloudButton>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </FlowPageShell>
  );
}
