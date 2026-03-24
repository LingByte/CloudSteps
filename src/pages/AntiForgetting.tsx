import { useState } from "react";
import { Calendar, Clock, User, Eye, BookOpen, ChevronLeft, ChevronRight } from "lucide-react";
import { useNavigate } from "react-router";

const reviewTasksData = {
  "2026-03-19": [
    {
      id: 1,
      time: "08:00",
      student: "王诗涵",
      vocabularyPack: "四六级词汇复习",
      trainingTime: "30分钟",
      status: "pending",
    },
    {
      id: 2,
      time: "14:00",
      student: "李明",
      vocabularyPack: "考研单词复习",
      trainingTime: "60分钟",
      status: "completed",
    },
  ],
  "2026-03-20": [
    {
      id: 3,
      time: "09:00",
      student: "张小雨",
      vocabularyPack: "雅思词汇复习",
      trainingTime: "30分钟",
      status: "pending",
    },
    {
      id: 4,
      time: "16:00",
      student: "赵阳",
      vocabularyPack: "高考核心词复习",
      trainingTime: "60分钟",
      status: "completed",
    },
  ],
  "2026-03-21": [
    {
      id: 5,
      time: "10:00",
      student: "陈雪",
      vocabularyPack: "托福词汇复习",
      trainingTime: "30分钟",
      status: "pending",
    },
    {
      id: 6,
      time: "15:00",
      student: "刘浩",
      vocabularyPack: "英语高频词复习",
      trainingTime: "60分钟",
      status: "completed",
    },
  ],
};

export default function AntiForgetting() {
  const [selectedDate, setSelectedDate] = useState("2026-03-21");
  const navigate = useNavigate();

  // 获取选中日期的任务
  const reviewTasks = reviewTasksData[selectedDate as keyof typeof reviewTasksData] || [];

  // 按学员分组
  const groupedByStudent: { [key: string]: typeof reviewTasks } = {};
  reviewTasks.forEach((task) => {
    if (!groupedByStudent[task.student]) {
      groupedByStudent[task.student] = [];
    }
    groupedByStudent[task.student].push(task);
  });

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

      {/* 日期筛选器 */}
      <div className="bg-white rounded-xl p-4 md:p-6 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <button className="p-2 hover:bg-[#F7F9FC] rounded-lg transition-colors">
            <ChevronLeft size={20} className="text-[#718096]" />
          </button>
          <div className="flex items-center gap-3">
            <Calendar size={20} className="text-[#4ECDC4]" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="text-[#2D3748] font-medium text-base md:text-lg border-none outline-none cursor-pointer"
            />
          </div>
          <button className="p-2 hover:bg-[#F7F9FC] rounded-lg transition-colors">
            <ChevronRight size={20} className="text-[#718096]" />
          </button>
        </div>
      </div>

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
                  今日 {tasks.length} 个复习任务
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
                      onClick={() => navigate("/review-word-list")}
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
              onClick={() => navigate("/review-word-list")}
              className="w-full mt-4 px-4 py-2 bg-[#4ECDC4] text-white rounded-lg hover:bg-[#3DBCB4] transition-colors flex items-center justify-center gap-2"
            >
              <Eye size={16} />
              <span>{task.status === "completed" ? "查看" : "复习"}</span>
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}