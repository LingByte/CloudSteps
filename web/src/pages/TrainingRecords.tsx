import { useEffect, useState, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router";
import { CloudButton } from "../components/cloudsteps";
import { CloudCard, CloudSelect, CloudDatePicker } from "../components/cloudsteps/arco";
import { BookOpen, RotateCcw, X, Volume2, Download } from "lucide-react";
import {
  listStudySessions,
  getStudySessionDetail,
  exportStudySessionWords,
  type StudySessionListItem,
  type StudyWordItem,
} from "../api/study";
import { listAllTeacherCoachingQuotas, type TeacherCoachingQuotaRow } from "../api/coaching";
import { playFirstWordAudio } from "../utils/audioPlayer";
import { formatTranslation, formatTranslationShort } from "../utils/wordFormat";
import { downloadExcelRows, downloadPdfTable } from "../utils/excelExport";
import { pickPhonetic } from "../utils/wordExportFields";
import { showToast } from "../utils/toast";
import { useAuthStore } from "../stores/authStore";
import { getTrainingStudent } from "../utils/trainingStudent";
import { useTranslation } from "react-i18next";
import i18n from "../i18n";
import { formatApiMessage } from "../utils/apiMessage";
import { normalizeSnowflakeId } from "../utils/json-snowflake";

type Tab = "study" | "review";
type ExportFormat = "excel" | "pdf";
/** 导出内容：音标+中文+英文 / 仅中文侧 / 仅英文侧 */
type ExportContent = "both" | "zh" | "en";

function exportContentLabel(c: ExportContent, tr: (k: string) => string) {
  if (c === "zh") return tr("training_records.content_zh");
  if (c === "en") return tr("training_records.content_en");
  return tr("training_records.export_both");
}

function todayCompact() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
}

function studentLabel(row: TeacherCoachingQuotaRow) {
  const s = row.student;
  return s?.displayName || s?.username || s?.email || i18n.t("student_detail.student_fallback", { id: row.studentId });
}

