import { useEffect, useMemo, useState } from "react";

import { listNotifications, markAllNotificationsRead, markNotificationRead } from "@/api/notifications";

type NotificationItem = {
  id: number;
  title: string;
  description: string;
  time: string;
  read: boolean;
};

type ApiNotification = {
  id: number;
  title: string;
  content: string;
  read: boolean;
  created_at: string;
};

type ListNotificationsResponse = {
  list: ApiNotification[];
  total: number;
  totalUnread: number;
  totalRead: number;
  page: number;
  size: number;
};

const formatTime = (iso: string) => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString();
};

export default function Notifications() {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page] = useState(1);
  const [size] = useState(50);
  const [totalUnread, setTotalUnread] = useState(0);

  const unreadCount = useMemo(() => {
    return totalUnread;
  }, [totalUnread]);

  const fetchNotifications = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listNotifications({ page, size });
      const data = res.data;
      setTotalUnread(data.totalUnread ?? 0);
      setItems(
        (data.list ?? []).map((n) => ({
          id: n.id,
          title: n.title,
          description: n.content,
          time: formatTime(n.created_at),
          read: !!n.read,
        })),
      );
    } catch (e: any) {
      setError(e?.msg || e?.message || "加载通知失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotifications();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const markAllRead = async () => {
    try {
      await markAllNotificationsRead();
      setItems((prev) => prev.map((i) => ({ ...i, read: true })));
      setTotalUnread(0);
    } catch (e: any) {
      setError(e?.msg || e?.message || "全部标为已读失败");
    }
  };

  const markOneRead = async (id: number) => {
    try {
      await markNotificationRead(id);
      setItems((prev) => prev.map((i) => (i.id === id ? { ...i, read: true } : i)));
      setTotalUnread((prev) => Math.max(0, prev - 1));
    } catch (e: any) {
      setError(e?.msg || e?.message || "标记已读失败");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[24px] md:text-[28px] font-semibold text-[#2D3748]">
            通知
          </h1>
          <p className="text-[#718096] mt-1 text-sm md:text-base">
            {unreadCount > 0
              ? `你有 ${unreadCount} 条未读通知`
              : "暂无未读通知"}
          </p>
        </div>

        <button
          type="button"
          onClick={markAllRead}
          disabled={loading || items.length === 0 || unreadCount === 0}
          className="px-4 py-2 rounded-lg border border-[#E2E8F0] text-[#2D3748] text-sm font-medium hover:bg-[#F7F9FC] transition-colors"
        >
          全部标为已读
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-[#E2E8F0] overflow-hidden">
        {loading ? (
          <div className="px-5 py-6 text-sm text-[#718096]">加载中...</div>
        ) : error ? (
          <div className="px-5 py-6 text-sm text-red-600">{error}</div>
        ) : items.length === 0 ? (
          <div className="px-5 py-6 text-sm text-[#718096]">暂无通知</div>
        ) : (
          items.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => {
                if (!n.read) markOneRead(n.id);
              }}
              className="w-full text-left px-5 py-4 border-b border-[#E2E8F0] last:border-b-0 hover:bg-[#F7F9FC] transition-colors"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    {!n.read && (
                      <span className="inline-block w-2 h-2 rounded-full bg-[#4ECDC4]" />
                    )}
                    <div className="text-[#2D3748] font-medium truncate">
                      {n.title}
                    </div>
                  </div>
                  <div className="text-sm text-[#718096] mt-1 line-clamp-2">
                    {n.description}
                  </div>
                </div>
                <div className="text-xs text-[#A0AEC0] whitespace-nowrap">
                  {n.time}
                </div>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
