import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { ChevronLeft, RefreshCw, TrendingUp, BookOpen } from "lucide-react";

import { getVocabResult } from "@/api/vocab";

type RecommendedBook = {
  id: number;
  name: string;
  description?: string;
  level?: string;
  wordCount?: number;
  coverUrl?: string;
};

type ResultPayload = {
  level: string;
  estimatedVocab: number;
  correctCount: number;
  totalCount: number;
  levelStats?: Record<
    string,
    {
      total: number;
      correct: number;
      correctRate: number;
      weightedRate?: number;
    }
  >;
  recommendedBooks?: RecommendedBook[];
};

const LEVELS = ["A1", "A2", "B1", "B2", "C1"] as const;
type Level = (typeof LEVELS)[number];

const VOCAB_MAP: Record<Level, number> = {
  A1: 300,
  A2: 1000,
  B1: 2500,
  B2: 4000,
  C1: 6000,
};

const clampLevel = (lv: string): Level => {
  const up = String(lv || "").toUpperCase();
  return (LEVELS.find((x) => x === up) as Level) || "A1";
};

export default function VocabularyTestResult() {
  const navigate = useNavigate();
  const [result, setResult] = useState<ResultPayload | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        const cached = sessionStorage.getItem("vocabulary_test_result");
        if (cached) {
          const parsed = JSON.parse(cached);
          if (mounted) setResult(parsed);
          return;
        }

        const res = await getVocabResult();
        if (res.code === 200) {
          // /vocab/result 返回 { record, recommendedBooks }
          const r = res.data?.record;
          const books = res.data?.recommendedBooks || [];
          if (r) {
            const mapped: ResultPayload = {
              level: r.estimatedLevel,
              estimatedVocab: r.estimatedVocab,
              correctCount: r.correctCount,
              totalCount: r.questionCount,
              recommendedBooks: books,
            };
            if (mounted) setResult(mapped);
          }
        }
      } catch (e) {
        console.error(e);
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  const accuracy = useMemo(() => {
    if (!result || !result.totalCount) return 0;
    return Math.round((result.correctCount / result.totalCount) * 100);
  }, [result]);

  const summary = useMemo(() => {
    if (!result) return null;
    const lv = clampLevel(result.level);
    const approxByLevel = VOCAB_MAP[lv];
    let bestLevel: string | null = null;
    let bestScore = -1;
    if (result.levelStats) {
      for (const [k, v] of Object.entries(result.levelStats)) {
        const score = v.weightedRate ?? v.correctRate ?? 0;
        if (score > bestScore) {
          bestScore = score;
          bestLevel = k;
        }
      }
    }
    return {
      level: lv,
      approxByLevel,
      bestLevel,
      bestScorePct: bestScore < 0 ? null : Math.round(bestScore * 100),
    };
  }, [result]);

  return (
    <div className="min-h-screen bg-[#F7F9FC] pb-20">
      {/* 顶部导航 */}
      <div className="fixed top-0 left-0 right-0 z-50 bg-white border-b border-[#E2E8F0]">
        <div className="flex items-center h-14 px-4">
          <button onClick={() => navigate(-1)} className="mr-4">
            <ChevronLeft size={24} className="text-[#2D3748]" />
          </button>
          <h1 className="text-lg font-semibold text-[#2D3748]">测试结果</h1>
        </div>
      </div>

      <div className="pt-16 px-4">
        {loading ? (
          <div className="max-w-md mx-auto text-center text-[#718096] py-16">
            结果加载中...
          </div>
        ) : !result ? (
          <div className="max-w-md mx-auto bg-white rounded-2xl p-8 text-center shadow-sm border border-[#E2E8F0]">
            <div className="text-[#2D3748] font-semibold text-lg">暂无测试结果</div>
            <div className="text-[#718096] text-sm mt-2">去开始一次词汇量测试吧</div>
            <button
              onClick={() => navigate("/vocabulary-test", { replace: true })}
              className="mt-6 w-full py-3 bg-[#4ECDC4] text-white rounded-full font-medium"
            >
              开始测试
            </button>
          </div>
        ) : (
          <div className="max-w-md mx-auto space-y-4">
            {/* 主结论卡 */}
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-[#E2E8F0]">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-sm text-[#718096]">测评等级</div>
                  <div className="text-3xl font-bold text-[#2D3748] mt-1">{result.level}</div>
                </div>
                <div className="w-12 h-12 rounded-2xl bg-[#4ECDC4]/10 flex items-center justify-center">
                  <TrendingUp className="w-6 h-6 text-[#4ECDC4]" />
                </div>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-3">
                <div className="rounded-xl bg-[#F7F9FC] p-3">
                  <div className="text-xs text-[#718096]">估算词汇量</div>
                  <div className="text-lg font-semibold text-[#2D3748] mt-1">{result.estimatedVocab}</div>
                </div>
                <div className="rounded-xl bg-[#F7F9FC] p-3">
                  <div className="text-xs text-[#718096]">正确</div>
                  <div className="text-lg font-semibold text-[#2D3748] mt-1">{result.correctCount}</div>
                </div>
                <div className="rounded-xl bg-[#F7F9FC] p-3">
                  <div className="text-xs text-[#718096]">正确率</div>
                  <div className="text-lg font-semibold text-[#2D3748] mt-1">{accuracy}%</div>
                </div>
              </div>
            </div>

            {/* 词汇量金字塔 */}
            {summary && (
              <div className="bg-white rounded-2xl p-6 shadow-sm border border-[#E2E8F0]">
                <div className="text-base font-semibold text-[#2D3748]">词汇量金字塔</div>
                <div className="text-sm text-[#718096] mt-1">按 CEFR 等级分层，当前测评等级已高亮</div>

                <div className="mt-5 flex flex-col items-center gap-2">
                  {[...LEVELS].reverse().map((lv, idx) => {
                    const isActive = lv === summary.level;
                    const widthPct = 55 + idx * 10;
                    const vocabHint = VOCAB_MAP[lv];
                    return (
                      <div
                        key={lv}
                        className={`rounded-xl px-4 py-3 border w-full transition-colors ${
                          isActive
                            ? "bg-[#4ECDC4]/10 border-[#4ECDC4]"
                            : "bg-[#F7F9FC] border-[#E2E8F0]"
                        }`}
                        style={{ maxWidth: `${widthPct}%` }}
                      >
                        <div className="flex items-center justify-between">
                          <div className={`text-sm font-semibold ${isActive ? "text-[#2D3748]" : "text-[#2D3748]"}`}>{lv}</div>
                          <div className="text-xs text-[#718096]">约 {vocabHint}+</div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="mt-4 rounded-xl bg-[#F7F9FC] p-4">
                  <div className="text-sm font-semibold text-[#2D3748]">本次自测总结</div>
                  <div className="text-sm text-[#718096] mt-2 leading-relaxed">
                    你的当前等级为 <span className="text-[#2D3748] font-semibold">{summary.level}</span>，
                    对应的常见词汇量区间大约在 <span className="text-[#2D3748] font-semibold">{summary.approxByLevel}+</span>。
                    {summary.bestLevel ? (
                      <>
                        你在 <span className="text-[#2D3748] font-semibold">{summary.bestLevel}</span> 段表现最好（约
                        <span className="text-[#2D3748] font-semibold"> {summary.bestScorePct}%</span>）。
                      </>
                    ) : null}
                  </div>
                  <div className="text-xs text-[#A0AEC0] mt-2">提示：选择“不认识”会计为错误，用于快速收敛你的真实水平。</div>
                </div>
              </div>
            )}

            {/* 分项统计（如有） */}
            {result.levelStats && Object.keys(result.levelStats).length > 0 && (
              <div className="bg-white rounded-2xl p-6 shadow-sm border border-[#E2E8F0]">
                <div className="text-base font-semibold text-[#2D3748]">分等级表现</div>
                <div className="mt-4 space-y-3">
                  {Object.entries(result.levelStats)
                    .sort((a, b) => a[0].localeCompare(b[0]))
                    .map(([lv, s]) => {
                      const rate = Math.round((s.correctRate || 0) * 100);
                      const wRate = s.weightedRate === undefined ? null : Math.round((s.weightedRate || 0) * 100);
                      return (
                        <div key={lv} className="rounded-xl bg-[#F7F9FC] p-3">
                          <div className="flex items-center justify-between">
                            <div className="text-sm font-semibold text-[#2D3748]">{lv}</div>
                            <div className="text-xs text-[#718096]">
                              {s.correct}/{s.total}（{rate}%{wRate !== null ? ` / 加权 ${wRate}%` : ""}）
                            </div>
                          </div>
                          <div className="mt-2 h-2 bg-white rounded-full overflow-hidden border border-[#E2E8F0]">
                            <div className="h-full bg-[#4ECDC4]" style={{ width: `${Math.min(100, Math.max(0, rate))}%` }} />
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}

            {/* 推荐词库 */}
            {result.recommendedBooks && result.recommendedBooks.length > 0 && (
              <div className="bg-white rounded-2xl p-6 shadow-sm border border-[#E2E8F0]">
                <div className="flex items-center justify-between">
                  <div className="text-base font-semibold text-[#2D3748]">推荐词库</div>
                  <BookOpen className="w-5 h-5 text-[#4ECDC4]" />
                </div>
                <div className="mt-4 space-y-3">
                  {result.recommendedBooks.slice(0, 6).map((b) => (
                    <div key={b.id} className="rounded-xl border border-[#E2E8F0] bg-[#F7F9FC] p-3">
                      <div className="text-sm font-semibold text-[#2D3748] truncate">{b.name}</div>
                      <div className="text-xs text-[#718096] mt-1 line-clamp-2">{b.description || ""}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 操作 */}
            <div className="flex gap-3">
              <button
                onClick={() => {
                  sessionStorage.removeItem("vocabulary_test_result");
                  navigate("/vocabulary-test/testing?mode=adaptive", { replace: true });
                }}
                className="flex-1 py-3 rounded-full bg-[#4ECDC4] text-white font-medium shadow-sm"
              >
                重新测试
              </button>
              <button
                onClick={() => navigate("/", { replace: true })}
                className="flex-1 py-3 rounded-full border border-[#E2E8F0] bg-white text-[#2D3748] font-medium"
              >
                返回首页
              </button>
            </div>

            <button
              onClick={() => window.location.reload()}
              className="w-full py-3 rounded-full border border-[#E2E8F0] bg-white text-[#2D3748] font-medium flex items-center justify-center gap-2"
            >
              <RefreshCw className="w-4 h-4" /> 刷新结果
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
