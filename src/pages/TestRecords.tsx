import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { ChevronLeft, Search, Calendar, TrendingUp, CheckCircle2 } from "lucide-react";

import { getVocabRecordDetail, listVocabRecords } from "@/api/vocab";

type VocabTestRecord = {
  id: number;
  createdAt: string;
  completedAt?: string | null;
  estimatedLevel: string;
  estimatedVocab: number;
  questionCount: number;
  correctCount: number;
  answers?: string;
};

type AnswerDetail = {
  questionId: number;
  answer: string;
  correct: boolean;
  level: string;
};

const formatDateTime = (iso?: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const safeParseAnswers = (s?: string) => {
  if (!s) return [] as AnswerDetail[];
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? (v as AnswerDetail[]) : [];
  } catch {
    return [] as AnswerDetail[];
  }
};

export default function TestRecords() {
  const navigate = useNavigate();
  const [searchKeyword, setSearchKeyword] = useState("");
  const [selectedMonth, setSelectedMonth] = useState("2026-03");

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [records, setRecords] = useState<VocabTestRecord[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [total, setTotal] = useState(0);

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detail, setDetail] = useState<VocabTestRecord | null>(null);

  const loadList = async (nextPage: number) => {
    const res = await listVocabRecords({ page: nextPage, pageSize });
    if (res.code !== 200) throw new Error(res.msg || "获取记录失败");
    const list = Array.isArray(res.data?.list) ? (res.data.list as VocabTestRecord[]) : [];
    setRecords(list);
    setTotal(Number(res.data?.total || 0));
    setPage(Number(res.data?.page || nextPage));
  };

  const loadDetail = async (id: number) => {
    const res = await getVocabRecordDetail(id);
    if (res.code !== 200) throw new Error(res.msg || "获取详情失败");
    setDetail(res.data as VocabTestRecord);
  };

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        setErrorMsg(null);
        await loadList(1);
      } catch (e: any) {
        if (!mounted) return;
        setErrorMsg(e?.msg || e?.message || "加载失败");
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredData = useMemo(() => {
    const kw = searchKeyword.trim();
    return records.filter((r) => {
      const dateStr = String(r.completedAt || r.createdAt || "").slice(0, 10);
      if (selectedMonth) {
        const monthStr = dateStr.slice(0, 7);
        if (monthStr !== selectedMonth) return false;
      }
      if (!kw) return true;
      return (
        String(r.estimatedLevel || "").toLowerCase().includes(kw.toLowerCase()) ||
        String(r.estimatedVocab || "").includes(kw) ||
        String(r.id || "").includes(kw)
      );
    });
  }, [records, searchKeyword, selectedMonth]);

  const avgCorrectRate = useMemo(() => {
    if (filteredData.length === 0) return "0";
    const sum = filteredData.reduce((acc, r) => {
      const totalQ = Number(r.questionCount || 0);
      const correctQ = Number(r.correctCount || 0);
      if (totalQ <= 0) return acc;
      return acc + (correctQ / totalQ) * 100;
    }, 0);
    return String(Math.round(sum / filteredData.length));
  }, [filteredData]);

  const totalQuestions = useMemo(() => {
    return filteredData.reduce((sum, r) => sum + Number(r.questionCount || 0), 0);
  }, [filteredData]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="min-h-screen bg-[#F7F9FC] pb-6">
      {/* 顶部导航 */}
      <div className="bg-white border-b border-[#E2E8F0] mb-6">
        <div className="flex items-center h-14 px-4">
          <button onClick={() => navigate(-1)} className="mr-4">
            <ChevronLeft size={24} className="text-[#2D3748]" />
          </button>
          <h1 className="text-lg font-semibold text-[#2D3748]">词汇测试记录</h1>
        </div>
      </div>

      <div className="max-w-[1200px] mx-auto px-4 space-y-6">
        {errorMsg && (
          <div className="bg-white rounded-xl p-4 border border-[#FF6B6B]/30 text-[#FF6B6B]">
            {errorMsg}
          </div>
        )}

        {/* 统计卡片 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white rounded-xl p-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[#718096] text-sm mb-2">测试总次数</div>
                <div className="text-[#2D3748] text-2xl font-bold">{loading ? "-" : filteredData.length}</div>
              </div>
              <div className="w-12 h-12 bg-[#4ECDC4]/10 rounded-lg flex items-center justify-center">
                <CheckCircle2 className="text-[#4ECDC4]" size={24} />
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl p-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[#718096] text-sm mb-2">平均正确率</div>
                <div className="text-[#55A3FF] text-2xl font-bold">{loading ? "-" : `${avgCorrectRate}%`}</div>
              </div>
              <div className="w-12 h-12 bg-[#55A3FF]/10 rounded-lg flex items-center justify-center">
                <TrendingUp className="text-[#55A3FF]" size={24} />
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl p-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[#718096] text-sm mb-2">总测试词数</div>
                <div className="text-[#4ECDC4] text-2xl font-bold">
                  {loading ? "-" : totalQuestions}
                </div>
              </div>
              <div className="w-12 h-12 bg-[#4ECDC4]/10 rounded-lg flex items-center justify-center">
                <CheckCircle2 className="text-[#4ECDC4]" size={24} />
              </div>
            </div>
          </div>
        </div>

        {/* 筛选栏 */}
        <div className="bg-white rounded-xl p-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* 月份 */}
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-[#A0AEC0]" size={20} />
              <input
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-[#F7F9FC] border border-[#E2E8F0] rounded-lg text-[#2D3748] focus:outline-none focus:border-[#4ECDC4]"
              />
            </div>
            {/* 搜索框 */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#A0AEC0]" size={20} />
              <input
                type="text"
                placeholder="搜索等级/词汇量/记录ID"
                value={searchKeyword}
                onChange={(e) => setSearchKeyword(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-[#F7F9FC] border border-[#E2E8F0] rounded-lg text-[#2D3748] placeholder:text-[#A0AEC0] focus:outline-none focus:border-[#4ECDC4]"
              />
            </div>
          </div>
        </div>

        {/* 测试记录列表 */}
        <div className="space-y-4">
          {loading ? (
            <div className="bg-white rounded-xl p-6 text-[#718096]">加载中...</div>
          ) : filteredData.length === 0 ? (
            <div className="bg-white rounded-xl p-6 text-[#718096]">暂无记录</div>
          ) : (
            filteredData.map((item) => {
              const totalQ = Number(item.questionCount || 0);
              const correctQ = Number(item.correctCount || 0);
              const wrongQ = Math.max(0, totalQ - correctQ);
              const rate = totalQ > 0 ? Math.round((correctQ / totalQ) * 100) : 0;
              const timeText = formatDateTime(item.completedAt || item.createdAt);
              return (
            <button
              type="button"
              key={item.id}
              onClick={async () => {
                try {
                  setDetailOpen(true);
                  setDetailLoading(true);
                  setDetail(null);
                  await loadDetail(item.id);
                } catch (e) {
                  console.error(e);
                } finally {
                  setDetailLoading(false);
                }
              }}
              className="w-full text-left bg-white rounded-xl p-6 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-[#2D3748] font-semibold text-lg">记录 #{item.id}</h3>
                    <span className="text-sm text-[#718096] bg-[#F7F9FC] px-3 py-1 rounded-full">
                      等级 {item.estimatedLevel || "-"}
                    </span>
                  </div>
                  <div className="text-sm text-[#718096]">{timeText}</div>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold text-[#4ECDC4] mb-1">{rate}%</div>
                  <div className="text-sm text-[#718096]">正确率</div>
                </div>
              </div>
              <div className="flex items-center gap-6 pt-4 border-t border-[#E2E8F0]">
                <div className="text-sm">
                  <span className="text-[#718096]">总词数：</span>
                  <span className="text-[#2D3748] font-medium">{totalQ}</span>
                </div>
                <div className="text-sm">
                  <span className="text-[#718096]">正确：</span>
                  <span className="text-[#4ECDC4] font-medium">{correctQ}</span>
                </div>
                <div className="text-sm">
                  <span className="text-[#718096]">错误：</span>
                  <span className="text-[#FF6B6B] font-medium">
                    {wrongQ}
                  </span>
                </div>
                <div className="text-sm">
                  <span className="text-[#718096]">估算词汇量：</span>
                  <span className="text-[#2D3748] font-medium">{item.estimatedVocab || 0}</span>
                </div>
              </div>
            </button>
              );
            })
          )}
        </div>

        {/* 分页 */}
        <div className="flex items-center justify-between bg-white rounded-xl p-4">
          <div className="text-sm text-[#718096]">
            第 {page}/{totalPages} 页，共 {total} 条
          </div>
          <div className="flex gap-2">
            <button
              onClick={async () => {
                const nextPage = Math.max(1, page - 1);
                if (nextPage === page) return;
                try {
                  setLoading(true);
                  await loadList(nextPage);
                } catch (e) {
                  console.error(e);
                } finally {
                  setLoading(false);
                }
              }}
              disabled={loading || page <= 1}
              className="px-4 py-2 rounded-lg border border-[#E2E8F0] bg-white text-[#2D3748] disabled:opacity-50"
            >
              上一页
            </button>
            <button
              onClick={async () => {
                const nextPage = Math.min(totalPages, page + 1);
                if (nextPage === page) return;
                try {
                  setLoading(true);
                  await loadList(nextPage);
                } catch (e) {
                  console.error(e);
                } finally {
                  setLoading(false);
                }
              }}
              disabled={loading || page >= totalPages}
              className="px-4 py-2 rounded-lg border border-[#E2E8F0] bg-white text-[#2D3748] disabled:opacity-50"
            >
              下一页
            </button>
          </div>
        </div>
      </div>

      {/* 详情弹窗 */}
      {detailOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="w-full max-w-2xl bg-white rounded-2xl shadow-xl border border-[#E2E8F0] overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#E2E8F0]">
              <div className="text-[#2D3748] font-semibold">记录详情</div>
              <button
                onClick={() => {
                  setDetailOpen(false);
                  setDetail(null);
                }}
                className="text-[#718096] hover:text-[#2D3748]"
              >
                关闭
              </button>
            </div>

            <div className="p-6 max-h-[70vh] overflow-auto">
              {detailLoading ? (
                <div className="text-[#718096]">加载中...</div>
              ) : !detail ? (
                <div className="text-[#718096]">暂无数据</div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-xl bg-[#F7F9FC] p-3">
                      <div className="text-xs text-[#718096]">记录ID</div>
                      <div className="text-sm font-semibold text-[#2D3748] mt-1">#{detail.id}</div>
                    </div>
                    <div className="rounded-xl bg-[#F7F9FC] p-3">
                      <div className="text-xs text-[#718096]">完成时间</div>
                      <div className="text-sm font-semibold text-[#2D3748] mt-1">{formatDateTime(detail.completedAt || detail.createdAt)}</div>
                    </div>
                    <div className="rounded-xl bg-[#F7F9FC] p-3">
                      <div className="text-xs text-[#718096]">测评等级</div>
                      <div className="text-sm font-semibold text-[#2D3748] mt-1">{detail.estimatedLevel}</div>
                    </div>
                    <div className="rounded-xl bg-[#F7F9FC] p-3">
                      <div className="text-xs text-[#718096]">估算词汇量</div>
                      <div className="text-sm font-semibold text-[#2D3748] mt-1">{detail.estimatedVocab}</div>
                    </div>
                  </div>

                  <div className="mt-4 rounded-2xl border border-[#E2E8F0] overflow-hidden">
                    <div className="px-4 py-3 bg-white border-b border-[#E2E8F0] text-sm font-semibold text-[#2D3748]">答题明细</div>
                    <div className="divide-y divide-[#E2E8F0]">
                      {safeParseAnswers(detail.answers).length === 0 ? (
                        <div className="px-4 py-4 text-sm text-[#718096]">暂无答题明细</div>
                      ) : (
                        safeParseAnswers(detail.answers).map((a, idx) => (
                          <div key={`${a.questionId}-${idx}`} className="px-4 py-3 flex items-center justify-between">
                            <div className="text-sm text-[#2D3748]">
                              #{idx + 1} 题（{a.level}）
                            </div>
                            <div className={`text-sm font-semibold ${a.correct ? "text-[#4ECDC4]" : "text-[#FF6B6B]"}`}>
                              {a.correct ? "正确" : "错误"}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
