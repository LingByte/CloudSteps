import { ArrowLeft, Pause, Volume2, Shuffle, ArrowRight } from "lucide-react";
import { useNavigate } from "react-router";
import { useEffect, useMemo, useState } from "react";

type ReviewWord = { id: number; word: string; translation: string; showTranslation: boolean };

export default function WordReview() {
  const navigate = useNavigate();
  const [words, setWords] = useState<ReviewWord[]>([]);
  const [speed, setSpeed] = useState("1.0x");
  const [showPauseMenu, setShowPauseMenu] = useState(false);
  const [touchedIds, setTouchedIds] = useState<Set<number>>(new Set());

  const mode = useMemo(() => sessionStorage.getItem("lb_mode") || "study", []);

  const batchIdx = useMemo(() => {
    const key = mode === "review" ? "lb_review_batch_idx" : "lb_study_batch_idx";
    return Number(sessionStorage.getItem(key) || 0);
  }, [mode]);

  const handleBack = () => {
    if (window.history.length > 1) navigate(-1);
    else navigate("/word-practice");
  };

  useEffect(() => {
    try {
      const wordsKey = mode === "review" ? "lb_review_words" : "lb_study_words";
      const raw = sessionStorage.getItem(wordsKey) || "[]";
      const arr = JSON.parse(raw);
      const all: any[] = Array.isArray(arr) ? arr : [];
      const start = batchIdx * 5;
      const slice = all.slice(start, start + 5);
      const mapped: ReviewWord[] = slice.map((w: any) => ({
        id: Number(w.id),
        word: String(w.word || ""),
        translation: String(w.translation || ""),
        showTranslation: false,
      }));
      setWords(mapped);
      setTouchedIds(new Set());
    } catch {
      // ignore
    }
  }, [batchIdx, mode]);

  const toggleTranslation = (id: number) => {
    setTouchedIds((prev) => new Set(prev).add(id));
    setWords((prev) =>
      prev.map((word) =>
        word.id === id ? { ...word, showTranslation: !word.showTranslation } : word
      )
    );
  };

  const handleShuffle = () => {
    const shuffled = [...words].sort(() => Math.random() - 0.5);
    setWords(shuffled);
  };

  const handleNext = () => {
    navigate("/listen-identify");
  };

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
            单词复习
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
          {words.map((word) => (
            <div
              key={word.id}
              className="bg-white rounded-xl p-4 shadow-sm"
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
    </div>
  );
}
