import { ArrowLeft, Pause, Volume2, Scissors, Check, X } from "lucide-react";
import { useNavigate } from "react-router";
import { useState, useEffect, useMemo, useRef } from "react";
import confetti from "canvas-confetti";
import { playWordAudio } from "@/utils/audioPlayer";

type FlashWord = { id: number; word: string; translation: string; audioUrl?: string; scissorCount: number; status: any; showTranslation: boolean };

export default function FlashReview() {
  const navigate = useNavigate();
  const [words, setWords] = useState<FlashWord[]>([]);
  const [currentGroup, setCurrentGroup] = useState(1);
  const [showCompleteDialog, setShowCompleteDialog] = useState(false);

  const mode = useMemo(() => sessionStorage.getItem("lb_mode") || "study", []);
  const batchIdx = useMemo(() => {
    const key = mode === "review" ? "lb_review_batch_idx" : "lb_study_batch_idx";
    return Number(sessionStorage.getItem(key) || 0);
  }, [mode]);

  const handleBack = () => {
    if (window.history.length > 1) navigate(-1);
    else navigate("/word-review");
  };

  useEffect(() => {
    try {
      const wordsKey = mode === "review" ? "lb_review_words" : "lb_study_words";
      const raw = sessionStorage.getItem(wordsKey) || "[]";
      const arr = JSON.parse(raw);
      const all: any[] = Array.isArray(arr) ? arr : [];
      const start = batchIdx * 5;
      const slice = all.slice(start, start + 5);
      const mapped: FlashWord[] = slice.map((w: any) => ({
        id: Number(w.id),
        word: String(w.word || ""),
        translation: String(w.translation || ""),
        audioUrl: w.audioUrl ? String(w.audioUrl) : undefined,
        scissorCount: 0,
        status: null,
        showTranslation: false,
      }));
      setWords(mapped);
    } catch {
      // ignore
    }
  }, [batchIdx, mode]);

  const handleScissorClick = (id: number) => {
    setWords((prev) =>
      prev.map((word) => {
        if (word.id === id) {
          if (word.scissorCount === 0) {
            // 第一次点击：显示中文释义
            return { ...word, scissorCount: 1, showTranslation: true };
          } else if (word.scissorCount === 1) {
            // 第二次点击：单词消失
            return { ...word, scissorCount: 2 };
          }
        }
        return word;
      })
    );
  };

  const [playingId, setPlayingId] = useState<number | null>(null);
  const abortRef = useRef<(() => void) | null>(null);

  const handlePlayAudio = (word: FlashWord) => {
    if (!word.audioUrl) return;
    abortRef.current?.();
    setPlayingId(word.id);
    const abort = playWordAudio(word.audioUrl, 300, () => setPlayingId(null));
    abortRef.current = abort;
  };

  const allCut = words.length > 0 && words.every((word) => word.scissorCount >= 2);

  const handleComplete = () => {
    confetti({
      particleCount: 100,
      spread: 70,
      origin: { y: 0.6 },
    });
    setShowCompleteDialog(true);
  };

  useEffect(() => {
    if (allCut && !showCompleteDialog) {
      handleComplete();
    }
  }, [allCut, showCompleteDialog]);

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* 顶部栏 */}
      <div className="bg-white sticky top-0 z-10 shadow-sm">
        <div className="flex items-center justify-between px-4 py-4">
          <button
            onClick={handleBack}
            className="p-2 -ml-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <ArrowLeft size={24} className="text-[#2D3748]" />
          </button>
          <h1 className="flex-1 text-center text-lg font-semibold text-[#2D3748]">
            第 1 组快闪
          </h1>
          <button className="p-2 -mr-2 hover:bg-gray-100 rounded-full transition-colors">
            <Pause size={24} className="text-[#2D3748]" />
          </button>
        </div>
      </div>

      <div className="px-4 mt-6">
        {/* 组信息 */}
        <div className="text-center text-sm text-[#718096] mb-6">1/1组</div>

        {/* 单词列表：已剪完的不渲染，避免占位，下方条目自动顶上来 */}
        <div className="space-y-3 mb-6">
          {words
            .filter((w) => w.scissorCount < 2)
            .map((word) => (
            <div
              key={word.id}
              className="bg-white rounded-xl p-4 flex items-center justify-between shadow-sm transition-all"
            >
              <div className="flex items-center gap-3 flex-1">
                <div>
                  <div className="text-base font-medium text-[#2D3748] mb-1">{word.word}</div>
                  {word.showTranslation && (
                    <div className="text-sm text-[#718096]">{word.translation}</div>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => handlePlayAudio(word)}
                  className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                >
                  <Volume2 size={20} className={playingId === word.id ? "text-[#4ECDC4] animate-pulse" : "text-[#4ECDC4]"} />
                </button>
                <button
                  onClick={() => handleScissorClick(word.id)}
                  className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                >
                  <Scissors
                    size={20}
                    className={word.scissorCount >= 1 ? "text-[#FF9800]" : "text-[#718096]"}
                  />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 完成弹窗 */}
      {showCompleteDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full mx-auto">
            <h3 className="text-3xl font-bold text-center text-[#4ECDC4] mb-2">
              PERFECT
            </h3>
            <p className="text-center text-[#718096] mb-6">恭喜完成本组快闪！</p>
            <div className="flex gap-3">
              <button
                onClick={() => navigate("/word-practice")}
                className="flex-1 py-3 border-2 border-[#E2E8F0] text-[#718096] rounded-full font-medium hover:bg-gray-50 transition-colors"
              >
                返回练习
              </button>
              <button
                onClick={() => navigate("/post-training-check")}
                className="flex-1 py-3 bg-[#4ECDC4] text-white rounded-full font-medium hover:bg-[#45b8b0] transition-colors"
              >
                进入检测
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
