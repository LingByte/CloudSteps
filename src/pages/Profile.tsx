import { useMemo, useState } from "react";
import { Mail, Phone, MapPin, Shield, Award, BookOpen, Clock } from "lucide-react";
import type { LucideIcon } from "lucide-react";

type StatCard = {
  label: string;
  value: string;
  icon: LucideIcon;
  color: string;
};

export default function Profile() {
  const [name] = useState("April Zhang");
  const [role] = useState("正式陪练");
  const [email] = useState("april@yunjiebei.com");
  const [phone] = useState("138****8888");
  const [location] = useState("中国 · 深圳");

  const stats: StatCard[] = useMemo(
    () => [
      { label: "累计陪练", value: "43h", icon: Clock, color: "#4ECDC4" },
      { label: "本月陪练", value: "12h", icon: Award, color: "#55A3FF" },
      { label: "训练记录", value: "128", icon: BookOpen, color: "#FF6B6B" },
    ],
    [],
  );

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl border border-[#E2E8F0] p-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#4ECDC4] to-[#55A3FF] flex items-center justify-center text-white text-xl font-bold">
              {name.slice(0, 1).toUpperCase()}
            </div>
            <div>
              <div className="text-[#2D3748] text-xl font-semibold">{name}</div>
              <div className="mt-1 inline-flex items-center gap-2 px-3 py-1 bg-[#4ECDC4]/10 rounded-full">
                <Shield size={14} className="text-[#4ECDC4]" />
                <span className="text-xs text-[#4ECDC4] font-semibold">
                  {role}
                </span>
              </div>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              className="px-4 py-2 rounded-lg border border-[#E2E8F0] text-[#2D3748] text-sm font-medium hover:bg-[#F7F9FC] transition-colors"
            >
              编辑资料
            </button>
            <button
              type="button"
              className="px-4 py-2 rounded-lg bg-[#4ECDC4] text-white text-sm font-medium hover:bg-[#45b8b0] transition-colors"
            >
              保存
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {stats.map((s) => {
          const Icon = s.icon;
          return (
            <div
              key={s.label}
              className="bg-white rounded-2xl border border-[#E2E8F0] p-5"
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm text-[#718096]">{s.label}</div>
                  <div className="text-[26px] font-bold text-[#2D3748] mt-1">
                    {s.value}
                  </div>
                </div>
                <div
                  className="w-11 h-11 rounded-xl flex items-center justify-center"
                  style={{ backgroundColor: `${s.color}15` }}
                >
                  <Icon size={20} color={s.color} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-white rounded-2xl border border-[#E2E8F0] p-6">
          <h2 className="text-[#2D3748] font-semibold text-[18px] mb-4">
            基本信息
          </h2>

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
          <h2 className="text-[#2D3748] font-semibold text-[18px] mb-4">
            账号与安全
          </h2>

          <div className="space-y-3">
            <div className="p-4 rounded-xl border border-[#E2E8F0]">
              <div className="text-sm font-medium text-[#2D3748]">登录状态</div>
              <div className="text-xs text-[#718096] mt-1">最近登录：今天 16:18</div>
            </div>
            <div className="p-4 rounded-xl border border-[#E2E8F0]">
              <div className="text-sm font-medium text-[#2D3748]">双重验证</div>
              <div className="text-xs text-[#718096] mt-1">未开启</div>
            </div>
            <div className="p-4 rounded-xl border border-[#E2E8F0]">
              <div className="text-sm font-medium text-[#2D3748]">权限</div>
              <div className="text-xs text-[#718096] mt-1">陪练 · 内容管理 · 训练查看</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
