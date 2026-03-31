import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { ChevronLeft, Users, Clock } from "lucide-react";

import { listTeacherStudents } from "@/api/teacher";

type ApiUser = {
  id: number;
  email: string;
  displayName?: string;
  role?: string;
};

type TeacherStudentsResponse = {
  list: ApiUser[];
  total: number;
};

export default function TeacherStudentManagement() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [students, setStudents] = useState<ApiUser[]>([]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        const res = await listTeacherStudents();
        const list = res.data?.list;
        if (mounted) setStudents(Array.isArray(list) ? list : []);
      } catch (e) {
        console.error(e);
        if (mounted) setStudents([]);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const items = useMemo(() => {
    return students.map((s) => {
      return {
        ...s,
        thirtyMinLeft: 0,
        sixtyMinLeft: 0,
        serviceHoursLeft: 0,
      };
    });
  }, [students]);

  return (
    <div className="min-h-screen bg-[#F7F9FC] pb-20">
      {/* 顶部导航 */}
      <div className="fixed top-0 left-0 right-0 z-50 bg-[#4ECDC4]">
        <div className="flex items-center h-14 px-4">
          <button onClick={() => navigate(-1)} className="mr-4">
            <ChevronLeft size={24} className="text-white" />
          </button>
          <h1 className="text-lg font-semibold text-white">学员管理</h1>
        </div>
      </div>

      <div className="pt-14 px-4 py-6 space-y-4">
        {loading ? (
          <div className="bg-white rounded-xl p-6 text-center text-[#718096]">加载中...</div>
        ) : items.length === 0 ? (
          <div className="bg-white rounded-xl p-6 text-center text-[#718096]">暂无学员</div>
        ) : (
          items.map((student) => (
            <div key={student.id} className="bg-white rounded-xl p-5 shadow-sm">
              <div className="mb-4 pb-3 border-b border-[#E2E8F0]">
                <h3 className="text-[#2D3748] font-medium text-lg">{student.displayName || student.email}</h3>
                {student.displayName && (
                  <div className="text-xs text-[#A0AEC0] mt-1">{student.email}</div>
                )}
              </div>

              <div className="grid grid-cols-3 gap-4 mb-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-[#2D3748] mb-1">{student.thirtyMinLeft}</div>
                  <div className="text-xs text-[#718096]">30分钟剩余</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-[#2D3748] mb-1">{student.sixtyMinLeft}</div>
                  <div className="text-xs text-[#718096]">60分钟剩余</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-[#2D3748] mb-1">{student.serviceHoursLeft}</div>
                  <div className="text-xs text-[#718096]">陪练服务时长剩余</div>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-[#E2E8F0] flex items-center justify-between text-sm text-[#718096]">
                <div className="flex items-center gap-1.5">
                  <Users size={16} className="text-[#A0AEC0]" />
                  <span>学员ID：</span>
                  <span className="text-[#2D3748] font-medium">{student.id}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Clock size={16} className="text-[#A0AEC0]" />
                  <span>上课：待接入</span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
