import { useNavigate } from "react-router";
import { ChevronLeft, Volume2, Check } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { getReviewToday, startReviewSession } from "@/api/review";

type ReviewWordItem = { id: number; word: string; status: null | "selected" };

const reviewGroups = ["今日复习"];

export default function ReviewWordList() {
  const navigate = useNavigate();
  const [words, setWords] = useState<ReviewWordItem[]>([]);
  const [showGroupMenu, setShowGroupMenu] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState(reviewGroups[0]);

  const wordBookId = useMemo(() => {
    const url = new URL(window.location.href);
    const qp = Number(url.searchParams.get("wordBookId") || 0);
    if (qp) return qp;
    return Number(sessionStorage.getItem("lb_review_wordbook_id") || 0);
  }, []);

  const [sessionId, setSessionId] = useState<number>(0);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await getReviewToday(wordBookId);
        const ws = Array.isArray(res.data?.words) ? (res.data.words as Array<{ id: number; word: string }>) : [];
        const mapped: ReviewWordItem[] = ws.map((w) => ({ id: Number(w.id), word: String(w.word || ""), status: null }));
        if (!mounted) return;
        setSessionId(0);
        setWords(mapped);
      } catch {
        if (!mounted) return;
        setSessionId(0);
        setWords([]);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [wordBookId]);

  const handleBack = () => {
    if (window.history.length > 1) navigate(-1);
    else navigate("/anti-forgetting");
  };

  const handleStatusClick = (id: number) => {
    setWords((prev) =>
      prev.map((word) => (word.id === id ? { ...word, status: word.status ? null : "selected" } : word))
    );
  };

  const handleSubmit = () => {
    (async () => {
      try {
        const selectedIds = words.filter((w) => w.status === "selected").map((w) => w.id);
        if (selectedIds.length === 0) {
          handleBack();
          return;
        }

        const res = await startReviewSession({ wordBookId, wordIds: selectedIds });
        const sid = Number(res.data?.sessionId || 0);
        const ws = Array.isArray(res.data?.words) ? (res.data.words as any[]) : [];
        if (!sid || ws.length === 0) {
          handleBack();
          return;
        }

        sessionStorage.setItem("lb_mode", "review");
        sessionStorage.setItem("lb_review_session_id", String(sid));
        sessionStorage.setItem("lb_review_words", JSON.stringify(ws));
        sessionStorage.setItem("lb_review_batch_idx", "0");
        sessionStorage.setItem("lb_review_wordbook_id", String(wordBookId));

        navigate("/word-practice");
      } finally {
        // no-op
      }
    })();
  };

  const masteredCount = words.filter((word) => word.status === "selected").length;
  const forgottenCount = words.length - masteredCount;

  return (
    <div className="min-h-screen bg-[#F7F9FC] pb-32">
      {/* 顶部导航 */}
      <div className="fixed top-0 left-0 right-0 z-50 bg-white border-b border-[#E2E8F0]">
        <div className="flex items-center h-14 px-4">
          <button onClick={handleBack} className="mr-4">
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
                item.status === "selected" ? "border-2 border-[#4ECDC4] bg-[#4ECDC4]/5" : ""
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
                    onClick={() => handleStatusClick(item.id)}
                    className={`p-2 rounded-full transition-colors ${
                      item.status === "selected"
                        ? "bg-[#4ECDC4] text-white"
                        : "hover:bg-gray-100 text-[#718096]"
                    }`}
                  >
                    <Check size={20} />
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
            已选 <span className="text-[#4ECDC4] font-semibold">{masteredCount}</span> 个，
            共 <span className="text-[#2D3748] font-semibold">{words.length}</span> 个
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
