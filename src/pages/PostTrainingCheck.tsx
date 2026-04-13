import { ArrowLeft, Volume2, Check, X } from "lucide-react";
import { useNavigate } from "react-router";
import { useEffect, useMemo, useState } from "react";
import { completeStudySession } from "@/api/study";
import { completeReviewSession } from "@/api/review";

type CheckWord = { 
  id: number; 
  word: string; 
  translation?: string;
  status: null | "correct" | "wrong";
  showTranslation?: boolean;
};

export default function PostTrainingCheck() {
  const navigate = useNavigate();
  const [words, setWords] = useState<CheckWord[]>([]);
  const [showResultDialog, setShowResultDialog] = useState(false);

  const mode = useMemo(() => sessionStorage.getItem("lb_mode") || "study", []);

  const batchIdx = useMemo(() => {
    const key = mode === "review" ? "lb_review_batch_idx" : "lb_study_batch_idx";
    return Number(sessionStorage.getItem(key) || 0);
  }, [mode]);
  const sessionId = useMemo(() => {
    const key = mode === "review" ? "lb_review_session_id" : "lb_study_session_id";
    return Number(sessionStorage.getItem(key) || 0);
  }, [mode]);
  const [submitting, setSubmitting] = useState(false);
  const [submitDone, setSubmitDone] = useState(false);

  const handleBack = () => {
    if (window.history.length > 1) navigate(-1);
    else navigate("/flash-review");
  };

  useEffect(() => {
    try {
      const wordsKey = mode === "review" ? "lb_review_words" : "lb_study_words";
      const raw = sessionStorage.getItem(wordsKey) || "[]";
      const arr = JSON.parse(raw);
      const all: any[] = Array.isArray(arr) ? arr : [];
      const start = batchIdx * 5;
      const slice = all.slice(start, start + 5);
      const mapped: CheckWord[] = slice.map((w: any) => ({ 
        id: Number(w.id), 
        word: String(w.word || ""), 
        translation: w.translation ? String(w.translation) : undefined,
        status: null,
        showTranslation: false
      }));
      setWords(mapped);
      setSubmitDone(false);
    } catch {
      // ignore
    }
  }, [batchIdx, mode]);

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

  const handleWordClick = (id: number) => {
    setWords((prev) =>
      prev.map((word) => (word.id === id ? { ...word, showTranslation: !word.showTranslation } : word))
    );
  };

  const handleSubmit = () => {
    const hasSelection = words.some((word) => word.status !== null);
    if (!hasSelection) return;
    (async () => {
      setSubmitting(true);
      try {
        const results = words
          .filter((w) => w.status !== null)
          .map((w) => ({ wordId: w.id, remembered: w.status === "correct" }));

        if (mode === "review") {
          // 抗遗忘模式：直接提交所有结果，不分批
          const res = await completeReviewSession({
            sessionId: sessionId,
            results: results,
          });
          if (res.code !== 200) {
            throw new Error(res.msg || "提交失败");
          }
          setSubmitDone(true);
          setShowResultDialog(true);
          return;
        }

        // 学习模式：保持原有逻辑
        if (!sessionId) {
          setSubmitDone(true);
          setShowResultDialog(true);
          return;
        }

        await completeStudySession(sessionId, results);
        setSubmitDone(true);
        setShowResultDialog(true);
      } catch {
        setSubmitDone(true);
      } finally {
        setSubmitting(false);
      }
    })();
  };

  const correctCount = words.filter((word) => word.status === "correct").length;
  const wrongCount = words.filter((word) => word.status === "wrong").length;

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* 顶部栏 */}
      <div className="bg-white sticky top-0 z-10 shadow-sm">
        <div className="flex items-center px-4 py-4">
          <button
            onClick={handleBack}
            className="p-2 -ml-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <ArrowLeft size={24} className="text-[#2D3748]" />
          </button>
          <h1 className="flex-1 text-center text-lg font-semibold text-[#2D3748] -ml-10">
            训后检测
          </h1>
        </div>
      </div>

      <div className="px-4 mt-6">
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
              <div className="flex items-center gap-3 flex-1 cursor-pointer" onClick={() => handleWordClick(word.id)}>
                <div>
                  <span className="text-base font-medium text-[#2D3748] hover:text-[#4ECDC4] transition-colors">{word.word}</span>
                  {word.showTranslation && word.translation && (
                    <p className="text-[#718096] text-sm mt-1 animate-in fade-in slide-in-from-top-1">
                      {word.translation}
                    </p>
                  )}
                </div>
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
        <div className="text-center text-sm text-[#718096] mb-3">
          正确 <span className="text-[#66BB6A] font-semibold">{correctCount}</span> ·
          错误 <span className="text-[#FF6B6B] font-semibold">{wrongCount}</span>
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
            <h3 className="text-2xl font-bold text-center mb-2">
              再接再厉
            </h3>
            <div className="space-y-3 mb-6">
              <div className="flex items-center justify-between py-2 border-b border-[#E2E8F0]">
                <span className="text-[#718096]">正确数</span>
                <span className="text-xl font-bold text-[#66BB6A]">{correctCount}</span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-[#E2E8F0]">
                <span className="text-[#718096]">错误数</span>
                <span className="text-xl font-bold text-[#FF6B6B]">{wrongCount}</span>
              </div>
            </div>
            <div className="space-y-3">
              <button
                onClick={() => {
                  setShowResultDialog(false);
                  if (!submitDone) return;
                  try {
                    const wordsKey = mode === "review" ? "lb_review_words" : "lb_study_words";
                    const raw = sessionStorage.getItem(wordsKey) || "[]";
                    const arr = JSON.parse(raw);
                    const total = Array.isArray(arr) ? arr.length : 0;
                    const totalBatches = Math.ceil(total / 5);
                    const next = batchIdx + 1;
                    if (next < totalBatches) {
                      if (mode === "review") {
                        sessionStorage.setItem("lb_review_batch_idx", String(next));
                      } else {
                        sessionStorage.setItem("lb_study_batch_idx", String(next));
                      }
                      navigate("/word-practice", { replace: true });
                    } else {
                      if (mode === "review") {
                        sessionStorage.removeItem("lb_review_results");
                        navigate("/anti-forgetting");
                      } else {
                        navigate("/pre-training-check");
                      }
                    }
                  } catch {
                    if (mode === "review") navigate("/anti-forgetting");
                    else navigate("/pre-training-check");
                  }
                }}
                className="w-full py-3 text-[#718096] rounded-lg hover:bg-gray-50 transition-colors"
              >
                {mode === "review" ? "继续复习" : "继续练习"}
              </button>
              <button
                onClick={() => {
                  if (mode === "review") navigate("/anti-forgetting");
                  else navigate("/create-anti-forgetting");
                }}
                className="w-full py-3 bg-[#4ECDC4] text-white rounded-lg hover:bg-[#45b8b0] transition-colors"
              >
                {mode === "review" ? "结束本次复习" : "结束本次训练，并创建单词抗遗忘"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
