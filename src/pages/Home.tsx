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
import { useState } from "react";
import { CloudButton } from "@/components/cloudsteps";

const trainingData = [
  {
    id: 1,
    name: "四级核心词汇 - 第一单元",
    appointmentTime: "2026-03-20 10:00",
    duration: "30分钟",
    coach: "张老师",
    student: "王小明",
    status: "开始上课",
    remainingTime: "25分钟",
  },
  {
    id: 2,
    name: "托福高频词汇 - 第三单元",
    appointmentTime: "2026-03-21 14:00",
    duration: "60分钟",
    coach: "李老师",
    student: "刘晓华",
    status: "未开始",
    remainingTime: "55分钟",
  },
  {
    id: 3,
    name: "雅思写作词汇包",
    appointmentTime: "2026-03-22 09:30",
    duration: "30分钟",
    coach: "陈老师",
    student: "张伟",
    status: "未开始",
    remainingTime: "30分钟",
  },
];

export default function Home() {
  const navigate = useNavigate();
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [selectedTraining, setSelectedTraining] = useState<any>(null);

  const handleStartTraining = (training: any) => {
    setSelectedTraining(training);
    setShowConfirmDialog(true);
  };

  const handleConfirm = () => {
    setShowConfirmDialog(false);
    navigate("/material-selection");
  };

  return (
    <div className="space-y-6">
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

        {/* 学员管理 */}
        <div
          onClick={() => navigate("/student-management")}
          className="bg-white rounded-xl p-6 hover:shadow-lg transition-shadow cursor-pointer group"
        >
          <div className="w-12 h-12 mb-4">
            <div className="w-12 h-12 bg-[#55A3FF]/10 rounded-lg flex items-center justify-center group-hover:bg-[#55A3FF]/20 transition-colors">
              <Users className="text-[#55A3FF]" size={24} />
            </div>
          </div>
          <div className="text-[#2D3748] text-sm md:text-base font-medium">
            学员管理
          </div>
        </div>
      </div>

      {/* 预约训练列表 */}
      <div>
        <h2 className="text-[20px] font-semibold text-[#2D3748] mb-4">
          最近7天预约训练
        </h2>
        <div className="space-y-4">
          {trainingData.map((item) => (
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
                {item.id === 1 ? (
                  <CloudButton
                    onClick={() => handleStartTraining(item)}
                    className="px-6 py-2 bg-[#66BB6A] text-white rounded-full hover:bg-[#5ca860] transition-colors whitespace-nowrap"
                  >
                    开始训练
                  </CloudButton>
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
          ))}
        </div>
      </div>

      {/* 核对信息弹窗 */}
      {showConfirmDialog && selectedTraining && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
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