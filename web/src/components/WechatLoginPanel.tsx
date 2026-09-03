import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { CheckCircle2, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { pollWechatLoginStatus, startWechatLoginSession, type WechatLoginStatus } from "../api/auth";
import { formatApiMessage } from "../utils/apiMessage";
import type { User } from "../api/auth";

type WechatLoginPanelProps = {
  active?: boolean;
  inviteCode?: string;
  onSuccess: (token: string, user?: User) => void | Promise<void>;
};

type WechatPhase = "form" | "entering";

export function WechatLoginPanel({ active = true, inviteCode, onSuccess }: WechatLoginPanelProps) {
  const { t } = useTranslation();
  const [sessionId, setSessionId] = useState("");
  const [loginCode, setLoginCode] = useState("");
  const [qrUrl, setQrUrl] = useState("/wechat-official-account-qr.jpg");
  const [status, setStatus] = useState<WechatLoginStatus>("pending");
  const [phase, setPhase] = useState<WechatPhase>("form");
  const [errorText, setErrorText] = useState<string | null>(null);
  const [booting, setBooting] = useState(true);
  const pollTimerRef = useRef<number | null>(null);
  const finishingRef = useRef(false);

  const stopPoll = useCallback(() => {
    if (pollTimerRef.current != null) {
      window.clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  const finishIfReady = useCallback(
    async (data?: { token?: string; user?: User }) => {
      if (finishingRef.current || !data?.token) return;
      finishingRef.current = true;
      stopPoll();
      setStatus("confirmed");
      setPhase("entering");
      toast.success(t("login.wechat_login_success"));
      await new Promise((resolve) => window.setTimeout(resolve, 900));
      await onSuccess(data.token, data.user);
    },
    [onSuccess, stopPoll, t],
  );

  const pollOnce = useCallback(
    async (sid: string) => {
      try {
        const res = await pollWechatLoginStatus(sid);
        if (res.code !== 200 || !res.data) return;
        const next = res.data.status;
        setStatus(next);
        if (next === "expired") {
          stopPoll();
          setErrorText(t("login.wechat_session_expired"));
          return;
        }
        if (next === "confirmed") {
          await finishIfReady({ token: res.data.token, user: res.data.user });
        }
      } catch {
        // ignore transient poll errors
      }
    },
    [finishIfReady, stopPoll, t],
  );

  const bootSession = useCallback(async () => {
    finishingRef.current = false;
    setPhase("form");
    setBooting(true);
    setErrorText(null);
    setLoginCode("");
    setStatus("pending");
    stopPoll();
    try {
      const res = await startWechatLoginSession(inviteCode);
      if (res.code !== 200 || !res.data?.sessionId) {
        setErrorText(formatApiMessage(res.msg, "login.wechat_unavailable"));
        return;
      }
      setSessionId(res.data.sessionId);
      setLoginCode(res.data.loginCode || "");
      if (res.data.qrUrl) {
        setQrUrl(
          res.data.qrUrl.startsWith("/")
            ? `${import.meta.env.BASE_URL}${res.data.qrUrl.slice(1)}`
            : res.data.qrUrl,
        );
      }
      pollTimerRef.current = window.setInterval(() => {
        void pollOnce(res.data!.sessionId);
      }, 2000);
      void pollOnce(res.data.sessionId);
    } catch (e: unknown) {
      const msg = e && typeof e === "object" && "msg" in e ? String((e as { msg: string }).msg) : undefined;
      setErrorText(formatApiMessage(msg, "login.wechat_unavailable"));
    } finally {
      setBooting(false);
    }
  }, [inviteCode, pollOnce, stopPoll]);

  useEffect(() => {
    if (!active) {
      stopPoll();
      return;
    }
    void bootSession();
    return () => stopPoll();
  }, [active, bootSession, stopPoll]);

  const waiting = status === "pending" && sessionId && !errorText && !booting && phase === "form";

  if (phase === "entering") {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-10">
        <div className="relative flex size-16 items-center justify-center">
          <Loader2 className="size-10 animate-spin text-[#07C160]" aria-hidden="true" />
          <CheckCircle2
            className="absolute size-5 text-[#07C160] animate-in fade-in zoom-in duration-300"
            aria-hidden="true"
          />
        </div>
        <div className="text-center space-y-1">
          <p className="text-sm font-medium text-foreground">{t("login.wechat_login_success")}</p>
          <p className="text-xs text-muted-foreground">{t("login.wechat_entering")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs text-muted-foreground leading-relaxed flex-1">{t("login.wechat_steps_compact")}</p>
        <button
          type="button"
          onClick={() => void bootSession()}
          disabled={booting}
          className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
          title={t("login.wechat_refresh")}
        >
          <RefreshCw className={`size-3.5 ${booting ? "animate-spin" : ""}`} />
          {t("login.wechat_refresh")}
        </button>
      </div>

      <div className="flex gap-3 rounded-xl border border-border bg-background/40 p-3">
        <div className="shrink-0 rounded-lg border border-border bg-white p-1.5">
          {booting ? (
            <div className="flex size-[88px] items-center justify-center">
              <Loader2 className="size-5 animate-spin text-muted-foreground/50" />
            </div>
          ) : (
            <img src={qrUrl} alt={t("login.wechat_qr_alt")} className="size-[88px] object-contain" />
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col justify-center gap-1">
          <span className="text-xs font-medium text-charcoal">{t("login.wechat_code_label")}</span>
          {booting ? (
            <Loader2 className="size-5 animate-spin text-[#07C160]/60" />
          ) : (
            <span className="text-2xl font-semibold tracking-[0.25em] text-[#07C160] tabular-nums">{loginCode}</span>
          )}
          {waiting ? (
            <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <span className="inline-block size-1.5 rounded-full bg-[#07C160] animate-pulse" />
              {t("login.wechat_polling")}
            </p>
          ) : null}
        </div>
      </div>

      {errorText ? (
        <p className="text-xs text-destructive bg-destructive/5 border border-destructive/20 rounded-lg px-3 py-2">
          {errorText}
        </p>
      ) : null}
    </div>
  );
}
