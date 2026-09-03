import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { Copy, Download, Gift, Share2, Users } from "lucide-react";
import { PageBackHeader } from "../components/PageBackHeader";
import { CloudButton } from "../components/cloudsteps";
import { CloudCard } from "../components/cloudsteps/arco";
import { showToast } from "../utils/toast";
import { Dialog, DialogContent, DialogFooter } from "../components/ui/dialog";
import { useIsMobile } from "../components/ui/use-mobile";
import { useAuthStore } from "../stores/authStore";
import { fetchMyInvite, rotateInviteCode, type InviteOverview, type InviteRecord } from "../api/invite";

const statusLabel = (status: InviteRecord["status"]) => (status === "activated" ? "已激活" : "已注册");

const inviteUrl = (code: string) => {
  const url = new URL("login", window.location.origin + import.meta.env.BASE_URL);
  url.searchParams.set("register", "1");
  url.searchParams.set("inviteCode", code);
  return url.toString();
};

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`图片加载失败: ${src}`));
    img.src = src;
  });
}

/** Compose invite code + QR onto the AI share poster background. */
async function makePoster(code: string, inviterName: string): Promise<Blob> {
  const bg = await loadImage(`${import.meta.env.BASE_URL}invite-poster-bg.png`);
  const W = 1080;
  const H = Math.round((W * bg.naturalHeight) / bg.naturalWidth) || 1440;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("无法生成分享图片");

  ctx.drawImage(bg, 0, 0, W, H);

  // Top logo
  try {
    const logo = await loadImage(`${import.meta.env.BASE_URL}logo.png`);
    const logoH = 56;
    const logoW = (logo.naturalWidth / logo.naturalHeight) * logoH;
    ctx.drawImage(logo, 48, 40, logoW, logoH);
  } catch {
    // ignore missing logo
  }

  // Inviter + slogan
  const name = inviterName.trim() || "解忧教练";
  ctx.textAlign = "left";
  ctx.fillStyle = "#1a2b3c";
  ctx.font = "700 44px sans-serif";
  ctx.fillText(name, 48, 150);
  ctx.fillStyle = "#2a7a74";
  ctx.font = "italic 600 36px sans-serif";
  ctx.fillText("邀请你一起加入解忧学习", 48, 204);

  // Overlay info card (QR + invite code) — drawn by code, not part of bg art
  const card = { x: 48, y: H - 360, w: W - 96, h: 280, r: 28 };
  ctx.save();
  ctx.shadowColor = "rgba(26, 43, 60, 0.12)";
  ctx.shadowBlur = 24;
  ctx.shadowOffsetY = 8;
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.roundRect(card.x, card.y, card.w, card.h, card.r);
  ctx.fill();
  ctx.restore();

  const qrSize = 200;
  const qrX = card.x + 32;
  const qrY = card.y + (card.h - qrSize) / 2;
  const qrDataUrl = await QRCode.toDataURL(inviteUrl(code), {
    width: qrSize * 2,
    margin: 1,
    color: { dark: "#1a2b3c", light: "#ffffff" },
  });
  const qrImage = await loadImage(qrDataUrl);
  ctx.drawImage(qrImage, qrX, qrY, qrSize, qrSize);

  const codeX = qrX + qrSize + 28;
  const codeY = qrY + qrSize / 2;
  ctx.textAlign = "left";
  ctx.fillStyle = "#667085";
  ctx.font = "600 22px sans-serif";
  ctx.fillText("我的邀请码", codeX, codeY - 28);
  ctx.fillStyle = "#1a2b3c";
  ctx.font = "700 40px monospace";
  ctx.fillText(code, codeX, codeY + 22);

  // Footer caption
  ctx.textAlign = "center";
  ctx.fillStyle = "#667085";
  ctx.font = "500 22px sans-serif";
  ctx.fillText("长按识别二维码，加入我们", W / 2, H - 36);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("图片导出失败"))), "image/png");
  });
}

