import { useEffect, useMemo, useRef, useState } from "react";
import { Calendar, Clock, Eye, BookOpen, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { useNavigate } from "react-router";
import { listReviewBooksByDate } from "@/api/review";

type ReviewBookStat = { wordBookId: number; cnt: number; name: string; level: string };

type ReviewTask = {
  id: number;
  time: string;
  student: string;
  vocabularyPack: string;
  trainingTime: string;
  status: "pending" | "completed";
  wordBookId: number;
  count: number;
};

function toDateInputValue(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

const WEEKDAY_ZH = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

function parseYMDLocal(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map((x) => Number(x));
  if (!y || !m || !d) return new Date();
  return new Date(y, m - 1, d);
}

function formatDateZhLong(ymd: string) {
  const d = parseYMDLocal(ymd);
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${WEEKDAY_ZH[d.getDay()]}`;
}

export default function AntiForgetting() {
  const [selectedDate, setSelectedDate] = useState(() => toDateInputValue(new Date()));
  const dateInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  const [bookStats, setBookStats] = useState<ReviewBookStat[]>([]);
  const [loadingBooks, setLoadingBooks] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoadingBooks(true);
      try {
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Shanghai";
        const res = await listReviewBooksByDate(selectedDate, tz);
        const arr = Array.isArray(res.data) ? (res.data as ReviewBookStat[]) : [];
        if (mounted) setBookStats(arr);
      } catch {
        if (mounted) setBookStats([]);
      } finally {
        if (mounted) setLoadingBooks(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [selectedDate]);

  // 获取选中日期的任务
  const reviewTasks = useMemo<ReviewTask[]>(() => {
    const student = sessionStorage.getItem("lb_user_name") || "当前用户";
    const times = ["08:00", "10:00", "14:00", "16:00", "18:00"]; 
    return bookStats.map((b, idx) => ({
      id: idx + 1,
      time: times[idx % times.length],
      student,
      vocabularyPack: b.name,
      trainingTime: `${Math.min(60, Math.max(10, Math.ceil(b.cnt / 20) * 10))}分钟`,
      status: "pending",
      wordBookId: b.wordBookId,
      count: b.cnt,
    }));
  }, [bookStats]);

  // 按学员分组
  const groupedByStudent: { [key: string]: typeof reviewTasks } = {};
  reviewTasks.forEach((task) => {
    if (!groupedByStudent[task.student]) {
      groupedByStudent[task.student] = [];
    }
    groupedByStudent[task.student].push(task);
  });

  const shiftDate = (deltaDays: number) => {
    const d = parseYMDLocal(selectedDate);
    d.setDate(d.getDate() + deltaDays);
    setSelectedDate(toDateInputValue(d));
  };

  const openNativeDatePicker = () => {
    const el = dateInputRef.current;
    if (!el) return;
    const anyEl = el as HTMLInputElement & { showPicker?: () => void };
    if (typeof anyEl.showPicker === "function") {
      try {
        anyEl.showPicker();
        return;
      } catch {
        // 部分浏览器仍可能抛错，回退为 click
      }
    }
    el.click();
  };

  const handleOpenTask = (task: ReviewTask) => {
    sessionStorage.setItem("lb_review_wordbook_id", String(task.wordBookId));
    sessionStorage.setItem("lb_review_wordbook_name", task.vocabularyPack);
    navigate(`/review-word-list?wordBookId=${task.wordBookId}`);
  };

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div>
        <h1 className="text-[24px] md:text-[28px] font-semibold text-[#2D3748]">
          抗遗忘复习
        </h1>
        <p className="text-[#718096] mt-1 text-sm md:text-base">
          定期复习，巩固记忆，防止遗忘
        </p>
      </div>

      {/* 日期筛选器：移动端用大字 + 系统日历，避免原生 date 输入条难点 */}
      <div className="bg-white rounded-xl p-4 md:p-6 shadow-sm">
        <div className="flex items-stretch justify-between gap-2 sm:gap-4">
          <button
            type="button"
            onClick={() => shiftDate(-1)}
            className="shrink-0 self-center p-3 rounded-xl hover:bg-[#F7F9FC] active:scale-[0.98] transition-all"
            aria-label="上一天"
          >
            <ChevronLeft size={22} className="text-[#718096]" />
          </button>

          <button
            type="button"
            onClick={openNativeDatePicker}
            className="flex-1 min-w-0 flex flex-col items-center justify-center rounded-xl px-2 py-3 hover:bg-[#F7F9FC]/80 active:bg-[#F7F9FC] transition-colors"
          >
            <div className="flex items-center gap-1.5 text-[#4ECDC4] mb-1">
              <Calendar size={18} />
              <span className="text-xs font-medium text-[#718096]">选择日期</span>
            </div>
            <div className="text-[15px] sm:text-lg font-semibold text-[#2D3748] text-center leading-snug">
              {formatDateZhLong(selectedDate)}
            </div>
            <span className="text-[11px] text-[#A0AEC0] mt-1.5">点按打开系统日历</span>
          </button>

          <input
            ref={dateInputRef}
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="absolute opacity-0 w-px h-px overflow-hidden -z-10"
            tabIndex={-1}
            aria-label="选择日期"
          />

          <button
            type="button"
            onClick={() => shiftDate(1)}
            className="shrink-0 self-center p-3 rounded-xl hover:bg-[#F7F9FC] active:scale-[0.98] transition-all"
            aria-label="下一天"
          >
            <ChevronRight size={22} className="text-[#718096]" />
          </button>
        </div>
      </div>

      {loadingBooks ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-10 h-10 animate-spin text-[#4ECDC4]" />
        </div>
      ) : reviewTasks.length === 0 ? (
        <div className="bg-white rounded-xl p-10 text-center text-[#718096] shadow-sm">
          该日暂无待复习词库任务（或已全部完成）。可切换日期查看其它天的计划。
        </div>
      ) : (
        <>
      {/* 桌面端：按学员分组显示 */}
      <div className="hidden lg:block space-y-6">
        {Object.entries(groupedByStudent).map(([student, tasks]) => (
          <div key={student} className="bg-white rounded-xl p-6 shadow-sm">
            <div className="flex items-center gap-3 mb-6 pb-4 border-b border-[#E2E8F0]">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#4ECDC4] to-[#55A3FF] flex items-center justify-center text-white font-semibold">
                {student.charAt(0)}
              </div>
              <div>
                <h3 className="text-[#2D3748] font-semibold text-lg">{student}</h3>
                <p className="text-[#A0AEC0] text-sm">
                  本日 {tasks.length} 个复习任务（按所选日期统计）
                </p>
              </div>
            </div>
            <div className="space-y-4">
              {tasks.map((task) => (
                <div
                  key={task.id}
                  className="flex items-center justify-between p-4 bg-[#F7F9FC] rounded-lg hover:bg-[#E2E8F0] transition-colors"
                >
                  <div className="flex items-center gap-6 flex-1">
                    <div className="flex items-center gap-2 min-w-[80px]">
                      <Clock size={18} className="text-[#4ECDC4]" />
                      <span className="text-[#2D3748] font-medium">{task.time}</span>
                    </div>
                    <div className="flex items-center gap-2 flex-1">
                      <BookOpen size={18} className="text-[#55A3FF]" />
                      <span className="text-[#2D3748]">{task.vocabularyPack}</span>
                    </div>
                    <div className="text-[#718096] text-sm min-w-[80px]">
                      {task.trainingTime}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {task.status === "completed" && (
                      <span className="text-xs text-[#4ECDC4] bg-[#4ECDC4]/10 px-3 py-1 rounded-full font-medium">
                        已完成
                      </span>
                    )}
                    <button
                      onClick={() => handleOpenTask(task)}
                      className="px-4 py-2 bg-[#4ECDC4] text-white rounded-lg hover:bg-[#3DBCB4] transition-colors flex items-center gap-2"
                    >
                      <Eye size={16} />
                      <span>{task.status === "completed" ? "查看" : "复习"}</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* 移动端：按时间顺序排列 */}
      <div className="lg:hidden space-y-4">
        {reviewTasks.map((task) => (
          <div key={task.id} className="bg-white rounded-xl p-4 shadow-sm">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#4ECDC4] to-[#55A3FF] flex items-center justify-center text-white font-semibold text-sm">
                  {task.student.charAt(0)}
                </div>
                <div>
                  <div className="text-[#2D3748] font-medium">{task.student}</div>
                  <div className="flex items-center gap-2 text-sm text-[#718096] mt-1">
                    <Clock size={14} className="text-[#A0AEC0]" />
                    <span>{task.time}</span>
                  </div>
                </div>
              </div>
              {task.status === "completed" && (
                <span className="text-xs text-[#4ECDC4] bg-[#4ECDC4]/10 px-2 py-1 rounded-full font-medium">
                  已完成
                </span>
              )}
            </div>
            <div className="space-y-3">
              <div className="flex items-start gap-2">
                <BookOpen size={16} className="text-[#55A3FF] mt-0.5 flex-shrink-0" />
                <span className="text-[#2D3748] text-sm">{task.vocabularyPack}</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-[#718096]">
                <Clock size={14} className="text-[#A0AEC0]" />
                <span>训练时长：{task.trainingTime}</span>
              </div>
            </div>
            <button
              onClick={() => handleOpenTask(task)}
              className="w-full mt-4 px-4 py-2 bg-[#4ECDC4] text-white rounded-lg hover:bg-[#3DBCB4] transition-colors flex items-center justify-center gap-2"
            >
              <Eye size={16} />
              <span>{task.status === "completed" ? "查看" : "复习"}</span>
            </button>
          </div>
        ))}
      </div>
        </>
      )}
    </div>
  );
}