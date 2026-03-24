import { useState } from "react";
import { Calendar, Clock, User, Users } from "lucide-react";
import { CloudButton } from "@/components/cloudsteps";

const categories = [
  { id: "all", label: "全部" },
  { id: "not-started", label: "未开始" },
  { id: "completed", label: "已完成" },
];

const trainingRecords = [
  {
    id: 1,
    name: "雅思词汇训练",
    appointmentTime: "2026-03-25 10:00",
    duration: "30分钟",
    coach: "张老师",
    student: "王小明",
    status: "未开始",
    statusColor: "#FF6B6B",
  },
  {
    id: 2,
    name: "托福高频词汇 - 第三单元",
    appointmentTime: "2026-03-24 14:00",
    duration: "60分钟",
    coach: "李老师",
    student: "刘晓华",
    status: "未开始",
    statusColor: "#FF6B6B",
  },
  {
    id: 3,
    name: "四级核心词汇 - 第二单元",
    appointmentTime: "2026-03-23 09:30",
    duration: "30分钟",
    coach: "陈老师",
    student: "张伟",
    status: "未开始",
    statusColor: "#FF6B6B",
  },
  {
    id: 4,
    name: "高考核心词训练",
    appointmentTime: "2026-03-20 15:00",
    duration: "60分钟",
    coach: "王老师",
    student: "李娜",
    status: "已完成",
    statusColor: "#4ECDC4",
  },
  {
    id: 5,
    name: "考研英语词汇",
    appointmentTime: "2026-03-19 11:00",
    duration: "30分钟",
    coach: "赵老师",
    student: "陈明",
    status: "已完成",
    statusColor: "#4ECDC4",
  },
  {
    id: 6,
    name: "商务英语词汇包",
    appointmentTime: "2026-03-18 10:00",
    duration: "30分钟",
    coach: "孙老师",
    student: "周杰",
    status: "已完成",
    statusColor: "#4ECDC4",
  },
];

export default function TrainingRecords() {
  const [activeCategory, setActiveCategory] = useState("all");

  // 根据分类过滤训练记录
  const filteredRecords = trainingRecords.filter((record) => {
    if (activeCategory === "all") return true;
    if (activeCategory === "not-started") return record.status === "未开始";
    if (activeCategory === "completed") return record.status === "已完成";
    return true;
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
        {filteredRecords.map((record) => (
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
        <CloudButton className="px-4 py-2 rounded-lg border border-[#E2E8F0] text-[#718096] hover:bg-[#F7F9FC] transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
          上一页
        </CloudButton>
        <div className="flex gap-2">
          <CloudButton className="w-10 h-10 rounded-lg bg-[#4ECDC4] text-white font-medium">
            1
          </CloudButton>
          <CloudButton className="w-10 h-10 rounded-lg border border-[#E2E8F0] text-[#718096] hover:bg-[#F7F9FC] transition-colors">
            2
          </CloudButton>
          <CloudButton className="w-10 h-10 rounded-lg border border-[#E2E8F0] text-[#718096] hover:bg-[#F7F9FC] transition-colors">
            3
          </CloudButton>
        </div>
        <CloudButton className="px-4 py-2 rounded-lg border border-[#E2E8F0] text-[#718096] hover:bg-[#F7F9FC] transition-colors">
          下一页
        </CloudButton>
      </div>
    </div>
  );
}
