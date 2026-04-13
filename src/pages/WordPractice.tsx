import { ArrowLeft, Pause, Volume2, Shuffle, ArrowRight } from "lucide-react";
import { useNavigate } from "react-router";
import { useEffect, useMemo, useState } from "react";

type PracticeWord = {
  id: number;
  word: string;
  translation: string;
  count: number;
  completed: boolean;
  showTranslation: boolean;
};

export default function WordPractice() {
  const navigate = useNavigate();
  const [words, setWords] = useState<PracticeWord[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [speed, setSpeed] = useState("1.0x");
  const [showPauseMenu, setShowPauseMenu] = useState(false);
  const [frameIdx, setFrameIdx] = useState(0);
  const [finished, setFinished] = useState(false);

  const mode = useMemo(() => sessionStorage.getItem("lb_mode") || "study", []);

  const handleBack = () => {
    if (window.history.length > 1) navigate(-1);
    else navigate(mode === "review" ? "/anti-forgetting" : "/pre-training-check");
  };

  const batchIdx = useMemo(() => {
    const key = mode === "review" ? "lb_review_batch_idx" : "lb_study_batch_idx";
    return Number(sessionStorage.getItem(key) || 0);
  }, [mode]);

  useEffect(() => {
    try {
      const wordsKey = mode === "review" ? "lb_review_words" : "lb_study_words";
      const raw = sessionStorage.getItem(wordsKey) || "[]";
      const arr = JSON.parse(raw);
      const all: any[] = Array.isArray(arr) ? arr : [];
      const start = batchIdx * 5;
      const slice = all.slice(start, start + 5);
      
      // 初始乱序（Fisher-Yates 洗牌算法）
      const shuffledSlice = [...slice];
      for (let i = shuffledSlice.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffledSlice[i], shuffledSlice[j]] = [shuffledSlice[j], shuffledSlice[i]];
      }
      
      const mapped: PracticeWord[] = shuffledSlice.map((w: any) => ({
        id: Number(w.id),
        word: String(w.word || ""),
        translation: String(w.translation || ""),
        count: 0,
        completed: false,
        showTranslation: false,
      }));
      setWords(mapped);
      setCurrentIndex(0);
      setFrameIdx(0);
      setFinished(false);
    } catch {
      // ignore
    }
  }, [batchIdx, mode]);

  // LinguaStart memorize sequence: 1,2,1,2,3,1,2,3,4,1,2,3,4,5 (0-based)
  const sequence = useMemo(() => {
    const n = words.length;
    if (n <= 0) return [] as number[];
    const seq: number[] = [0];
    for (let i = 1; i < n; i++) {
      seq.push(i);
      for (let j = 0; j <= i; j++) seq.push(j);
    }
    return seq;
  }, [words]);

  const activeIndex = sequence.length > 0 ? sequence[Math.min(frameIdx, sequence.length - 1)] : 0;

  useEffect(() => {
    if (words.length === 0) return;
    setCurrentIndex(activeIndex);
  }, [activeIndex, words.length]);

  const toggleTranslation = (id: number) => {
    setWords((prev) =>
      prev.map((word) =>
        word.id === id ? { ...word, showTranslation: !word.showTranslation } : word
      )
    );
  };

  const handleCountClick = (id: number) => {
    const idx = words.findIndex((w) => w.id === id);
    if (idx !== activeIndex) return;

    // advance one frame in the fixed sequence
    if (sequence.length === 0) return;
    if (frameIdx >= sequence.length - 1) {
      setFinished(true);
      return;
    }
    setFrameIdx((f) => f + 1);
  };

  const handleShuffle = () => {
    const shuffled = [...words].sort(() => Math.random() - 0.5);
    setWords(shuffled);
    setCurrentIndex(0);
    setFrameIdx(0);
    setFinished(false);
  };

  const handleNext = () => {
    navigate("/word-review");
  };

  const allCompleted = finished;

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
            单词练习
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
          {words.map((word, index) => (
            <div
              key={word.id}
              className={`bg-white rounded-xl p-4 shadow-sm transition-all ${
                index === currentIndex ? "bg-[#4ECDC4]/10 border-2 border-[#4ECDC4]" : ""
              }`}
            >
              <div className="flex items-center justify-between">
                <div
                  onClick={() => toggleTranslation(word.id)}
                  className="flex-1 cursor-pointer pr-3"
                >
                  <div className="text-base font-medium text-[#2D3748] mb-1">{word.word}</div>
                  {word.showTranslation && (
                    <div className="text-sm text-[#718096]">{word.translation}</div>
                  )}
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <button className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                    <Volume2 size={20} className="text-[#4ECDC4]" />
                  </button>
                  <button
                    onClick={() => handleCountClick(word.id)}
                    className={`w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold transition-colors ${
                      index === activeIndex
                        ? "bg-[#4ECDC4] text-white hover:bg-[#45b8b0]"
                        : "bg-gray-100 text-[#A0AEC0] cursor-not-allowed"
                    }`}
                  >
                    ✓
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 底部工具栏 */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-[#E2E8F0] px-4 py-4 shadow-lg">
        <div className="flex items-center justify-between">
          <div className="flex gap-2">
            <button
              onClick={handleShuffle}
              className="px-4 py-2 border border-[#E2E8F0] rounded-full text-sm text-[#718096] hover:bg-gray-50 transition-colors flex items-center gap-1"
            >
              <Shuffle size={16} />
              乱序
            </button>
            <button className="px-4 py-2 border border-[#E2E8F0] rounded-full text-sm text-[#718096] hover:bg-gray-50 transition-colors">
              人工带读
            </button>
            <button
              onClick={() => setSpeed(speed === "1.0x" ? "1.5x" : "1.0x")}
              className="px-4 py-2 border border-[#E2E8F0] rounded-full text-sm text-[#718096] hover:bg-gray-50 transition-colors"
            >
              {speed}倍速
            </button>
          </div>
          <button
            onClick={handleNext}
            className="p-3 rounded-full transition-colors bg-[#4ECDC4] text-white hover:bg-[#45b8b0]"
          >
            <ArrowRight size={24} />
          </button>
        </div>
      </div>

      {/* 暂停菜单 */}
      {showPauseMenu && (
        <div
          className="fixed inset-0 bg-black/50 z-50"
          onClick={() => setShowPauseMenu(false)}
        >
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

      {/* 右下角箭头按钮（仅在完成后显示） */}
    </div>
  );
}
