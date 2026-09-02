import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import {
  getPendingAnnouncementPopup,
  markAnnouncementRead,
  type Announcement,
} from "../api/announcements";
import { useAuthStore } from "../stores/authStore";
import {
  shouldDeferSystemPopups,
  subscribeCoachOnboardingUi,
} from "../utils/coachOnboarding";
import { MarkdownView } from "./MarkdownView";
import { CloudButton } from "./cloudsteps";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";

/**
 * 登录后拉取未读公告；若新手引导正在进行/待展示，则延后弹出，引导结束后再展示。
 * 每次仅展示最新一条；点「我知道了」标记已读；可跳转公告列表查看其余公告。
 */
export function AnnouncementPopupHost() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const hasHydrated = useAuthStore((s) => s.hasHydrated);
  const user = useAuthStore((s) => s.user);
  const role = (user as { role?: string } | null)?.role;
  const userId = user?.id;

  const [item, setItem] = useState<Announcement | null>(null);
  const [moreCount, setMoreCount] = useState(0);
  const pendingRef = useRef<{ item: Announcement; moreCount: number } | null>(null);
  const loadedRef = useRef(false);

  const deferred = shouldDeferSystemPopups(role, userId);

  const flushPendingIfReady = useCallback(() => {
    if (shouldDeferSystemPopups(role, userId)) {
      setItem(null);
      setMoreCount(0);
      return;
    }
    if (pendingRef.current) {
      setItem(pendingRef.current.item);
      setMoreCount(pendingRef.current.moreCount);
      pendingRef.current = null;
    }
  }, [role, userId]);

  const applyList = useCallback(
    (list: Announcement[]) => {
      const latest = list[0] ?? null;
      const extra = Math.max(0, list.length - 1);
      if (shouldDeferSystemPopups(role, userId)) {
        pendingRef.current = latest ? { item: latest, moreCount: extra } : null;
        setItem(null);
        setMoreCount(0);
        return;
      }
      pendingRef.current = null;
      setItem(latest);
      setMoreCount(extra);
    },
    [role, userId],
  );

  const load = useCallback(async () => {
    if (!hasHydrated || !isAuthenticated) {
      setItem(null);
      setMoreCount(0);
      pendingRef.current = null;
      loadedRef.current = false;
      return;
    }
    try {
      const res = await getPendingAnnouncementPopup();
      const list =
        res.code === 200 && res.data
          ? (res.data.announcements?.filter((a) => a?.id) ??
            (res.data.announcement?.id ? [res.data.announcement] : []))
          : [];
      loadedRef.current = true;
      if (list.length === 0) {
        pendingRef.current = null;
        setItem(null);
        setMoreCount(0);
        return;
      }
      applyList(list);
    } catch {
      setItem(null);
      setMoreCount(0);
      pendingRef.current = null;
    }
  }, [hasHydrated, isAuthenticated, applyList]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    return subscribeCoachOnboardingUi(() => {
      if (shouldDeferSystemPopups(role, userId)) {
        setItem(null);
        setMoreCount(0);
        return;
      }
      if (pendingRef.current) {
        flushPendingIfReady();
        return;
      }
      if (!loadedRef.current) {
        void load();
      }
    });
  }, [role, userId, flushPendingIfReady, load]);

  useEffect(() => {
    flushPendingIfReady();
  }, [deferred, flushPendingIfReady]);

  const close = () => {
    setItem(null);
    setMoreCount(0);
    pendingRef.current = null;
  };

  const dismiss = () => {
    const id = item?.id;
    close();
    if (id) {
      void markAnnouncementRead(id).catch(() => {
        // 忽略失败；下次仍可能再弹
      });
    }
  };

  const viewAll = () => {
    close();
    navigate("/announcements");
  };

  const open = !!item && !deferred;

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) dismiss();
      }}
    >
      <DialogContent className="sm:max-w-md max-h-[min(85dvh,640px)] flex flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b border-border px-5 pt-5 pb-3">
          <DialogTitle className="text-base leading-snug pr-8">
            {item?.title || t("announcements.title")}
          </DialogTitle>
          {item?.publishedAt ? (
            <p className="text-xs text-muted-foreground pt-1">
              {new Date(item.publishedAt).toLocaleDateString()}
            </p>
          ) : null}
        </DialogHeader>
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 py-4">
          <div className="text-sm text-foreground leading-relaxed">
            {item?.content ? (
              <MarkdownView content={item.content} className="text-[15px]" />
            ) : (
              <p className="text-muted-foreground">{t("announcements.no_content")}</p>
            )}
          </div>
        </div>
        <DialogFooter className="shrink-0 border-t border-border px-5 py-3.5 flex-col sm:flex-row gap-2 pb-[max(0.875rem,env(safe-area-inset-bottom))]">
          <CloudButton type="button" variant="outline" onClick={viewAll} className="w-full sm:w-auto">
            {moreCount > 0
              ? t("announcements.view_all_with_more", { count: moreCount })
              : t("announcements.view_all")}
          </CloudButton>
          <CloudButton type="button" onClick={dismiss} className="w-full sm:w-auto">
            {t("announcements.got_it")}
          </CloudButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