export default function InviteCode() {
  const user = useAuthStore((s) => s.user);
  const isMobile = useIsMobile();
  const inviterName =
    user?.displayName?.trim() ||
    user?.account?.trim() ||
    user?.email?.split("@")[0] ||
    "解忧教练";
  const [code, setCode] = useState("");
  const [sharing, setSharing] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [posterUrl, setPosterUrl] = useState<string | null>(null);
  const [records, setRecords] = useState<InviteRecord[]>([]);
  const [totalInvited, setTotalInvited] = useState(0);
  const [totalActivated, setTotalActivated] = useState(0);
  const [earnedMinutes, setEarnedMinutes] = useState(0);
  const [rewardEnabled, setRewardEnabled] = useState(false);
  const [registerMinutes, setRegisterMinutes] = useState(0);
  const [activateMinutes, setActivateMinutes] = useState(0);
  const qrCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const link = code ? inviteUrl(code) : "";

  const applyOverview = (data: InviteOverview) => {
    setCode(data.code);
    setTotalInvited(data.totalInvited || 0);
    setTotalActivated(data.totalActivated || 0);
    setRecords(data.records || []);
    setEarnedMinutes(data.earnedMinutes || 0);
    setRewardEnabled(Boolean(data.reward?.enabled));
    setRegisterMinutes(data.reward?.inviterRegisterMinutes || 0);
    setActivateMinutes(data.reward?.inviterActivateMinutes || 0);
  };

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetchMyInvite();
        if (cancelled) return;
        if (res.code === 200 && res.data?.code) {
          applyOverview(res.data);
        } else {
          showToast.error(res.msg || "加载邀请码失败");
        }
      } catch {
        if (!cancelled) showToast.error("加载邀请码失败");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!qrCanvasRef.current || !link) return;
    void QRCode.toCanvas(qrCanvasRef.current, link, {
      width: 170,
      margin: 2,
      color: { dark: "#25344a", light: "#ffffff" },
    });
  }, [link]);

  const rotate = async () => {
    if (rotating || loading) return;
    setRotating(true);
    try {
      const res = await rotateInviteCode();
      if (res.code !== 200 || !res.data?.code) {
        showToast.error(res.msg || "更换邀请码失败");
        return;
      }
      applyOverview(res.data);
      showToast.success("已生成新的邀请码");
    } catch {
      showToast.error("更换邀请码失败");
    } finally {
      setRotating(false);
    }
  };

  const copy = async (text: string, label: string) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      showToast.success(`${label}已复制`);
    } catch {
      showToast.error("复制失败，请手动复制");
    }
  };

  const downloadPoster = async () => {
    if (!code) return;
    setSharing(true);
    try {
      const blob = await makePoster(code, inviterName);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `解忧邀请码-${code}.png`;
      anchor.click();
      URL.revokeObjectURL(url);
      showToast.success("分享图片已保存");
    } catch {
      showToast.error("分享图片生成失败");
    } finally {
      setSharing(false);
    }
  };

  const openPosterPreview = async () => {
    if (!code) return;
    setSharing(true);
    try {
      const blob = await makePoster(code, inviterName);
      const url = URL.createObjectURL(blob);
      setPosterUrl((previous) => {
        if (previous) URL.revokeObjectURL(previous);
        return url;
      });
    } catch {
      showToast.error("分享图片生成失败");
    } finally {
      setSharing(false);
    }
  };

  const sharePoster = async () => {
    if (!code) return;
    setSharing(true);
    try {
      let url = posterUrl;
      if (!url) {
        const blob = await makePoster(code, inviterName);
        url = URL.createObjectURL(blob);
        setPosterUrl((previous) => {
          if (previous) URL.revokeObjectURL(previous);
          return url;
        });
      }
      const response = await fetch(url);
      const blob = await response.blob();
      const file = new File([blob], `解忧邀请码-${code}.png`, { type: "image/png" });
      if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
        await navigator.share({ title: "解忧邀请码", text: "扫码加入解忧学习", files: [file] });
        return;
      }
      showToast.info("当前环境不支持系统分享，已改为保存图片");
      await downloadPoster();
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) showToast.error("分享图片失败");
    } finally {
      setSharing(false);
    }
  };

  const posterActions = (
    <div className="mt-3 flex flex-wrap justify-center gap-2 sm:justify-start">
      {isMobile ? (
        <CloudButton size="sm" onClick={() => void sharePoster()} disabled={sharing || !code}>
          <Share2 size={14} />
          {sharing ? "生成中…" : "分享海报"}
        </CloudButton>
      ) : null}
      <CloudButton size="sm" variant={isMobile ? "secondary" : undefined} onClick={() => void openPosterPreview()} disabled={sharing || !code}>
        <Download size={14} />
        {sharing ? "生成中…" : "保存分享图"}
      </CloudButton>
    </div>
  );

  return (
    <div className="h-dvh flex flex-col bg-background overflow-hidden">
      <PageBackHeader title="邀请码" subtitle="邀请好友一起学习解忧" fallbackTo="/coach-center" />
      <main className="flex-1 min-h-0 overflow-y-auto px-3 pb-5 sm:px-5">
        <div className="mx-auto max-w-2xl space-y-3 pb-6 lg:max-w-5xl lg:space-y-0 lg:grid lg:grid-cols-12 lg:gap-4">
          <CloudCard className="relative overflow-hidden bg-tint-mint px-5 pb-6 pt-8 text-center lg:col-span-5 lg:flex lg:flex-col lg:justify-center lg:pt-10 lg:pb-8">
            <img
              src={`${import.meta.env.BASE_URL}invite-code-card-bg.png`}
              alt=""
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 size-full object-cover object-right opacity-55"
            />
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-tint-mint via-tint-mint/80 to-transparent" />
            <div className="relative">
              <p className="text-xs font-medium text-primary">我的专属邀请码</p>
            <p className="mt-3 font-mono text-2xl font-bold tracking-wider text-foreground lg:text-3xl">
              {loading ? "加载中…" : code || "—"}
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              <CloudButton size="sm" onClick={() => void copy(code, "邀请码")} disabled={!code}>
                <Copy size={14} />复制邀请码
              </CloudButton>
              <CloudButton size="sm" variant="secondary" onClick={() => void rotate()} disabled={rotating || loading}>
                {rotating ? "更换中…" : "换一个"}
              </CloudButton>
            </div>
            </div>
          </CloudCard>

          <CloudCard className="p-4 lg:col-span-7 lg:flex lg:flex-col lg:justify-center">
            <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center">
              <div className="rounded-xl border border-border bg-white p-2"><canvas ref={qrCanvasRef} aria-label="邀请码二维码" /></div>
              <div className="min-w-0 flex-1 text-center sm:text-left">
                <p className="text-sm font-semibold">分享图片邀请好友</p>
                {posterActions}
              </div>
            </div>
            <div className="mt-4 flex items-center gap-2 border-t border-border pt-3"><span className="min-w-0 flex-1 truncate rounded-lg bg-muted px-3 py-2 font-mono text-xs text-foreground">{link || (loading ? "加载中…" : "")}</span><CloudButton size="sm" variant="ghost" onClick={() => void copy(link, "邀请链接")} disabled={!link}><Copy size={14} /></CloudButton></div>
          </CloudCard>

          <div className="grid grid-cols-2 gap-3 lg:col-span-4 lg:grid-cols-1 lg:content-start">
            <CloudCard tint="sky" className="p-4"><Users size={18} className="text-secondary-brand" /><p className="mt-2 text-xs text-muted-foreground">累计邀请</p><p className="text-2xl font-bold">{totalInvited}</p></CloudCard>
            <CloudCard tint="cream" className="p-4"><Gift size={18} className="text-warning" /><p className="mt-2 text-xs text-muted-foreground">已激活</p><p className="text-2xl font-bold">{totalActivated}</p></CloudCard>
            {rewardEnabled && (registerMinutes > 0 || activateMinutes > 0 || earnedMinutes > 0) ? (
              <CloudCard className="p-4 lg:col-span-1 col-span-2">
                <p className="text-xs text-muted-foreground">邀请奖励</p>
                <p className="mt-1 text-2xl font-bold">{earnedMinutes} 分钟</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {registerMinutes > 0 ? `好友注册你得 ${registerMinutes} 分钟` : null}
                  {registerMinutes > 0 && activateMinutes > 0 ? "，" : null}
                  {activateMinutes > 0 ? `激活后再得 ${activateMinutes} 分钟` : null}
                  {registerMinutes <= 0 && activateMinutes <= 0 ? "授课时长已发放到课时池" : "（写入授课时长）"}
                </p>
              </CloudCard>
            ) : null}
          </div>

          <CloudCard className="overflow-hidden lg:col-span-8">
            <div className="flex items-center gap-2 border-b border-border px-4 py-3"><Users size={16} /><h2 className="text-sm font-semibold">邀请记录</h2></div>
            {records.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">暂无邀请记录</p>
            ) : (
              <div className="divide-y divide-border">
                {records.map((record) => (
                  <div key={record.id} className="flex items-center justify-between px-4 py-3 text-sm">
                    <span className="font-medium">{record.invitee}</span>
                    <span className="text-xs text-muted-foreground">{record.registeredAt}</span>
                    <span className={record.status === "activated" ? "text-primary text-xs" : "text-muted-foreground text-xs"}>
                      {statusLabel(record.status)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CloudCard>
        </div>
      </main>

      <Dialog open={Boolean(posterUrl)} onOpenChange={(open) => { if (!open && posterUrl) { URL.revokeObjectURL(posterUrl); setPosterUrl(null); } }}>
        <DialogContent className="max-w-sm rounded-2xl border-primary/20 bg-card p-4 sm:max-w-2xl">
          <div className="overflow-hidden rounded-xl bg-primary-soft/40 p-2">
            {posterUrl ? <img src={posterUrl} alt="解忧邀请码分享图片预览" className="mx-auto max-h-[65vh] w-full rounded-lg object-contain" /> : null}
          </div>
          <DialogFooter className={isMobile ? "grid grid-cols-2 gap-2" : "flex"}>
            {isMobile ? (
              <CloudButton variant="secondary" onClick={() => void sharePoster()} disabled={sharing || !code}>
                <Share2 size={15} />分享
              </CloudButton>
            ) : null}
            <CloudButton onClick={() => void downloadPoster()} disabled={sharing || !code}>
              <Download size={15} />保存图片
            </CloudButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
