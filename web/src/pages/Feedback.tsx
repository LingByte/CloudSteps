import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronRight, MessageCircle, Plus } from "lucide-react";
import { CloudButton, CloudImageWithFallback } from "../components/cloudsteps";
import { CloudCard, CloudSpin } from "../components/cloudsteps/arco";
import { EmptyState } from "../components/EmptyState";
import { FeedbackComposer } from "../components/FeedbackComposer";
import { FeedbackMessageBody } from "../components/FeedbackMessageBody";
import { PageBackHeader } from "../components/PageBackHeader";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";
import { showToast } from "../utils/toast";
import { formatApiMessage } from "../utils/apiMessage";
import { teacherAvatarSrc } from "../utils/avatar";
import {
  encodeFeedbackContent,
  feedbackPreviewText,
  isFeedbackContentEmpty,
} from "../utils/feedbackContent";
import { useAuthStore } from "../stores/authStore";
import {
  createFeedback,
  getFeedback,
  listFeedback,
  markFeedbackReadAll,
  replyFeedback,
  type FeedbackTicket,
} from "../api/feedback";

const POLL_MS = 4000;
const OFFICIAL_AVATAR = `${import.meta.env.BASE_URL}logo.png`;

const fieldClass =
  "w-full px-4 py-3 rounded-xl bg-card border border-input text-charcoal placeholder:text-muted-soft transition-colors outline-none hover:border-border focus:border-primary focus:ring-[3px] focus:ring-primary/25";

