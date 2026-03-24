import { useNavigate } from "react-router";
import { ChevronLeft, Volume2, Check, X } from "lucide-react";
import { useState } from "react";

const initialWords = [
  { id: 1, word: "embroidery", status: null },
  { id: 2, word: "sponsor", status: null },
  { id: 3, word: "blizzard", status: null },
  { id: 4, word: "accurate", status: null },
  { id: 5, word: "frank", status: null },
  { id: 6, word: "plaster", status: null },
  { id: 7, word: "terminal", status: null },
  { id: 8, word: "revenue", status: null },
  { id: 9, word: "magnificent", status: null },
  { id: 10, word: "cathedral", status: null },
];

const reviewGroups = [
  "2026-3-20练习...",
  "2026-3-19练习...",
  "2026-3-18练习...",
];

export default function ReviewWordList() {
  const navigate = useNavigate();
  const [words, setWords] = useState(initialWords);
  const [showGroupMenu, setShowGroupMenu] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState(reviewGroups[0]);

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

  const handleSubmit = () => {
    navigate(-1);
  };

  const masteredCount = words.filter((word) => word.status === "correct").length;
  const forgottenCount = words.filter((word) => word.status === "wrong").length;

  return (
    <div className="min-h-screen bg-[#F7F9FC] pb-32">
      {/* 顶部导航 */}
      <div className="fixed top-0 left-0 right-0 z-50 bg-white border-b border-[#E2E8F0]">
        <div className="flex items-center h-14 px-4">
          <button onClick={() => navigate(-1)} className="mr-4">
            <ChevronLeft size={24} className="text-[#2D3748]" />
          </button>
          <h1 className="text-lg font-semibold text-[#2D3748]">抗遗忘复习</h1>
        </div>
      </div>

      {/* 主内容 */}
      <div className="pt-14 px-4 py-6">
        {/* 标题信息 */}
        <div className="mb-6">
          <p className="text-[#718096] text-sm mb-3">
            当前共有 {words.length} 个可选单词
          </p>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-[#4ECDC4]" />
            <p className="text-[#2D3748] font-medium">
              {selectedGroup}
            </p>
          </div>
        </div>

        {/* 单词列表 */}
        <div className="space-y-3">
          {words.map((item, index) => (
            <div
              key={item.id}
              className={`bg-white rounded-xl p-4 shadow-sm transition-all ${
                item.status === "correct"
                  ? "border-2 border-[#66BB6A] bg-[#66BB6A]/5"
                  : item.status === "wrong"
                  ? "border-2 border-[#FF6B6B] bg-[#FF6B6B]/5"
                  : ""
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-start gap-4 flex-1">
                  <span className="text-[#A0AEC0] text-sm mt-1">
                    {index + 1}
                  </span>
                  <h3 className="text-2xl font-semibold text-[#2D3748]">
                    {item.word}
                  </h3>
                </div>
                <div className="flex items-center gap-2">
                  <button className="text-[#55A3FF] hover:text-[#4ECDC4] transition-colors p-2">
                    <Volume2 size={24} />
                  </button>
                  <button
                    onClick={() => handleStatusClick(item.id, "correct")}
                    className={`p-2 rounded-full transition-colors ${
                      item.status === "correct"
                        ? "bg-[#66BB6A] text-white"
                        : "hover:bg-gray-100 text-[#718096]"
                    }`}
                  >
                    <Check size={20} />
                  </button>
                  <button
                    onClick={() => handleStatusClick(item.id, "wrong")}
                    className={`p-2 rounded-full transition-colors ${
                      item.status === "wrong"
                        ? "bg-[#FF6B6B] text-white"
                        : "hover:bg-gray-100 text-[#718096]"
                    }`}
                  >
                    <X size={20} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 底部工具栏 */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-[#E2E8F0] px-4 py-4 shadow-lg">
        <div className="flex items-center justify-between mb-3">
          {/* 左下角选择复习组按钮 */}
          <div className="relative">
            <button
              onClick={() => setShowGroupMenu(!showGroupMenu)}
              className="px-4 py-2 bg-[#4ECDC4] text-white rounded-lg hover:bg-[#45b8b0] transition-colors text-sm"
            >
              {selectedGroup}
            </button>
            {showGroupMenu && (
              <div className="absolute bottom-full left-0 mb-2 bg-white rounded-lg shadow-lg overflow-hidden">
                {reviewGroups.map((group) => (
                  <button
                    key={group}
                    onClick={() => {
                      setSelectedGroup(group);
                      setShowGroupMenu(false);
                    }}
                    className={`w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors ${
                      selectedGroup === group ? "bg-[#4ECDC4]/10 text-[#4ECDC4]" : "text-[#2D3748]"
                    }`}
                  >
                    {group}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 统计信息 */}
          <div className="text-sm text-[#718096]">
            掌握 <span className="text-[#66BB6A] font-semibold">{masteredCount}</span> 个，
            遗忘 <span className="text-[#FF6B6B] font-semibold">{forgottenCount}</span> 个
          </div>

          {/* 右下角提交按钮 */}
          <button
            onClick={handleSubmit}
            className="px-6 py-2 bg-[#4ECDC4] text-white rounded-lg hover:bg-[#45b8b0] transition-colors"
          >
            提交
          </button>
        </div>
      </div>
    </div>
  );
}
