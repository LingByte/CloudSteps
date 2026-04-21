import { ArrowLeft, Pause, Volume2, ArrowRight } from "lucide-react";
import { useNavigate } from "react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { playWordAudio } from "@/utils/audioPlayer";

type ListenWord = {
  id: number;
  word: string;
  phonetic?: string;
  translation?: string;
  audioUrl?: string;
  state: "idle" | "played" | "played2" | "revealed";
};

export default function ListenIdentify() {
  const navigate = useNavigate();
  const [words, setWords] = useState<ListenWord[]>([]);
  const [showPauseMenu, setShowPauseMenu] = useState(false);

  const mode = useMemo(() => sessionStorage.getItem("lb_mode") || "study", []);
  const batchIdx = useMemo(() => {
    const key = mode === "review" ? "lb_review_batch_idx" : "lb_study_batch_idx";
    return Number(sessionStorage.getItem(key) || 0);
  }, [mode]);

  const [playingId, setPlayingId] = useState<number | null>(null);
  const abortRef = useRef<(() => void) | null>(null);

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
      const mapped: ListenWord[] = slice.map((w: any) => ({
        id: Number(w.id),
        word: String(w.word || ""),
        phonetic: w.phonetic ? String(w.phonetic) : "",
        translation: w.translation ? String(w.translation) : "",
        audioUrl: w.audioUrl ? String(w.audioUrl) : "",
        state: "idle",
      }));
      setWords(mapped);
    } catch {
      // ignore
    }
  }, [batchIdx, mode]);

  const handlePlayAudio = (w: ListenWord) => {
    if (!w.audioUrl) return;
    abortRef.current?.();
    setPlayingId(w.id);
    const abort = playWordAudio(w.audioUrl, 300, () => setPlayingId(null));
    abortRef.current = abort;
  };

  const handleCardClick = (id: number) => {
    setWords((prev) =>
      prev.map((w) => {
        if (w.id !== id) return w;
        if (w.state === "idle") {
          handlePlayAudio(w);
          return { ...w, state: "played" };
        }
        if (w.state === "played") {
          handlePlayAudio(w);
          return { ...w, state: "played2" };
        }
        if (w.state === "played2") {
          return { ...w, state: "revealed" };
        }
        return { ...w, state: "idle" };
      })
    );
  };

  const allRevealed = words.length > 0 && words.every((w) => w.state === "revealed");

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
            听音识词
          </h1>
          <button
            onClick={() => setShowPauseMenu(!showPauseMenu)}
            className="p-2 -mr-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <Pause size={24} className="text-[#2D3748]" />
          </button>
        </div>
      </div>

      <div className="px-4 mt-6">
        {/* 组信息 */}
        <div className="text-center text-sm text-[#718096] mb-6">1/1组</div>

        {/* 单词列表 */}
        <div className="space-y-3 mb-6">
          {words.map((w) => {
            const showWord = w.state === "played2" || w.state === "revealed";
            const showTranslation = w.state === "revealed";
            return (
              <div
                key={w.id}
                onClick={() => handleCardClick(w.id)}
                className={`bg-white rounded-xl p-4 shadow-sm transition-all cursor-pointer select-none ${
                  w.state === "revealed"
                    ? "border-2 border-[#66BB6A] bg-[#66BB6A]/5"
                    : w.state === "played" || w.state === "played2"
                    ? "border-2 border-[#4ECDC4] bg-[#4ECDC4]/10"
                    : ""
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 flex-1">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                      w.state === "revealed" ? "bg-[#66BB6A]/15" : w.state === "played" || w.state === "played2" ? "bg-[#4ECDC4]/15" : "bg-gray-100"
                    }`}>
                      <Volume2 size={20} className={w.state === "revealed" ? "text-[#66BB6A]" : w.state === "played" || w.state === "played2" ? "text-[#4ECDC4]" : "text-[#718096]"} />
                    </div>
                    <div>
                      {!showWord && (
                        <div className="text-sm text-[#718096]">点击播放（第三次显示答案）</div>
                      )}
                      {showWord && (
                        <div className="text-base font-medium text-[#2D3748] mb-1">{w.word}</div>
                      )}
                      {showTranslation && (
                        <div className="text-sm text-[#718096]">{w.translation}</div>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handlePlayAudio(w);
                    }}
                    className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                  >
                    <Volume2 size={20} className={playingId === w.id ? "text-[#4ECDC4] animate-pulse" : "text-[#4ECDC4]"} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 底部工具栏 */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-[#E2E8F0] px-4 py-4 shadow-lg">
        <div className="flex items-center justify-between">
          <div className="text-sm text-[#718096]">全部完成后进入快闪</div>
          <button
            onClick={() => {
              navigate("/flash-review");
            }}
            className="p-3 rounded-full transition-colors bg-[#4ECDC4] text-white hover:bg-[#45b8b0]"
          >
            <ArrowRight size={24} />
          </button>
        </div>
      </div>

      {/* 暂停菜单 */}
      {showPauseMenu && (
        <div className="fixed inset-0 bg-black/50 z-50" onClick={() => setShowPauseMenu(false)}>
          <div className="absolute top-20 right-4 bg-white rounded-xl shadow-lg overflow-hidden">
            <button
              onClick={() => {
                setShowPauseMenu(false);
                navigate("/word-training");
              }}
              className="w-full px-6 py-3 text-left hover:bg-gray-50 transition-colors text-[#2D3748]"
            >
              返回主页
            </button>
            <button
              onClick={() => setShowPauseMenu(false)}
              className="w-full px-6 py-3 text-left hover:bg-gray-50 transition-colors text-[#2D3748]"
            >
              继续练习
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
