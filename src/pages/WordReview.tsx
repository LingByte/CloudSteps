import { ArrowLeft, Pause, Volume2, Shuffle, ArrowRight } from "lucide-react";
import { useNavigate } from "react-router";
import { useState } from "react";

const initialWords = [
  { id: 1, word: "abandon", translation: "放弃；抛弃", showTranslation: false },
  { id: 2, word: "ability", translation: "能力；才能", showTranslation: false },
  { id: 3, word: "abroad", translation: "在国外；到国外", showTranslation: false },
  { id: 4, word: "absolute", translation: "绝对的；完全的", showTranslation: false },
  { id: 5, word: "abstract", translation: "抽象的；摘要", showTranslation: false },
];

export default function WordReview() {
  const navigate = useNavigate();
  const [words, setWords] = useState(initialWords);
  const [speed, setSpeed] = useState("1.0x");
  const [showPauseMenu, setShowPauseMenu] = useState(false);

  const toggleTranslation = (id: number) => {
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
    navigate("/flash-review");
  };

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
            className="p-3 bg-[#4ECDC4] text-white rounded-full hover:bg-[#45b8b0] transition-colors"
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

      {/* 右下角箭头按钮 */}
      <div className="fixed bottom-28 right-6">
        <button
          onClick={handleNext}
          className="p-4 bg-[#4ECDC4] text-white rounded-full shadow-lg hover:bg-[#45b8b0] transition-colors"
        >
          <ArrowRight size={24} />
        </button>
      </div>
    </div>
  );
}
