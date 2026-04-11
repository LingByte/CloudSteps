import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router";
import { Calendar, ChevronLeft, CheckCircle2, Search, TrendingUp, BookOpen, GraduationCap, Dumbbell } from "lucide-react";
import { CloudButton } from "@/components/cloudsteps";
import {
  getStudentCoachingSessionAsTeacher,
  getStudentStudySessionAsTeacher,
  getStudentVocabRecordAsTeacher,
  getTeacherCoachingQuotas,
  listStudentActivityRecordsAsTeacher,
  type CoachingSessionRecordDTO,
  type StudentActivityListItem,
  type StudentActivityKind,
  type StudySessionDTO,
  type VocabTestRecordDTO,
} from "@/api/coaching";

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

function studentLabelFromRow(r: { studentId: number; student?: { displayName?: string; username?: string; email?: string } }) {
  const s = r.student;
  return s?.displayName || s?.username || s?.email || `学员 #${r.studentId}`;
}

function kindBadge(kind: StudentActivityKind) {
  switch (kind) {
    case "coaching_session":
      return { label: "陪练完课", className: "bg-[#4ECDC4]/15 text-[#2C7A7B]", Icon: GraduationCap };
    case "vocab_test":
      return { label: "词汇测评", className: "bg-[#55A3FF]/15 text-[#2B6CB0]", Icon: BookOpen };
    case "study_session":
      return { label: "单词训练", className: "bg-[#9F7AEA]/15 text-[#6B46C1]", Icon: Dumbbell };
    default:
      return { label: kind, className: "bg-[#F7F9FC] text-[#718096]", Icon: CheckCircle2 };
  }
}

