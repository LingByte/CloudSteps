import React, { useEffect, useMemo, useState } from "react";
import { Bell, Menu, X } from "lucide-react";
import { useNavigate } from "react-router";
import { getStudentWeek, getTeacherWeek } from "@/api/teacher";
import { useAuthStore } from "@/stores/authStore";

const pad2 = (n: number) => String(n).padStart(2, "0");
const fmtYMD = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

const parseScheduleEnd = (dateStr: string, startTimeStr: string, endTimeStr: string) => {
  const base = new Date(dateStr);
  if (Number.isNaN(base.getTime())) return null;

  const end = new Date(base);
  const [eh, em] = String(endTimeStr || "").split(":").map((x) => Number(x));
  end.setHours(Number.isFinite(eh) ? eh : 0, Number.isFinite(em) ? em : 0, 0, 0);

  const start = new Date(base);
  const [sh, sm] = String(startTimeStr || "").split(":").map((x) => Number(x));
  start.setHours(Number.isFinite(sh) ? sh : 0, Number.isFinite(sm) ? sm : 0, 0, 0);

  if (end.getTime() < start.getTime()) {
    end.setDate(end.getDate() + 1);
  }
  return end;
};

type HeaderProps = {
  mobileMenuOpen: boolean;
  onToggleMobileMenu: () => void;
};

export function Header({ mobileMenuOpen, onToggleMobileMenu }: HeaderProps) {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const role = (user as any)?.role || "user";
  const [nowTs, setNowTs] = useState(() => Date.now());
  const [todayRemainCount, setTodayRemainCount] = useState<number>(0);

  const NOTIFICATION_PATH = "/notifications";

  const todayStr = useMemo(() => fmtYMD(new Date(nowTs)), [nowTs]);

  useEffect(() => {
    const t = window.setInterval(() => {
      setNowTs(Date.now());
    }, 60_000);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = role === "student" ? await getStudentWeek(todayStr) : await getTeacherWeek(todayStr);
        const raw = res.data?.schedules || [];
        const list = Array.isArray(raw) ? raw : [];
        const now = new Date(nowTs);

        const remain = list.filter((s: any) => {
          if (!s) return false;
          if (String(s.scheduledDate || "") !== todayStr) return false;
          const rawStatus = s.status || s.session?.status;
          if (rawStatus === "completed") return false;

          const plannedEnd = parseScheduleEnd(String(s.scheduledDate || ""), String(s.startTime || ""), String(s.endTime || ""));
          if (!plannedEnd) return false;
          if (now.getTime() > plannedEnd.getTime()) return false;

          return true;
        }).length;

        if (!mounted) return;
        setTodayRemainCount(remain);
      } catch {
        if (!mounted) return;
        setTodayRemainCount(0);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [nowTs, role, todayStr]);

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-white border-b border-[#E2E8F0]">
      <div className="flex items-center justify-between h-16 px-4 lg:px-6">
        <div className="flex items-center gap-4">
          <button
            className="lg:hidden text-[#2D3748]"
            onClick={onToggleMobileMenu}
          >
            {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
          <div className="flex items-center gap-3">
            <img
              src="/logo.png"
              alt="CloudSteps"
              className="w-8 h-8 rounded-lg object-contain"
              loading="eager"
            />
            <h1 className="text-[20px] md:text-[24px] font-bold text-[#4ECDC4]">
              云阶背词
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-2 md:gap-4">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#4ECDC4]/10 text-[#2D3748]">
            <span className="text-[11px] md:text-xs text-[#4ECDC4] font-semibold">今天还有</span>
            <span className="text-[11px] md:text-xs font-semibold text-[#2D3748]">{todayRemainCount}</span>
            <span className="text-[11px] md:text-xs text-[#4ECDC4] font-semibold">次训练</span>
          </div>
          <button
            className="text-[#718096] hover:text-[#4ECDC4] transition-colors"
            onClick={() => navigate(NOTIFICATION_PATH)}
          >
            <Bell size={20} />
          </button>
        </div>
      </div>
    </header>
  );
}
