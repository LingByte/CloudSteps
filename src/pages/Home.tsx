import { Calendar, Clock, FileText, User, Users, Timer } from "lucide-react";
import { useNavigate } from "react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CloudButton } from "@/components/cloudsteps";
import { useAuthStore } from "@/stores/authStore";
import {
  endCoachingAppointment,
  getCoachingTimeStats,
  getStudentCoachingWeek,
  getTeacherCoachingWeek,
  startCoachingAppointment,
  type CoachingTimeStats,
  type CoachingWeekSchedule,
} from "@/api/coaching";

const pad2 = (n: number) => String(n).padStart(2, "0");
const fmtYMD = (d: Date) =>
  `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** 该日期所在周的周一（本地时区） */
function weekMonday(d: Date) {
  const x = startOfDay(d);
  const wd = x.getDay();
  const fromMon = (wd + 6) % 7;
  x.setDate(x.getDate() - fromMon);
  return x;
}

function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function isCoachRole(role: string) {
  return role === "teacher" || role === "user";
}

export default function Home() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const [nowTs, setNowTs] = useState(() => Date.now());
  /** 用于周课表查询的锚点日期（该周内任意一天即可） */
  const [weekAnchor, setWeekAnchor] = useState(() => new Date());
  const [schedules, setSchedules] = useState<CoachingWeekSchedule[]>([]);
  const [loadingSchedules, setLoadingSchedules] = useState(false);
  const [timeStats, setTimeStats] = useState<CoachingTimeStats | null>(null);
  const [loadingTimeStats, setLoadingTimeStats] = useState(false);

  const role = (user as { role?: string } | null)?.role || "user";
  const isStudent = role === "student";
  const isCoach = role === "teacher" || role === "user";

  const loadTimeStats = useCallback(async () => {
    if (!user) return;
    
    setLoadingTimeStats(true);
    try {
      const res = await getCoachingTimeStats();
      if (res.code === 200 && res.data) {
        setTimeStats(res.data);
      }
    } catch (error) {
      console.error("加载时长统计失败:", error);
    } finally {
      setLoadingTimeStats(false);
    }
  }, [user]);

  const greetingText = useMemo(() => {
    const hour = new Date(nowTs).getHours();
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
  }, [nowTs]);

  const weekMon = useMemo(() => weekMonday(weekAnchor), [weekAnchor]);
  const weekSun = useMemo(() => addDays(weekMon, 6), [weekMon]);
  const weekRangeLabel = useMemo(
    () => `${fmtYMD(weekMon).replace(/-/g, ".")} – ${fmtYMD(weekSun).replace(/-/g, ".")}`,
    [weekMon, weekSun]
  );

  const loadWeek = useCallback(async () => {
    const ref = fmtYMD(weekAnchor);
    setLoadingSchedules(true);
    try {
      if (isStudent) {
        const res = await getStudentCoachingWeek(ref);
        setSchedules(Array.isArray(res.data?.schedules) ? res.data!.schedules : []);
      } else if (isCoach) {
        const res = await getTeacherCoachingWeek(ref);
        setSchedules(Array.isArray(res.data?.schedules) ? res.data!.schedules : []);
      } else {
        setSchedules([]);
      }
    } catch (e: unknown) {
      const msg = e && typeof e === "object" && "msg" in e ? String((e as { msg: string }).msg) : "加载课表失败";
      console.error(e);
      alert(msg);
      setSchedules([]);
    } finally {
      setLoadingSchedules(false);
    }
  }, [weekAnchor, isStudent, isCoach]);

  useEffect(() => {
    void loadWeek();
  }, [loadWeek]);

  useEffect(() => {
    void loadTimeStats();
  }, [loadTimeStats]);

  useEffect(() => {
    const t = window.setInterval(() => setNowTs(Date.now()), 60_000);
    return () => window.clearInterval(t);
  }, []);

  const onStart = async (id: number) => {
    try {
      const res = await startCoachingAppointment(id);
      if (res.code !== 200) {
        alert(res.msg || "无法开始");
        return;
      }
      void loadWeek();
      navigate("/material-selection");
    } catch (e: unknown) {
      const msg = e && typeof e === "object" && "msg" in e ? String((e as { msg: string }).msg) : "开始失败";
      alert(msg);
    }
  };

  const onEnd = async (id: number) => {
    try {
      const res = await endCoachingAppointment(id);
      if (res.code !== 200) {
        alert(res.msg || "无法下课");
        return;
      }
      void loadWeek();
    } catch (e: unknown) {
      const msg = e && typeof e === "object" && "msg" in e ? String((e as { msg: string }).msg) : "下课失败";
      alert(msg);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl border border-slate-200 p-5">
        <div className="text-xs text-slate-500">{greetingText}</div>
        <div className="text-lg font-semibold text-slate-900 mt-1">
          欢迎回来，{(user as { displayName?: string; username?: string })?.displayName || (user as { username?: string })?.username || "-"}
        </div>
      </div>

      {/* 陪练时长统计 */}
      {(isStudent || isCoach) && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 bg-[#4ECDC4]/10 rounded-lg flex items-center justify-center">
              <Timer className="text-[#4ECDC4]" size={16} />
            </div>
            <h3 className="text-base font-semibold text-slate-900">陪练时长统计</h3>
          </div>
          
          {loadingTimeStats ? (
            <div className="text-center text-slate-500 py-4">加载中...</div>
          ) : timeStats ? (
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-slate-50 rounded-lg p-4">
                <div className="text-2xl font-bold text-slate-900">
                  {timeStats.todayMinutes}分钟
                </div>
                <div className="text-sm text-slate-600 mt-1">今日陪练时长</div>
                <div className="text-xs text-slate-500 mt-2">{timeStats.todaySessions} 次陪练</div>
              </div>
              <div className="bg-slate-50 rounded-lg p-4">
                <div className="text-2xl font-bold text-slate-900">
                  {timeStats.totalMinutes}分钟
                </div>
                <div className="text-sm text-slate-600 mt-1">累积陪练时长</div>
                <div className="text-xs text-slate-500 mt-2">{timeStats.totalSessions} 次陪练</div>
              </div>
            </div>
          ) : (
            <div className="text-center text-slate-500 py-4">暂无数据</div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <button
          type="button"
          onClick={() => navigate("/vocabulary-test")}
          className="bg-white rounded-xl p-6 text-left hover:shadow-lg transition-shadow border border-slate-100"
        >
          <div className="w-12 h-12 mb-4">
            <div className="w-12 h-12 bg-[#4ECDC4]/10 rounded-lg flex items-center justify-center">
              <FileText className="text-[#4ECDC4]" size={24} />
            </div>
          </div>
          <div className="text-[#2D3748] text-sm md:text-base font-medium">词汇测试</div>
          <p className="text-xs text-[#718096] mt-2">进入测评流程</p>
        </button>

        {isCoach ? (
          <button
            type="button"
            onClick={() => navigate("/my-students")}
            className="bg-white rounded-xl p-6 text-left hover:shadow-lg transition-shadow border border-slate-100"
          >
            <div className="w-12 h-12 mb-4">
              <div className="w-12 h-12 bg-[#55A3FF]/10 rounded-lg flex items-center justify-center">
                <Users className="text-[#55A3FF]" size={24} />
              </div>
            </div>
            <div className="text-[#2D3748] text-sm md:text-base font-medium">学员管理</div>
            <p className="text-xs text-[#718096] mt-2">查看名下学员与陪练剩余时长</p>
          </button>
        ) : (
          <button
            type="button"
            onClick={() => navigate("/material-selection")}
            className="bg-white rounded-xl p-6 text-left hover:shadow-lg transition-shadow border border-slate-100"
          >
            <div className="w-12 h-12 mb-4">
              <div className="w-12 h-12 bg-[#55A3FF]/10 rounded-lg flex items-center justify-center">
                <FileText className="text-[#55A3FF]" size={24} />
              </div>
            </div>
            <div className="text-[#2D3748] text-sm md:text-base font-medium">单词训练</div>
            <p className="text-xs text-[#718096] mt-2">选择词库开始练习</p>
          </button>
        )}
      </div>

      {(isStudent || isCoach) && (
        <div>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
            <div>
              <h2 className="text-[18px] font-semibold text-[#2D3748]">陪练排课</h2>
              <p className="text-xs text-[#718096] mt-1">周范围：{weekRangeLabel}</p>
            </div>
            <div className="flex flex-wrap gap-2 shrink-0">
              <CloudButton
                type="button"
                className="px-3 py-1.5 rounded-full text-xs border border-[#E2E8F0] text-[#4A5568] bg-white"
                onClick={() => setWeekAnchor(addDays(weekAnchor, -7))}
              >
                上一周
              </CloudButton>
              <CloudButton
                type="button"
                className="px-3 py-1.5 rounded-full text-xs border border-[#E2E8F0] text-[#4A5568] bg-white"
                onClick={() => setWeekAnchor(new Date())}
              >
                本周
              </CloudButton>
              <CloudButton
                type="button"
                className="px-3 py-1.5 rounded-full text-xs border border-[#E2E8F0] text-[#4A5568] bg-white"
                onClick={() => setWeekAnchor(addDays(weekAnchor, 7))}
              >
                下一周
              </CloudButton>
            </div>
          </div>
          <div className="space-y-3">
            {loadingSchedules ? (
              <div className="bg-white rounded-xl p-6 text-center text-[#718096]">加载中…</div>
            ) : schedules.length === 0 ? (
              <div className="bg-white rounded-xl p-6 text-center text-[#718096]">暂无排课</div>
            ) : (
              schedules.map((s) => {
                const st = s.status;
                const canStart = isCoach && st === "scheduled";
                const canEnd = isCoach && st === "in_progress";
                return (
                  <div
                    key={s.id}
                    className="bg-white rounded-xl p-4 border border-[#E2E8F0] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
                  >
                    <div>
                      <div className="font-medium text-[#2D3748]">{s.title || `排课 #${s.id}`}</div>
                      <div className="flex flex-wrap gap-3 mt-2 text-sm text-[#718096]">
                        <span className="inline-flex items-center gap-1">
                          <Calendar size={14} /> {s.scheduledDate?.slice?.(0, 10) || s.scheduledDate}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Clock size={14} /> {s.startTime}–{s.endTime}
                        </span>
                        {s.students && s.students.length > 0 && (
                          <span className="inline-flex items-center gap-1">
                            <Users size={14} /> {s.students.join("、")}
                          </span>
                        )}
                        {isStudent && (
                          <span className="inline-flex items-center gap-1">
                            <User size={14} /> 状态：{st}
                          </span>
                        )}
                      </div>
                      {s.session?.billedMinutes != null && s.session.billedMinutes >= 0 && st === "completed" && (
                        <div className="text-xs text-[#718096] mt-2">
                          实际 {s.session.actualMinutes ?? "-"} 分钟 · 学员扣减 {s.session.billedMinutes} 分钟
                          {s.session.teacherCreditedMinutes != null && (
                            <>
                              {" "}
                              · 计入老师 {s.session.teacherCreditedMinutes} 分钟
                              {s.session.teacherCreditedMinutes < s.session.billedMinutes ? "（封顶截断）" : ""}
                            </>
                          )}
                        </div>
                      )}
                    </div>
                    {isCoach && (canStart || canEnd) && (
                      <div className="flex gap-2 shrink-0">
                        {canStart && (
                          <CloudButton
                            onClick={() => void onStart(s.id)}
                            className="px-4 py-2 bg-[#4ECDC4] text-white rounded-full text-sm"
                          >
                            开始上课
                          </CloudButton>
                        )}
                        {canEnd && (
                          <CloudButton
                            onClick={() => void onEnd(s.id)}
                            className="px-4 py-2 bg-[#FF6B6B] text-white rounded-full text-sm"
                          >
                            下课
                          </CloudButton>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
