import { ArrowLeft, Volume2, Check, X, Shuffle } from "lucide-react";
import { useNavigate } from "react-router";
import { useState } from "react";

const initialWords = [
  { id: 1, word: "abandon", status: null },
  { id: 2, word: "ability", status: null },
  { id: 3, word: "abroad", status: null },
  { id: 4, word: "absolute", status: null },
  { id: 5, word: "abstract", status: null },
];

export default function ReviewCheck() {
  const navigate = useNavigate();
  const [words, setWords] = useState(initialWords);
  const [showResultDialog, setShowResultDialog] = useState(false);

  const handleStatusClick = (id: number, newStatus: "correct" | "wrong") => {
    setWords((prev) =>
      prev.map((word) => {
        if (word.id === id) {
          return { ...word, status: word.status === newStatus ? null : newStatus };
        }
        return word;
      })
    );
  };

  const handleShuffle = () => {
    const shuffled = [...words].sort(() => Math.random() - 0.5);
    setWords(shuffled);
  };

  const handleSelectAll = () => {
    const allSelected = words.every((word) => word.status !== null);
    if (allSelected) {
      setWords(words.map((word) => ({ ...word, status: null })));
    } else {
      setWords(words.map((word) => ({ ...word, status: "correct" })));
    }
  };

  const handleSubmit = () => {
    const hasSelection = words.some((word) => word.status !== null);
    if (!hasSelection) return;
    setShowResultDialog(true);
  };

  const correctCount = words.filter((word) => word.status === "correct").length;
  const wrongCount = words.filter((word) => word.status === "wrong").length;

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* 顶部栏 */}
      <div className="bg-white sticky top-0 z-10 shadow-sm">
        <div className="flex items-center px-4 py-4">
          <button
            onClick={() => navigate(-1)}
            className="p-2 -ml-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <ArrowLeft size={24} className="text-[#2D3748]" />
          </button>
          <h1 className="flex-1 text-center text-lg font-semibold text-[#2D3748] -ml-10">
            复习检测
          </h1>
        </div>
      </div>

      <div className="px-4 mt-6">
        {/* 提示文字 */}
        <p className="text-center text-[#718096] mb-4">
          当前共有 {words.length} 个可选单词
        </p>

        {/* 单词列表 */}
        <div className="space-y-3 mb-6">
          {words.map((word) => (
            <div
              key={word.id}
              className={`bg-white rounded-xl p-4 flex items-center justify-between shadow-sm transition-all ${
                word.status === "correct"
                  ? "border-2 border-[#66BB6A] bg-[#66BB6A]/5"
                  : word.status === "wrong"
                  ? "border-2 border-[#FF6B6B] bg-[#FF6B6B]/5"
                  : ""
              }`}
            >
              <div className="flex items-center gap-3 flex-1">
                <span className="text-base font-medium text-[#2D3748]">{word.word}</span>
              </div>
              <div className="flex items-center gap-3">
                <button className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                  <Volume2 size={20} className="text-[#4ECDC4]" />
                </button>
                <button
                  onClick={() => handleStatusClick(word.id, "correct")}
                  className={`p-2 rounded-full transition-colors ${
                    word.status === "correct"
                      ? "bg-[#66BB6A] text-white"
                      : "hover:bg-gray-100 text-[#718096]"
                  }`}
                >
                  <Check size={20} />
                </button>
                <button
                  onClick={() => handleStatusClick(word.id, "wrong")}
                  className={`p-2 rounded-full transition-colors ${
                    word.status === "wrong"
                      ? "bg-[#FF6B6B] text-white"
                      : "hover:bg-gray-100 text-[#718096]"
                  }`}
                >
                  <X size={20} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 底部栏 */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-[#E2E8F0] px-4 py-4 shadow-lg">
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm text-[#718096]">
            已选择 <span className="text-[#4ECDC4] font-semibold">{correctCount + wrongCount}</span> ·
            错误 <span className="text-[#FF6B6B] font-semibold">{wrongCount}</span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleShuffle}
              className="px-4 py-2 border border-[#E2E8F0] rounded-full text-sm text-[#718096] hover:bg-gray-50 transition-colors flex items-center gap-1"
            >
              <Shuffle size={16} />
              乱序
            </button>
            <button
              onClick={handleSelectAll}
              className="px-4 py-2 border border-[#E2E8F0] rounded-full text-sm text-[#718096] hover:bg-gray-50 transition-colors"
            >
              全选
            </button>
          </div>
        </div>
        <button
          onClick={handleSubmit}
          disabled={correctCount + wrongCount === 0}
          className="w-full py-3 bg-[#4ECDC4] text-white rounded-full font-medium hover:bg-[#45b8b0] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          提交
        </button>
      </div>

      {/* 结果弹窗 */}
      {showResultDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full mx-auto">
            <h3 className="text-2xl font-bold text-center text-[#4ECDC4] mb-6">
              训练结果
            </h3>
            <div className="space-y-4 mb-6">
              <div className="flex items-center justify-between py-3 border-b border-[#E2E8F0]">
                <span className="text-[#718096]">正确数</span>
                <span className="text-2xl font-bold text-[#66BB6A]">{correctCount}</span>
              </div>
              <div className="flex items-center justify-between py-3 border-b border-[#E2E8F0]">
                <span className="text-[#718096]">错误数</span>
                <span className="text-2xl font-bold text-[#FF6B6B]">{wrongCount}</span>
              </div>
            </div>
            <button
              onClick={() => {
                setShowResultDialog(false);
                navigate("/word-training");
              }}
              className="w-full py-3 bg-[#4ECDC4] text-white rounded-full font-medium hover:bg-[#45b8b0] transition-colors"
            >
              确定
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
