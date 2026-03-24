import { ArrowLeft, Pause, Volume2, Shuffle, ArrowRight } from "lucide-react";
import { useNavigate } from "react-router";
import { useState } from "react";

const initialWords = [
  { id: 1, word: "abandon", translation: "放弃；抛弃", count: 0, completed: false, showTranslation: false },
  { id: 2, word: "ability", translation: "能力；才能", count: 0, completed: false, showTranslation: false },
  { id: 3, word: "abroad", translation: "在国外；到国外", count: 0, completed: false, showTranslation: false },
  { id: 4, word: "absolute", translation: "绝对的；完全的", count: 0, completed: false, showTranslation: false },
  { id: 5, word: "abstract", translation: "抽象的；摘要", count: 0, completed: false, showTranslation: false },
];

export default function WordPractice() {
  const navigate = useNavigate();
  const [words, setWords] = useState(initialWords);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [speed, setSpeed] = useState("1.0x");
  const [showPauseMenu, setShowPauseMenu] = useState(false);

  const toggleTranslation = (id: number) => {
    setWords((prev) =>
      prev.map((word) =>
        word.id === id ? { ...word, showTranslation: !word.showTranslation } : word
      )
    );
  };

  const handleCountClick = (id: number) => {
    setWords((prev) =>
      prev.map((word) => {
        if (word.id === id) {
          const newCount = word.count + 1;
          if (newCount === 5) {
            return { ...word, count: 5, completed: true };
          } else if (newCount > 5) {
            return { ...word, count: 0, completed: false };
          } else {
            return { ...word, count: newCount };
          }
        }
        return word;
      })
    );
  };

  const handleShuffle = () => {
    const shuffled = [...words].sort(() => Math.random() - 0.5);
    setWords(shuffled);
  };

  const handleNext = () => {
    const allCompleted = words.every((word) => word.completed);
    if (allCompleted) {
      navigate("/word-review");
    }
  };

  const allCompleted = words.every((word) => word.completed);

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* 顶部栏 */}
      <div className="bg-white sticky top-0 z-10 shadow-sm">
        <div className="flex items-center justify-between px-4 py-4">
          <button
            onClick={() => navigate(-1)}
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
                  {index === 0 && (
                    <button
                      onClick={() => handleCountClick(word.id)}
                      className={`w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold transition-colors ${
                        word.completed
                          ? "bg-[#66BB6A] text-white"
                          : "bg-[#4ECDC4] text-white hover:bg-[#45b8b0]"
                      }`}
                    >
                      {word.completed ? "✓" : word.count === 0 ? "1" : word.count}
                    </button>
                  )}
                  {index !== 0 && (
                    <button
                      onClick={() => handleCountClick(word.id)}
                      className={`w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold transition-colors ${
                        word.completed
                          ? "bg-[#66BB6A] text-white"
                          : "border-2 border-[#E2E8F0] text-[#718096] hover:bg-gray-50"
                      }`}
                    >
                      {word.completed ? "✓" : word.count === 0 ? "" : word.count}
                    </button>
                  )}
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
            disabled={!allCompleted}
            className={`p-3 rounded-full transition-colors ${
              allCompleted
                ? "bg-[#4ECDC4] text-white hover:bg-[#45b8b0]"
                : "bg-gray-100 text-[#A0AEC0] cursor-not-allowed"
            }`}
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
      {allCompleted && (
        <div className="fixed bottom-28 right-6">
          <button
            onClick={handleNext}
            className="p-4 bg-[#4ECDC4] text-white rounded-full shadow-lg hover:bg-[#45b8b0] transition-colors"
          >
            <ArrowRight size={24} />
          </button>
        </div>
      )}
    </div>
  );
}
