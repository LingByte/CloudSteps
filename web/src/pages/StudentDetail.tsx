import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router";
import {
  BookOpen,
  ChevronLeft,
  Clock,
  KeyRound,
  Loader2,
  Pencil,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { CloudButton } from "../components/cloudsteps";
import { CloudCard, CloudEmpty, CloudInput, CloudSpin } from "../components/cloudsteps/arco";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";
import {
  addStudentWordBookAsTeacher,
  addTeacherCoachingStudent,
  listAllTeacherCoachingQuotas,
  listStudentActivityRecordsAsTeacher,
  listStudentWordBooksAsTeacher,
  removeStudentWordBookAsTeacher,
  removeTeacherStudent,
  setTeacherStudentPassword,
  setTeacherStudentReviewCurve,
  type StudentActivityListItem,
  type StudentWordBookItem,
  type TeacherCoachingQuotaRow,
} from "../api/coaching";
import { listWordBooks } from "../api/wordbooks";
import type { CachedWordBook } from "../utils/wordBooksCache";
import { showToast } from "../utils/toast";
import { resolveMediaUrl } from "../utils/mediaUrl";
import type { ReviewCurvePreset } from "../api/auth";
import { useTranslation } from "react-i18next";
import i18n from "../i18n";
import { formatApiMessage } from "../utils/apiMessage";
import {
  getReviewTimesOptions,
  normalizeReviewCurvePreset,
  reviewCurveLabel,
} from "../utils/reviewCurve";
import { isValidSnowflakeId, normalizeSnowflakeId, sameSnowflakeId } from "../utils/json-snowflake";

const DEFAULT_PASSWORD = "student123";

type TabKey = "hours" | "wordbooks" | "vocab";

function studentLabel(row: TeacherCoachingQuotaRow) {
  const s = row.student;
  return s?.displayName || s?.username || s?.email || i18n.t("student_detail.student_fallback", { id: row.studentId });
}

function formatDateTime(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function StudentDetail() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { studentId: studentIdParam } = useParams<{ studentId: string }>();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const studentId = normalizeSnowflakeId(studentIdParam);

  const tabFromQuery = searchParams.get("tab");
  const initialTab: TabKey =
    tabFromQuery === "wordbooks" ||
    tabFromQuery === "vocab" ||
    tabFromQuery === "hours"
      ? (tabFromQuery as TabKey)
      : "hours";
  const [tab, setTab] = useState<TabKey>(initialTab);

  const [quota, setQuota] = useState<TeacherCoachingQuotaRow | null>(null);
  const [title, setTitle] = useState("");
  const [loadingQuota, setLoadingQuota] = useState(true);

  const [wordBooks, setWordBooks] = useState<StudentWordBookItem[]>([]);
  const [loadingBooks, setLoadingBooks] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [catalog, setCatalog] = useState<Array<CachedWordBook & { custom?: boolean }>>([]);
  const [catalogQ, setCatalogQ] = useState("");
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const [vocabItems, setVocabItems] = useState<StudentActivityListItem[]>([]);
  const [loadingVocab, setLoadingVocab] = useState(false);

  const [pwdOpen, setPwdOpen] = useState(false);
  const [pwdValue, setPwdValue] = useState(DEFAULT_PASSWORD);
  const [pwdSaving, setPwdSaving] = useState(false);
  const [reviewPreset, setReviewPreset] = useState<ReviewCurvePreset>("times5");
  const [reviewSaving, setReviewSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [quotaEditOpen, setQuotaEditOpen] = useState(false);
  const [quotaMode, setQuotaMode] = useState<"add" | "set">("add");
  const [quotaInput, setQuotaInput] = useState("1");
  const [quotaSaving, setQuotaSaving] = useState(false);

  useEffect(() => {
    const fromNav = (location.state as { studentName?: string } | null)?.studentName;
    if (fromNav) setTitle(fromNav);
  }, [location.state]);

  useEffect(() => {
    if (!isValidSnowflakeId(studentId)) {
      setLoadingQuota(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoadingQuota(true);
      try {
        const rows = await listAllTeacherCoachingQuotas();
        if (cancelled) return;
        const row = rows.find((r) => sameSnowflakeId(r.studentId, studentId)) || null;
        setQuota(row);
        if (row) setTitle(studentLabel(row));
        else if (!title) setTitle(t("student_detail.student_fallback", { id: studentId }));
      } catch {
        if (!cancelled && !title) setTitle(t("student_detail.student_fallback", { id: studentId }));
      } finally {
        if (!cancelled) setLoadingQuota(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- title only for initial fallback
  }, [studentId]);

  useEffect(() => {
    const p =
      quota?.reviewCurvePreset ||
      quota?.student?.reviewCurvePreset ||
      (quota?.reviewTimes === 3
        ? "times3"
        : quota?.reviewTimes === 7
          ? "times7"
          : quota?.reviewTimes === 10
            ? "times10"
            : "times5");
    setReviewPreset(normalizeReviewCurvePreset(p));
  }, [quota?.reviewCurvePreset, quota?.student?.reviewCurvePreset, quota?.reviewTimes]);

  const saveReviewCurve = async (next: ReviewCurvePreset) => {
    setReviewPreset(next);
    setReviewSaving(true);
    try {
      const res = await setTeacherStudentReviewCurve(studentId, next);
      if (res.code !== 200) {
        showToast.error(formatApiMessage(res.msg, "common.operation_failed"));
        return;
      }
      setQuota((prev) =>
        prev
          ? {
              ...prev,
              reviewCurvePreset: next,
              reviewTimes: res.data?.reviewTimes,
              student: prev.student
                ? { ...prev.student, reviewCurvePreset: next }
                : prev.student,
            }
          : prev
      );
      showToast.success(t("student_detail.review_updated"));
    } catch {
      showToast.error(formatApiMessage(undefined, "common.operation_failed"));
    } finally {
      setReviewSaving(false);
    }
  };

  const saveStudentQuota = async () => {
    if (!quota) return;
    const n = Number(quotaInput);
    if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
      showToast.error(t("student_detail.invalid_lessons"));
      return;
    }
    const nextRemaining =
      quotaMode === "add" ? Math.max(0, remaining) + n : n;
    setQuotaSaving(true);
    try {
      const res = await addTeacherCoachingStudent({
        studentId,
        remainingLessons: nextRemaining,
      });
      if (res.code !== 200 || !res.data) {
        showToast.error(formatApiMessage(res.msg, "common.operation_failed"));
        return;
      }
      setQuota((prev) =>
        prev
          ? {
              ...prev,
              ...res.data,
              student: res.data.student || prev.student,
            }
          : res.data
      );
      showToast.success(
        quotaMode === "add"
          ? t("student_detail.added_lessons", { n, remaining: nextRemaining })
          : t("student_detail.set_lessons", { remaining: nextRemaining })
      );
      setQuotaInput(quotaMode === "add" ? "1" : String(nextRemaining));
      setQuotaEditOpen(false);
    } catch (e: unknown) {
      const msg =
        e && typeof e === "object" && "msg" in e ? String((e as { msg: string }).msg) : formatApiMessage(undefined, "common.operation_failed");
      showToast.error(msg);
    } finally {
      setQuotaSaving(false);
    }
  };

  const onTabChange = (v: string) => {
    const next = (v as TabKey) || "hours";
    setTab(next);
    const sp = new URLSearchParams(searchParams);
    if (next === "hours") sp.delete("tab");
    else sp.set("tab", next);
    setSearchParams(sp, { replace: true });
  };

  const loadWordBooks = useCallback(async () => {
    if (!isValidSnowflakeId(studentId)) return;
    setLoadingBooks(true);
    try {
      const res = await listStudentWordBooksAsTeacher(studentId);
      if (res.code !== 200) {
        showToast.error(formatApiMessage(res.msg, "common.query_failed"));
        setWordBooks([]);
        return;
      }
      setWordBooks(Array.isArray(res.data?.list) ? res.data.list : []);
    } catch (e: unknown) {
      const msg =
        e && typeof e === "object" && "msg" in e
          ? String((e as { msg: string }).msg)
          : formatApiMessage(undefined, "common.query_failed");
      showToast.error(msg);
      setWordBooks([]);
    } finally {
      setLoadingBooks(false);
    }
  }, [studentId]);

  const loadVocabTests = useCallback(async () => {
    if (!isValidSnowflakeId(studentId)) return;
    setLoadingVocab(true);
    try {
      const res = await listStudentActivityRecordsAsTeacher(studentId, {
        limit: 50,
        q: "vocab_test",
      });
      if (res.code !== 200) {
        showToast.error(formatApiMessage(res.msg, "common.query_failed"));
        setVocabItems([]);
        return;
      }
      const list = Array.isArray(res.data?.list) ? res.data.list : [];
      setVocabItems(list.filter((x) => x.kind === "vocab_test"));
    } catch (e: unknown) {
      const msg =
        e && typeof e === "object" && "msg" in e
          ? String((e as { msg: string }).msg)
          : formatApiMessage(undefined, "common.query_failed");
      showToast.error(msg);
      setVocabItems([]);
    } finally {
      setLoadingVocab(false);
    }
  }, [studentId]);


  useEffect(() => {
    if (tab === "wordbooks") void loadWordBooks();
  }, [tab, loadWordBooks]);

  useEffect(() => {
    if (tab === "vocab") void loadVocabTests();
  }, [tab, loadVocabTests]);

  const openAddBook = () => {
    setAddOpen(true);
    setCatalogQ("");
    setCatalog([]);
  };

  const loadCatalog = useCallback(async (keyword: string) => {
    setCatalogLoading(true);
    try {
      const kw = keyword.trim() || undefined;
      const [systemRes, customRes] = await Promise.all([
        listWordBooks({ page: 1, pageSize: 40, keyword: kw }),
        listWordBooks({ page: 1, pageSize: 100, keyword: kw, group: "custom" }),
      ]);
      const system = systemRes.code === 200 && Array.isArray(systemRes.data?.list) ? systemRes.data.list : [];
      const custom = customRes.code === 200 && Array.isArray(customRes.data?.list) ? customRes.data.list : [];
      const seen = new Set<string>();
      const merged: Array<CachedWordBook & { custom?: boolean }> = [];
      for (const b of [...custom, ...system]) {
        const id = normalizeSnowflakeId(b.id);
        if (!id || seen.has(id)) continue;
        seen.add(id);
        merged.push({
          id: b.id,
          name: b.name,
          wordCount: b.wordCount,
          level: b.level,
          category: b.category,
          custom: custom.some((c) => sameSnowflakeId(c.id, b.id)) || b.category === "custom",
        });
      }
      setCatalog(merged);
    } catch {
      setCatalog([]);
    } finally {
      setCatalogLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!addOpen) return;
    const delay = catalogQ.trim() ? 300 : 0;
    const timer = window.setTimeout(() => {
      void loadCatalog(catalogQ);
    }, delay);
    return () => window.clearTimeout(timer);
  }, [addOpen, catalogQ, loadCatalog]);

  const assignedIds = useMemo(
    () => new Set(wordBooks.map((b) => normalizeSnowflakeId(b.id))),
    [wordBooks]
  );

  const filteredCatalog = useMemo(() => {
    const q = catalogQ.trim().toLowerCase();
    return catalog.filter((b) => {
      if (assignedIds.has(normalizeSnowflakeId(b.id))) return false;
      if (!q) return true;
      return (
        b.name.toLowerCase().includes(q) ||
        String(b.id).includes(q) ||
        (b.level || "").toLowerCase().includes(q) ||
        (b.category || "").toLowerCase().includes(q)
      );
    });
  }, [catalog, catalogQ, assignedIds]);

  const handleAddBook = async (wbId: string | number) => {
    const bookId = normalizeSnowflakeId(wbId);
    if (!bookId) return;
    setAddingId(bookId);
    try {
      const res = await addStudentWordBookAsTeacher(studentId, bookId);
      if (res.code !== 200) {
        showToast.error(formatApiMessage(res.msg, "common.operation_failed"));
        return;
      }
      showToast.success(t("student_detail.added_wordbook"));
      await loadWordBooks();
      setAddOpen(false);
    } catch (e: unknown) {
      const msg =
        e && typeof e === "object" && "msg" in e ? String((e as { msg: string }).msg) : formatApiMessage(undefined, "common.operation_failed");
      showToast.error(msg);
    } finally {
      setAddingId(null);
    }
  };

  const handleRemoveBook = async (wbId: string | number) => {
    const bookId = normalizeSnowflakeId(wbId);
    if (!bookId) return;
    setRemovingId(bookId);
    try {
      const res = await removeStudentWordBookAsTeacher(studentId, bookId);
      if (res.code !== 200) {
        showToast.error(formatApiMessage(res.msg, "common.operation_failed"));
        return;
      }
      showToast.success(t("student_detail.removed_wordbook"));
      setWordBooks((prev) => prev.filter((b) => !sameSnowflakeId(b.id, bookId)));
    } catch (e: unknown) {
      const msg =
        e && typeof e === "object" && "msg" in e ? String((e as { msg: string }).msg) : formatApiMessage(undefined, "common.operation_failed");
      showToast.error(msg);
    } finally {
      setRemovingId(null);
    }
  };

  const savePassword = async (resetDefault: boolean) => {
    const pwd = resetDefault ? DEFAULT_PASSWORD : pwdValue.trim();
    if (!pwd || pwd.length < 6) {
      showToast.warning(t("my_students.password_min"));
      return;
    }
    setPwdSaving(true);
    try {
      const res = await setTeacherStudentPassword(studentId, pwd);
      if (res.code !== 200) {
        showToast.error(formatApiMessage(res.msg, "common.operation_failed"));
        return;
      }
      const account = res.data?.username || quota?.student?.username || title;
      showToast.success(
        resetDefault
          ? t("my_students.reset_success", { account, pwd: DEFAULT_PASSWORD })
          : t("my_students.update_password_success", { account })
      );
      setPwdOpen(false);
    } catch (e: unknown) {
      const msg =
        e && typeof e === "object" && "msg" in e ? String((e as { msg: string }).msg) : formatApiMessage(undefined, "common.operation_failed");
      showToast.error(msg);
    } finally {
      setPwdSaving(false);
    }
  };

  const handleRemoveStudent = async () => {
    setDeleting(true);
    try {
      const res = await removeTeacherStudent(studentId);
      if (res.code !== 200) {
        showToast.error(formatApiMessage(res.msg, "common.operation_failed"));
        return;
      }
      showToast.success(t("student_detail.removed"));
      setDeleteOpen(false);
      navigate("/my-students", { replace: true });
    } catch (e: unknown) {
      const msg =
        e && typeof e === "object" && "msg" in e ? String((e as { msg: string }).msg) : formatApiMessage(undefined, "common.operation_failed");
      showToast.error(msg);
    } finally {
      setDeleting(false);
    }
  };

  const displayName = title || t("student_detail.student_fallback", { id: studentId });
  const avatar = resolveMediaUrl(quota?.student?.avatar);
  const remaining = quota?.remainingLessons ?? 0;
  const total = quota?.totalAllocatedLessons ?? 0;
  const low = remaining < 1;

  if (!isValidSnowflakeId(studentId)) {
    return (
      <div className="p-4">
        <CloudCard className="p-8">
          <CloudEmpty description={t("student_detail.invalid")} />
        </CloudCard>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-3">
      <div className="flex items-center gap-2 shrink-0">
        <CloudButton
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => navigate("/my-students")}
          aria-label={t("student_detail.back")}
          className="shrink-0"
        >
          <ChevronLeft size={20} />
        </CloudButton>
        <div className="min-w-0 flex-1 flex items-center gap-2">
          <div className="size-9 rounded-full bg-primary-soft border border-border overflow-hidden flex items-center justify-center shrink-0">
            {avatar ? (
              <img src={avatar} alt="" className="size-full object-cover" />
            ) : (
              <span className="text-xs font-semibold text-primary">
                {(displayName || "?").trim().slice(0, 1).toUpperCase()}
              </span>
            )}
          </div>
          <div className="min-w-0">
            <span className="text-sm font-semibold text-foreground truncate block">
              {displayName}
            </span>
            <span className="text-[11px] text-muted-foreground truncate block">
              {quota?.student?.username || quota?.student?.email || `ID ${studentId}`}
            </span>
          </div>
        </div>
        <CloudButton
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0 text-destructive border-destructive/30 hover:bg-destructive/5"
          onClick={() => setDeleteOpen(true)}
          disabled={!quota || deleting}
        >
          <Trash2 size={14} className="mr-1" />
          {t("student_detail.remove")}
        </CloudButton>
      </div>

      <Tabs value={tab} onValueChange={onTabChange} className="flex flex-col flex-1 min-h-0 gap-3">
        <TabsList className="w-full shrink-0">
          <TabsTrigger value="hours" className="flex-1">
            {t("student_detail.tab_hours")}
          </TabsTrigger>
          <TabsTrigger value="wordbooks" className="flex-1">
            {t("student_detail.tab_wordbooks")}
          </TabsTrigger>
          <TabsTrigger value="vocab" className="flex-1">
            {t("student_detail.tab_vocab")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="hours" className="flex-1 min-h-0 overflow-y-auto space-y-3 pb-2">
          {loadingQuota ? (
            <CloudCard className="p-10">
              <CloudSpin tip={t("practice.loading")} />
            </CloudCard>
          ) : !quota ? (
            <CloudCard className="p-8">
              <CloudEmpty description={t("student_detail.not_found_quota")} />
            </CloudCard>
          ) : (
            <>
              <CloudCard className="p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-xs text-muted-foreground">{t("student_detail.remaining_hours")}</div>
                    <div
                      className={`text-2xl font-bold tabular-nums mt-1 ${
                        low ? "text-destructive" : "text-foreground"
                      }`}
                    >
                      {t("student_detail.lessons_count", { count: remaining })}
                    </div>
                    <div className="flex items-center justify-between gap-2 mt-1">
                      <div className="text-[11px] text-muted-soft min-w-0">
                        {t("student_detail.allocated_lessons_summary", {
                          total,
                          remaining,
                        })}
                      </div>
                      <CloudButton
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="shrink-0 h-7 px-2 text-muted-foreground hover:text-foreground"
                        onClick={() => {
                          setQuotaMode("add");
                          setQuotaInput("1");
                          setQuotaEditOpen(true);
                        }}
                        aria-label={t("student_detail.edit_quota")}
                      >
                        <Pencil size={14} />
                      </CloudButton>
                    </div>
                  </div>
                  <div
                    className={`size-12 rounded-2xl flex items-center justify-center shrink-0 ${
                      low ? "bg-destructive/10" : "bg-primary-soft"
                    }`}
                  >
                    <Clock size={22} className={low ? "text-destructive" : "text-primary"} />
                  </div>
                </div>
                {total > 0 && (
                  <div className="mt-4 h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className={`h-full rounded-full ${low ? "bg-destructive" : "bg-primary"}`}
                      style={{
                        width: `${Math.min(100, Math.round((remaining / total) * 100))}%`,
                      }}
                    />
                  </div>
                )}
              </CloudCard>

              <CloudCard className="p-4 space-y-3">
                <div>
                  <div className="text-sm font-semibold text-foreground">{t("student_detail.review_times")}</div>
                  <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
{t("student_detail.review_desc", { label: reviewCurveLabel(reviewPreset) })}
                  </p>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {getReviewTimesOptions().map((opt) => (
                    <CloudButton
                      key={opt.value}
                      type="button"
                      variant={reviewPreset === opt.value ? "brand" : "outline"}
                      size="sm"
                      disabled={reviewSaving}
                      onClick={() => void saveReviewCurve(opt.value)}
                    >
                      {opt.label}
                    </CloudButton>
                  ))}
                </div>
              </CloudCard>

              <CloudCard className="p-4 space-y-3">
                <div className="text-sm font-semibold text-foreground">{t("student_detail.quick_actions")}</div>
                <div className="flex flex-wrap gap-2">
                  <CloudButton
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1"
                    onClick={() => {
                      setPwdValue(DEFAULT_PASSWORD);
                      setPwdOpen(true);
                    }}
                  >
                    <KeyRound size={14} />
                    {t("student_detail.reset_password")}
                  </CloudButton>
                </div>
                <div className="text-[11px] text-muted-foreground grid grid-cols-3 gap-2 pt-1">
                  <div>
                    {t("student_detail.tests")} <span className="font-medium text-foreground">{quota.vocabTestCount ?? 0}</span>
                  </div>
                  <div>
                    {t("student_detail.coaching")}{" "}
                    <span className="font-medium text-foreground">
                      {quota.coachingSessionCount ?? 0}
                    </span>
                  </div>
                  <div>
                    {t("student_detail.training")}{" "}
                    <span className="font-medium text-foreground">{quota.studySessionCount ?? 0}</span>
                  </div>
                </div>
                {quota.latestVocabLevel && (
                  <p className="text-[11px] text-muted-soft">
                    {t("student_detail.latest_vocab", {
                      level: quota.latestVocabLevel,
                      vocab: quota.latestEstimatedVocab
                        ? t("student_detail.approx_vocab", { count: quota.latestEstimatedVocab })
                        : "",
                      time: quota.latestVocabTestAt
                        ? ` · ${formatDateTime(quota.latestVocabTestAt)}`
                        : "",
                    })}
                  </p>
                )}
              </CloudCard>
            </>
          )}
        </TabsContent>

        <TabsContent value="wordbooks" className="flex-1 min-h-0 overflow-y-auto space-y-3 pb-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm text-muted-foreground">
              {t("student_detail.assigned_count", { count: loadingBooks ? "…" : wordBooks.length })}
            </span>
            <CloudButton
              type="button"
              variant="brand"
              size="sm"
              className="gap-1"
              onClick={() => void openAddBook()}
            >
              <Plus size={14} />
              {t("student_detail.add_wordbook")}
            </CloudButton>
          </div>

          {loadingBooks ? (
            <CloudCard className="p-10">
              <CloudSpin tip={t("student_detail.loading_wordbooks")} />
            </CloudCard>
          ) : wordBooks.length === 0 ? (
            <CloudCard className="p-8">
              <CloudEmpty description={t("student_detail.no_wordbooks")} />
            </CloudCard>
          ) : (
            wordBooks.map((b) => (
              <CloudCard key={normalizeSnowflakeId(b.id)} className="p-3">
                <div className="flex items-center gap-3">
                  <div className="size-10 rounded-xl bg-primary-soft flex items-center justify-center shrink-0">
                    <BookOpen size={18} className="text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-foreground truncate">{b.name}</div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">
                      {b.wordCount > 0 ? t("create_wordbook.words_count", { count: b.wordCount }) : t("student_detail.word_count_unknown")} · ID {b.id}
                    </div>
                  </div>
                  <CloudButton
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="shrink-0 text-destructive"
                    disabled={removingId !== null}
                    onClick={() => void handleRemoveBook(b.id)}
                    aria-label={t("student_detail.remove_wordbook")}
                  >
                    {sameSnowflakeId(removingId, b.id) ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <Trash2 size={16} />
                    )}
                  </CloudButton>
                </div>
              </CloudCard>
            ))
          )}
        </TabsContent>

        <TabsContent value="vocab" className="flex-1 min-h-0 overflow-y-auto space-y-3 pb-2">
          {loadingVocab ? (
            <CloudCard className="p-10">
              <CloudSpin tip={t("student_detail.loading_vocab")} />
            </CloudCard>
          ) : vocabItems.length === 0 ? (
            <CloudCard className="p-8">
              <CloudEmpty description={t("student_detail.no_vocab")} />
            </CloudCard>
          ) : (
            vocabItems.map((item) => (
              <button
                type="button"
                key={`${item.kind}-${item.id}`}
                className="w-full text-left"
                onClick={() =>
                  navigate(
                    `/vocabulary-test/result?studentId=${studentId}&recordId=${item.id}`
                  )
                }
              >
                <CloudCard className="p-3 hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-foreground">{item.title}</div>
                      <p className="text-[12px] text-muted-foreground mt-1 leading-relaxed">
                        {item.summary}
                      </p>
                      <p className="text-[11px] text-muted-soft mt-1.5">
                        {formatDateTime(item.time)}
                      </p>
                    </div>
                    {item.vocabTest?.estimatedLevel && (
                      <span className="shrink-0 text-xs font-medium px-2 py-0.5 rounded-md bg-primary-soft text-primary">
                        {item.vocabTest.estimatedLevel}
                      </span>
                    )}
                  </div>
                </CloudCard>
              </button>
            ))
          )}
        </TabsContent>

      </Tabs>

      <Dialog
        open={quotaEditOpen}
        onOpenChange={(open) => {
          if (quotaSaving) return;
          setQuotaEditOpen(open);
        }}
      >
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle>{t("student_detail.edit_quota")}</DialogTitle>
            <DialogDescription>
              {t("student_detail.allocated_lessons_summary", {
                total,
                remaining,
              })}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex gap-2">
              <CloudButton
                type="button"
                size="sm"
                variant={quotaMode === "add" ? "brand" : "outline"}
                onClick={() => {
                  setQuotaMode("add");
                  setQuotaInput("1");
                }}
              >
                {t("student_detail.add_lessons")}
              </CloudButton>
              <CloudButton
                type="button"
                size="sm"
                variant={quotaMode === "set" ? "brand" : "outline"}
                onClick={() => {
                  setQuotaMode("set");
                  setQuotaInput(String(Math.max(0, remaining)));
                }}
              >
                {t("student_detail.set_remaining")}
              </CloudButton>
            </div>
            <CloudInput
              label={
                quotaMode === "add"
                  ? t("student_detail.add_lessons_label")
                  : t("student_detail.remaining_lessons_label")
              }
              type="number"
              min={0}
              step={1}
              value={quotaInput}
              onChange={setQuotaInput}
              inputMode="numeric"
            />
            <div className="flex flex-wrap gap-2">
              {(quotaMode === "add" ? [1, 2, 4, 8] : [0, 2, 4, 8]).map((n) => (
                <CloudButton
                  key={n}
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setQuotaInput(String(n))}
                >
                  {quotaMode === "add"
                    ? `+${n}`
                    : t("student_detail.lessons_count", { count: n })}
                </CloudButton>
              ))}
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-2 flex-col sm:flex-row">
            <CloudButton
              type="button"
              variant="outline"
              className="flex-1"
              disabled={quotaSaving}
              onClick={() => setQuotaEditOpen(false)}
            >
              {t("practice.cancel")}
            </CloudButton>
            <CloudButton
              type="button"
              variant="brand"
              className="flex-1"
              loading={quotaSaving}
              onClick={() => void saveStudentQuota()}
            >
              {t("practice.save")}
            </CloudButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-lg rounded-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{t("student_detail.add_wordbook")}</DialogTitle>
            <DialogDescription>{t("student_detail.add_wordbook_desc")}</DialogDescription>
          </DialogHeader>
          <CloudInput
            value={catalogQ}
            onChange={setCatalogQ}
            placeholder={t("student_detail.search_wordbooks")}
            prefix={<Search size={16} className="text-muted-foreground" />}
            allowClear
          />
          <div className="flex-1 min-h-0 overflow-y-auto space-y-2 max-h-[50vh] -mx-1 px-1">
            {catalogLoading ? (
              <div className="py-10 flex justify-center">
                <CloudSpin tip={t("student_detail.catalog_loading")} />
              </div>
            ) : filteredCatalog.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                {catalogQ.trim()
                  ? t("student_detail.no_addable")
                  : t("student_detail.catalog_search_hint")}
              </p>
            ) : (
              filteredCatalog.map((b) => (
                <div
                  key={normalizeSnowflakeId(b.id)}
                  className="flex items-center gap-3 rounded-xl border border-border px-3 py-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-foreground truncate">
                      {b.name}
                      {b.custom ? (
                        <span className="ml-1.5 text-[11px] font-normal text-muted-foreground">
                          {t("shelf.group_custom")}
                        </span>
                      ) : null}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      {b.wordCount ? t("create_wordbook.words_count", { count: b.wordCount }) : "—"}
                      {b.level ? ` · ${b.level}` : ""}
                    </div>
                  </div>
                  <CloudButton
                    type="button"
                    variant="brand"
                    size="sm"
                    loading={sameSnowflakeId(addingId, b.id)}
                    disabled={addingId !== null}
                    onClick={() => void handleAddBook(b.id)}
                  >
                    {t("student_detail.add")}
                  </CloudButton>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={deleteOpen}
        onOpenChange={(open) => {
          if (deleting) return;
          setDeleteOpen(open);
        }}
      >
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle>{t("student_detail.remove_student_title")}</DialogTitle>
            <DialogDescription>
              {t("student_detail.remove_student_desc", { name: displayName })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2 flex-col sm:flex-row">
            <CloudButton
              type="button"
              variant="outline"
              className="flex-1"
              disabled={deleting}
              onClick={() => setDeleteOpen(false)}
            >
              {t("practice.cancel")}
            </CloudButton>
            <CloudButton
              type="button"
              variant="brand"
              className="flex-1 bg-destructive hover:bg-destructive/90"
              loading={deleting}
              onClick={() => void handleRemoveStudent()}
            >
              {t("student_detail.confirm_remove")}
            </CloudButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={pwdOpen}
        onOpenChange={(open) => {
          if (pwdSaving) return;
          setPwdOpen(open);
        }}
      >
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle>{t("my_students.set_password")}</DialogTitle>
            <DialogDescription>
              {displayName}
              {quota?.student?.username ? ` · ${quota.student.username}` : ""}
            </DialogDescription>
          </DialogHeader>
          <CloudInput
            value={pwdValue}
            onChange={setPwdValue}
            placeholder={DEFAULT_PASSWORD}
            autoComplete="new-password"
          />
          <DialogFooter className="gap-2 sm:gap-2 flex-col sm:flex-row">
            <CloudButton
              type="button"
              variant="outline"
              className="flex-1"
              disabled={pwdSaving}
              onClick={() => void savePassword(true)}
            >
              {t("my_students.reset_password", { pwd: DEFAULT_PASSWORD })}
            </CloudButton>
            <CloudButton
              type="button"
              variant="brand"
              className="flex-1"
              loading={pwdSaving}
              onClick={() => void savePassword(false)}
            >
              {t("my_students.save_password")}
            </CloudButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