export default function StudentTrainingRecords() {
  const navigate = useNavigate();
  const { studentId: studentIdParam } = useParams<{ studentId: string }>();
  const location = useLocation();
  const studentId = Number(studentIdParam);

  const [studentTitle, setStudentTitle] = useState("");
  const [searchKeyword, setSearchKeyword] = useState("");
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [allItems, setAllItems] = useState<StudentActivityListItem[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailKind, setDetailKind] = useState<StudentActivityKind | null>(null);
  const [detailVocab, setDetailVocab] = useState<VocabTestRecordDTO | null>(null);
  const [detailCoaching, setDetailCoaching] = useState<CoachingSessionRecordDTO | null>(null);
  const [detailStudy, setDetailStudy] = useState<StudySessionDTO | null>(null);
  const [detailWordBookName, setDetailWordBookName] = useState("");

  useEffect(() => {
    if (!Number.isFinite(studentId) || studentId <= 0) return;
    const fromNav = (location.state as { studentName?: string } | null)?.studentName;
    if (fromNav) {
      setStudentTitle(fromNav);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await getTeacherCoachingQuotas();
        if (cancelled || res.code !== 200 || !Array.isArray(res.data)) return;
        const row = res.data.find((r) => r.studentId === studentId);
        if (row) setStudentTitle(studentLabelFromRow(row));
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [studentId, location.key, location.state]);

  const loadAll = async () => {
    if (!Number.isFinite(studentId) || studentId <= 0) throw new Error("学员无效");
    const res = await listStudentActivityRecordsAsTeacher(studentId);
    if (res.code !== 200) throw new Error(res.msg || "获取记录失败");
    const list = Array.isArray(res.data?.list) ? res.data!.list : [];
    setAllItems(list);
    setPage(1);
  };

  useEffect(() => {
    if (!Number.isFinite(studentId) || studentId <= 0) {
      setErrorMsg("无效的学员");
      setLoading(false);
      return;
    }
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        setErrorMsg(null);
        await loadAll();
      } catch (e: unknown) {
        if (!mounted) return;
        const msg = e && typeof e === "object" && "msg" in e ? String((e as { msg: string }).msg) : "加载失败";
        setErrorMsg(msg);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId]);

  const filteredData = useMemo(() => {
    const kw = searchKeyword.trim().toLowerCase();
    return allItems.filter((item) => {
      const dateStr = String(item.time || "").slice(0, 10);
      if (selectedMonth) {
        const monthStr = dateStr.slice(0, 7);
        if (monthStr !== selectedMonth) return false;
      }
      if (!kw) return true;
      return (
        item.title.toLowerCase().includes(kw) ||
        item.summary.toLowerCase().includes(kw) ||
        item.kind.toLowerCase().includes(kw) ||
        String(item.id).includes(kw)
      );
    });
  }, [allItems, searchKeyword, selectedMonth]);

  const pagedData = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredData.slice(start, start + pageSize);
  }, [filteredData, page, pageSize]);

  const kindCounts = useMemo(() => {
    let c = 0,
      v = 0,
      s = 0;
    for (const item of filteredData) {
      if (item.kind === "coaching_session") c++;
      else if (item.kind === "vocab_test") v++;
      else if (item.kind === "study_session") s++;
    }
    return { coaching: c, vocab: v, study: s };
  }, [filteredData]);

  const avgVocabCorrectRate = useMemo(() => {
    const vocabItems = filteredData.filter((x) => x.kind === "vocab_test");
    if (vocabItems.length === 0) return "0";
    const sum = vocabItems.reduce((acc, item) => {
      const vt = item.vocabTest;
      const totalQ = Number(vt?.questionCount || 0);
      const correctQ = Number(vt?.correctCount || 0);
      if (totalQ <= 0) return acc;
      return acc + (correctQ / totalQ) * 100;
    }, 0);
    return String(Math.round(sum / vocabItems.length));
  }, [filteredData]);

  const totalVocabQuestions = useMemo(() => {
    return filteredData
      .filter((x) => x.kind === "vocab_test")
      .reduce((sum, item) => sum + Number(item.vocabTest?.questionCount || 0), 0);
  }, [filteredData]);

  const totalPages = Math.max(1, Math.ceil(filteredData.length / pageSize));

  const displayName = studentTitle || `学员 #${studentId}`;

  const openDetail = async (item: StudentActivityListItem) => {
    setDetailOpen(true);
    setDetailLoading(true);
    setDetailKind(item.kind);
    setDetailVocab(null);
    setDetailCoaching(null);
    setDetailStudy(null);
    setDetailWordBookName("");
    try {
      if (item.kind === "vocab_test") {
        const res = await getStudentVocabRecordAsTeacher(studentId, item.id);
        if (res.code !== 200) throw new Error(res.msg || "加载失败");
        setDetailVocab(res.data as VocabTestRecordDTO);
      } else if (item.kind === "coaching_session") {
        const res = await getStudentCoachingSessionAsTeacher(studentId, item.id);
        if (res.code !== 200) throw new Error(res.msg || "加载失败");
        setDetailCoaching(res.data as CoachingSessionRecordDTO);
      } else if (item.kind === "study_session") {
        const res = await getStudentStudySessionAsTeacher(studentId, item.id);
        if (res.code !== 200) throw new Error(res.msg || "加载失败");
        setDetailStudy(res.data.session);
        setDetailWordBookName(res.data.wordBookName || "");
      }
    } catch (e) {
      console.error(e);
    } finally {
      setDetailLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <CloudButton
          type="button"
          onClick={() => navigate("/my-students")}
          className="inline-flex items-center gap-1 px-3 py-2 rounded-full text-sm border border-[#E2E8F0] text-[#4A5568] bg-white"
        >
          <ChevronLeft size={18} />
          学员管理
        </CloudButton>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-5">
        <h1 className="text-lg font-semibold text-[#2D3748]">学习活动记录</h1>
        <p className="text-sm text-[#718096] mt-1">
          学员：<span className="text-[#2D3748] font-medium">{displayName}</span>
          <span className="block text-xs mt-1">
            含陪练完课、词汇量测评、单词训练会话；可按月份筛选后在本页分页查看
          </span>
        </p>
      </div>

      {errorMsg && (
        <div className="bg-white rounded-xl p-4 border border-[#FF6B6B]/30 text-[#FF6B6B]">{errorMsg}</div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl p-6 border border-[#E2E8F0]">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[#718096] text-sm mb-2">筛选后条数</div>
              <div className="text-[#2D3748] text-2xl font-bold">{loading ? "-" : filteredData.length}</div>
              <div className="text-xs text-[#A0AEC0] mt-2">
                陪练 {kindCounts.coaching} · 测评 {kindCounts.vocab} · 训练 {kindCounts.study}
              </div>
            </div>
            <div className="w-12 h-12 bg-[#4ECDC4]/10 rounded-lg flex items-center justify-center">
              <CheckCircle2 className="text-[#4ECDC4]" size={24} />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-6 border border-[#E2E8F0]">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[#718096] text-sm mb-2">词汇测评平均正确率</div>
              <div className="text-[#55A3FF] text-2xl font-bold">
                {loading || kindCounts.vocab === 0 ? "-" : `${avgVocabCorrectRate}%`}
              </div>
            </div>
            <div className="w-12 h-12 bg-[#55A3FF]/10 rounded-lg flex items-center justify-center">
              <TrendingUp className="text-[#55A3FF]" size={24} />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-6 border border-[#E2E8F0]">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[#718096] text-sm mb-2">词汇测评总题数（筛选内）</div>
              <div className="text-[#4ECDC4] text-2xl font-bold">
                {loading || kindCounts.vocab === 0 ? "-" : totalVocabQuestions}
              </div>
            </div>
            <div className="w-12 h-12 bg-[#4ECDC4]/10 rounded-lg flex items-center justify-center">
              <BookOpen className="text-[#4ECDC4]" size={24} />
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl p-4 border border-[#E2E8F0] space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="relative">
            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-[#A0AEC0]" size={20} />
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => {
                setSelectedMonth(e.target.value);
                setPage(1);
              }}
              className="w-full pl-10 pr-4 py-2 bg-[#F7F9FC] border border-[#E2E8F0] rounded-lg text-[#2D3748] focus:outline-none focus:border-[#4ECDC4]"
            />
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#A0AEC0]" size={20} />
            <input
              type="text"
              placeholder="搜索标题、摘要、类型、记录 ID"
              value={searchKeyword}
              onChange={(e) => {
                setSearchKeyword(e.target.value);
                setPage(1);
              }}
              className="w-full pl-10 pr-4 py-2 bg-[#F7F9FC] border border-[#E2E8F0] rounded-lg text-[#2D3748] placeholder:text-[#A0AEC0] focus:outline-none focus:border-[#4ECDC4]"
            />
          </div>
        </div>
      </div>

      <div className="space-y-4">
        {loading ? (
          <div className="bg-white rounded-xl p-6 text-[#718096] border border-[#E2E8F0]">加载中…</div>
        ) : pagedData.length === 0 ? (
          <div className="bg-white rounded-xl p-6 text-[#718096] border border-[#E2E8F0]">暂无记录</div>
        ) : (
          pagedData.map((item) => {
            const badge = kindBadge(item.kind);
            const Icon = badge.Icon;
            const timeText = formatDateTime(item.time);
            return (
              <button
                type="button"
                key={`${item.kind}-${item.id}`}
                onClick={() => void openDetail(item)}
                className="w-full text-left bg-white rounded-xl p-6 hover:shadow-md transition-shadow border border-[#E2E8F0]"
              >
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <span
                        className={`inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full ${badge.className}`}
                      >
                        <Icon size={14} />
                        {badge.label}
                      </span>
                      <span className="text-xs text-[#A0AEC0] font-mono">#{item.id}</span>
                    </div>
                    <h3 className="text-[#2D3748] font-semibold text-base">{item.title}</h3>
                    <p className="text-sm text-[#718096] mt-1">{item.summary}</p>
                    <p className="text-xs text-[#A0AEC0] mt-2">{timeText}</p>
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>

      <div className="flex items-center justify-between bg-white rounded-xl p-4 border border-[#E2E8F0]">
        <div className="text-sm text-[#718096]">
          第 {page}/{totalPages} 页（每页 {pageSize} 条），筛选后共 {filteredData.length} 条
        </div>
        <div className="flex gap-2">
          <CloudButton
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={loading || page <= 1}
            className="px-4 py-2 rounded-lg border border-[#E2E8F0] bg-white text-[#2D3748] disabled:opacity-50"
          >
            上一页
          </CloudButton>
          <CloudButton
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={loading || page >= totalPages}
            className="px-4 py-2 rounded-lg border border-[#E2E8F0] bg-white text-[#2D3748] disabled:opacity-50"
          >
            下一页
          </CloudButton>
        </div>
      </div>

      {detailOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="w-full max-w-2xl bg-white rounded-2xl shadow-xl border border-[#E2E8F0] overflow-hidden max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#E2E8F0] shrink-0">
              <div className="text-[#2D3748] font-semibold">记录详情</div>
              <button
                type="button"
                onClick={() => {
                  setDetailOpen(false);
                  setDetailKind(null);
                  setDetailVocab(null);
                  setDetailCoaching(null);
                  setDetailStudy(null);
                }}
                className="text-[#718096] hover:text-[#2D3748]"
              >
                关闭
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1">
              {detailLoading ? (
                <div className="text-[#718096]">加载中…</div>
              ) : detailKind === "vocab_test" && detailVocab ? (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-xl bg-[#F7F9FC] p-3">
                      <div className="text-xs text-[#718096]">记录 ID</div>
                      <div className="text-sm font-semibold text-[#2D3748] mt-1">#{detailVocab.id}</div>
                    </div>
                    <div className="rounded-xl bg-[#F7F9FC] p-3">
                      <div className="text-xs text-[#718096]">完成时间</div>
                      <div className="text-sm font-semibold text-[#2D3748] mt-1">
                        {formatDateTime(detailVocab.completedAt || detailVocab.createdAt)}
                      </div>
                    </div>
                    <div className="rounded-xl bg-[#F7F9FC] p-3">
                      <div className="text-xs text-[#718096]">测评等级</div>
                      <div className="text-sm font-semibold text-[#2D3748] mt-1">{detailVocab.estimatedLevel}</div>
                    </div>
                    <div className="rounded-xl bg-[#F7F9FC] p-3">
                      <div className="text-xs text-[#718096]">估算词汇量</div>
                      <div className="text-sm font-semibold text-[#2D3748] mt-1">{detailVocab.estimatedVocab}</div>
                    </div>
                  </div>
                  <div className="mt-4 rounded-2xl border border-[#E2E8F0] overflow-hidden">
                    <div className="px-4 py-3 bg-white border-b border-[#E2E8F0] text-sm font-semibold text-[#2D3748]">
                      答题明细
                    </div>
                    <div className="divide-y divide-[#E2E8F0]">
                      {safeParseAnswers(detailVocab.answers).length === 0 ? (
                        <div className="px-4 py-4 text-sm text-[#718096]">暂无答题明细</div>
                      ) : (
                        safeParseAnswers(detailVocab.answers).map((a, idx) => (
                          <div key={`${a.questionId}-${idx}`} className="px-4 py-3 flex items-center justify-between">
                            <div className="text-sm text-[#2D3748]">
                              #{idx + 1} 题（{a.level}）
                            </div>
                            <div
                              className={`text-sm font-semibold ${a.correct ? "text-[#4ECDC4]" : "text-[#FF6B6B]"}`}
                            >
                              {a.correct ? "正确" : "错误"}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </>
              ) : detailKind === "coaching_session" && detailCoaching ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-xl bg-[#F7F9FC] p-3">
                      <div className="text-xs text-[#718096]">完课记录 ID</div>
                      <div className="text-sm font-semibold text-[#2D3748] mt-1">#{detailCoaching.id}</div>
                    </div>
                    <div className="rounded-xl bg-[#F7F9FC] p-3">
                      <div className="text-xs text-[#718096]">排课 ID</div>
                      <div className="text-sm font-semibold text-[#2D3748] mt-1">#{detailCoaching.appointmentId}</div>
                    </div>
                    <div className="rounded-xl bg-[#F7F9FC] p-3 col-span-2">
                      <div className="text-xs text-[#718096]">上课时间</div>
                      <div className="text-sm font-semibold text-[#2D3748] mt-1">
                        {formatDateTime(detailCoaching.startedAt)} — {formatDateTime(detailCoaching.endedAt)}
                      </div>
                    </div>
                    <div className="rounded-xl bg-[#F7F9FC] p-3">
                      <div className="text-xs text-[#718096]">实际分钟</div>
                      <div className="text-sm font-semibold text-[#2D3748] mt-1">{detailCoaching.actualMinutes}</div>
                    </div>
                    <div className="rounded-xl bg-[#F7F9FC] p-3">
                      <div className="text-xs text-[#718096]">学员扣减</div>
                      <div className="text-sm font-semibold text-[#2D3748] mt-1">{detailCoaching.billedMinutes} 分钟</div>
                    </div>
                    <div className="rounded-xl bg-[#F7F9FC] p-3">
                      <div className="text-xs text-[#718096]">计入老师</div>
                      <div className="text-sm font-semibold text-[#2D3748] mt-1">
                        {detailCoaching.teacherCreditedMinutes} 分钟
                      </div>
                    </div>
                    <div className="rounded-xl bg-[#F7F9FC] p-3">
                      <div className="text-xs text-[#718096]">状态</div>
                      <div className="text-sm font-semibold text-[#2D3748] mt-1">{detailCoaching.status}</div>
                    </div>
                  </div>
                  {detailCoaching.appointment && (
                    <div className="rounded-xl border border-[#E2E8F0] p-4 text-sm">
                      <div className="font-semibold text-[#2D3748] mb-2">关联排课</div>
                      <div className="text-[#718096]">
                        {detailCoaching.appointment.title || "（无标题）"} ·{" "}
                        {String(detailCoaching.appointment.scheduledDate || "").slice(0, 10)}{" "}
                        {detailCoaching.appointment.startTime}–{detailCoaching.appointment.endTime}
                      </div>
                    </div>
                  )}
                </div>
              ) : detailKind === "study_session" && detailStudy ? (
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl bg-[#F7F9FC] p-3">
                    <div className="text-xs text-[#718096]">会话 ID</div>
                    <div className="text-sm font-semibold text-[#2D3748] mt-1">#{detailStudy.id}</div>
                  </div>
                  <div className="rounded-xl bg-[#F7F9FC] p-3">
                    <div className="text-xs text-[#718096]">词库</div>
                    <div className="text-sm font-semibold text-[#2D3748] mt-1">
                      {detailWordBookName || `词库 #${detailStudy.wordBookId}`}
                    </div>
                  </div>
                  <div className="rounded-xl bg-[#F7F9FC] p-3">
                    <div className="text-xs text-[#718096]">类型</div>
                    <div className="text-sm font-semibold text-[#2D3748] mt-1">{detailStudy.sessionType}</div>
                  </div>
                  <div className="rounded-xl bg-[#F7F9FC] p-3">
                    <div className="text-xs text-[#718096]">状态</div>
                    <div className="text-sm font-semibold text-[#2D3748] mt-1">{detailStudy.status}</div>
                  </div>
                  <div className="rounded-xl bg-[#F7F9FC] p-3 col-span-2">
                    <div className="text-xs text-[#718096]">时间</div>
                    <div className="text-sm font-semibold text-[#2D3748] mt-1">
                      开始 {formatDateTime(detailStudy.startedAt)}
                      {detailStudy.completedAt ? ` · 结束 ${formatDateTime(detailStudy.completedAt)}` : ""}
                    </div>
                  </div>
                  <div className="rounded-xl bg-[#F7F9FC] p-3">
                    <div className="text-xs text-[#718096]">词数</div>
                    <div className="text-sm font-semibold text-[#2D3748] mt-1">{detailStudy.wordCount}</div>
                  </div>
                  <div className="rounded-xl bg-[#F7F9FC] p-3">
                    <div className="text-xs text-[#718096]">答对</div>
                    <div className="text-sm font-semibold text-[#2D3748] mt-1">{detailStudy.correctCount}</div>
                  </div>
                </div>
              ) : (
                <div className="text-[#718096]">暂无数据</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