function formatTime(iso: string | undefined, locale: string) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(locale === "zh-CN" ? "zh-CN" : "en-US", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusLabel(ticket: FeedbackTicket, t: (key: string) => string) {
  if (ticket.status === "closed") return t("feedback.status.closed");
  if (ticket.lastReplierRole === "admin") return t("feedback.status.replied");
  return t("feedback.status.pending");
}

function statusClass(ticket: FeedbackTicket) {
  if (ticket.status === "closed") return "bg-muted text-muted-foreground";
  if (ticket.lastReplierRole === "admin") return "bg-primary-soft text-primary";
  return "bg-tint-sky text-secondary-brand";
}

function AvatarBubble({ src, alt }: { src: string; alt: string }) {
  return (
    <div className="size-8 rounded-full overflow-hidden bg-muted border border-border shrink-0">
      <CloudImageWithFallback src={src} alt={alt} className="size-full object-cover" />
    </div>
  );
}

export default function Feedback() {
  const { t, i18n } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const userAvatar = teacherAvatarSrc(user?.avatar);
  const [tickets, setTickets] = useState<FeedbackTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [draftText, setDraftText] = useState("");
  const [draftImages, setDraftImages] = useState<string[]>([]);
  const [contact, setContact] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [active, setActive] = useState<FeedbackTicket | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [replyImages, setReplyImages] = useState<string[]>([]);
  const [replying, setReplying] = useState(false);
  const [composing, setComposing] = useState(false);
  const [wechatOpen, setWechatOpen] = useState(false);
  const activeIdRef = useRef<number | null>(null);
  const threadEndRef = useRef<HTMLDivElement | null>(null);
  activeIdRef.current = activeId;

  useEffect(() => {
    let cancelled = false;
    let inFlight = false;

    const refresh = async (silent: boolean) => {
      if (inFlight) return;
      inFlight = true;
      if (!silent) setLoading(true);
      try {
        if (!silent) {
          try {
            await markFeedbackReadAll();
          } catch {
            /* ignore */
          }
        }
        const ticketId = activeIdRef.current;
        if (ticketId) {
          const detail = await getFeedback(ticketId);
          if (!cancelled && activeIdRef.current === ticketId) setActive(detail.data);
        }
        const res = await listFeedback({ page: 1, pageSize: 50 });
        if (!cancelled) setTickets(res.data?.list ?? []);
      } catch (e: unknown) {
        if (!silent && !cancelled) {
          const apiMsg =
            e && typeof e === "object" && "msg" in e ? String((e as { msg: string }).msg) : undefined;
          showToast.error(formatApiMessage(apiMsg, "feedback.load_failed"));
        }
      } finally {
        inFlight = false;
        if (!silent && !cancelled) setLoading(false);
      }
    };

    void refresh(false);
    const timer = window.setInterval(() => {
      if (document.hidden) return;
      void refresh(true);
    }, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh(true);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  const openTicket = async (id: number) => {
    setActiveId(id);
    setComposing(false);
    setDetailLoading(true);
    setReplyText("");
    setReplyImages([]);
    try {
      const res = await getFeedback(id);
      setActive(res.data);
      // GET 详情已把该工单标已读，列表红点同步清掉
      setTickets((prev) =>
        prev.map((ticket) =>
          ticket.id === id ? { ...ticket, userUnread: false } : ticket,
        ),
      );
    } catch (e: unknown) {
      const apiMsg =
        e && typeof e === "object" && "msg" in e ? String((e as { msg: string }).msg) : undefined;
      showToast.error(formatApiMessage(apiMsg, "feedback.load_ticket_failed"));
      setActiveId(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const backToList = () => {
    setActiveId(null);
    setActive(null);
    setReplyText("");
    setReplyImages([]);
  };

  const submitTicket = async () => {
    if (submitting || isFeedbackContentEmpty(draftText, draftImages)) return;
    setSubmitting(true);
    try {
      const res = await createFeedback({
        content: encodeFeedbackContent(draftText, draftImages),
        contact: contact.trim() || undefined,
      });
      showToast.success(t("feedback.submitted_success"));
      setDraftText("");
      setDraftImages([]);
      setContact("");
      setComposing(false);
      setTickets((prev) => [res.data, ...prev.filter((ticket) => ticket.id !== res.data.id)]);
      await openTicket(res.data.id);
    } catch (e: unknown) {
      const apiMsg =
        e && typeof e === "object" && "msg" in e ? String((e as { msg: string }).msg) : undefined;
      showToast.error(formatApiMessage(apiMsg, "feedback.submit_failed"));
    } finally {
      setSubmitting(false);
    }
  };

  const submitReply = async () => {
    if (!active || replying || isFeedbackContentEmpty(replyText, replyImages)) return;
    setReplying(true);
    try {
      const res = await replyFeedback(active.id, encodeFeedbackContent(replyText, replyImages));
      setActive(res.data);
      setReplyText("");
      setReplyImages([]);
      setTickets((prev) =>
        prev.map((ticket) => (ticket.id === res.data.id ? { ...ticket, ...res.data, replies: undefined } : ticket)),
      );
      showToast.success(t("feedback.reply_success"));
    } catch (e: unknown) {
      const apiMsg =
        e && typeof e === "object" && "msg" in e ? String((e as { msg: string }).msg) : undefined;
      showToast.error(formatApiMessage(apiMsg, "feedback.reply_failed"));
    } finally {
      setReplying(false);
    }
  };

  const thread = useMemo(() => {
    if (!active) return [];
    const opening = {
      id: 0,
      role: "user" as const,
      content: active.content,
      createdAt: active.createdAt,
    };
    return [opening, ...(active.replies ?? [])];
  }, [active]);

  useEffect(() => {
    if (!activeId || detailLoading) return;
    threadEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [activeId, detailLoading, thread.length]);

  const headerExtra = (
    <div className="flex items-center gap-0.5">
      <CloudButton
        type="button"
        variant="ghost"
        size="sm"
        className="h-8 max-w-[9.5rem] px-2 text-[11px] text-muted-foreground hover:text-primary"
        onClick={() => setWechatOpen(true)}
      >
        <span className="truncate">{t("feedback.no_reply_title")}</span>
      </CloudButton>
      {activeId ? null : composing ? (
        <CloudButton variant="ghost" size="sm" className="h-8 px-2" onClick={() => setComposing(false)}>
          {t("feedback.cancel")}
        </CloudButton>
      ) : (
        <CloudButton size="sm" className="h-8 px-2.5" onClick={() => setComposing(true)}>
          <Plus size={14} />
          {t("feedback.new_ticket")}
        </CloudButton>
      )}
    </div>
  );

  return (
    <div className="h-dvh flex flex-col bg-background overflow-hidden">
      <PageBackHeader
        title={t("feedback.page_title")}
        subtitle={activeId ? t("feedback.ticket_no", { id: activeId }) : t("feedback.subtitle")}
        fallbackTo="/coach-center"
        onBack={activeId ? backToList : undefined}
        extra={headerExtra}
      />

      <div className="flex-1 min-h-0 flex flex-col">
        {activeId ? (
          detailLoading || !active ? (
            <div className="flex-1 flex items-center justify-center px-4">
              <CloudSpin tip={t("feedback.loading_thread")} />
            </div>
          ) : (
            <>
              <div className="shrink-0 px-4 pt-2.5 pb-2 flex items-center justify-between gap-2 border-b border-border/70 bg-muted/30">
                <p className="text-[11px] text-muted-foreground truncate">
                  {formatTime(active.lastRepliedAt || active.createdAt, i18n.language)}
                  {active.replyCount > 0 ? t("feedback.reply_count", { count: active.replyCount }) : ""}
                </p>
                <span className={`shrink-0 text-[11px] px-2 py-0.5 rounded-full ${statusClass(active)}`}>
                  {statusLabel(active, t)}
                </span>
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 py-4 space-y-4 bg-gradient-to-b from-muted/20 to-background">
                {thread.map((item) => {
                  const mine = item.role !== "admin";
                  return (
                    <div
                      key={`${item.role}-${item.id}`}
                      className={`flex items-end gap-2 ${mine ? "flex-row-reverse" : "flex-row"}`}
                    >
                      <AvatarBubble
                        src={mine ? userAvatar : OFFICIAL_AVATAR}
                        alt={mine ? t("feedback.me") : t("feedback.team")}
                      />
                      <div className={`max-w-[78%] min-w-0 ${mine ? "items-end" : "items-start"} flex flex-col`}>
                        <div className={`text-[10px] text-muted-foreground mb-1 px-0.5 ${mine ? "text-right" : "text-left"}`}>
                          {mine ? t("feedback.me") : t("feedback.team")} ·{" "}
                          {formatTime(item.createdAt, i18n.language)}
                        </div>
                        <div
                          className={`rounded-2xl px-3.5 py-2.5 shadow-sm ${
                            mine
                              ? "bg-primary text-primary-foreground rounded-br-md"
                              : "bg-card border border-border text-foreground rounded-bl-md"
                          }`}
                        >
                          <FeedbackMessageBody content={item.content} inverted={mine} />
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={threadEndRef} />
              </div>

              <div className="shrink-0 border-t border-border bg-card/95 backdrop-blur-sm px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                {active.status === "closed" ? (
                  <p className="text-xs text-muted-foreground text-center py-2">{t("feedback.ticket_closed")}</p>
                ) : (
                  <FeedbackComposer
                    text={replyText}
                    images={replyImages}
                    onTextChange={setReplyText}
                    onImagesChange={setReplyImages}
                    placeholder={t("feedback.reply_placeholder")}
                    submitting={replying}
                    submitLabel={t("feedback.send_reply")}
                    onSubmit={() => void submitReply()}
                  />
                )}
              </div>
            </>
          )
        ) : composing ? (
          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 py-4">
            <CloudCard className="p-4 space-y-3">
              <div className="flex items-center gap-2.5">
                <div className="size-9 rounded-xl bg-primary-soft text-primary flex items-center justify-center shrink-0">
                  <MessageCircle size={16} />
                </div>
                <div className="min-w-0">
                  <h2 className="text-sm font-semibold text-foreground">{t("feedback.new_ticket_title")}</h2>
                  <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
                    {t("feedback.new_ticket_hint")}
                  </p>
                </div>
              </div>
              <FeedbackComposer
                text={draftText}
                images={draftImages}
                onTextChange={setDraftText}
                onImagesChange={setDraftImages}
                placeholder={t("feedback.content_placeholder")}
                submitting={submitting}
                submitLabel={t("feedback.submit_ticket")}
                onSubmit={() => void submitTicket()}
                minHeightClass="min-h-[140px]"
              />
              <input
                className={fieldClass}
                placeholder={t("feedback.contact_placeholder")}
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                maxLength={128}
              />
            </CloudCard>
          </div>
        ) : (
          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 py-4">
            <div className="flex items-center justify-between gap-2 px-0.5 pb-2.5">
              <h2 className="text-xs font-semibold text-muted-foreground tracking-wide">
                {t("feedback.my_tickets")}
              </h2>
              {!loading && tickets.length > 0 ? (
                <span className="text-[11px] text-muted-soft tabular-nums">{tickets.length}</span>
              ) : null}
            </div>

            {loading ? (
              <div className="py-16 flex justify-center">
                <CloudSpin tip={t("feedback.loading_tickets")} />
              </div>
            ) : tickets.length === 0 ? (
              <div className="space-y-4">
                <EmptyState icon="icon-zu" description={t("feedback.no_tickets")} />
                <div className="flex justify-center">
                  <CloudButton size="sm" onClick={() => setComposing(true)}>
                    <Plus size={14} />
                    {t("feedback.new_ticket")}
                  </CloudButton>
                </div>
              </div>
            ) : (
              <CloudCard className="p-1 overflow-hidden">
                <div className="divide-y divide-border">
                  {tickets.map((ticket) => {
                    const unread = Boolean(ticket.userUnread);
                    return (
                      <button
                        key={ticket.id}
                        type="button"
                        onClick={() => void openTicket(ticket.id)}
                        className="w-full text-left px-3 py-3 rounded-xl hover:bg-muted/60 active:bg-muted/80 transition-colors"
                      >
                        <div className="flex items-start gap-2.5">
                          <span
                            className={`mt-1.5 size-1.5 rounded-full shrink-0 ${
                              unread ? "bg-destructive" : "bg-transparent"
                            }`}
                            aria-hidden
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span
                                className={`text-sm truncate leading-snug ${
                                  unread ? "font-semibold text-foreground" : "font-medium text-foreground"
                                }`}
                              >
                                {feedbackPreviewText(ticket.lastReplyPreview || ticket.content)}
                              </span>
                              <span
                                className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded-full ${statusClass(ticket)}`}
                              >
                                {statusLabel(ticket, t)}
                              </span>
                            </div>
                            <div className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
                              <span className="tabular-nums">#{ticket.id}</span>
                              <span>·</span>
                              <span>{formatTime(ticket.lastRepliedAt || ticket.createdAt, i18n.language)}</span>
                              {ticket.replyCount > 0 ? (
                                <span>{t("feedback.reply_count", { count: ticket.replyCount })}</span>
                              ) : null}
                            </div>
                          </div>
                          <ChevronRight size={14} className="text-muted-soft shrink-0 mt-1" />
                        </div>
                      </button>
                    );
                  })}
                </div>
              </CloudCard>
            )}
          </div>
        )}
      </div>

      <Dialog open={wechatOpen} onOpenChange={setWechatOpen}>
        <DialogContent className="sm:max-w-sm rounded-2xl p-0 gap-0 overflow-hidden">
          <DialogHeader className="px-5 pt-5 pb-3 border-b border-border text-left">
            <DialogTitle>{t("feedback.no_reply_title")}</DialogTitle>
            <DialogDescription>{t("feedback.add_business")}</DialogDescription>
          </DialogHeader>
          <div className="px-5 py-5 flex flex-col items-center gap-3">
            <img
              src={`${import.meta.env.BASE_URL}wechat-biz-qr.png`}
              alt={t("feedback.qr_alt")}
              className="w-48 h-48 rounded-xl border border-border bg-white object-contain"
            />
            <p className="text-[12px] text-muted-foreground text-center">{t("feedback.scan_wechat")}</p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
