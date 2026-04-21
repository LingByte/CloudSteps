import { Volume2, Loader2 } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { getLighthouseWords, type StudyWordItem } from "@/api/study";
import { TopBar } from "@/components/TopBar";
import { playFirstWordAudio } from "@/utils/audioPlayer";

const STEP_LABELS: Record<string, string> = {
  today: "今日训新",
  "1": "第1步·初学",
  "2": "第2步·1天后",
  "3": "第3步·2天后",
  "4": "第4步·4天后",
  "5": "第5步·7天后",
  "6": "第6步·15天后",
  "7": "第7步·30天后",
  pending: "待学",
  mastered: "掌握",
};

export default function LighthouseWords() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const step = searchParams.get("step") || "1";
  const label = STEP_LABELS[step] || step;

  const wordBookId = useMemo(
    () => Number(sessionStorage.getItem("lb_wordbook_id") || 0),
    []
  );

  const [words, setWords] = useState<StudyWordItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showTranslationMap, setShowTranslationMap] = useState<
    Map<number, boolean>
  >(new Map());
  const [playingId, setPlayingId] = useState<number | null>(null);
  const abortRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!wordBookId) return;
    let mounted = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await getLighthouseWords(wordBookId, step);
        if (!mounted) return;
        const list = Array.isArray(res.data?.words)
          ? (res.data.words as StudyWordItem[])
          : [];
        setWords(list);
        setTotal(res.data?.total ?? list.length);
      } catch {
        if (!mounted) return;
        setError("加载失败，请重试");
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [wordBookId, step]);

  const handleWordClick = (word: StudyWordItem) => {
    const isShowing = !showTranslationMap.get(word.id);
    if (isShowing && word.audioUrl) {
      abortRef.current?.();
      setPlayingId(word.id);
      const abort = playFirstWordAudio(word.audioUrl, () =>
        setPlayingId(null)
      );
      abortRef.current = abort;
    }
    setShowTranslationMap((prev) => {
      const next = new Map(isShowing ? [] : prev);
      if (isShowing) {
        next.set(word.id, true);
      } else {
        next.delete(word.id);
      }
      return next;
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
    <div className="min-h-screen bg-gray-50 pb-8">
      <TopBar title={label} onBack={handleBack} />

      <div className="px-4 mt-6">
        {/* 统计信息 */}
        <div className="text-center text-sm text-[#718096] mb-4">
          共 {total} 个单词
        </div>

        {/* 错误提示 */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-600 text-sm mb-4">
            {error}
          </div>
        )}

        {/* 加载中 */}
        {loading && (
          <div className="flex justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-[#4ECDC4]" />
          </div>
        )}

        {/* 单词列表 */}
        {!loading && !error && (
          <div className="space-y-3">
            {words.length === 0 ? (
              <div className="text-center py-12 text-[#718096]">
                暂无单词
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
                      <span className="text-base font-medium text-[#2D3748] hover:text-[#4ECDC4] transition-colors">
                        {word.word}
                      </span>
                      {showTranslationMap.get(word.id) && word.translation && (
                        <p className="text-[#718096] text-sm mt-1">
                          {word.translation}
                        </p>
                      )}
                    </div>
                  </div>
                  {word.audioUrl && (
                    <button
                      onClick={() => handlePlayAudio(word)}
                      className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                    >
                      <Volume2
                        size={20}
                        className={
                          playingId === word.id
                            ? "text-[#4ECDC4] animate-pulse"
                            : "text-[#4ECDC4]"
                        }
                      />
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
