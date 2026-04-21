import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { CloudButton } from "@/components/cloudsteps";
import { getCaptcha, loginWithPassword, type User } from "@/api/auth";
import { useAuthStore } from "@/stores/authStore";

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const doLogin = useAuthStore((s) => s.login);
  const isLoading = useAuthStore((s) => s.isLoading);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [captchaId, setCaptchaId] = useState<string | null>(null);
  const [captchaImage, setCaptchaImage] = useState<string | null>(null);
  const [captchaCode, setCaptchaCode] = useState("");
  const [errorText, setErrorText] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const lastSubmitTsRef = useRef(0);

  const isSubmitting = isLoading || submitting;

  const nextPath = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return params.get("next") || "/";
  }, [location.search]);

  const refreshCaptcha = async () => {
    try {
      const res = await getCaptcha();
      if (res.code !== 200) return;
      setCaptchaId(res.data?.id ?? null);
      setCaptchaImage(res.data?.image ?? null);
      setCaptchaCode("");
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    refreshCaptcha();
  }, []);

  const onSubmit = async () => {
    const now = Date.now();
    // 防连点：1秒内重复提交直接忽略
    if (isSubmitting || now - lastSubmitTsRef.current < 1000) return;
    lastSubmitTsRef.current = now;
    setErrorText(null);

    if (!email.trim()) {
      setErrorText("请输入账号");
      return;
    }

    if (!password) {
      setErrorText("请输入密码");
      return;
    }

    if (!captchaId || !captchaCode.trim()) {
      setErrorText("请输入验证码");
      return;
    }

    setSubmitting(true);
    try {
      const res = await loginWithPassword({
        email,
        password,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        authToken: true,
        captchaId: captchaId ?? undefined,
        captchaCode: captchaCode || undefined,
      });
      if (res.code !== 200) {
        setErrorText(res.msg || "登录失败");
        refreshCaptcha();
        return;
      }

      const token =
        res.data?.token ||
        res.data?.authToken ||
        res.data?.user?.token ||
        res.data?.user?.authToken ||
        res.data?.user?.AuthToken;

      if (!token) {
        setErrorText("登录成功但未返回 token");
        refreshCaptcha();
        return;
      }

      const userForStore: User | undefined = res.data?.user?.email
        ? {
            id: res.data.user.id,
            email: res.data.user.email,
            displayName: res.data.user.displayName ?? res.data.user.DisplayName,
            avatar: res.data.user.avatar,
            role: res.data.user.role,
            timezone: res.data.user.timezone ?? "",
            createdAt: res.data.user.createdAt ?? "",
            updatedAt: res.data.user.updatedAt ?? "",
            lastLogin: res.data.user.lastLogin ?? "",
            hasFilledDetails: (res.data.user as any).hasFilledDetails ?? false,
            emailNotifications: (res.data.user as any).emailNotifications ?? false,
          }
        : undefined;

      const ok = await doLogin(token, userForStore);
      if (!ok) {
        setErrorText("登录失败：无法获取用户信息");
        refreshCaptcha();
        return;
      }

      navigate(nextPath, { replace: true });
    } catch (e: any) {
      setErrorText(e?.msg || e?.message || "登录失败");
      refreshCaptcha();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-slate-50 via-white to-sky-50">
      <div className="w-full max-w-md rounded-2xl p-6 shadow-sm bg-white/80 backdrop-blur border border-slate-200">
        <div className="flex items-center gap-3 mb-6">
          <img
            src="/logo.png"
            alt="CloudSteps"
            className="w-10 h-10 rounded-xl object-contain"
          />
          <div>
            <div className="text-[#2D3748] text-xl font-semibold">欢迎回来</div>
            <div className="text-[#718096] text-sm">登录以继续使用云阶</div>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <div className="text-sm text-[#2D3748] font-medium mb-2">账号</div>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="请输入邮箱/手机号"
              className="w-full px-4 py-3 rounded-xl bg-white border border-slate-200 text-slate-900 placeholder:text-slate-400 transition-all duration-200 outline-none hover:border-slate-300 hover:shadow-sm focus:border-[#4ECDC4] focus:ring-2 focus:ring-[#4ECDC4]/20 active:scale-[0.99]"
            />
          </div>

          <div>
            <div className="text-sm text-[#2D3748] font-medium mb-2">密码</div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="请输入密码"
              className="w-full px-4 py-3 rounded-xl bg-white border border-slate-200 text-slate-900 placeholder:text-slate-400 transition-all duration-200 outline-none hover:border-slate-300 hover:shadow-sm focus:border-[#4ECDC4] focus:ring-2 focus:ring-[#4ECDC4]/20 active:scale-[0.99]"
            />
          </div>

          <div>
            <div className="text-sm text-[#2D3748] font-medium mb-2">验证码</div>
            <div className="flex items-center gap-3">
              <input
                value={captchaCode}
                onChange={(e) => setCaptchaCode(e.target.value)}
                placeholder="请输入验证码"
                className="flex-1 px-4 py-3 rounded-xl bg-white border border-slate-200 text-slate-900 placeholder:text-slate-400 transition-all duration-200 outline-none hover:border-slate-300 hover:shadow-sm focus:border-[#4ECDC4] focus:ring-2 focus:ring-[#4ECDC4]/20 active:scale-[0.99]"
              />
              <CloudButton
                type="button"
                onClick={refreshCaptcha}
                disabled={isSubmitting}
                className="h-[46px] w-[120px] rounded-xl border border-slate-200 bg-white/70 hover:bg-white transition-all duration-200 overflow-hidden flex items-center justify-center p-0 hover:shadow-sm active:scale-[0.99]"
                aria-label="刷新验证码"
              >
                {captchaImage ? (
                  <img
                    src={captchaImage}
                    alt="captcha"
                    className="h-full w-full object-contain"
                  />
                ) : (
                  <span className="text-xs text-[#718096]">加载中...</span>
                )}
              </CloudButton>
            </div>
          </div>

          {errorText ? (
            <div className="text-sm text-[#FF6B6B] bg-[#FF6B6B]/5 border border-[#FF6B6B]/20 rounded-xl px-4 py-3">
              {errorText}
            </div>
          ) : null}

          <CloudButton
            onClick={onSubmit}
            loading={isSubmitting}
            loadingText="登录中..."
            className="w-full py-3 rounded-xl font-medium bg-[#4ECDC4] text-white hover:bg-[#45b8b0] transition-all duration-200 hover:shadow-md active:scale-[0.99]"
            disabled={isSubmitting}
          >
            登录
          </CloudButton>

          <div className="text-xs text-[#A0AEC0] leading-relaxed">请使用你的后端账号进行登录。</div>
        </div>

      </div>
    </div>
  );
}
