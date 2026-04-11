import { Users, RefreshCw, ChevronLeft, ClipboardList } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { CloudButton } from "@/components/cloudsteps";
import { getTeacherCoachingQuotas, type TeacherCoachingQuotaRow } from "@/api/coaching";

function studentLabel(row: TeacherCoachingQuotaRow) {
  const s = row.student;
  return s?.displayName || s?.username || s?.email || `学员 #${row.studentId}`;
}

function fmtShort(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export default function MyStudents() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<TeacherCoachingQuotaRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getTeacherCoachingQuotas();
      if (res.code !== 200) {
        alert(res.msg || "加载失败");
        setRows([]);
        return;
      }
      setRows(Array.isArray(res.data) ? res.data : []);
    } catch (e: unknown) {
      const msg =
        e && typeof e === "object" && "msg" in e ? String((e as { msg: string }).msg) : "加载失败";
      alert(msg);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <CloudButton
          type="button"
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-1 px-3 py-2 rounded-full text-sm border border-[#E2E8F0] text-[#4A5568] bg-white"
        >
          <ChevronLeft size={18} />
          返回
        </CloudButton>
        <CloudButton
          type="button"
          onClick={() => void load()}
          className="inline-flex items-center gap-1 px-3 py-2 rounded-full text-sm border border-[#E2E8F0] text-[#4A5568] bg-white"
        >
          <RefreshCw size={16} />
          刷新
        </CloudButton>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-5">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-[#55A3FF]/10 rounded-xl flex items-center justify-center">
            <Users className="text-[#55A3FF]" size={24} />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-[#2D3748]">学员管理</h1>
            <p className="text-xs text-[#718096] mt-0.5">
              名下学员档案与额度；点击「活动记录」查看陪练完课、词汇测评与单词训练时间线
            </p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-[#E2E8F0] overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-[#718096]">加载中…</div>
        ) : rows.length === 0 ? (
          <div className="p-8 text-center text-[#718096]">暂无学员额度记录</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[720px]">
              <thead>
                <tr className="border-b border-[#E2E8F0] text-left text-[#718096]">
                  <th className="p-3 font-medium">学员</th>
                  <th className="p-3 font-medium whitespace-nowrap">用户名 / ID</th>
                  <th className="p-3 font-medium whitespace-nowrap">手机</th>
                  <th className="p-3 font-medium whitespace-nowrap text-right">剩余分钟</th>
                  <th className="p-3 font-medium whitespace-nowrap text-right">累计分配</th>
                  <th className="p-3 font-medium whitespace-nowrap text-right min-w-[100px]">活动次数</th>
                  <th className="p-3 font-medium min-w-[140px]">最近测评</th>
                  <th className="p-3 font-medium w-28">操作</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-[#F1F5F9] last:border-0 align-top">
                    <td className="p-3">
                      <div className="text-[#2D3748] font-medium">{studentLabel(r)}</div>
                      {r.student?.city || r.student?.region ? (
                        <div className="text-xs text-[#A0AEC0] mt-0.5">
                          {[r.student?.region, r.student?.city].filter(Boolean).join(" · ")}
                        </div>
                      ) : null}
                    </td>
                    <td className="p-3 text-[#4A5568]">
                      <div className="font-mono text-xs">{r.student?.username || "—"}</div>
                      <div className="text-xs text-[#A0AEC0] mt-0.5">#{r.studentId}</div>
                    </td>
                    <td className="p-3 text-[#4A5568] whitespace-nowrap">{r.student?.phone || "—"}</td>
                    <td className="p-3 text-right tabular-nums font-medium text-[#2D3748]">
                      {r.remainingMinutes}
                    </td>
                    <td className="p-3 text-right tabular-nums text-[#718096]">
                      {r.totalAllocatedMinutes ?? "—"}
                    </td>
                    <td className="p-3 text-right text-[#718096] text-xs leading-relaxed">
                      <div>测评 {r.vocabTestCount ?? 0}</div>
                      <div>陪练 {r.coachingSessionCount ?? 0}</div>
                      <div>训练 {r.studySessionCount ?? 0}</div>
                    </td>
                    <td className="p-3 text-[#718096] text-xs">
                      {r.latestVocabTestAt || r.latestVocabLevel || r.latestEstimatedVocab ? (
                        <>
                          <div>{fmtShort(r.latestVocabTestAt)}</div>
                          <div className="text-[#2D3748] mt-0.5">
                            {r.latestVocabLevel || "—"} · 估 {r.latestEstimatedVocab ?? "—"}
                          </div>
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="p-3">
                      <CloudButton
                        type="button"
                        onClick={() =>
                          navigate(`/my-students/${r.studentId}/training`, {
                            state: { studentName: studentLabel(r) },
                          })
                        }
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs bg-[#55A3FF] text-white"
                      >
                        <ClipboardList size={14} />
                        活动记录
                      </CloudButton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
