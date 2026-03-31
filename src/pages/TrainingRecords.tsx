import { useEffect, useMemo, useState } from "react";
import { Calendar, Clock, User, Users } from "lucide-react";
import { CloudButton } from "@/components/cloudsteps";
import { listTeacherRecords } from "@/api/teacher";

const categories = [
  { id: "all", label: "全部" },
  { id: "not-started", label: "未开始" },
  { id: "completed", label: "已完成" },
];

type TrainingRecord = {
  id: number;
  name: string;
  appointmentTime: string;
  duration: string;
  coach: string;
  student: string;
  status: string;
};

const statusColorMap: Record<string, string> = {
  "未开始": "#FF6B6B",
  "训练中": "#FFB020",
  "已完成": "#4ECDC4",
};

const statusLabelMap: Record<string, string> = {
  "not-started": "未开始",
  "in_progress": "训练中",
  completed: "已完成",
};

export default function TrainingRecords() {
  const [activeCategory, setActiveCategory] = useState("all");
  const [records, setRecords] = useState<TrainingRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [total, setTotal] = useState(0);

  const statusQuery = useMemo(() => {
    if (activeCategory === "not-started") return "not-started";
    if (activeCategory === "completed") return "completed";
    return "";
  }, [activeCategory]);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    (async () => {
      try {
        const res = await listTeacherRecords({
          page,
          pageSize,
          ...(statusQuery ? { status: statusQuery } : {}),
        });
        if (!mounted) return;
        const list = Array.isArray(res.data?.records) ? (res.data.records as TrainingRecord[]) : [];
        setRecords(list);
        setTotal(Number(res.data?.total || 0));
      } catch {
        if (!mounted) return;
        setRecords([]);
        setTotal(0);
      } finally {
        if (!mounted) return;
        setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [page, pageSize, statusQuery]);

  useEffect(() => {
    setPage(1);
  }, [activeCategory]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const filteredRecords = records.map((r) => {
    const label = statusLabelMap[r.status] || r.status;
    return {
      ...r,
      status: label,
      statusColor: statusColorMap[label] || "#A0AEC0",
    };
  });

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div>
        <h1 className="text-[24px] md:text-[28px] font-semibold text-[#2D3748]">
          训练记录
        </h1>
        <p className="text-[#718096] mt-1 text-sm md:text-base">
          查看和管理所有训练记录
        </p>
      </div>

      {/* 筛选栏 */}
      <div className="bg-white rounded-xl p-2 md:p-3 shadow-sm">
        <div className="flex gap-2 overflow-x-auto scrollbar-hide">
          {categories.map((category) => (
            <CloudButton
              key={category.id}
              onClick={() => setActiveCategory(category.id)}
              className={`px-4 md:px-6 py-2 rounded-lg whitespace-nowrap text-sm md:text-base font-medium transition-all ${
                activeCategory === category.id
                  ? "bg-[#4ECDC4] text-white shadow-md"
                  : "text-[#718096] hover:bg-[#F7F9FC]"
              }`}
            >
              {category.label}
            </CloudButton>
          ))}
        </div>
      </div>

      {/* 训练列表 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {loading ? null : filteredRecords.map((record) => (
          <div
            key={record.id}
            className="bg-white rounded-xl p-4 md:p-6 hover:shadow-md transition-shadow"
          >
            <div className="flex items-start justify-between mb-4">
              <div className="flex-1 pr-4">
                <h3 className="text-[#2D3748] font-medium text-base md:text-lg mb-2 line-clamp-2">
                  {record.name}
                </h3>
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5 text-sm text-[#718096]">
                    <Calendar size={16} className="text-[#A0AEC0] flex-shrink-0" />
                    <span>{record.appointmentTime}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-sm text-[#718096]">
                    <Clock size={16} className="text-[#A0AEC0] flex-shrink-0" />
                    <span>{record.duration}</span>
                  </div>
                </div>
              </div>
              <div
                className="flex items-center gap-1.5 px-3 py-1 rounded-full flex-shrink-0"
                style={{ backgroundColor: `${record.statusColor}15` }}
              >
                <div
                  className="w-2 h-2 rounded-full"
                  style={{
                    backgroundColor: record.statusColor,
                    animation:
                      record.status === "未开始" || record.status === "训练中"
                        ? "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite"
                        : "none",
                  }}
                />
                <span
                  className="text-xs font-medium whitespace-nowrap"
                  style={{ color: record.statusColor }}
                >
                  {record.status}
                </span>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6 pt-3 border-t border-[#E2E8F0]">
              <div className="flex items-center gap-2 text-sm text-[#718096]">
                <User size={16} className="text-[#A0AEC0] flex-shrink-0" />
                <span>陪练人：</span>
                <span className="text-[#2D3748] font-medium">{record.coach}</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-[#718096]">
                <Users size={16} className="text-[#A0AEC0] flex-shrink-0" />
                <span>学员：</span>
                <span className="text-[#2D3748] font-medium">{record.student}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* 分页 */}
      <div className="flex items-center justify-center gap-2 pt-4">
        <CloudButton
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          disabled={page <= 1}
          className="px-4 py-2 rounded-lg border border-[#E2E8F0] text-[#718096] hover:bg-[#F7F9FC] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          上一页
        </CloudButton>
        <div className="flex gap-2">
          <CloudButton className="w-10 h-10 rounded-lg bg-[#4ECDC4] text-white font-medium">{page}</CloudButton>
        </div>
        <CloudButton
          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          disabled={page >= totalPages}
          className="px-4 py-2 rounded-lg border border-[#E2E8F0] text-[#718096] hover:bg-[#F7F9FC] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          下一页
        </CloudButton>
      </div>
    </div>
  );
}
