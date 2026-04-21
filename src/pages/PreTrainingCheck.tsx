import { Volume2, Check, X, Shuffle, Loader2 } from "lucide-react";
import { useNavigate } from "react-router";
import { useEffect, useMemo, useState, useCallback, useRef } from "react";

import { getStudyWords, startStudySession } from "@/api/study";
import { TopBar } from "@/components/TopBar";
import { playFirstWordAudio, playWordAudio } from "@/utils/audioPlayer";

type WordItem = { 
  id: number; 
  word: string; 
  translation?: string;
  audioUrl?: string;
  showTranslation?: boolean;
  status: null | "correct" | "wrong" 
};

const PAGE_SIZE = 20;

export default function PreTrainingCheck() {
  const navigate = useNavigate();
  const [words, setWords] = useState<WordItem[]>([]);
  const [selectedCount, setSelectedCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // 用于防抖的ref
  const loadingRef = useRef(false);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const [playingId, setPlayingId] = useState<number | null>(null);
  const abortRef = useRef<(() => void) | null>(null);

  const handlePlayAudio = useCallback((word: WordItem) => {
    if (!word.audioUrl) return;
    abortRef.current?.();
    setPlayingId(word.id);
    const abort = playWordAudio(word.audioUrl, 300, () => setPlayingId(null));
    abortRef.current = abort;
  }, []);

  const handleBack = () => {
    navigate("/word-training");
  };

  const wordBookId = useMemo(() => Number(sessionStorage.getItem("lb_wordbook_id") || 0), []);

  // 加载单词数据
  const loadWords = useCallback(async (page: number, isInitial = false) => {
    if (loadingRef.current || !wordBookId) return;
    
    loadingRef.current = true;
    if (isInitial) {
      setInitialLoading(true);
    } else {
      setLoading(true);
    }
    
    try {
      const res = await getStudyWords(wordBookId, page, PAGE_SIZE);
      const list = res.data?.words;
      const totalCount = res.data?.total || 0;
      const arr = Array.isArray(list) ? (list as Array<{ id: number; word: string; translation?: string; audioUrl?: string }>) : [];
      
      if (arr.length === 0) {
        setHasMore(false);
        return;
      }
      
      const newWords = arr.map((w) => ({ 
        id: w.id, 
        word: w.word, 
        translation: w.translation,
        audioUrl: w.audioUrl,
        showTranslation: false,
        status: null as WordItem["status"] 
      }));
      
      setWords(prev => {
        const updatedWords = page === 1 ? newWords : [...prev, ...newWords];
        
        // 如果返回的数据少于页面大小，或者已加载完所有数据，说明没有更多数据了
        if (arr.length < PAGE_SIZE || updatedWords.length >= totalCount) {
          setHasMore(false);
        }
        
        return updatedWords;
      });
      
      setError(null);
    } catch (err) {
      console.error('加载单词失败:', err);
      setError('加载单词失败，请重试');
    } finally {
      loadingRef.current = false;
      if (isInitial) {
        setInitialLoading(false);
      } else {
        setLoading(false);
      }
    }
  }, [wordBookId]);

  // 初始加载
  useEffect(() => {
    if (wordBookId) {
      setCurrentPage(1);
      setHasMore(true);
      setError(null);
      loadWords(1, true);
    }
  }, [wordBookId, loadWords]);

  // 设置无限滚动
  useEffect(() => {
    if (!loadMoreRef.current || !hasMore || loading) return;

    observerRef.current = new IntersectionObserver(
      (entries) => {
        const target = entries[0];
        if (target.isIntersecting && hasMore && !loadingRef.current && !loading) {
          const nextPage = currentPage + 1;
          setCurrentPage(nextPage);
          loadWords(nextPage, false);
        }
      },
      {
        threshold: 0.1,
        rootMargin: '100px',
      }
    );

    observerRef.current.observe(loadMoreRef.current);

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [hasMore, loading, currentPage]);

  const handleStatusClick = useCallback((id: number, newStatus: "correct" | "wrong") => {
    setWords((prev) =>
      prev.map((word) => {
        if (word.id === id) {
          const wasSelected = word.status !== null;
          const isNowSelected = newStatus !== null;

          if (!wasSelected && isNowSelected) {
            setSelectedCount(s => s + 1);
          } else if (wasSelected && !isNowSelected) {
            setSelectedCount(s => s - 1);
          }

          return { ...word, status: word.status === newStatus ? null : newStatus };
        }
        return word;
      })
    );
  }, []);

  const handleWordClick = useCallback((word: WordItem) => {
    const id = word.id;
    const isShowing = !word.showTranslation;
    if (isShowing && word.audioUrl) {
      abortRef.current?.();
      setPlayingId(word.id);
      const abort = playFirstWordAudio(word.audioUrl, () => setPlayingId(null));
      abortRef.current = abort;
    }
    setWords((prev) =>
      prev.map((w) => {
        if (isShowing) {
          return w.id === id ? { ...w, showTranslation: true } : { ...w, showTranslation: false };
        }
        return w.id === id ? { ...w, showTranslation: false } : w;
      })
    );
  }, []);

  const handleShuffle = useCallback(() => {
    setWords(prev => {
      const shuffled = [...prev].sort(() => Math.random() - 0.5);
      return shuffled;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    setWords((prev) => {
      const allSelected = prev.every((word) => word.status !== null);
      if (allSelected) {
        setSelectedCount(0);
        return prev.map((word) => ({ ...word, status: null as WordItem["status"] }));
      } else {
        setSelectedCount(prev.length);
        return prev.map((word) => ({ ...word, status: "wrong" as WordItem["status"] }));
      }
    });
  }, []);

  const handleSelect5 = useCallback(() => {
    setWords((prev) => {
      const unselected = prev.filter((word) => word.status === null);
      const toSelect = unselected.slice(0, 5);
      
      const newWords = prev.map((word) => {
        if (toSelect.find((w) => w.id === word.id)) {
          return { ...word, status: "wrong" as WordItem["status"] };
        }
        return word;
      });
      
      setSelectedCount(newWords.filter((w) => w.status !== null).length);
      return newWords;
    });
  }, []);

  const handleStartLearning = async () => {
    const selectedWords = words.filter((word) => word.status !== null);
    if (selectedWords.length === 0) return;

    const knownIds = selectedWords.filter((w) => w.status === "correct").map((w) => w.id);
    const unknownIds = selectedWords.filter((w) => w.status === "wrong").map((w) => w.id);
    
    try {
      const res = await startStudySession({ wordBookId, knownIds, unknownIds });
      const sessionId = res.data?.sessionId;
      const sessionWords = res.data?.words;
      if (sessionId) {
        sessionStorage.setItem("lb_study_session_id", String(sessionId));
      }
      if (Array.isArray(sessionWords)) {
        sessionStorage.setItem("lb_study_words", JSON.stringify(sessionWords));
      }
      sessionStorage.setItem("lb_mode", "study");
      sessionStorage.setItem("lb_study_batch_idx", "0");
      sessionStorage.removeItem("lb_study_batch_results");
      navigate("/word-practice");
    } catch {
      // ignore
    }
  };

  const correctCount = useMemo(() => words.filter((word) => word.status === "correct").length, [words]);
  const wrongCount = useMemo(() => words.filter((word) => word.status === "wrong").length, [words]);

  // 渲染单个单词项（使用React.memo优化）
  const WordItemComponent = useMemo(() => {
    const Item = ({ word }: { word: WordItem }) => (
      <div
        className={`bg-white rounded-xl p-4 flex items-center justify-between shadow-sm transition-all ${
          word.status === "correct"
            ? "border-2 border-[#66BB6A] bg-[#66BB6A]/5"
            : word.status === "wrong"
            ? "border-2 border-[#FF6B6B] bg-[#FF6B6B]/5"
            : ""
        }`}
      >
        <div className="flex items-center gap-3 flex-1 cursor-pointer" onClick={() => handleWordClick(word)}>
          <div>
            <span className="text-base font-medium text-[#2D3748] hover:text-[#4ECDC4] transition-colors">
              {word.word}
            </span>
            {word.showTranslation && word.translation && (
              <p className="text-[#718096] text-sm mt-1 animate-in fade-in slide-in-from-top-1">
                {word.translation}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => handlePlayAudio(word)}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <Volume2 size={20} className={playingId === word.id ? "text-[#4ECDC4] animate-pulse" : "text-[#4ECDC4]"} />
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
    );
    return Item;
  }, [handleStatusClick, handleWordClick]);

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <TopBar title="训前检测" onBack={handleBack} />

      <div className="px-4 mt-6">
        {/* 错误提示 */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-600 text-sm mb-4">
            {error}
          </div>
        )}

        {/* 单词列表 */}
        <div className="space-y-3 mb-6">
          {initialLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-8 h-8 animate-spin text-[#4ECDC4]" />
            </div>
          ) : (
            <>
              {words.map((word) => (
                <WordItemComponent key={word.id} word={word} />
              ))}
              
              {/* 加载更多指示器 */}
              {hasMore && (
                <div ref={loadMoreRef} className="flex justify-center py-4">
                  {loading ? (
                    <Loader2 className="w-6 h-6 animate-spin text-[#4ECDC4]" />
                  ) : (
                    <span className="text-[#718096] text-sm">下拉加载更多</span>
                  )}
                </div>
              )}
              
              {/* 没有更多数据提示 */}
              {!hasMore && words.length > 0 && (
                <div className="text-center py-4">
                  <span className="text-[#718096] text-sm">已加载全部单词</span>
                </div>
              )}
            </>
          )}
        </div>

        {/* 加载更多触发器 */}
        {hasMore && (
          <div ref={loadMoreRef} className="flex justify-center py-4">
            {loading ? (
              <div className="flex items-center gap-2 text-[#718096]">
                <Loader2 size={16} className="animate-spin" />
                <span>加载更多...</span>
              </div>
            ) : (
              <div className="text-[#718096] text-sm">下拉加载更多</div>
            )}
          </div>
        )}
        
        {!hasMore && words.length > 0 && (
          <div className="text-center text-[#718096] text-sm py-4">
            已加载全部单词
          </div>
        )}
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
