import { useNavigate } from "react-router";
import { ChevronLeft, ChevronRight, Lock, Smartphone, Bell, Shield, LogOut } from "lucide-react";
import { CloudButton } from "@/components/cloudsteps";

const settingOptions = [
  {
    id: 1,
    icon: Lock,
    label: "修改密码",
    description: "定期修改密码，保障账号安全",
    color: "#4ECDC4",
  },
  {
    id: 2,
    icon: Smartphone,
    label: "绑定手机号",
    description: "用于登录验证和找回密码",
    color: "#55A3FF",
  },
  {
    id: 3,
    icon: Bell,
    label: "消息通知",
    description: "管理推送通知和提醒设置",
    color: "#4ECDC4",
  },
  {
    id: 4,
    icon: Shield,
    label: "账号安全",
    description: "查看登录记录和设备管理",
    color: "#55A3FF",
  },
];

export default function Settings() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-[#F7F9FC] pb-6">
      {/* 顶部导航 */}
      <div className="bg-white border-b border-[#E2E8F0] mb-6">
        <div className="flex items-center h-14 px-4">
          <CloudButton onClick={() => navigate(-1)} className="mr-4">
            <ChevronLeft size={24} className="text-[#2D3748]" />
          </CloudButton>
          <h1 className="text-lg font-semibold text-[#2D3748]">设置</h1>
        </div>
      </div>

      <div className="max-w-[800px] mx-auto px-4 space-y-6">
        {/* 账号信息 */}
        <div className="bg-white rounded-xl p-6">
          <h2 className="text-[18px] font-semibold text-[#2D3748] mb-4">账号信息</h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between py-3 border-b border-[#E2E8F0] last:border-0">
              <div>
                <div className="text-sm text-[#718096] mb-1">用户名</div>
                <div className="text-[#2D3748] font-medium">April Zhang</div>
              </div>
            </div>
            <div className="flex items-center justify-between py-3 border-b border-[#E2E8F0] last:border-0">
              <div>
                <div className="text-sm text-[#718096] mb-1">账号</div>
                <div className="text-[#2D3748] font-medium">april@yunjiebei.com</div>
              </div>
            </div>
            <div className="flex items-center justify-between py-3">
              <div>
                <div className="text-sm text-[#718096] mb-1">手机号</div>
                <div className="text-[#2D3748] font-medium">138****8888</div>
              </div>
            </div>
          </div>
        </div>

        {/* 设置选项 */}
        <div className="bg-white rounded-xl p-4">
          <h2 className="text-[18px] font-semibold text-[#2D3748] mb-4 px-2">账号设置</h2>
          <div className="space-y-2">
            {settingOptions.map((option) => {
              const Icon = option.icon;
              return (
                <CloudButton
                  key={option.id}
                  className="w-full flex items-center justify-between p-4 hover:bg-[#F7F9FC] rounded-lg transition-colors group"
                >
                  <div className="flex items-center gap-4">
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center"
                      style={{ backgroundColor: `${option.color}15` }}
                    >
                      <Icon size={20} style={{ color: option.color }} />
                    </div>
                    <div className="text-left">
                      <div className="text-[#2D3748] font-medium mb-1">{option.label}</div>
                      <div className="text-sm text-[#718096]">{option.description}</div>
                    </div>
                  </div>
                  <ChevronRight
                    size={20}
                    className="text-[#A0AEC0] group-hover:text-[#4ECDC4] group-hover:translate-x-1 transition-all"
                  />
                </CloudButton>
              );
            })}
          </div>
        </div>

        {/* 其他设置 */}
        <div className="bg-white rounded-xl p-4">
          <h2 className="text-[18px] font-semibold text-[#2D3748] mb-4 px-2">其他</h2>
          <div className="space-y-2">
            <CloudButton className="w-full flex items-center justify-between p-4 hover:bg-[#F7F9FC] rounded-lg transition-colors">
              <span className="text-[#2D3748] font-medium">关于我们</span>
              <ChevronRight size={20} className="text-[#A0AEC0]" />
            </CloudButton>
            <CloudButton className="w-full flex items-center justify-between p-4 hover:bg-[#F7F9FC] rounded-lg transition-colors">
              <span className="text-[#2D3748] font-medium">用户协议</span>
              <ChevronRight size={20} className="text-[#A0AEC0]" />
            </CloudButton>
            <CloudButton className="w-full flex items-center justify-between p-4 hover:bg-[#F7F9FC] rounded-lg transition-colors">
              <span className="text-[#2D3748] font-medium">隐私政策</span>
              <ChevronRight size={20} className="text-[#A0AEC0]" />
            </CloudButton>
          </div>
        </div>

        {/* 退出登录 */}
        <CloudButton className="w-full bg-white rounded-xl p-4 text-[#FF6B6B] font-medium hover:bg-[#FF6B6B]/5 transition-colors flex items-center justify-center gap-2">
          <LogOut size={20} />
          <span>退出登录</span>
        </CloudButton>
      </div>
    </div>
  );
}
