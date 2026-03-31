import {
  Search as SearchIcon,
  Calendar,
  FileText,
  Users,
  Clock,
  User,
  AlertCircle,
} from "lucide-react";
import { useNavigate } from "react-router";
import { useEffect, useMemo, useState } from "react";
import { CloudButton } from "@/components/cloudsteps";
import { endTeacherSession, getStudentWeek, getTeacherWeek, startTeacherSession } from "@/api/teacher";
import { useAuthStore } from "@/stores/authStore";

type ApiUser = {
  id: number;
  email: string;
  displayName?: string;
};

type ApiCourse = {
  id: number;
  name: string;
  teacherId: number;
};

type ApiClassSession = {
  id: number;
  status: string;
  startedAt?: string | null;
  endedAt?: string | null;
  durationMinutes?: number;
};

type ApiSchedule = {
  id: number;
  title: string;
  scheduledDate: string;
  startTime: string;
  endTime: string;
  courseId: number;
  course?: ApiCourse;
};

type TeacherWeekItem = {
  id: number;
  scheduledDate: string;
  startTime: string;
  endTime: string;
  title: string;
  course?: ApiCourse;
  students?: string[];
  status?: string;
  session?: ApiClassSession | null;
};

const pad2 = (n: number) => String(n).padStart(2, "0");
const fmtYMD = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

const parseScheduleStart = (dateStr: string, timeStr: string) => {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  const [h, m] = String(timeStr || "").split(":").map((x) => Number(x));
  d.setHours(Number.isFinite(h) ? h : 0, Number.isFinite(m) ? m : 0, 0, 0);
  return d;
};

const parseScheduleEnd = (dateStr: string, startTimeStr: string, endTimeStr: string) => {
  const base = new Date(dateStr);
  if (Number.isNaN(base.getTime())) return null;

  const end = new Date(base);
  const [eh, em] = String(endTimeStr || "").split(":").map((x) => Number(x));
  end.setHours(Number.isFinite(eh) ? eh : 0, Number.isFinite(em) ? em : 0, 0, 0);

  const start = new Date(base);
  const [sh, sm] = String(startTimeStr || "").split(":").map((x) => Number(x));
  start.setHours(Number.isFinite(sh) ? sh : 0, Number.isFinite(sm) ? sm : 0, 0, 0);

  // 跨天：endTime < startTime 视为次日结束
  if (end.getTime() < start.getTime()) {
    end.setDate(end.getDate() + 1);
  }

  return end;
};

const durationMinutes = (start: string, end: string) => {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  if (!Number.isFinite(sh) || !Number.isFinite(sm) || !Number.isFinite(eh) || !Number.isFinite(em)) return 0;
  return Math.max(0, (eh * 60 + em) - (sh * 60 + sm));
};

