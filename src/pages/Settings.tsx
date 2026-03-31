import { useNavigate } from "react-router";
import { ChevronLeft, ChevronRight, Lock, Smartphone, Bell, Shield, LogOut } from "lucide-react";
import { CloudButton } from "@/components/cloudsteps";
import { useEffect, useMemo, useState } from "react";
import { useAuthStore } from "@/stores/authStore";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import {
  changePassword,
  getUserActivity,
  sendPhoneVerification,
  updateCurrentUser,
  updateNotificationSettings,
  verifyPhone,
  type UserActivity,
} from "@/api/auth";

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
  const logout = useAuthStore((s) => s.logout);
  const clearUser = useAuthStore((s) => s.clearUser);
  const refreshUserInfo = useAuthStore((s) => s.refreshUserInfo);
  const user = useAuthStore((s) => s.user);
  const [logoutOpen, setLogoutOpen] = useState(false);

  const [panel, setPanel] = useState<null | "password" | "phone" | "notifications" | "security">(null);

  const [errorText, setErrorText] = useState<string | null>(null);

  // 修改密码
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  // 绑定手机号
  const [phone, setPhone] = useState("");
  const [phoneCode, setPhoneCode] = useState("");
  const [sendingPhoneCode, setSendingPhoneCode] = useState(false);
  const [verifyingPhone, setVerifyingPhone] = useState(false);

  // 通知设置
  const [emailNotifications, setEmailNotifications] = useState(false);
  const [pushNotifications, setPushNotifications] = useState(false);
  const [systemNotifications, setSystemNotifications] = useState(false);
  const [autoCleanUnreadEmails, setAutoCleanUnreadEmails] = useState(false);
  const [savingNotifications, setSavingNotifications] = useState(false);

  // 安全/活动
  const [activityLoading, setActivityLoading] = useState(false);
  const [activities, setActivities] = useState<UserActivity[]>([]);

  useEffect(() => {
    setPhone(user?.phone ?? "");
    setEmailNotifications(Boolean(user?.emailNotifications));
    setPushNotifications(Boolean(user?.pushNotifications));
    setSystemNotifications(Boolean(user?.systemNotifications));
    setAutoCleanUnreadEmails(Boolean(user?.autoCleanUnreadEmails));
  }, [user]);

  useEffect(() => {
    if (panel !== "security") return;
    let mounted = true;
    (async () => {
      try {
        setActivityLoading(true);
        const res = await getUserActivity({ page: 1, limit: 20 });
        if (!mounted) return;
        if (res.code === 200) {
          setActivities(res.data?.activities ?? []);
        } else {
          setActivities([]);
        }
      } catch {
        if (!mounted) return;
        setActivities([]);
      } finally {
        if (mounted) setActivityLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [panel]);

  const openPanel = (p: NonNullable<typeof panel>) => {
    setErrorText(null);
    setPanel(p);
  };

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
        {/* 设置选项 */}
        <div className="bg-white rounded-xl p-4">
          <h2 className="text-[18px] font-semibold text-[#2D3748] mb-4 px-2">账号设置</h2>
          <div className="space-y-2">
            {settingOptions.map((option) => {
              const Icon = option.icon;
              return (
                <CloudButton
                  key={option.id}
                  onClick={() => {
                    if (option.id === 1) openPanel("password");
                    if (option.id === 2) openPanel("phone");
                    if (option.id === 3) openPanel("notifications");
                    if (option.id === 4) openPanel("security");
                  }}
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
            <CloudButton
              onClick={() => navigate("/about")}
              className="w-full flex items-center justify-between p-4 hover:bg-[#F7F9FC] rounded-lg transition-colors"
            >
              <span className="text-[#2D3748] font-medium">关于我们</span>
              <ChevronRight size={20} className="text-[#A0AEC0]" />
            </CloudButton>
            <CloudButton
              onClick={() => navigate("/terms")}
              className="w-full flex items-center justify-between p-4 hover:bg-[#F7F9FC] rounded-lg transition-colors"
            >
              <span className="text-[#2D3748] font-medium">用户协议</span>
              <ChevronRight size={20} className="text-[#A0AEC0]" />
            </CloudButton>
            <CloudButton
              onClick={() => navigate("/privacy")}
              className="w-full flex items-center justify-between p-4 hover:bg-[#F7F9FC] rounded-lg transition-colors"
            >
              <span className="text-[#2D3748] font-medium">隐私政策</span>
              <ChevronRight size={20} className="text-[#A0AEC0]" />
            </CloudButton>
          </div>
        </div>

        {/* 退出登录 */}
        <CloudButton
          onClick={() => setLogoutOpen(true)}
          className="w-full bg-white rounded-xl p-4 text-[#FF6B6B] font-medium hover:bg-[#FF6B6B]/5 transition-colors flex items-center justify-center gap-2"
        >
          <LogOut size={20} />
          <span>退出登录</span>
        </CloudButton>

        <ConfirmDialog
          open={logoutOpen}
          onOpenChange={setLogoutOpen}
          title="确认退出登录？"
          description="退出后需要重新登录才能继续使用。"
          confirmText="退出登录"
          cancelText="取消"
          confirmVariant="destructive"
          onConfirm={async () => {
            await logout();
            navigate("/login", { replace: true });
          }}
        />

        {/* Panels */}
        <Dialog open={panel !== null} onOpenChange={(v) => !v && setPanel(null)}>
          <DialogContent className="sm:max-w-[520px] rounded-2xl border-slate-200 shadow-xl">
            {panel === "password" ? (
              <>
                <DialogHeader>
                  <DialogTitle className="text-slate-900">修改密码</DialogTitle>
                </DialogHeader>

                <div className="space-y-4">
                  <div>
                    <div className="text-sm text-slate-700 font-medium mb-2">当前密码</div>
                    <input
                      type="password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder="请输入当前密码"
                      className="w-full px-4 py-3 rounded-xl bg-white border border-slate-200 text-slate-900 placeholder:text-slate-400 transition-all duration-200 outline-none hover:border-slate-300 hover:shadow-sm focus:border-[#4ECDC4] focus:ring-2 focus:ring-[#4ECDC4]/20"
                    />
                  </div>
                  <div>
                    <div className="text-sm text-slate-700 font-medium mb-2">新密码</div>
                    <input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="至少 6 位"
                      className="w-full px-4 py-3 rounded-xl bg-white border border-slate-200 text-slate-900 placeholder:text-slate-400 transition-all duration-200 outline-none hover:border-slate-300 hover:shadow-sm focus:border-[#4ECDC4] focus:ring-2 focus:ring-[#4ECDC4]/20"
                    />
                  </div>
                  <div>
                    <div className="text-sm text-slate-700 font-medium mb-2">确认新密码</div>
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="再次输入新密码"
                      className="w-full px-4 py-3 rounded-xl bg-white border border-slate-200 text-slate-900 placeholder:text-slate-400 transition-all duration-200 outline-none hover:border-slate-300 hover:shadow-sm focus:border-[#4ECDC4] focus:ring-2 focus:ring-[#4ECDC4]/20"
                    />
                  </div>

                  {errorText ? (
                    <div className="text-sm text-[#FF6B6B] bg-[#FF6B6B]/5 border border-[#FF6B6B]/20 rounded-xl px-4 py-3">
                      {errorText}
                    </div>
                  ) : null}
                </div>

                <DialogFooter className="gap-2 sm:gap-2">
                  <CloudButton
                    type="button"
                    onClick={() => setPanel(null)}
                    disabled={savingPassword}
                    className="h-10 px-4 rounded-xl border border-slate-200 bg-white text-slate-900 hover:bg-slate-50 transition-all duration-200 hover:shadow-sm active:scale-[0.99]"
                  >
                    取消
                  </CloudButton>
                  <CloudButton
                    type="button"
                    disabled={savingPassword}
                    onClick={async () => {
                      setErrorText(null);
                      if (!currentPassword) {
                        setErrorText("请输入当前密码");
                        return;
                      }
                      if (!newPassword || newPassword.length < 6) {
                        setErrorText("新密码至少 6 位");
                        return;
                      }
                      if (confirmPassword && confirmPassword !== newPassword) {
                        setErrorText("两次输入的新密码不一致");
                        return;
                      }

                      try {
                        setSavingPassword(true);
                        const res = await changePassword({
                          currentPassword,
                          newPassword,
                          confirmPassword: confirmPassword || undefined,
                        });

                        if (res.code !== 200) {
                          setErrorText(res.msg || "修改失败");
                          return;
                        }

                        setPanel(null);
                        setCurrentPassword("");
                        setNewPassword("");
                        setConfirmPassword("");

                        if (res.data?.logout) {
                          clearUser();
                          navigate("/login", { replace: true });
                        }
                      } catch (e: any) {
                        setErrorText(e?.msg || e?.message || "修改失败");
                      } finally {
                        setSavingPassword(false);
                      }
                    }}
                    className="h-10 px-4 rounded-xl font-medium bg-[#4ECDC4] text-white hover:bg-[#45b8b0] transition-all duration-200 hover:shadow-md active:scale-[0.99]"
                  >
                    {savingPassword ? (
                      <span className="inline-flex items-center justify-center gap-2">
                        <span className="inline-block h-4 w-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                        <span>保存</span>
                      </span>
                    ) : (
                      "保存"
                    )}
                  </CloudButton>
                </DialogFooter>
              </>
            ) : null}

            {panel === "phone" ? (
              <>
                <DialogHeader>
                  <DialogTitle className="text-slate-900">绑定手机号</DialogTitle>
                </DialogHeader>

                <div className="space-y-4">
                  <div>
                    <div className="text-sm text-slate-700 font-medium mb-2">手机号</div>
                    <input
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="请输入手机号"
                      className="w-full px-4 py-3 rounded-xl bg-white border border-slate-200 text-slate-900 placeholder:text-slate-400 transition-all duration-200 outline-none hover:border-slate-300 hover:shadow-sm focus:border-[#4ECDC4] focus:ring-2 focus:ring-[#4ECDC4]/20"
                    />
                    <div className="text-xs text-slate-500 mt-2">
                      提示：验证码发送接口要求你已在资料中设置手机号。
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <CloudButton
                      type="button"
                      disabled={sendingPhoneCode}
                      onClick={async () => {
                        setErrorText(null);
                        try {
                          setSendingPhoneCode(true);
                          if (!phone.trim()) {
                            setErrorText("请先填写手机号");
                            return;
                          }
                          await updateCurrentUser({ phone: phone.trim() });
                          const res = await sendPhoneVerification();
                          if (res.code !== 200) {
                            setErrorText(res.msg || "发送失败");
                            return;
                          }
                        } catch (e: any) {
                          setErrorText(e?.msg || e?.message || "发送失败");
                        } finally {
                          setSendingPhoneCode(false);
                        }
                      }}
                      className="h-10 px-4 rounded-xl font-medium bg-[#4ECDC4] text-white hover:bg-[#45b8b0] transition-all duration-200 hover:shadow-md active:scale-[0.99]"
                    >
                      {sendingPhoneCode ? "发送中..." : "发送验证码"}
                    </CloudButton>
                    <input
                      value={phoneCode}
                      onChange={(e) => setPhoneCode(e.target.value)}
                      placeholder="输入验证码"
                      className="flex-1 px-4 py-3 rounded-xl bg-white border border-slate-200 text-slate-900 placeholder:text-slate-400 transition-all duration-200 outline-none hover:border-slate-300 hover:shadow-sm focus:border-[#4ECDC4] focus:ring-2 focus:ring-[#4ECDC4]/20"
                    />
                  </div>

                  {errorText ? (
                    <div className="text-sm text-[#FF6B6B] bg-[#FF6B6B]/5 border border-[#FF6B6B]/20 rounded-xl px-4 py-3">
                      {errorText}
                    </div>
                  ) : null}
                </div>

                <DialogFooter className="gap-2 sm:gap-2">
                  <CloudButton
                    type="button"
                    onClick={() => setPanel(null)}
                    disabled={verifyingPhone}
                    className="h-10 px-4 rounded-xl border border-slate-200 bg-white text-slate-900 hover:bg-slate-50 transition-all duration-200 hover:shadow-sm active:scale-[0.99]"
                  >
                    关闭
                  </CloudButton>
                  <CloudButton
                    type="button"
                    disabled={verifyingPhone}
                    onClick={async () => {
                      setErrorText(null);
                      if (!phoneCode.trim()) {
                        setErrorText("请输入验证码");
                        return;
                      }
                      try {
                        setVerifyingPhone(true);
                        const res = await verifyPhone(phoneCode.trim());
                        if (res.code !== 200) {
                          setErrorText(res.msg || "验证失败");
                          return;
                        }
                        await refreshUserInfo();
                        setPanel(null);
                        setPhoneCode("");
                      } catch (e: any) {
                        setErrorText(e?.msg || e?.message || "验证失败");
                      } finally {
                        setVerifyingPhone(false);
                      }
                    }}
                    className="h-10 px-4 rounded-xl font-medium bg-[#4ECDC4] text-white hover:bg-[#45b8b0] transition-all duration-200 hover:shadow-md active:scale-[0.99]"
                  >
                    {verifyingPhone ? "验证中..." : "确认绑定"}
                  </CloudButton>
                </DialogFooter>
              </>
            ) : null}

            {panel === "notifications" ? (
              <>
                <DialogHeader>
                  <DialogTitle className="text-slate-900">消息通知</DialogTitle>
                </DialogHeader>

                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 rounded-xl border border-slate-200">
                    <div>
                      <div className="text-slate-900 font-medium">邮件通知</div>
                      <div className="text-slate-500 text-sm">重要活动与账号提醒</div>
                    </div>
                    <Switch checked={emailNotifications} onCheckedChange={setEmailNotifications} />
                  </div>
                  <div className="flex items-center justify-between p-4 rounded-xl border border-slate-200">
                    <div>
                      <div className="text-slate-900 font-medium">推送通知</div>
                      <div className="text-slate-500 text-sm">学习提醒与系统推送</div>
                    </div>
                    <Switch checked={pushNotifications} onCheckedChange={setPushNotifications} />
                  </div>
                  <div className="flex items-center justify-between p-4 rounded-xl border border-slate-200">
                    <div>
                      <div className="text-slate-900 font-medium">系统通知</div>
                      <div className="text-slate-500 text-sm">系统公告与安全提醒</div>
                    </div>
                    <Switch checked={systemNotifications} onCheckedChange={setSystemNotifications} />
                  </div>
                  <div className="flex items-center justify-between p-4 rounded-xl border border-slate-200">
                    <div>
                      <div className="text-slate-900 font-medium">自动清理未读邮件</div>
                      <div className="text-slate-500 text-sm">自动清理 7 天未读</div>
                    </div>
                    <Switch checked={autoCleanUnreadEmails} onCheckedChange={setAutoCleanUnreadEmails} />
                  </div>

                  {errorText ? (
                    <div className="text-sm text-[#FF6B6B] bg-[#FF6B6B]/5 border border-[#FF6B6B]/20 rounded-xl px-4 py-3">
                      {errorText}
                    </div>
                  ) : null}
                </div>

                <DialogFooter className="gap-2 sm:gap-2">
                  <CloudButton
                    type="button"
                    onClick={() => setPanel(null)}
                    disabled={savingNotifications}
                    className="h-10 px-4 rounded-xl border border-slate-200 bg-white text-slate-900 hover:bg-slate-50 transition-all duration-200 hover:shadow-sm active:scale-[0.99]"
                  >
                    关闭
                  </CloudButton>
                  <CloudButton
                    type="button"
                    disabled={savingNotifications}
                    onClick={async () => {
                      setErrorText(null);
                      try {
                        setSavingNotifications(true);
                        const res = await updateNotificationSettings({
                          emailNotifications,
                          pushNotifications,
                          systemNotifications,
                          autoCleanUnreadEmails,
                        });
                        if (res.code !== 200) {
                          setErrorText(res.msg || "保存失败");
                          return;
                        }
                        await refreshUserInfo();
                        setPanel(null);
                      } catch (e: any) {
                        setErrorText(e?.msg || e?.message || "保存失败");
                      } finally {
                        setSavingNotifications(false);
                      }
                    }}
                    className="h-10 px-4 rounded-xl font-medium bg-[#4ECDC4] text-white hover:bg-[#45b8b0] transition-all duration-200 hover:shadow-md active:scale-[0.99]"
                  >
                    {savingNotifications ? "保存中..." : "保存"}
                  </CloudButton>
                </DialogFooter>
              </>
            ) : null}

            {panel === "security" ? (
              <>
                <DialogHeader>
                  <DialogTitle className="text-slate-900">账号安全</DialogTitle>
                </DialogHeader>

                <div className="space-y-3">
                  <div className="p-4 rounded-xl border border-slate-200">
                    <div className="text-slate-900 font-medium">最近登录</div>
                    <div className="text-slate-500 text-sm mt-1">{user?.lastLogin || "-"}</div>
                  </div>

                  <div className="p-4 rounded-xl border border-slate-200">
                    <div className="text-slate-900 font-medium">活动记录</div>
                    <div className="text-slate-500 text-sm mt-1">显示最近 20 条</div>

                    <div className="mt-3 space-y-2 max-h-[320px] overflow-auto pr-1">
                      {activityLoading ? (
                        <div className="text-sm text-slate-500">加载中...</div>
                      ) : activities.length === 0 ? (
                        <div className="text-sm text-slate-500">暂无记录</div>
                      ) : (
                        activities.map((a) => (
                          <div
                            key={a.id}
                            className="p-3 rounded-xl bg-slate-50 border border-slate-200"
                          >
                            <div className="text-slate-900 text-sm font-medium">
                              {a.action || "-"}
                            </div>
                            <div className="text-slate-500 text-xs mt-1 break-words">
                              {a.createdAt}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {errorText ? (
                    <div className="text-sm text-[#FF6B6B] bg-[#FF6B6B]/5 border border-[#FF6B6B]/20 rounded-xl px-4 py-3">
                      {errorText}
                    </div>
                  ) : null}
                </div>

                <DialogFooter className="gap-2 sm:gap-2">
                  <CloudButton
                    type="button"
                    onClick={() => setPanel(null)}
                    className="h-10 px-4 rounded-xl border border-slate-200 bg-white text-slate-900 hover:bg-slate-50 transition-all duration-200 hover:shadow-sm active:scale-[0.99]"
                  >
                    关闭
                  </CloudButton>
                </DialogFooter>
              </>
            ) : null}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
