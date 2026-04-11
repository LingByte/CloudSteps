import {
  DollarSign,
  ClipboardList,
  Settings2,
  ChevronRight,
  Award,
  Star,
  Mail,
  Phone,
  MapPin,
  Shield,
  Users,
} from "lucide-react";
import { useEffect, useMemo } from "react";
import { useNavigate } from "react-router";
import { CloudButton, CloudImageWithFallback } from "@/components/cloudsteps";
import { useAuthStore } from "@/stores/authStore";

const features = (role: string) => [
  ...(role === "student"
    ? []
    : [{ id: 1, icon: DollarSign, label: "佣金核对", color: "#4ECDC4", path: "/commission-check" }]),
  { id: 2, icon: ClipboardList, label: "词汇测试记录", color: "#55A3FF", path: "/test-records" },
  { id: 3, icon: Settings2, label: "设置", color: "#718096", path: "/settings" },
];

export default function CoachCenter() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const refreshUserInfo = useAuthStore((s) => s.refreshUserInfo);
	const role = (user as any)?.role || "user";

  useEffect(() => {
    void refreshUserInfo();
  }, [refreshUserInfo]);

  const name = user?.displayName || user?.email || "";
  const roleLabel = useMemo(() => {
    return "正式陪练";
  }, []);
  const greetingText = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
  }, []);
  const email = user?.email || "-";
  const phone = user?.phone || "-";
  const location = [user?.region, user?.city].filter(Boolean).join(" · ") || "-";

	const featureList = useMemo(() => features(role), [role]);

  return (
    <div className="space-y-6">
      {/* 个人信息面板 */}
      <div className="bg-gradient-to-br from-[#4ECDC4] to-[#55A3FF] rounded-xl p-6 md:p-8 text-white">
        <div className="flex flex-col md:flex-row items-center md:items-start gap-6">
          {/* 头像和徽章 */}
          <div className="relative">
            <div className="w-20 h-20 md:w-24 md:h-24 rounded-full bg-white/20 backdrop-blur-sm border-4 border-white/30 overflow-hidden flex items-center justify-center">
              {user?.avatar ? (
                <CloudImageWithFallback
                  src={user.avatar}
                  alt={name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-3xl md:text-4xl font-bold leading-none">
                  {(name || "?").slice(0, 1).toUpperCase()}
                </span>
              )}
            </div>
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 bg-white text-[#4ECDC4] px-3 py-1 rounded-full text-xs font-semibold shadow-lg flex items-center gap-1 whitespace-nowrap min-w-max">
              <Award size={14} />
              <span>{roleLabel || "-"}</span>
            </div>
          </div>

          {/* 用户信息 */}
          <div className="flex-1 text-center md:text-left">
            <div className="text-white/80 text-xs md:text-sm mb-1">{greetingText}</div>
            <h1 className="text-2xl md:text-3xl font-bold mb-2">
              Hi, {name || "-"}
            </h1>
            <p className="text-white/80 text-sm md:text-base mb-4">
              账号：{email}
            </p>
            <div className="flex flex-wrap items-center justify-center md:justify-start gap-4">
              <div className="flex items-center gap-2 bg-white/20 backdrop-blur-sm px-4 py-2 rounded-lg">
                <Users size={18} />
                <span className="text-sm">ID：{user?.id ?? "-"}</span>
              </div>
              <div className="flex items-center gap-2 bg-white/20 backdrop-blur-sm px-4 py-2 rounded-lg">
                <Star size={18} />
                <span className="text-sm">角色：{user?.role || "-"}</span>
              </div>
              <CloudButton
                onClick={() => navigate("/profile/edit")}
                className="h-9 px-4 rounded-lg bg-white/20 hover:bg-white/25 text-white border border-white/30 transition-all duration-200 hover:shadow-sm active:scale-[0.99]"
              >
                编辑资料
              </CloudButton>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-white rounded-2xl border border-[#E2E8F0] p-6">
          <h2 className="text-[#2D3748] font-semibold text-[18px] mb-4 mt-6">基本信息</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-center gap-3 p-4 rounded-xl bg-[#F7F9FC] border border-[#E2E8F0]">
              <Mail size={18} className="text-[#55A3FF]" />
              <div className="min-w-0">
                <div className="text-xs text-[#A0AEC0]">邮箱</div>
                <div className="text-sm text-[#2D3748] truncate">{email}</div>
              </div>
            </div>

            <div className="flex items-center gap-3 p-4 rounded-xl bg-[#F7F9FC] border border-[#E2E8F0]">
              <Phone size={18} className="text-[#4ECDC4]" />
              <div className="min-w-0">
                <div className="text-xs text-[#A0AEC0]">手机号</div>
                <div className="text-sm text-[#2D3748] truncate">{phone}</div>
              </div>
            </div>

            <div className="flex items-center gap-3 p-4 rounded-xl bg-[#F7F9FC] border border-[#E2E8F0] md:col-span-2">
              <MapPin size={18} className="text-[#FF6B6B]" />
              <div className="min-w-0">
                <div className="text-xs text-[#A0AEC0]">地区</div>
                <div className="text-sm text-[#2D3748] truncate">{location}</div>
              </div>
            </div>
          </div>

          <div className="mt-6">
            <h3 className="text-[#2D3748] font-semibold mb-2">个人简介</h3>
            <div className="text-sm text-[#718096] leading-relaxed">
              擅长通过结构化训练帮助学员建立稳固的词汇体系，覆盖四级/六级/托福/雅思等主流考试。
              关注学习节奏与抗遗忘策略，强调可持续的复习闭环。
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-[#E2E8F0] p-6">
          <h2 className="text-[#2D3748] font-semibold text-[18px] mb-4">账号与安全</h2>

          <div className="space-y-3">
            <div className="p-4 rounded-xl border border-[#E2E8F0]">
              <div className="text-sm font-medium text-[#2D3748]">登录状态</div>
              <div className="text-xs text-[#718096] mt-1">
                最近登录：{user?.lastLogin || "-"}
              </div>
            </div>
            <div className="p-4 rounded-xl border border-[#E2E8F0]">
              <div className="text-sm font-medium text-[#2D3748]">双重验证</div>
              <div className="text-xs text-[#718096] mt-1">
                {user?.twoFactorEnabled ? "已开启" : "未开启"}
              </div>
            </div>
            <div className="p-4 rounded-xl border border-[#E2E8F0]">
              <div className="text-sm font-medium text-[#2D3748]">权限</div>
              <div className="text-xs text-[#718096] mt-1">
                {roleLabel ? `${roleLabel} · 基础功能` : "-"}
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
          {featureList.map((feature) => {
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