function todayYMD() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function dayKey(ts?: string | null) {
  if (!ts) return "";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return String(ts).slice(0, 10);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 后端未开 groupBy 时：前端按词库+日聚合已完成会话 */
function groupSessionsClient(items: StudySessionListItem[]): StudySessionListItem[] {
  const map = new Map<string, StudySessionListItem>();
  for (const item of items) {
    if (item.status && item.status !== "completed" && item.status !== "grouped") continue;
    const day = item.day || dayKey(item.startedAt || item.latestAt);
    const key = `${item.wordBookId || 0}|${day}`;
    const prev = map.get(key);
    if (!prev) {
      map.set(key, {
        ...item,
        day,
        latestAt: item.latestAt || item.startedAt,
        sessionCount: item.sessionCount || 1,
        sessionIds: item.sessionIds?.length
          ? [...item.sessionIds]
          : item.id
            ? [item.id]
            : [],
        status: "grouped",
      });
      continue;
    }
    prev.wordCount = (prev.wordCount || 0) + (item.wordCount || 0);
    prev.correctCount = (prev.correctCount || 0) + (item.correctCount || 0);
    prev.screenedKnownCount = (prev.screenedKnownCount || 0) + (item.screenedKnownCount || 0);
    prev.screenedUnknownCount = (prev.screenedUnknownCount || 0) + (item.screenedUnknownCount || 0);
    prev.sessionCount = (prev.sessionCount || 0) + 1;
    const id = item.id;
    if (id && !prev.sessionIds?.includes(id)) {
      prev.sessionIds = [...(prev.sessionIds || []), id];
    }
    const latest = item.latestAt || item.startedAt || "";
    if (latest && (!prev.latestAt || latest > prev.latestAt)) {
      prev.latestAt = latest;
    }
  }
  return Array.from(map.values()).sort((a, b) =>
    String(b.latestAt || "").localeCompare(String(a.latestAt || ""))
  );
}

export default function TrainingRecords() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const role = useAuthStore((s) => s.user?.role) || "user";
  const isCoach = role === "user" || role === "admin" || role === "teacher";

  const [tab, setTab] = useState<Tab>("study");
  const [list, setList] = useState<StudySessionListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 50;

  const [studentId, setStudentId] = useState<string>("");
  const [dateMode, setDateMode] = useState<"all" | "day" | "range">("all");
  const [dateDay, setDateDay] = useState(todayYMD());
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [wordBookId, setWordBookId] = useState<string>("");

  const [students, setStudents] = useState<TeacherCoachingQuotaRow[]>([]);
  const [studentsLoading, setStudentsLoading] = useState(false);

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailWords, setDetailWords] = useState<StudyWordItem[]>([]);
  const [detailSession, setDetailSession] = useState<StudySessionListItem | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [playingId, setPlayingId] = useState<number | null>(null);

  const [exportOpen, setExportOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState<ExportFormat>("pdf");
  const [exportContent, setExportContent] = useState<ExportContent>("both");
  const [rowExportItem, setRowExportItem] = useState<StudySessionListItem | null>(null);

  const studentOptions = useMemo(
    () => students.map((r) => ({ label: studentLabel(r), value: String(r.studentId) })),
    [students]
  );

  const selectedStudentName = useMemo(() => {
    if (!studentId) return "";
    const row = students.find((s) => String(s.studentId) === studentId);
    return row ? studentLabel(row) : "";
  }, [studentId, students]);

  const wordBookOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of list) {
      const id = normalizeSnowflakeId(item.wordBookId);
      if (id && item.wordBookName) map.set(id, item.wordBookName);
    }
    return [
      { label: t("training_records.all_wordbooks"), value: "" },
      ...Array.from(map.entries()).map(([id, name]) => ({ label: name, value: id })),
    ];
  }, [list, t]);

  const filterParams = useCallback(() => {
    const params: {
      sessionType: string;
      status: string;
      groupBy: "bookDay";
      studentId?: number;
      date?: string;
      dateFrom?: string;
      dateTo?: string;
      wordBookId?: string | number;
    } = {
      // 后端正课会话 session_type 存的是 learn（不是 study）
      sessionType: tab === "study" ? "learn" : tab,
      // 只看已完成，过滤掉中途退出留下的「进行中」空会话
      status: "completed",
      groupBy: "bookDay",
    };

    // 正课/抗遗忘会话目前写在授课老师账号下，列表不按 studentId 过滤，否则会空。
    // 学员选择仅用于导出归类与标题。
    if (dateMode === "day" && dateDay) params.date = dateDay;
    if (dateMode === "range") {
      if (dateFrom) params.dateFrom = dateFrom;
      if (dateTo) params.dateTo = dateTo;
    }
    if (wordBookId) params.wordBookId = wordBookId;
    return params;
  }, [tab, dateMode, dateDay, dateFrom, dateTo, wordBookId]);

  useEffect(() => {
    if (!isCoach) return;
    let mounted = true;
    setStudentsLoading(true);
    listAllTeacherCoachingQuotas()
      .then((rows) => {
        if (!mounted) return;
        setStudents(rows);
        if (!studentId && rows.length > 0) {
          const saved = getTrainingStudent();
          const pick =
            (saved?.id ? rows.find((r) => r.studentId === saved.id) : undefined) || rows[0];
          setStudentId(String(pick.studentId));
        }
      })
      .catch(() => {
        if (mounted) setStudents([]);
      })
      .finally(() => {
        if (mounted) setStudentsLoading(false);
      });
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCoach]);

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listStudySessions({
        page,
        pageSize,
        ...filterParams(),
      });
      if (res.code === 200) {
        const raw = res.data?.list || [];
        if (res.data?.grouped) {
          setList(raw);
          setTotal(res.data?.total || 0);
        } else {
          const grouped = groupSessionsClient(raw);
          setList(grouped);
          setTotal(grouped.length);
        }
      }
    } catch (e) {
      console.error("加载记录失败:", e);
    } finally {
      setLoading(false);
    }
  }, [page, filterParams]);

  useEffect(() => {
    setPage(1);
  }, [tab, studentId, dateMode, dateDay, dateFrom, dateTo, wordBookId]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  const openDetail = async (item: StudySessionListItem) => {
    setDetailOpen(true);
    setDetailSession(item);
    setDetailWords([]);
    setDetailLoading(true);
    try {
      // 聚合记录：按词库+日一次拉取去重单词（避免 N 次详情请求失败/空列表）
      if (item.wordBookId) {
        const res = await exportStudySessionWords({
          sessionType: tab === "study" ? "learn" : "review",
          status: "completed",
          wordBookId: item.wordBookId,
          date: item.day || undefined,
        });
        if (res.code === 200 && (res.data?.words?.length || 0) > 0) {
          setDetailWords(
            (res.data?.words || []).map((w) => ({
              id: w.id,
              word: w.word,
              phonetic: w.phonetic,
              phoneticUk: w.phoneticUk,
              phoneticUs: w.phoneticUs,
              translation: formatTranslation(w.translation),
              partOfSpeech: w.partOfSpeech,
              audioUrl: w.audioUrl,
            }))
          );
          return;
        }
      }

      const ids =
        Array.isArray(item.sessionIds) && item.sessionIds.length > 0
          ? item.sessionIds
          : item.id
            ? [item.id]
            : [];
      if (ids.length === 0) return;

      const merged = new Map<number, StudyWordItem>();
      await Promise.all(
        ids.map(async (sid) => {
          const res = await getStudySessionDetail(sid);
          if (res.code !== 200) return;
          for (const w of res.data?.words || []) {
            if (!merged.has(w.id)) {
              merged.set(w.id, {
                ...w,
                translation: w.translation ? formatTranslation(w.translation) : undefined,
              });
            }
          }
        })
      );
      setDetailWords(Array.from(merged.values()));
    } catch (e) {
      console.error("加载详情失败:", e);
      showToast.error(t("training_records.load_detail_failed"));
    } finally {
      setDetailLoading(false);
    }
  };

  const handlePlayAudio = (word: StudyWordItem) => {
    if (!word.audioUrl) return;
    setPlayingId(word.id);
    playFirstWordAudio(word.audioUrl, () => setPlayingId(null));
  };

  const fmtTime = (ts?: string | null) => {
    if (!ts) return "—";
    try {
      const d = new Date(ts);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    } catch {
      return ts;
    }
  };

  const buildExportTable = (
    words: Array<{
      word: string;
      phonetic?: string;
      phoneticUk?: string;
      phoneticUs?: string;
      translation?: string;
    }>,
    content: ExportContent
  ) => {
    const headers =
      content === "both"
        ? [
            t("training_records.header_index"),
            t("training_records.header_en"),
            t("training_records.header_phonetic"),
            t("training_records.header_zh"),
          ]
        : content === "zh"
          ? [
              t("training_records.header_index"),
              t("training_records.header_en"),
              t("training_records.header_zh"),
            ]
          : [
              t("training_records.header_index"),
              t("training_records.header_en"),
              t("training_records.header_phonetic"),
            ];
    const tableRows: Array<Array<string | number>> = words.map((w, i) => {
      const phonetic = pickPhonetic(w);
      const zh = formatTranslationShort(w.translation) || "";
      const en = w.word || "";
      const no = i + 1;
      if (content === "both") return [no, en, phonetic, zh];
      if (content === "zh") return [no, en, zh];
      return [no, en, phonetic];
    });
    return { headers, tableRows };
  };

  const downloadExportFile = async (opts: {
    format: ExportFormat;
    fileBase: string;
    headers: string[];
    tableRows: Array<Array<string | number>>;
  }) => {
    const title = opts.fileBase.replace(/^【|】$/g, "");
    if (opts.format === "excel") {
      downloadExcelRows(`${opts.fileBase}.xls`, title, [opts.headers, ...opts.tableRows], {
        equalColumns: true,
      });
    } else {
      await downloadPdfTable({
        filename: `${opts.fileBase}.pdf`,
        title,
        headers: opts.headers,
        rows: opts.tableRows,
      });
    }
  };

  const handleExport = async () => {
    if (isCoach && !studentId) {
      showToast.error(t("training_records.select_student_export"));
      return;
    }
    setExporting(true);
    try {
      const res = await exportStudySessionWords(filterParams());
      if (res.code !== 200) {
        showToast.error(formatApiMessage(res.msg, "common.export_failed"));
        return;
      }
      const words = res.data?.words || [];
      if (words.length === 0) {
        showToast.error(t("training_records.no_words_export"));
        return;
      }

      const { headers, tableRows } = buildExportTable(words, exportContent);
      const who = selectedStudentName || t("training_records.student_fallback");
      const contentLabel = exportContentLabel(exportContent, t);
      const stamp = todayCompact();
      const fileBase =
        tab === "review"
          ? `【${who}-${stamp}-${t("training_records.kind_review")}-${contentLabel}】`
          : `【${who}-${stamp}-${contentLabel}】`;

      await downloadExportFile({ format: exportFormat, fileBase, headers, tableRows });
      showToast.success(t("training_records.exported_count", { count: words.length }));
      setExportOpen(false);
    } catch (e) {
      console.error(e);
      showToast.error(formatApiMessage(e instanceof Error ? e.message : undefined, "common.export_failed"));
    } finally {
      setExporting(false);
    }
  };

  const fetchRecordWords = async (item: StudySessionListItem) => {
    if (item.wordBookId) {
      const res = await exportStudySessionWords({
        sessionType: tab === "study" ? "learn" : "review",
        status: "completed",
        wordBookId: item.wordBookId,
        date: item.day || undefined,
      });
      if (res.code === 200 && (res.data?.words?.length || 0) > 0) {
        return res.data?.words || [];
      }
    }
    const ids =
      Array.isArray(item.sessionIds) && item.sessionIds.length > 0
        ? item.sessionIds
        : item.id
          ? [item.id]
          : [];
    if (ids.length === 0) return [];
    const merged = new Map<number, StudyWordItem>();
    await Promise.all(
      ids.map(async (sid) => {
        const res = await getStudySessionDetail(sid);
        if (res.code !== 200) return;
        for (const w of res.data?.words || []) {
          if (!merged.has(w.id)) merged.set(w.id, w);
        }
      })
    );
    return Array.from(merged.values());
  };

  const handleExportRecord = async (item: StudySessionListItem, format: ExportFormat) => {
    setExporting(true);
    try {
      const words = await fetchRecordWords(item);
      if (words.length === 0) {
        showToast.error(t("training_records.no_words_export"));
        return;
      }
      const { headers, tableRows } = buildExportTable(words, exportContent);
      const who = selectedStudentName || t("training_records.student_fallback");
      const day = item.day || todayCompact();
      const book = item.wordBookName || t("training_records.wordbook_fallback");
      const kind = tab === "review" ? t("training_records.kind_review") : t("training_records.kind_study");
      const contentLabel = exportContentLabel(exportContent, t);
      const fileBase = `【${who}-${day}-${book}-${kind}-${contentLabel}】`;
      await downloadExportFile({ format, fileBase, headers, tableRows });
      showToast.success(t("training_records.exported_count", { count: words.length }));
      setRowExportItem(null);
    } catch (e) {
      console.error(e);
      showToast.error(formatApiMessage(e instanceof Error ? e.message : undefined, "common.export_failed"));
    } finally {
      setExporting(false);
    }
  };

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <CloudButton
          type="button"
          variant="outline"
          size="sm"
          disabled={exporting || loading || (isCoach && !studentId)}
          onClick={() => setExportOpen(true)}
          className="shrink-0 self-end sm:self-auto"
        >
          <Download size={16} />
          {t("training_records.export_words")}
        </CloudButton>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setTab("study")}
          className={`px-4 py-1.5 rounded-xl text-sm font-medium transition-colors ${
            tab === "study"
              ? "bg-primary text-primary-foreground"
              : "bg-card text-muted-foreground border border-border"
          }`}
        >
          {t("training_records.tab_study")}
        </button>
        <button
          type="button"
          onClick={() => setTab("review")}
          className={`px-4 py-1.5 rounded-xl text-sm font-medium transition-colors ${
            tab === "review"
              ? "bg-primary text-primary-foreground"
              : "bg-card text-muted-foreground border border-border"
          }`}
        >
          {t("training_records.tab_review")}
        </button>
      </div>

      <CloudCard className="p-3 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {isCoach && (
            <div>
              <p className="text-xs text-muted-foreground mb-1">{t("training_records.student")}</p>
              <CloudSelect
                value={studentId || undefined}
                onChange={(v) => setStudentId(String(v ?? ""))}
                options={studentOptions}
                placeholder={studentsLoading ? t("training_records.loading_students") : t("training_records.select_student")}
                showSearch
                allowClear={false}
                sheetTitle={t("training_records.select_student")}
                disabled={studentsLoading || studentOptions.length === 0}
              />
            </div>
          )}
          <div>
            <p className="text-xs text-muted-foreground mb-1">{t("training_records.date_range")}</p>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {(
                [
                  { id: "all", label: t("training_records.date_all") },
                  { id: "day", label: t("training_records.date_day") },
                  { id: "range", label: t("training_records.date_range_label") },
                ] as const
              ).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setDateMode(m.id)}
                  className={`px-2.5 py-1 rounded-lg text-xs border transition-colors ${
                    dateMode === m.id
                      ? "bg-primary/15 text-primary border-primary/40 font-medium"
                      : "bg-muted/40 text-muted-foreground border-transparent"
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
            {dateMode === "day" && (
              <CloudDatePicker
                value={dateDay || undefined}
                allowClear={false}
                onChange={(v) => {
                  if (v) setDateDay(v);
                }}
              />
            )}
            {dateMode === "range" && (
              <div className="flex items-center gap-2">
                <CloudDatePicker
                  value={dateFrom || undefined}
                  placeholder={t("training_records.start_date")}
                  allowClear
                  onChange={(v) => setDateFrom(v || "")}
                />
                <span className="text-xs text-muted-foreground shrink-0">{t("training_records.to")}</span>
                <CloudDatePicker
                  value={dateTo || undefined}
                  placeholder={t("training_records.end_date")}
                  allowClear
                  onChange={(v) => setDateTo(v || "")}
                />
              </div>
            )}
          </div>
          <div className={isCoach ? "sm:col-span-2" : ""}>
            <p className="text-xs text-muted-foreground mb-1">{t("training_records.wordbook_filter")}</p>
            <CloudSelect
              value={wordBookId}
              onChange={(v) => setWordBookId(String(v ?? ""))}
              options={wordBookOptions}
              placeholder={t("training_records.all_wordbooks")}
              allowClear
              showSearch
              sheetTitle={t("training_records.filter_wordbook")}
            />
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground">
          {t("training_records.summary", {
            total,
            exportHint: selectedStudentName
              ? t("training_records.export_for", { name: selectedStudentName })
              : isCoach
                ? t("training_records.export_select_student")
                : "",
            dateHint:
              dateMode === "day" && dateDay
                ? ` · ${dateDay}`
                : dateMode === "range" && (dateFrom || dateTo)
                  ? ` · ${dateFrom || "…"} ~ ${dateTo || "…"}`
                  : "",
          })}
        </p>
      </CloudCard>

      {loading ? (
        <CloudCard className="p-10 text-center text-muted-foreground">{t("training_records.loading")}</CloudCard>
      ) : list.length === 0 ? (
        <CloudCard className="p-10 text-center">
          <div className="text-foreground font-semibold text-lg">{t("training_records.no_records")}</div>
          <div className="text-muted-foreground text-sm mt-2">{t("training_records.adjust_filters")}</div>
        </CloudCard>
      ) : (
        <div className="space-y-3">
          {list.map((item) => {
            const correctRate =
              item.wordCount > 0 ? Math.round((item.correctCount / item.wordCount) * 100) : 0;
            const key =
              item.sessionIds?.join("-") ||
              `${item.wordBookId || 0}-${item.day || item.startedAt || item.id || Math.random()}`;
            return (
              <CloudCard
                key={key}
                interactive
                className="p-4 hover:border-primary/40 transition-colors"
                onClick={() => openDetail(item)}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {tab === "study" ? (
                      <BookOpen size={16} className="text-primary shrink-0" />
                    ) : (
                      <RotateCcw size={16} className="text-secondary-brand shrink-0" />
                    )}
                    <span className="text-sm font-semibold text-foreground truncate">
                      {item.wordBookName || t("word_book_words.fallback_title", { id: item.wordBookId || "—" })}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-xs px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700">
                      {item.day || (item.startedAt ? String(item.startedAt).slice(0, 10) : "—")}
                    </span>
                    <CloudButton
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 px-2"
                      disabled={exporting}
                      onClick={(e) => {
                        e.stopPropagation();
                        setExportContent("both");
                        setRowExportItem(item);
                      }}
                    >
                      <Download size={14} />
                      {t("training_records.export")}
                    </CloudButton>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span>{fmtTime(item.latestAt || item.startedAt)}</span>
                  {(item.sessionCount || 0) > 1 && (
                    <span>{t("training_records.groups", { count: item.sessionCount })}</span>
                  )}
                  {tab === "study" &&
                    ((item.screenedKnownCount || 0) > 0 || (item.screenedUnknownCount || 0) > 0) && (
                      <span>
                        {t("training_records.screened_summary", {
                          known: item.screenedKnownCount || 0,
                          unknown: item.screenedUnknownCount || 0,
                        })}
                      </span>
                    )}
                  <span>{t("training_records.words_count", { count: item.wordCount })}</span>
                  <span>{t("training_records.correct_count", { count: item.correctCount })}</span>
                  {item.wordCount > 0 && (
                    <span>{t("training_records.accuracy", { rate: correctRate })}</span>
                  )}
                </div>
              </CloudCard>
            );
          })}

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-3 pt-2">
              <CloudButton
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                {t("practice.prev_page")}
              </CloudButton>
              <span className="text-sm text-muted-foreground">
                {page} / {totalPages}
              </span>
              <CloudButton
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                {t("practice.next_page")}
              </CloudButton>
            </div>
          )}
        </div>
      )}

      {rowExportItem && (
        <div
          className="fixed inset-0 bg-black/40 z-[110] flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => !exporting && setRowExportItem(null)}
        >
          <div
            className="bg-card rounded-t-2xl sm:rounded-2xl border border-border max-w-sm w-full overflow-hidden shadow-soft-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <div className="min-w-0 pr-2">
                <h3 className="text-base font-semibold text-foreground truncate">{t("training_records.export_row_title")}</h3>
                <p className="text-xs text-muted-foreground mt-0.5 truncate">
                  {[
                    rowExportItem.wordBookName,
                    rowExportItem.day || String(rowExportItem.startedAt || "").slice(0, 10),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              <CloudButton
                type="button"
                variant="ghost"
                size="iconRound"
                disabled={exporting}
                onClick={() => setRowExportItem(null)}
              >
                <X size={20} className="text-muted-foreground" />
              </CloudButton>
            </div>
            <div className="px-4 py-4 space-y-3">
              <div>
                <p className="text-xs text-muted-foreground mb-1">{t("training_records.export_content")}</p>
                <div className="flex gap-2">
                  {(
                    [
                      { id: "both", label: t("training_records.content_both_short") },
                      { id: "zh", label: t("training_records.content_zh") },
                      { id: "en", label: t("training_records.content_en") },
                    ] as const
                  ).map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      disabled={exporting}
                      onClick={() => setExportContent(f.id)}
                      className={`flex-1 py-2 rounded-xl text-sm font-medium border transition-colors ${
                        exportContent === f.id
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-card text-muted-foreground border-border"
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>
              <p className="text-xs text-muted-foreground mb-1">{t("training_records.export_format")}</p>
              <CloudButton
                type="button"
                variant="brand"
                className="w-full"
                disabled={exporting}
                onClick={() => void handleExportRecord(rowExportItem, "excel")}
              >
                {exporting ? t("training_records.exporting") : "Excel"}
              </CloudButton>
              <CloudButton
                type="button"
                variant="outline"
                className="w-full"
                disabled={exporting}
                onClick={() => void handleExportRecord(rowExportItem, "pdf")}
              >
                {exporting ? t("training_records.exporting") : "PDF"}
              </CloudButton>
            </div>
          </div>
        </div>
      )}

      {exportOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => !exporting && setExportOpen(false)}
        >
          <div
            className="bg-card rounded-t-2xl sm:rounded-2xl border border-border max-w-md w-full overflow-hidden flex flex-col shadow-soft-lg max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
              <h3 className="text-base font-semibold text-foreground">{t("training_records.export_study_words")}</h3>
              <CloudButton
                type="button"
                variant="ghost"
                size="iconRound"
                disabled={exporting}
                onClick={() => setExportOpen(false)}
              >
                <X size={20} className="text-muted-foreground" />
              </CloudButton>
            </div>
            <div className="px-4 py-4 space-y-4 overflow-y-auto">
              <p className="text-xs text-muted-foreground">
                {t("training_records.export_hint")}
              </p>
              {isCoach && (
                <div>
                  <p className="text-sm font-medium text-foreground mb-2">{t("training_records.export_student_label")}</p>
                  <CloudSelect
                    value={studentId || undefined}
                    onChange={(v) => setStudentId(String(v ?? ""))}
                    options={studentOptions}
                    placeholder={studentsLoading ? t("training_records.loading_students") : t("training_records.select_student")}
                    showSearch
                    allowClear={false}
                    sheetTitle={t("training_records.select_student")}
                    disabled={studentsLoading || studentOptions.length === 0 || exporting}
                  />
                </div>
              )}
              <div>
                <p className="text-sm font-medium text-foreground mb-2">{t("training_records.content_label")}</p>
                <div className="flex gap-2">
                  {(
                    [
                      { id: "both", label: t("training_records.export_both") },
                      { id: "zh", label: t("training_records.content_zh") },
                      { id: "en", label: t("training_records.content_en") },
                    ] as const
                  ).map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setExportContent(f.id)}
                      className={`flex-1 py-2 rounded-xl text-sm font-medium border transition-colors ${
                        exportContent === f.id
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-card text-muted-foreground border-border"
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-sm font-medium text-foreground mb-2">{t("training_records.format_label")}</p>
                <div className="flex gap-2">
                  {(
                    [
                      { id: "pdf", label: "PDF" },
                      { id: "excel", label: "Excel" },
                    ] as const
                  ).map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setExportFormat(f.id)}
                      className={`flex-1 py-2 rounded-xl text-sm font-medium border transition-colors ${
                        exportFormat === f.id
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-card text-muted-foreground border-border"
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="px-4 py-3 border-t border-border flex gap-2 shrink-0">
              <CloudButton
                type="button"
                variant="outline"
                className="flex-1"
                disabled={exporting}
                onClick={() => setExportOpen(false)}
              >
                {t("practice.cancel")}
              </CloudButton>
              <CloudButton
                type="button"
                variant="brand"
                className="flex-1"
                disabled={exporting}
                onClick={() => void handleExport()}
              >
                {exporting ? t("training_records.exporting") : t("training_records.start_export")}
              </CloudButton>
            </div>
          </div>
        </div>
      )}

      {detailOpen &&
        createPortal(
          <div
            className="fixed inset-0 z-[200] bg-black/45 flex items-end sm:items-center justify-center p-0 sm:p-4"
            onClick={() => setDetailOpen(false)}
          >
            <div
              className="bg-card rounded-t-2xl sm:rounded-2xl border border-border w-full max-w-lg sm:max-h-[85vh] h-[min(88dvh,720px)] sm:h-auto overflow-hidden flex flex-col shadow-soft-lg"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
                <div className="min-w-0 pr-2">
                  <h3 className="text-base font-semibold text-foreground truncate">
                    {detailSession?.wordBookName || t("training_records.study_detail")}
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">
                    {[
                      detailSession?.day ||
                        fmtTime(detailSession?.latestAt || detailSession?.startedAt),
                      (detailSession?.sessionCount || 0) > 1
                        ? t("training_records.groups", { count: detailSession?.sessionCount })
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                <CloudButton
                  type="button"
                  variant="ghost"
                  size="iconRound"
                  onClick={() => setDetailOpen(false)}
                >
                  <X size={20} className="text-muted-foreground" />
                </CloudButton>
              </div>

              <div className="px-4 py-2.5 border-b border-border shrink-0 space-y-2">
                {tab === "study" && (
                  <div className="grid grid-cols-2 gap-2 text-center">
                    <div className="rounded-lg bg-muted/50 py-1.5">
                      <div className="text-sm font-semibold text-foreground">
                        {detailSession?.screenedKnownCount ?? 0}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {t("session_report.stat.screened_known")}
                      </div>
                    </div>
                    <div className="rounded-lg bg-muted/50 py-1.5">
                      <div className="text-sm font-semibold text-foreground">
                        {detailSession?.screenedUnknownCount ?? 0}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {t("session_report.stat.screened_unknown")}
                      </div>
                    </div>
                  </div>
                )}
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg bg-muted/50 py-1.5">
                    <div className="text-sm font-semibold text-foreground">
                      {detailLoading ? "…" : detailWords.length}
                    </div>
                    <div className="text-[11px] text-muted-foreground">{t("practice.words_unit")}</div>
                  </div>
                  <div className="rounded-lg bg-muted/50 py-1.5">
                    <div className="text-sm font-semibold text-foreground">
                      {detailSession?.correctCount ?? 0}
                    </div>
                    <div className="text-[11px] text-muted-foreground">{t("training_records.correct_label")}</div>
                  </div>
                  <div className="rounded-lg bg-muted/50 py-1.5">
                    <div className="text-sm font-semibold text-foreground">
                      {detailSession && detailSession.wordCount > 0
                        ? `${Math.round(
                            (detailSession.correctCount / detailSession.wordCount) * 100
                          )}%`
                        : "—"}
                    </div>
                    <div className="text-[11px] text-muted-foreground">{t("training_records.accuracy_label")}</div>
                  </div>
                </div>
                {tab === "study" &&
                  (() => {
                    const reportId = normalizeSnowflakeId(
                      detailSession?.id ?? detailSession?.sessionIds?.[0],
                    );
                    if (!reportId) return null;
                    return (
                      <CloudButton
                        type="button"
                        variant="outline"
                        size="sm"
                        className="w-full"
                        onClick={() => {
                          setDetailOpen(false);
                          navigate(`/session-report/${encodeURIComponent(reportId)}`);
                        }}
                      >
                        {t("training_records.view_session_report")}
                      </CloudButton>
                    );
                  })()}
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 py-3">
                {detailLoading ? (
                  <div className="text-center text-muted-foreground py-10 text-sm">{t("training_records.loading")}</div>
                ) : detailWords.length === 0 ? (
                  <div className="text-center text-muted-foreground py-10 text-sm">{t("training_records.no_word_data")}</div>
                ) : (
                  <div className="space-y-2">
                    {detailWords.map((word, idx) => (
                      <div
                        key={word.id}
                        className="flex items-start justify-between gap-2 bg-muted/50 rounded-xl px-3 py-2.5"
                      >
                        <div className="flex items-start gap-2.5 flex-1 min-w-0">
                          <span className="text-xs text-muted-soft shrink-0 w-5 text-right pt-0.5">
                            {idx + 1}
                          </span>
                          <div className="min-w-0 space-y-0.5">
                            <div className="text-sm font-semibold text-foreground break-words">
                              {word.word}
                            </div>
                            {(word.phoneticUk || word.phoneticUs || word.phonetic) && (
                              <div className="text-xs text-muted-soft font-mono">
                                {pickPhonetic(word)}
                              </div>
                            )}
                            {word.translation && (
                              <div className="text-xs text-muted-foreground leading-snug break-words">
                                {word.translation}
                              </div>
                            )}
                          </div>
                        </div>
                        {word.audioUrl && (
                          <CloudButton
                            type="button"
                            variant="ghost"
                            size="iconRound"
                            className="shrink-0"
                            onClick={() => handlePlayAudio(word)}
                          >
                            <Volume2
                              size={18}
                              className={
                                playingId === word.id
                                  ? "text-[#4ECDC4] animate-pulse"
                                  : "text-[#4ECDC4]"
                              }
                            />
                          </CloudButton>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
