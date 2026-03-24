import {
  DollarSign,
  ClipboardList,
  Users,
  Settings2,
  ChevronRight,
  Award,
  Star,
} from "lucide-react";
import { useNavigate } from "react-router";

const features = [
  { id: 1, icon: DollarSign, label: "佣金核对", color: "#4ECDC4", path: "/commission-check" },
  { id: 2, icon: ClipboardList, label: "词汇测试记录", color: "#55A3FF", path: "/test-records" },
  { id: 3, icon: Users, label: "学员管理", color: "#4ECDC4", path: "/student-management" },
  { id: 4, icon: Settings2, label: "设置", color: "#718096", path: "/settings" },
];

export default function CoachCenter() {
  const navigate = useNavigate();

  return (
    <div className="space-y-6">
      {/* 个人信息面板 */}
      <div className="bg-gradient-to-br from-[#4ECDC4] to-[#55A3FF] rounded-xl p-6 md:p-8 text-white">
        <div className="flex flex-col md:flex-row items-center md:items-start gap-6">
          {/* 头像和徽章 */}
          <div className="relative">
            <div className="w-20 h-20 md:w-24 md:h-24 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center border-4 border-white/30">
              <span className="text-3xl md:text-4xl font-bold">A</span>
            </div>
            <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-white text-[#4ECDC4] px-3 py-1 rounded-full text-xs font-semibold shadow-lg flex items-center gap-1">
              <Award size={14} />
              <span>正式陪练</span>
            </div>
          </div>

          {/* 用户信息 */}
          <div className="flex-1 text-center md:text-left">
            <h1 className="text-2xl md:text-3xl font-bold mb-2">April Zhang</h1>
            <p className="text-white/80 text-sm md:text-base mb-4">
              账号：april@yunjiebei.com
            </p>
            <div className="flex flex-wrap items-center justify-center md:justify-start gap-4">
              <div className="flex items-center gap-2 bg-white/20 backdrop-blur-sm px-4 py-2 rounded-lg">
                <Users size={18} />
                <span className="text-sm">学员数：32</span>
              </div>
              <div className="flex items-center gap-2 bg-white/20 backdrop-blur-sm px-4 py-2 rounded-lg">
                <Star size={18} />
                <span className="text-sm">评分：4.9</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 功能菜单 */}
      <div>
        <h2 className="text-[20px] font-semibold text-[#2D3748] mb-4">
          功能中心
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {features.map((feature) => {
            const Icon = feature.icon;
            return (
              <div
                key={feature.id}
                onClick={() => navigate(feature.path)}
                className="bg-white rounded-xl p-4 md:p-5 hover:shadow-md transition-all cursor-pointer group"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div
                      className="w-12 h-12 rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform"
                      style={{ backgroundColor: `${feature.color}15` }}
                    >
                      <Icon size={24} style={{ color: feature.color }} />
                    </div>
                    <span className="text-[#2D3748] font-medium text-base md:text-lg">
                      {feature.label}
                    </span>
                  </div>
                  <ChevronRight
                    size={20}
                    className="text-[#A0AEC0] group-hover:text-[#4ECDC4] group-hover:translate-x-1 transition-all"
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}