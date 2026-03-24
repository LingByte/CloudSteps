import { ArrowLeft, Pause, Volume2, Scissors, Check, X } from "lucide-react";
import { useNavigate } from "react-router";
import { useState, useEffect } from "react";
import confetti from "canvas-confetti";

const initialWords = [
  { id: 1, word: "abandon", translation: "放弃；抛弃", scissorCount: 0, status: null, showTranslation: false },
  { id: 2, word: "ability", translation: "能力；才能", scissorCount: 0, status: null, showTranslation: false },
  { id: 3, word: "abroad", translation: "在国外；到国外", scissorCount: 0, status: null, showTranslation: false },
  { id: 4, word: "absolute", translation: "绝对的；完全的", scissorCount: 0, status: null, showTranslation: false },
  { id: 5, word: "abstract", translation: "抽象的；摘要", scissorCount: 0, status: null, showTranslation: false },
];

export default function FlashReview() {
  const navigate = useNavigate();
  const [words, setWords] = useState(initialWords);
  const [currentGroup, setCurrentGroup] = useState(1);
  const [showCompleteDialog, setShowCompleteDialog] = useState(false);

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

  const allCut = words.every((word) => word.scissorCount >= 2);

  const handleComplete = () => {
    confetti({
      particleCount: 100,
      spread: 70,
      origin: { y: 0.6 },
    });
    setShowCompleteDialog(true);
  };

  useEffect(() => {
    if (allCut) {
      handleComplete();
    }
  }, [allCut]);

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

        {/* 单词列表 */}
        <div className="space-y-3 mb-6">
          {words.map((word) => (
            <div
              key={word.id}
              className={`bg-white rounded-xl p-4 flex items-center justify-between shadow-sm transition-all ${
                word.scissorCount >= 2 ? "opacity-0 h-0 overflow-hidden p-0 mb-0" : ""
              }`}
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
                <button className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                  <Volume2 size={20} className="text-[#4ECDC4]" />
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
