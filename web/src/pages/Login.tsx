import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { ArrowLeft } from "lucide-react";
import { CloudButton } from "../components/cloudsteps";
import CaptchaWidget from "../components/CaptchaWidget";
import { WechatIcon } from "../components/WechatIcon";
import {
  loginWithPassword,
  registerUser,
  type CaptchaFields,
  type LoginResponseData,
  type User,
} from "../api/auth";
import { useAuthStore } from "../stores/authStore";
import { formatAuthErrorMessage } from "../utils/authErrors";
import { WechatLoginPanel } from "../components/WechatLoginPanel";

const fieldClass =
  "w-full px-4 py-3 rounded-xl bg-background/60 border border-input text-charcoal placeholder:text-muted-soft transition-colors duration-200 outline-none hover:border-border focus:border-primary focus:ring-[3px] focus:ring-primary/25";

type Screen = "login" | "register";

function pickToken(data?: LoginResponseData | null) {
  return (
    data?.token ||
    data?.authToken ||
    data?.user?.token ||
    data?.user?.authToken ||
    data?.user?.AuthToken ||
    ""
  );
}

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();
  const doLogin = useAuthStore((s) => s.login);
  const isLoading = useAuthStore((s) => s.isLoading);
  const [screen, setScreen] = useState<Screen>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("register") === "1" ? "register" : "login";
  });
  const [showWechat, setShowWechat] = useState(false);
  const [account, setAccount] = useState("");
  const [password, setPassword] = useState("");
  const [captchaFields, setCaptchaFields] = useState<CaptchaFields | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const lastSubmitTsRef = useRef(0);
  const captchaKeyRef = useRef(0);

  const isSubmitting = isLoading || submitting;
  const registering = screen === "register";

  const nextPath = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return params.get("next") || "/";
  }, [location.search]);

  const refreshCaptcha = useCallback(() => {
    captchaKeyRef.current += 1;
    setCaptchaFields(null);
  }, []);

  useEffect(() => {
    setErrorText(null);
  }, [screen, showWechat]);

  const finishLogin = async (token: string, rawUser: any) => {
    const userForStore: User | undefined = rawUser
      ? {
          id: rawUser.id,
          email: rawUser.email || rawUser.username || "",
          displayName: rawUser.displayName ?? rawUser.DisplayName,
          avatar: rawUser.avatar,
          role: rawUser.role,
          timezone: rawUser.timezone ?? "",
          createdAt: rawUser.createdAt ?? "",
          updatedAt: rawUser.updatedAt ?? "",
          lastLogin: rawUser.lastLogin ?? "",
          hasFilledDetails: rawUser.hasFilledDetails ?? false,
          emailNotifications: rawUser.emailNotifications ?? false,
        }
      : undefined;

    const ok = await doLogin(token, userForStore);
    if (!ok) {
      setErrorText(t("login.login_failed_no_user"));
      refreshCaptcha();
      return;
    }
    navigate(nextPath, { replace: true });
  };

  const onSubmit = async () => {
    const now = Date.now();
    if (isSubmitting || now - lastSubmitTsRef.current < 1000) return;
    lastSubmitTsRef.current = now;
    setErrorText(null);

    const identity = account.trim();
    if (!identity) {
      setErrorText(t("login.enter_account"));
      return;
    }
    if (!password) {
      setErrorText(registering ? t("login.set_password") : t("login.enter_password"));
      return;
    }
    if (registering) {
      if ([...identity].length < 2) {
        setErrorText(t("login.account_min_2"));
        return;
      }
      if ([...identity].length > 30) {
        setErrorText(t("login.account_too_long"));
        return;
      }
      if (password.length < 6) {
        setErrorText(t("login.password_min_6"));
        return;
      }
    }
    if (!captchaFields?.captchaId || captchaFields.captchaValue == null || captchaFields.captchaValue === "") {
      setErrorText(t("login.complete_captcha"));
      return;
    }

    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const captcha = {
      captchaId: captchaFields.captchaId,
      captchaType: captchaFields.captchaType,
      captchaValue: captchaFields.captchaValue,
    };

    setSubmitting(true);
    try {
      if (screen === "register") {
        const reg = await registerUser({
          username: identity,
          password,
          displayName: identity,
          timezone,
          source: "web",
          ...captcha,
        });
        if (reg.code !== 200) {
          setErrorText(formatAuthErrorMessage(reg.msg, t("login.register_failed")));
          refreshCaptcha();
          return;
        }
        const autoLogin = await loginWithPassword({
          email: identity,
          password,
          timezone,
          authToken: true,
        });
        if (autoLogin.code === 200) {
          const token = pickToken(autoLogin.data);
          if (token) {
            const userForStore = (autoLogin.data?.user || {}) as User;
            const ok = await doLogin(token, userForStore);
            if (ok) {
              navigate(nextPath, { replace: true });
              return;
            }
          }
        }
        setScreen("login");
        setShowWechat(false);
        setPassword("");
        refreshCaptcha();
        setErrorText(t("login.register_success_login"));
        return;
      }

      const res = await loginWithPassword({
        email: identity,
        password,
        timezone,
        authToken: true,
        ...captcha,
      });
      if (res.code !== 200) {
        setErrorText(formatAuthErrorMessage(res.msg, t("login.login_failed")));
        refreshCaptcha();
        return;
      }
      const token = pickToken(res.data);
      if (!token) {
        setErrorText(t("login.login_success_no_token"));
        refreshCaptcha();
        return;
      }
      await finishLogin(token, res.data?.user);
    } catch (e: any) {
      setErrorText(
        formatAuthErrorMessage(
          e?.msg || e?.message,
          screen === "register" ? t("login.register_failed") : t("login.login_failed"),
        ),
      );
      refreshCaptcha();
    } finally {
      setSubmitting(false);
    }
  };

  const title = screen === "login" ? t("login.title") : t("login.register_title");

  return (
    <div className="relative min-h-screen flex items-center justify-center p-4 sm:p-6 bg-background">
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute -top-28 -right-20 size-80 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute -bottom-36 -left-24 size-96 rounded-full bg-secondary-brand/10 blur-3xl" />
      </div>

      <div className="relative w-full max-w-[420px] rounded-2xl border border-border/70 bg-card/95 backdrop-blur-sm p-6 sm:p-7 shadow-[var(--shadow-rest)]">
        {showWechat && screen === "login" ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2.5">
              <img
                src={`${import.meta.env.BASE_URL}logo.png`}
                alt="CloudSteps"
                className="size-9 rounded-lg object-contain"
              />
              <h1 className="text-xl font-semibold tracking-tight text-foreground">{t("login.app_name")}</h1>
            </div>
            <button
              type="button"
              onClick={() => setShowWechat(false)}
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors -mt-1"
            >
              <ArrowLeft className="size-4" />
              {t("login.back_to_password")}
            </button>

            <WechatLoginPanel
              active
              onSuccess={async (token, rawUser) => {
                await finishLogin(token, rawUser);
              }}
            />
          </div>
        ) : (
          <>
            <div className="flex items-center justify-center gap-2.5 mb-5">
              <img
                src={`${import.meta.env.BASE_URL}logo.png`}
                alt="CloudSteps"
                className="size-10 rounded-xl object-contain"
              />
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">{t("login.app_name")}</h1>
            </div>
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-foreground">{title}</h2>
              {screen === "register" ? (
                <p className="mt-1.5 text-sm text-muted-foreground">{t("login.register_hint")}</p>
              ) : null}
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-sm text-charcoal font-medium mb-1.5 block">{t("login.account")}</label>
                <input
                  value={account}
                  onChange={(e) => setAccount(e.target.value)}
                  placeholder={registering ? t("login.username_placeholder") : t("login.username_or_email")}
                  className={fieldClass}
                  autoComplete="username"
                />
              </div>

              <div>
                <label className="text-sm text-charcoal font-medium mb-1.5 block">
                  {screen === "register" ? t("login.set_password") : t("login.password")}
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={screen === "register" ? t("login.password_placeholder_min") : t("login.enter_password")}
                  className={fieldClass}
                  autoComplete={screen === "register" ? "new-password" : "current-password"}
                />
              </div>

              <div>
                <label className="text-sm text-charcoal font-medium mb-1.5 block">{t("login.captcha")}</label>
                <CaptchaWidget key={captchaKeyRef.current} onChange={setCaptchaFields} />
              </div>

              {errorText ? (
                <div className="text-sm text-destructive bg-destructive/5 border border-destructive/20 rounded-xl px-4 py-3">
                  {errorText}
                </div>
              ) : null}

              <CloudButton
                variant="brand"
                onClick={onSubmit}
                loading={isSubmitting}
                loadingText={screen === "register" ? t("login.registering") : t("login.signing_in")}
                className="w-full h-11 mt-1"
                disabled={isSubmitting}
              >
                {title}
              </CloudButton>

              <p className="text-center text-sm text-muted-foreground pt-1">
                {screen === "login" ? (
                  <>
                    {t("login.no_account")}
                    <button
                      type="button"
                      className="ml-1 text-primary font-medium hover:underline"
                      onClick={() => {
                        setScreen("register");
                        setShowWechat(false);
                        setErrorText(null);
                      }}
                    >
                      {t("login.click_register")}
                    </button>
                  </>
                ) : (
                  <>
                    {t("login.have_account")}
                    <button
                      type="button"
                      className="ml-1 text-primary font-medium hover:underline"
                      onClick={() => {
                        setScreen("login");
                        setShowWechat(false);
                        setErrorText(null);
                      }}
                    >
                      {t("login.back_to_login")}
                    </button>
                  </>
                )}
              </p>
            </div>

            {screen === "login" ? (
              <div className="mt-8">
                <div className="flex items-center gap-3 mb-4">
                  <div className="h-px flex-1 bg-border" />
                  <span className="text-xs text-muted-foreground shrink-0">{t("login.other_methods")}</span>
                  <div className="h-px flex-1 bg-border" />
                </div>
                <div className="flex justify-center">
                  <button
                    type="button"
                    onClick={() => setShowWechat(true)}
                    className="inline-flex items-center justify-center size-12 rounded-full border border-border bg-[#07C160]/10 text-[#07C160] hover:bg-[#07C160]/15 hover:border-[#07C160]/40 transition-colors"
                    aria-label={t("login.wechat_login")}
                    title={t("login.wechat_login")}
                  >
                    <WechatIcon className="size-7" />
                  </button>
                </div>
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
