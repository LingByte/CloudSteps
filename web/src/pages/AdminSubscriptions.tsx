import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { ChevronLeft, Plus, Search, Crown, Clock, Ban, CheckCircle2, XCircle } from "lucide-react";
import {
  listSubscriptions,
  upsertSubscription,
  cancelSubscription,
  searchCoachingStudents,
  type UserSubscription,
  type SubscriptionType,
  type SubscriptionStatus,
} from "../api/coaching";
import { showToast } from "../utils/toast";
import { useAuthStore } from "../stores/authStore";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "../components/ui/dialog";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Badge } from "../components/ui/badge";

const typeLabels: Record<SubscriptionType, string> = {
  monthly: "包月",
  yearly: "包年",
  lifetime: "买断",
};

const statusConfig: Record<SubscriptionStatus, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: typeof CheckCircle2 }> = {
  active: { label: "生效中", variant: "default", icon: CheckCircle2 },
  expired: { label: "已过期", variant: "secondary", icon: Clock },
  cancelled: { label: "已取消", variant: "destructive", icon: XCircle },
};

type SearchResult = {
  id: string | number;
  username?: string;
  displayName?: string;
  email?: string;
};

export default function AdminSubscriptions() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === "admin";

  const [list, setList] = useState<UserSubscription[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<SubscriptionStatus | "">("");

  // Create/Edit dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<UserSubscription | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [selectedUser, setSelectedUser] = useState<SearchResult | null>(null);
  const [formType, setFormType] = useState<SubscriptionType>("monthly");
  const [formDuration, setFormDuration] = useState<number>(1);
  const [submitting, setSubmitting] = useState(false);

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listSubscriptions(statusFilter ? { status: statusFilter } : undefined);
      if (res.code === 200) {
        setList(Array.isArray(res.data) ? res.data : []);
      } else {
        showToast.error(res.msg || "加载失败");
      }
    } catch {
      showToast.error("加载订阅列表失败");
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    if (isAdmin) void loadList();
  }, [isAdmin, loadList]);

  // Search teachers for assignment
  const doSearch = async (q: string) => {
    if (q.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    try {
      const res = await searchCoachingStudents(q.trim());
      if (res.code === 200 && Array.isArray(res.data)) {
        setSearchResults(res.data as SearchResult[]);
      }
    } catch {
      // ignore
    }
  };

  const openCreate = () => {
    setEditing(null);
    setSelectedUser(null);
    setSearchQuery("");
    setSearchResults([]);
    setFormType("monthly");
    setFormDuration(1);
    setDialogOpen(true);
  };

  const openEdit = (sub: UserSubscription) => {
    setEditing(sub);
    setSelectedUser(
      sub.user
        ? {
            id: sub.userId,
            username: sub.user.username,
            displayName: sub.user.displayName,
            email: sub.user.email,
          }
        : { id: sub.userId },
    );
    setSearchQuery("");
    setSearchResults([]);
    setFormType(sub.type);
    setFormDuration(1);
    setDialogOpen(true);
  };

  const handleSubmit = async () => {
    if (!selectedUser) {
      showToast.error("请先选择用户");
      return;
    }
    const userId = Number(selectedUser.id);
    if (!userId) {
      showToast.error("用户 ID 无效");
      return;
    }
    setSubmitting(true);
    try {
      const body: Parameters<typeof upsertSubscription>[0] = {
        userId,
        type: formType,
      };
      if (formType !== "lifetime" && formDuration > 0) {
        body.duration = formDuration;
      }
      const res = await upsertSubscription(body);
      if (res.code === 200) {
        showToast.success(editing ? "订阅已更新" : "订阅已创建");
        setDialogOpen(false);
        void loadList();
      } else {
        showToast.error(res.msg || "操作失败");
      }
    } catch (e: unknown) {
      const msg = e && typeof e === "object" && "msg" in e ? String((e as { msg: string }).msg) : "操作失败";
      showToast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = async (sub: UserSubscription) => {
    if (!window.confirm(`确认取消该订阅？（${typeLabels[sub.type]} - 用户ID: ${sub.userId}）`)) return;
    try {
      const res = await cancelSubscription(sub.id);
      if (res.code === 200) {
        showToast.success("订阅已取消");
        void loadList();
      } else {
        showToast.error(res.msg || "取消失败");
      }
    } catch (e: unknown) {
      const msg = e && typeof e === "object" && "msg" in e ? String((e as { msg: string }).msg) : "取消失败";
      showToast.error(msg);
    }
  };

  const formatDate = (d?: string | null) => {
    if (!d) return "—";
    try {
      return new Date(d).toLocaleString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
    } catch {
      return d;
    }
  };

  if (!isAdmin) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-3 bg-background text-foreground">
        <Ban size={40} className="text-muted-foreground" />
        <p className="text-sm text-muted-foreground">仅管理员可访问此页面</p>
      </div>
    );
  }

  return (
    <div className="flex h-dvh flex-col bg-background text-foreground">
      {/* Header */}
      <header className="shrink-0 border-b border-border/70 bg-card/95 backdrop-blur">
        <div className="mx-auto flex h-12 w-full max-w-5xl items-center px-3 sm:px-5">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="mr-1 flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-primary-soft hover:text-foreground"
            aria-label="返回"
          >
            <ChevronLeft size={16} strokeWidth={1.8} />
          </button>
          <div className="flex items-baseline gap-2">
            <Crown size={16} className="text-primary" />
            <h1 className="text-sm font-semibold tracking-tight">订阅管理</h1>
            <span className="hidden text-[11px] text-muted-foreground sm:inline">管理老师的包月/包年/买断订阅</span>
          </div>
          <Button size="sm" className="ml-auto h-8 gap-1" onClick={openCreate}>
            <Plus size={15} /> 新增订阅
          </Button>
        </div>
      </header>

      {/* Main */}
      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-5xl px-3 py-4 sm:px-5 sm:py-6">
          {/* Filter */}
          <div className="mb-4 flex items-center gap-2">
            <div className="flex items-center gap-1 rounded-lg bg-muted p-1">
              {(["", "active", "expired", "cancelled"] as const).map((s) => (
                <button
                  key={s || "all"}
                  type="button"
                  onClick={() => setStatusFilter(s)}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    statusFilter === s
                      ? "bg-card text-foreground shadow-sm ring-1 ring-border/60"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {s === "" ? "全部" : statusConfig[s].label}
                </button>
              ))}
            </div>
            <span className="ml-auto text-xs text-muted-foreground">共 {list.length} 条</span>
          </div>

          {/* Table */}
          {loading ? (
            <div className="flex justify-center py-16 text-sm text-muted-foreground">加载中…</div>
          ) : list.length === 0 ? (
            <div className="rounded-xl border border-border/70 bg-card/50 px-4 py-12 text-center">
              <Crown size={32} className="mx-auto mb-3 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">暂无订阅记录</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border/70">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-muted/50">
                    <th className="border-b border-border px-3 py-2.5 text-left font-medium">用户</th>
                    <th className="border-b border-border px-3 py-2.5 text-center font-medium">类型</th>
                    <th className="border-b border-border px-3 py-2.5 text-center font-medium">状态</th>
                    <th className="border-b border-border px-3 py-2.5 text-left font-medium">开始时间</th>
                    <th className="border-b border-border px-3 py-2.5 text-left font-medium">到期时间</th>
                    <th className="border-b border-border px-3 py-2.5 text-center font-medium">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((sub) => {
                    const sc = statusConfig[sub.status];
                    const StatusIcon = sc.icon;
                    return (
                      <tr key={sub.id} className="border-b border-border/50 last:border-0 hover:bg-muted/30">
                        <td className="px-3 py-2.5">
                          <div className="font-medium">{sub.user?.displayName || sub.user?.username || `#${sub.userId}`}</div>
                          {sub.user?.email && (
                            <div className="text-xs text-muted-foreground">{sub.user.email}</div>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <Badge variant="outline">{typeLabels[sub.type]}</Badge>
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <Badge variant={sc.variant} className="gap-1">
                            <StatusIcon size={12} /> {sc.label}
                          </Badge>
                        </td>
                        <td className="px-3 py-2.5 text-muted-foreground">{formatDate(sub.startedAt)}</td>
                        <td className="px-3 py-2.5 text-muted-foreground">
                          {sub.expiredAt ? formatDate(sub.expiredAt) : "永久"}
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              type="button"
                              onClick={() => openEdit(sub)}
                              className="rounded-md px-2 py-1 text-xs text-primary hover:bg-primary-soft"
                            >
                              编辑
                            </button>
                            {sub.status === "active" && (
                              <button
                                type="button"
                                onClick={() => handleCancel(sub)}
                                className="rounded-md px-2 py-1 text-xs text-destructive hover:bg-destructive/10"
                              >
                                取消
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "编辑订阅" : "新增订阅"}</DialogTitle>
            <DialogDescription>
              {editing ? "修改订阅类型和有效期" : "为老师开通包月/包年/买断订阅"}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* User search */}
            <div>
              <label className="mb-1.5 block text-sm font-medium">选择用户</label>
              {editing || selectedUser ? (
                <div className="flex items-center justify-between rounded-md border border-border bg-muted/30 px-3 py-2">
                  <span className="text-sm">
                    {selectedUser?.displayName || selectedUser?.username || `#${selectedUser?.id}`}
                    {selectedUser?.email && (
                      <span className="ml-2 text-xs text-muted-foreground">{selectedUser.email}</span>
                    )}
                  </span>
                  {!editing && (
                    <button
                      type="button"
                      onClick={() => { setSelectedUser(null); setSearchQuery(""); }}
                      className="text-xs text-muted-foreground hover:text-foreground"
                    >
                      更换
                    </button>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="relative">
                    <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={searchQuery}
                      onChange={(e) => {
                        setSearchQuery(e.target.value);
                        void doSearch(e.target.value);
                      }}
                      placeholder="搜索用户名或邮箱（至少 2 字）"
                      className="pl-8"
                    />
                  </div>
                  {searchResults.length > 0 && (
                    <div className="max-h-40 overflow-y-auto rounded-md border border-border">
                      {searchResults.map((r) => (
                        <button
                          key={r.id}
                          type="button"
                          onClick={() => { setSelectedUser(r); setSearchResults([]); setSearchQuery(""); }}
                          className="flex w-full items-center justify-between border-b border-border/50 px-3 py-2 text-sm last:border-0 hover:bg-muted/50"
                        >
                          <span>{r.displayName || r.username || `#${r.id}`}</span>
                          {r.email && <span className="text-xs text-muted-foreground">{r.email}</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Type */}
            <div>
              <label className="mb-1.5 block text-sm font-medium">订阅类型</label>
              <div className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1">
                {(Object.keys(typeLabels) as SubscriptionType[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setFormType(t)}
                    className={`rounded-md px-2 py-1.5 text-sm font-medium transition-colors ${
                      formType === t
                        ? "bg-card text-foreground shadow-sm ring-1 ring-border/60"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {typeLabels[t]}
                  </button>
                ))}
              </div>
            </div>

            {/* Duration (hidden for lifetime) */}
            {formType !== "lifetime" && (
              <div>
                <label className="mb-1.5 block text-sm font-medium">
                  {formType === "monthly" ? "月数" : "年数"}
                </label>
                <Input
                  type="number"
                  min={1}
                  max={formType === "monthly" ? 120 : 10}
                  value={formDuration}
                  onChange={(e) => setFormDuration(Math.max(1, Number(e.target.value) || 1))}
                  className="w-24"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  {formType === "monthly" ? `订阅 ${formDuration} 个月` : `订阅 ${formDuration} 年`}
                </p>
              </div>
            )}
            {formType === "lifetime" && (
              <p className="text-xs text-muted-foreground">买断订阅永不过期，无需设置时长</p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={submitting}>
              取消
            </Button>
            <Button onClick={handleSubmit} disabled={submitting || (!editing && !selectedUser)}>
              {submitting ? "提交中…" : editing ? "保存" : "创建"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