const fmtAppointment = (dateStr: string, timeStr: string) => {
  const d = parseScheduleStart(dateStr, timeStr);
  if (!d) return `${dateStr} ${timeStr}`;
  return `${fmtYMD(d)} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
};

export default function Home() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [selectedTraining, setSelectedTraining] = useState<any>(null);

  const [nowTs, setNowTs] = useState(() => Date.now());

  const greetingText = useMemo(() => {
    const hour = new Date(nowTs).getHours();
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
  }, [nowTs]);

  const role = (user as any)?.role || "user";
  const isStudent = role === "student";

  const [loadingSchedules, setLoadingSchedules] = useState(true);
  const [schedules, setSchedules] = useState<TeacherWeekItem[]>([]);

  const handleStartTraining = (training: any) => {
    setSelectedTraining(training);
    setShowConfirmDialog(true);
  };

  const handleConfirm = async () => {
    try {
      // 学员端目前没有 teacher session 的开始/结束概念
      if (!isStudent && selectedTraining?.id) {
        await startTeacherSession(Number(selectedTraining.id));
        // 乐观更新：把该排课置为 in_progress
        setSchedules((prev) =>
          prev.map((s) =>
            s.id === selectedTraining.id
              ? {
                  ...s,
                  status: "in_progress",
                  session: {
                    id: (s.session as any)?.id || 0,
                    status: "in_progress",
                    startedAt: new Date().toISOString(),
                    endedAt: null,
                  },
                }
              : s,
          ),
        );
      }
    } finally {
      setShowConfirmDialog(false);
      navigate("/material-selection");
    }
  };

  const handleEndClass = async (scheduleId: number) => {
    if (isStudent) return;
    await endTeacherSession(scheduleId);
    setSchedules((prev) =>
      prev.map((s) =>
        s.id === scheduleId
          ? {
              ...s,
              status: "completed",
              session: s.session
                ? {
                    ...s.session,
                    status: "completed",
                    endedAt: new Date().toISOString(),
                  }
                : {
                    id: 0,
                    status: "completed",
                    startedAt: null,
                    endedAt: new Date().toISOString(),
                  },
            }
          : s,
      ),
    );
  };

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoadingSchedules(true);
        const today = new Date();
        const date = fmtYMD(today);

        // 老师看 teacher/week；学员看 student/week；其他角色默认 teacher/week
        const res = role === "student" ? await getStudentWeek(date) : await getTeacherWeek(date);
        const raw = res.data?.schedules || [];
        const list: TeacherWeekItem[] = Array.isArray(raw) ? raw : [];
        if (!mounted) return;
        setSchedules(list);
      } catch (e) {
        console.error(e);
        if (!mounted) return;
        setSchedules([]);
      } finally {
        if (mounted) setLoadingSchedules(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [user]);

  useEffect(() => {
    const t = window.setInterval(() => {
      setNowTs(Date.now());
    }, 60_000);
    return () => window.clearInterval(t);
  }, []);

  // 前端兜底：如果已开始上课且超过排课 endTime，还没点下课则自动下课
  useEffect(() => {
    if (isStudent) return;
    if (!schedules || schedules.length === 0) return;

    const endedOnce = new Set<number>();
    const timer = window.setInterval(() => {
      const now = new Date();
      schedules.forEach((s) => {
        if (endedOnce.has(s.id)) return;
        if ((s.status || s.session?.status) !== "in_progress") return;
        const plannedEnd = parseScheduleEnd(s.scheduledDate, s.startTime, s.endTime);
        if (!plannedEnd) return;
        if (now.getTime() < plannedEnd.getTime()) return;

        endedOnce.add(s.id);
        handleEndClass(s.id).catch(() => {
          endedOnce.delete(s.id);
        });
      });
    }, 15_000);

    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStudent, schedules]);

  const trainingData = useMemo(() => {
    const now = new Date(nowTs);
    const startWindow = new Date(now);
    startWindow.setDate(startWindow.getDate() - 7);
    const end = new Date(now);
    end.setDate(end.getDate() + 7);

    const items = schedules
      .map((s) => {
        const start = parseScheduleStart(s.scheduledDate, s.startTime);
        if (!start) return null;
        const endAt = parseScheduleEnd(s.scheduledDate, s.startTime, s.endTime);
        if (!endAt) return null;
        const mins = durationMinutes(s.startTime, s.endTime);
        const rawCourseId = (s as any).courseId as number | undefined;
        const title = s.title || s.course?.name || `课程#${s.course?.id || rawCourseId || s.id}`;

        const teacherName = user?.displayName || user?.email || "-";
        const studentNames = (s.students || []).filter(Boolean);
        const studentLabel = studentNames.length > 0 ? studentNames.join("、") : "-";

        const rawStatus = s.status || s.session?.status;
        const isExpired = rawStatus !== "in_progress" && rawStatus !== "completed" && now.getTime() > endAt.getTime();
        const status =
          rawStatus === "in_progress"
            ? "开始上课"
            : rawStatus === "completed"
              ? "已下课"
              : isExpired
                ? "已过期"
                : "未开始";

        return {
          id: s.id,
          name: title,
          appointmentTime: fmtAppointment(s.scheduledDate, s.startTime),
          duration: mins ? `${mins}分钟` : "-",
          coach: teacherName,
          student: studentLabel,
          status,
          remainingTime: mins ? `${mins}分钟` : "-",
          _start: start.getTime(),
          _end: endAt.getTime(),
        };
      })
      .filter(Boolean) as any[];

    return items
      .filter((x) => x._start >= startWindow.getTime() && x._start < end.getTime())
      .sort((a, b) => b._start - a._start)
      .slice(0, 6);
  }, [nowTs, schedules, user]);

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl border border-slate-200 p-5">
        <div className="text-xs text-slate-500">{greetingText}</div>
        <div className="text-lg font-semibold text-slate-900 mt-1">
          欢迎回来，{user?.displayName || user?.email || "-"}
        </div>
      </div>

      {/* 数据卡片组 - 横向并列小框 */}
      <div className="flex gap-2">
        {/* 累计陪练卡片 - 浅湖蓝背景 */}
        <div className="flex-1 md:w-[180px] bg-gradient-to-br from-[#87CEEB] to-[#4ECDC4] rounded-xl p-4 text-white">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[28px] font-bold leading-none mb-1">43h</div>
              <div className="text-white/90 text-sm">累计陪练</div>
            </div>
            <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center flex-shrink-0">
              <SearchIcon size={20} />
            </div>
          </div>
        </div>

        {/* 本月陪练卡片 - 薄荷青背景 */}
        <div className="flex-1 md:w-[180px] bg-[#4ECDC4] rounded-xl p-4 text-white">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[28px] font-bold leading-none mb-1">12h</div>
              <div className="text-white/90 text-sm">本月陪练</div>
            </div>
            <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center flex-shrink-0">
              <Calendar size={20} />
            </div>
          </div>
        </div>
      </div>

      {/* 功能入口 */}
      <div className="grid grid-cols-2 gap-4">
        {/* 词汇测试 */}
        <div
          onClick={() => navigate("/vocabulary-test")}
          className="bg-white rounded-xl p-6 hover:shadow-lg transition-shadow cursor-pointer group"
        >
          <div className="w-12 h-12 mb-4">
            <div className="w-12 h-12 bg-[#4ECDC4]/10 rounded-lg flex items-center justify-center group-hover:bg-[#4ECDC4]/20 transition-colors">
              <FileText className="text-[#4ECDC4]" size={24} />
            </div>
          </div>
          <div className="text-[#2D3748] text-sm md:text-base font-medium">
            词汇测试
          </div>
        </div>

        {/* 管理入口：管理员=班级管理；老师=学员管理 */}
        <div
          onClick={() => {
            const role = (user as any)?.role || "user";
            navigate(role === "admin" ? "/class-management" : "/student-management");
          }}
          className="bg-white rounded-xl p-6 hover:shadow-lg transition-shadow cursor-pointer group"
        >
          <div className="w-12 h-12 mb-4">
            <div className="w-12 h-12 bg-[#55A3FF]/10 rounded-lg flex items-center justify-center group-hover:bg-[#55A3FF]/20 transition-colors">
              <Users className="text-[#55A3FF]" size={24} />
            </div>
          </div>
          <div className="text-[#2D3748] text-sm md:text-base font-medium">
            {(user as any)?.role === "admin" ? "班级管理" : "学员管理"}
          </div>
        </div>
      </div>

      {/* 预约训练列表 */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[20px] font-semibold text-[#2D3748]">最近7天预约训练</h2>
          <button
            onClick={() => navigate("/training-records")}
            className="text-sm text-[#4ECDC4] hover:text-[#45b8b0] transition-colors"
          >
            查看更多
          </button>
        </div>
        <div className="space-y-4">
          {loadingSchedules ? (
            <div className="bg-white rounded-xl p-6 text-center text-[#718096]">加载中...</div>
          ) : trainingData.length === 0 ? (
            <div className="bg-white rounded-xl p-6 text-center text-[#718096]">暂无预约课程</div>
          ) : (
            trainingData.map((item) => (
            <div
              key={item.id}
              className="bg-white rounded-xl p-4 md:p-6 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <h3 className="text-[#2D3748] font-medium text-base md:text-lg mb-2">
                    {item.name}
                  </h3>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-[#718096]">
                    <div className="flex items-center gap-1.5">
                      <Calendar size={16} className="text-[#A0AEC0]" />
                      <span>{item.appointmentTime}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Clock size={16} className="text-[#A0AEC0]" />
                      <span>{item.duration}</span>
                    </div>
                  </div>
                </div>
                {item.status === "开始上课" ? (
                  <div className="flex items-center gap-1.5 px-3 py-1 border-2 border-[#66BB6A] rounded-full">
                    <div className="w-2 h-2 bg-[#66BB6A] rounded-full animate-pulse" />
                    <span className="text-xs text-[#66BB6A] font-medium">
                      {item.status}
                    </span>
                  </div>
                ) : item.status === "已过期" ? (
                  <div className="flex items-center gap-1.5 px-3 py-1 bg-slate-200 rounded-full">
                    <div className="w-2 h-2 bg-slate-500 rounded-full" />
                    <span className="text-xs text-slate-600 font-medium">已过期</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 px-3 py-1 bg-[#FF6B6B] rounded-full">
                    <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
                    <span className="text-xs text-white font-medium">
                      {item.status}
                    </span>
                  </div>
                )}
              </div>
              <div className="flex items-center justify-between gap-4 pt-3 border-t border-[#E2E8F0]">
                <div className="flex items-center gap-4 flex-wrap">
                  <div className="flex items-center gap-2 text-sm text-[#718096]">
                    <User size={16} className="text-[#A0AEC0]" />
                    <span>陪练人：</span>
                    <span className="text-[#2D3748] font-medium">{item.coach}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-[#718096]">
                    <Users size={16} className="text-[#A0AEC0]" />
                    <span>学员：</span>
                    <span className="text-[#2D3748] font-medium">{item.student}</span>
                  </div>
                </div>
                {item.status === "已下课" || item.status === "已过期" ? null : item.status === "开始上课" && !isStudent ? (
                  <div className="flex items-center gap-2">
                    <CloudButton
                      onClick={() => handleEndClass(item.id)}
                      className="px-5 py-2 bg-[#FF6B6B] text-white rounded-full hover:bg-[#ff5252] transition-colors whitespace-nowrap"
                    >
                      下课
                    </CloudButton>
                    <CloudButton
                      onClick={() => handleStartTraining(item)}
                      className="px-5 py-2 bg-[#66BB6A] text-white rounded-full hover:bg-[#5ca860] transition-colors whitespace-nowrap"
                    >
                      开始训练
                    </CloudButton>
                  </div>
                ) : (
                  <CloudButton
                    onClick={() => handleStartTraining(item)}
                    className="px-6 py-2 bg-[#4ECDC4] text-white rounded-full hover:bg-[#45b8b0] transition-colors whitespace-nowrap"
                  >
                    开始训练
                  </CloudButton>
                )}
              </div>
            </div>
            ))
          )}
        </div>
      </div>

      {/* 核对信息弹窗 */}
      {showConfirmDialog && selectedTraining && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full mx-auto">
            <h3 className="text-xl font-semibold text-[#2D3748] mb-4 text-center">
              核对信息
            </h3>
            <div className="flex items-center justify-center gap-2 mb-6">
              <AlertCircle className="text-[#FF9800]" size={20} />
              <p className="text-[#FF9800]">即将开始练习，请确认！</p>
            </div>
            <div className="space-y-3 mb-6">
              <div className="flex items-center justify-between py-2 border-b border-[#E2E8F0]">
                <span className="text-[#718096]">用户姓名</span>
                <span className="text-[#2D3748] font-medium">{selectedTraining.student}</span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-[#E2E8F0]">
                <span className="text-[#718096]">资料名称</span>
                <span className="text-[#2D3748] font-medium">{selectedTraining.name}</span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-[#E2E8F0]">
                <span className="text-[#718096]">剩余时间</span>
                <span className="text-[#2D3748] font-medium">{selectedTraining.remainingTime}</span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-[#E2E8F0]">
                <span className="text-[#718096]">开始时间</span>
                <span className="text-[#2D3748] font-medium">{selectedTraining.appointmentTime}</span>
              </div>
            </div>
            <div className="flex gap-3">
              <CloudButton
                onClick={() => setShowConfirmDialog(false)}
                className="flex-1 py-3 text-[#718096] rounded-lg hover:bg-gray-50 transition-colors"
              >
                取消
              </CloudButton>
              <CloudButton
                onClick={handleConfirm}
                className="flex-1 py-3 bg-[#4ECDC4] text-white rounded-lg hover:bg-[#45b8b0] transition-colors"
              >
                确认
              </CloudButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}