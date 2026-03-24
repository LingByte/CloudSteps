import { ArrowLeft, Volume2, Check, X, Shuffle } from "lucide-react";
import { useNavigate } from "react-router";
import { useState } from "react";

const initialWords = [
  { id: 1, word: "abandon", status: null },
  { id: 2, word: "ability", status: null },
  { id: 3, word: "abroad", status: null },
  { id: 4, word: "absolute", status: null },
  { id: 5, word: "abstract", status: null },
  { id: 6, word: "academic", status: null },
  { id: 7, word: "accept", status: null },
  { id: 8, word: "access", status: null },
];

export default function PreTrainingCheck() {
  const navigate = useNavigate();
  const [words, setWords] = useState(initialWords);
  const [selectedCount, setSelectedCount] = useState(0);

  const handleStatusClick = (id: number, newStatus: "correct" | "wrong") => {
    setWords((prev) =>
      prev.map((word) => {
        if (word.id === id) {
          const wasSelected = word.status !== null;
          const isNowSelected = newStatus !== null;

          if (!wasSelected && isNowSelected) {
            setSelectedCount(selectedCount + 1);
          } else if (wasSelected && !isNowSelected) {
            setSelectedCount(selectedCount - 1);
          }

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
      setSelectedCount(0);
    } else {
      setWords(words.map((word) => ({ ...word, status: "wrong" })));
      setSelectedCount(words.length);
    }
  };

  const handleSelect5 = () => {
    const unselected = words.filter((word) => word.status === null);
    const toSelect = unselected.slice(0, 5);

    setWords((prev) =>
      prev.map((word) => {
        if (toSelect.find((w) => w.id === word.id)) {
          return { ...word, status: "wrong" };
        }
        return word;
      })
    );

    setSelectedCount(words.filter((w) => w.status !== null).length + Math.min(5, unselected.length));
  };

  const handleStartLearning = () => {
    const selectedWords = words.filter((word) => word.status !== null);
    if (selectedWords.length === 0) return;
    navigate("/word-practice");
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
            训前检测
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
            正确 <span className="text-[#66BB6A] font-semibold">{correctCount}</span> ·
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
        <div className="flex gap-3">
          <button
            onClick={handleSelect5}
            className="flex-1 py-3 border-2 border-[#4ECDC4] text-[#4ECDC4] rounded-full font-medium hover:bg-[#4ECDC4]/5 transition-colors"
          >
            选择5个
          </button>
          <button
            onClick={handleStartLearning}
            disabled={selectedCount === 0}
            className="flex-1 py-3 bg-[#4ECDC4] text-white rounded-full font-medium hover:bg-[#45b8b0] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            开始识记
          </button>
        </div>
      </div>
    </div>
  );
}
