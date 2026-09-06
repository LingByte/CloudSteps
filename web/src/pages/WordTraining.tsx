import { Clock, Lightbulb, BookOpen, UserPlus, Users } from "lucide-react";
import { useNavigate } from "react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { CloudButton } from "../components/cloudsteps";
import { CloudSelect, CloudSpin } from "../components/cloudsteps/arco";
import { FlowPageShell } from "../components/PageTransition";
import { MemoryLighthouse, type MemoryLighthouseData } from "../components/MemoryLighthouse";
import { TopBar } from "../components/TopBar";
import { AudioMuteToggleButton } from "../components/AudioMuteToggleButton";
import { useAuthStore } from "../stores/authStore";
import {
  getTeacherTeachingPool,
  listAllTeacherCoachingQuotas,
  listStudentWordBooksAsTeacher,
  type StudentWordBookItem,
} from "../api/coaching";
import { formatTeachingMinutes } from "../utils/formatMinutes";
import { fetchLighthouse, getCachedLighthouse } from "../utils/lighthouseCache";
import {
  getCachedWordBooks,
  loadWordBooksStaleWhileRevalidate,
  type CachedWordBook,
} from "../utils/wordBooksCache";
import { useTranslation } from "react-i18next";
import {
  clearTrainingStudent,
  getTrainingStudent,
  setTrainingStudent,
  studentLabelFromQuota,
} from "../utils/trainingStudent";
import { sameSnowflakeId, normalizeSnowflakeId } from "../utils/json-snowflake";
import { ensurePracticeBillingActive } from "../utils/practiceBilling";

type LighthouseDay = { id: string; count: number; label: string };

// `/api/study/lighthouse` 返回的 `days` 按复习阶段提供词条数，数组顺序对应 02→08。

const pad2 = (n: number) => String(n).padStart(2, "0");
const fmtYMD = (d: Date) =>
  `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

function resolvePick(wbs: CachedWordBook[]): CachedWordBook | undefined {
  const cachedName = sessionStorage.getItem("lb_wordbook_name") || "";
  const cachedId = normalizeSnowflakeId(sessionStorage.getItem("lb_wordbook_id"));
  return (
    wbs.find((x) => cachedId && sameSnowflakeId(x.id, cachedId)) ||
    wbs.find((x) => x.name === cachedName) ||
    wbs[0]
  );
}

export default function WordTraining() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const role = (user as { role?: string } | null)?.role || "user";
  const isStudent = role === "student";
  const isCoach = !isStudent;

  const initialBooks = getCachedWordBooks() || [];
  const initialPick = resolvePick(initialBooks);

  /** 教练端：先校验授课池与陪练关系，避免无效进入练习流 */
  const [coachGate, setCoachGate] = useState<
    "idle" | "loading" | "ready" | "no-students" | "pool-empty"
  >(isCoach ? "loading" : "idle");
  const [studentId, setStudentId] = useState(() => {
    const cached = getTrainingStudent();
    return cached?.id ? String(cached.id) : "";
  });

  const [wordBooks, setWordBooks] = useState<CachedWordBook[]>(initialBooks);
  const [studentWordBooks, setStudentWordBooks] = useState<StudentWordBookItem[]>([]);
  const [studentBooksLoading, setStudentBooksLoading] = useState(false);
  const [continueLoading, setContinueLoading] = useState(false);
  const userPickedByStudent = useRef<Record<string, string>>({});
  const [selectedWordBookId, setSelectedWordBookId] = useState<string>(() =>
    normalizeSnowflakeId(initialPick?.id)
  );
  const [memoryData, setMemoryData] = useState<LighthouseDay[]>(() => {
    const id = normalizeSnowflakeId(initialPick?.id);
    const sid = isCoach ? normalizeSnowflakeId(getTrainingStudent()?.id) : "";
    return id ? getCachedLighthouse(id, sid || undefined)?.days || [] : [];
  });
  const [pendingCount, setPendingCount] = useState<number>(() => {
    const id = normalizeSnowflakeId(initialPick?.id);
    const sid = isCoach ? normalizeSnowflakeId(getTrainingStudent()?.id) : "";
    return id ? Number(getCachedLighthouse(id, sid || undefined)?.pendingCount || 0) : 0;
  });
  const [masteredCount, setMasteredCount] = useState<number>(() => {
    const id = normalizeSnowflakeId(initialPick?.id);
    const sid = isCoach ? normalizeSnowflakeId(getTrainingStudent()?.id) : "";
    return id ? Number(getCachedLighthouse(id, sid || undefined)?.masteredCount || 0) : 0;
  });
  const [todayNewLearned, setTodayNewLearned] = useState<number>(() => {
    const id = normalizeSnowflakeId(initialPick?.id);
    const sid = isCoach ? normalizeSnowflakeId(getTrainingStudent()?.id) : "";
    return id ? Number(getCachedLighthouse(id, sid || undefined)?.todayNewLearned || 0) : 0;
  });

  const todayLabel = useMemo(() => fmtYMD(new Date()), []);

  const handleBack = () => {
    navigate("/");
  };

  const applyLighthouse = (data: {
    days?: LighthouseDay[];
    pendingCount?: number;
    masteredCount?: number;
    todayNewLearned?: number;
  }) => {
    setMemoryData(Array.isArray(data.days) ? data.days : []);
    setPendingCount(Number(data.pendingCount || 0));
    setMasteredCount(Number(data.masteredCount || 0));
    setTodayNewLearned(Number(data.todayNewLearned ?? 0));
  };

  const pickWordBook = (wb: { id: string | number; name: string }, opts?: { fromUser?: boolean }) => {
    const id = normalizeSnowflakeId(wb.id);
    if (!id) return;
    const sid = isCoach ? studentId : undefined;
    const cached = getCachedLighthouse(id, sid);
    if (cached) applyLighthouse(cached);
    setSelectedWordBookId(id);
    sessionStorage.setItem("lb_wordbook_id", id);
    sessionStorage.setItem("lb_wordbook_name", wb.name);
    if (opts?.fromUser && studentId) {
      userPickedByStudent.current[studentId] = id;
    }
  };

  useEffect(() => {
    if (!isCoach) {
      setCoachGate("idle");
      return;
    }
    let mounted = true;
    setCoachGate("loading");
    (async () => {
      try {
        const [rows, poolRes] = await Promise.all([
          listAllTeacherCoachingQuotas({ includeSelf: true }),
          getTeacherTeachingPool(),
        ]);
        if (!mounted) return;

        const poolMinutes =
          poolRes.code === 200 && poolRes.data
            ? Number(poolRes.data.remainingMinutes ?? 0)
            : 0;
        if (poolMinutes <= 0) {
          setCoachGate("pool-empty");
          return;
        }

        if (!rows.length) {
          clearTrainingStudent();
          setStudentId("");
          setStudentWordBooks([]);
          setCoachGate("no-students");
          return;
        }
        const saved = getTrainingStudent();
        const selected =
          (saved?.id && rows.find((row) => sameSnowflakeId(row.studentId, saved.id))) || rows[0];
        setTrainingStudent(String(selected.studentId), studentLabelFromQuota(selected));
        setStudentId(String(selected.studentId));
        setCoachGate("ready");
      } catch {
        if (!mounted) return;
        // 额度接口失败时仍允许看词库，但不带无效学员上下文
        clearTrainingStudent();
        setStudentId("");
        setCoachGate("ready");
      }
    })();
    return () => {
      mounted = false;
    };
  }, [isCoach]);

  useEffect(() => {
    if (isCoach) return;
    let mounted = true;
    (async () => {
      try {
        const all = await loadWordBooksStaleWhileRevalidate();
        if (!mounted) return;
        setWordBooks(all);

        const pick = resolvePick(all);
        if (pick) {
          const pickId = normalizeSnowflakeId(pick.id);
          setSelectedWordBookId((prev) => prev || pickId);
          sessionStorage.setItem("lb_wordbook_id", pickId);
          sessionStorage.setItem("lb_wordbook_name", pick.name);
          const cached = getCachedLighthouse(pickId);
          if (cached) applyLighthouse(cached);
        }
      } catch {
        // ignore
      }
    })();
    return () => {
      mounted = false;
    };
  }, [isCoach]);

  // 教练选学员时：仅拉取该学员已分配词库
  useEffect(() => {
    if (!isCoach || coachGate !== "ready" || !studentId) {
      setStudentWordBooks([]);
      setStudentBooksLoading(false);
      return;
    }
    let mounted = true;
    setStudentBooksLoading(true);
    (async () => {
      try {
        const res = await listStudentWordBooksAsTeacher(studentId);
        if (!mounted) return;
        const list = res.code === 200 && Array.isArray(res.data?.list) ? res.data.list : [];
        setStudentWordBooks(list);

        if (list.length === 0) {
          setSelectedWordBookId("");
          sessionStorage.removeItem("lb_wordbook_id");
          sessionStorage.removeItem("lb_wordbook_name");
          setMemoryData([]);
          setPendingCount(0);
          setMasteredCount(0);
          setTodayNewLearned(0);
          return;
        }

        const manualId = userPickedByStudent.current[studentId];
        if (manualId) {
          const fromAssigned = list.find((b) => sameSnowflakeId(b.id, manualId));
          if (fromAssigned) {
            pickWordBook({ id: fromAssigned.id, name: fromAssigned.name });
            return;
          }
        }

        const currentValid = list.find((b) => sameSnowflakeId(b.id, selectedWordBookId));
        if (currentValid) {
          pickWordBook({ id: currentValid.id, name: currentValid.name });
        } else {
          pickWordBook({ id: list[0].id, name: list[0].name });
        }
      } catch {
        if (mounted) {
          setStudentWordBooks([]);
          setSelectedWordBookId("");
        }
      } finally {
        if (mounted) setStudentBooksLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only react to student / gate change
  }, [isCoach, coachGate, studentId]);

  useEffect(() => {
    let mounted = true;
    if (isCoach && coachGate !== "ready") return;
    if (isCoach && !studentId) return;
    if (!selectedWordBookId) return;

    const sid = isCoach ? studentId : undefined;
    const cached = getCachedLighthouse(selectedWordBookId, sid);
    if (cached) {
      applyLighthouse(cached);
    } else {
      setMemoryData([]);
      setPendingCount(0);
      setMasteredCount(0);
      setTodayNewLearned(0);
    }

    (async () => {
      try {
        const data = await fetchLighthouse(selectedWordBookId, { force: true, studentId: sid });
        if (!mounted) return;
        applyLighthouse(data);
      } catch {
        if (!mounted) return;
        if (!cached) {
          setMemoryData([]);
          setPendingCount(0);
          setMasteredCount(0);
          setTodayNewLearned(0);
        }
      }
    })();
    return () => {
      mounted = false;
    };
  }, [selectedWordBookId, isCoach, coachGate, studentId]);

  const wordBookOptions = useMemo(() => {
    if (isCoach) {
      return studentWordBooks.map((b) => ({
        label: b.name,
        value: normalizeSnowflakeId(b.id),
      }));
    }
    return wordBooks.map((w) => ({
      label: w.name,
      value: normalizeSnowflakeId(w.id),
    }));
  }, [isCoach, studentWordBooks, wordBooks]);

  const findWordBookName = (id: string) => {
    if (isCoach) {
      return studentWordBooks.find((b) => sameSnowflakeId(b.id, id))?.name || "";
    }
    return wordBooks.find((x) => sameSnowflakeId(x.id, id))?.name || "";
  };

  const trainingStudentName = getTrainingStudent()?.name || "";
  const lighthouseStudentQuery =
    isCoach && studentId ? `&studentId=${encodeURIComponent(studentId)}` : "";

  const lighthouseBoxes = memoryData.map(({ count }) => ({ count }));

  if (isCoach && coachGate === "loading") {
    return (
      <FlowPageShell className="min-h-dvh bg-gray-50 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <TopBar title={t("word_training.title")} onBack={handleBack} rightSlot={<AudioMuteToggleButton />} />
        <div className="px-4 mt-6 flex justify-center">
          <CloudSpin tip={t("word_training.loading_students")} />
        </div>
      </FlowPageShell>
    );
  }

  if (isCoach && coachGate === "pool-empty") {
    return (
      <FlowPageShell className="min-h-dvh bg-gray-50 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <TopBar title={t("word_training.title")} onBack={handleBack} rightSlot={<AudioMuteToggleButton />} />
        <div className="px-4 mt-6">
          <div className="bg-white rounded-xl p-6 shadow-sm text-center space-y-4">
            <div className="mx-auto w-12 h-12 rounded-xl bg-amber-50 flex items-center justify-center">
              <Clock className="text-amber-600" size={22} />
            </div>
            <div className="space-y-1.5">
              <h2 className="text-base font-semibold text-[#2D3748]">{t("word_training.pool_empty_title")}</h2>
              <p className="text-sm text-[#718096] leading-relaxed">
                {t("word_training.pool_empty_desc", { minutes: formatTeachingMinutes(0) })}
              </p>
            </div>
            <CloudButton variant="brand" size="pillLg" className="w-full" onClick={handleBack}>
              {t("word_training.back_home")}
            </CloudButton>
          </div>
        </div>
      </FlowPageShell>
    );
  }

  if (isCoach && coachGate === "no-students") {
    return (
      <FlowPageShell className="min-h-dvh bg-gray-50 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <TopBar title={t("word_training.title")} onBack={handleBack} rightSlot={<AudioMuteToggleButton />} />
        <div className="px-4 mt-6">
          <div className="bg-white rounded-xl p-6 shadow-sm text-center space-y-4">
            <div className="mx-auto w-12 h-12 rounded-xl bg-tint-sky flex items-center justify-center">
              <Users className="text-secondary-brand" size={22} />
            </div>
            <div className="space-y-1.5">
              <h2 className="text-base font-semibold text-[#2D3748]">{t("word_training.no_students_title")}</h2>
              <p className="text-sm text-[#718096] leading-relaxed">
                {t("word_training.no_students_desc")}
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
              <CloudButton
                variant="brand"
                size="pillLg"
                className="flex-1"
                onClick={() => navigate("/my-students/new")}
              >
                <UserPlus size={16} className="mr-1.5" />
                {t("word_training.create_student")}
              </CloudButton>
              <CloudButton
                variant="brandOutline"
                size="pillLg"
                className="flex-1"
                onClick={() => navigate("/my-students?link=1")}
              >
                {t("word_training.manage_students")}
              </CloudButton>
            </div>
          </div>
        </div>
      </FlowPageShell>
    );
  }

  if (isCoach && coachGate === "ready" && studentId && !studentBooksLoading && studentWordBooks.length === 0) {
    return (
      <FlowPageShell className="min-h-dvh bg-gray-50 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <TopBar title={t("word_training.title")} onBack={handleBack} rightSlot={<AudioMuteToggleButton />} />
        <div className="px-4 mt-6">
          <div className="bg-white rounded-xl p-6 shadow-sm text-center space-y-4">
            <div className="mx-auto w-12 h-12 rounded-xl bg-tint-sky flex items-center justify-center">
              <BookOpen className="text-secondary-brand" size={22} />
            </div>
            <div className="space-y-1.5">
              <h2 className="text-base font-semibold text-[#2D3748]">
                {t("word_training.no_student_wordbooks_title")}
              </h2>
              <p className="text-sm text-[#718096] leading-relaxed">
                {t("word_training.no_student_wordbooks_desc", {
                  name: trainingStudentName || t("word_training.this_student"),
                })}
              </p>
            </div>
            <CloudButton
              variant="brand"
              size="pillLg"
              className="w-full"
              onClick={() => navigate(`/my-students/${studentId}?tab=wordbooks`)}
            >
              {t("word_training.assign_wordbooks")}
            </CloudButton>
          </div>
        </div>
      </FlowPageShell>
    );
  }

  if (isCoach && coachGate === "ready" && studentBooksLoading) {
    return (
      <FlowPageShell className="min-h-dvh bg-gray-50 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <TopBar title={t("word_training.title")} onBack={handleBack} rightSlot={<AudioMuteToggleButton />} />
        <div className="px-4 mt-6 flex justify-center">
          <CloudSpin tip={t("word_training.loading_wordbooks")} />
        </div>
      </FlowPageShell>
    );
  }

  return (
    <FlowPageShell className="h-dvh max-h-dvh bg-gray-50 flex flex-col overflow-hidden">
      <TopBar title={t("word_training.title")} onBack={handleBack} rightSlot={<AudioMuteToggleButton />} />

      <div className="flex-1 min-h-0 flex flex-col px-3 sm:px-4 mt-6 pb-[max(0.75rem,env(safe-area-inset-bottom))] gap-2 overflow-hidden">
        <CloudSelect
          value={selectedWordBookId || undefined}
          onChange={(v) => {
            const id = normalizeSnowflakeId(v);
            const name = findWordBookName(id);
            if (id && name) pickWordBook({ id, name }, { fromUser: true });
          }}
          options={wordBookOptions}
          placeholder={
            studentBooksLoading && isCoach
              ? t("word_training.loading_wordbooks")
              : wordBookOptions.length
                ? t("word_training.select_wordbook")
                : t("word_training.loading_wordbooks")
          }
          disabled={!wordBookOptions.length}
          showSearch
          allowClear={false}
          sheetTitle={t("word_training.select_wordbook")}
        />

        <div className="bg-white rounded-xl px-3 py-2 shadow-sm space-y-1 shrink-0">
          <div className="flex items-center justify-between text-sm">
            <span className="text-[#718096]">{t("word_training.training_date")}</span>
            <span className="text-[#2D3748] font-medium tabular-nums">{todayLabel}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-[#718096]">{t("word_training.today_new")}</span>
            <span className="text-[#2D3748] font-medium">{todayNewLearned} {t("practice.words_unit")}</span>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 shrink-0">
          <div
            onClick={() => navigate(`/lighthouse-words?step=today${lighthouseStudentQuery}`)}
            className="bg-white rounded-xl p-2.5 text-center shadow-sm cursor-pointer hover:bg-gray-50 active:scale-95 transition-all"
          >
            <div className="text-lg font-bold text-[#4ECDC4] mb-0.5">{todayNewLearned}</div>
            <div className="text-[11px] text-[#718096]">{t("word_training.today_new")}</div>
          </div>
          <div
            onClick={() => navigate(`/lighthouse-words?step=01${lighthouseStudentQuery}`)}
            className="bg-white rounded-xl p-2.5 text-center shadow-sm cursor-pointer hover:bg-gray-50 active:scale-95 transition-all"
          >
            <div className="text-lg font-bold text-[#FF9800] mb-0.5">{memoryData[0]?.count ?? 0}</div>
            <div className="text-[11px] text-[#718096]">{t("word_training.today_review_target")}</div>
          </div>
          <div
            onClick={() => navigate(`/lighthouse-words?step=mastered${lighthouseStudentQuery}`)}
            className="bg-white rounded-xl p-2.5 text-center shadow-sm cursor-pointer hover:bg-gray-50 active:scale-95 transition-all"
          >
            <div className="text-lg font-bold text-[#66BB6A] mb-0.5">{masteredCount}</div>
            <div className="text-[11px] text-[#718096]">{t("word_training.total_mastered")}</div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-2.5 shadow-sm flex-1 min-h-0 flex flex-col overflow-hidden">
          <div className="flex items-center justify-center gap-1.5 mb-1 shrink-0">
            <Lightbulb className="text-[#FFD700]" size={18} />
            <h3 className="text-sm font-semibold text-[#2D3748]">{t("word_training.memory_lighthouse")}</h3>
          </div>
          <div className="flex-1 min-h-0 flex items-center justify-center overflow-hidden [&_.aspect-square]:max-w-[min(100%,min(38vh,320px))] [&_.aspect-square]:max-h-[38vh]">
            <MemoryLighthouse
              data={{
                boxes: lighthouseBoxes,
                mastered: masteredCount,
                unlearned: pendingCount,
                total:
                  pendingCount +
                  lighthouseBoxes.reduce((sum, box) => sum + box.count, 0) +
                  masteredCount,
              } as MemoryLighthouseData}
              onBlockClick={(type, _wordNum, tips) => {
                const stepMap: Record<string, string> = {
                  BOX_0: "01", BOX_1: "02", BOX_2: "03", BOX_3: "04",
                  BOX_4: "05", BOX_5: "06", BOX_6: "07",
                  BOX_7: "mastered", UNLEARNED: "pending",
                };
                const step = stepMap[type] || tips;
                navigate(`/lighthouse-words?step=${step}${lighthouseStudentQuery}`);
              }}
            />
          </div>
        </div>

        <div className="flex gap-2.5 shrink-0">
          <CloudButton
            variant="brandOutline"
            size="pillLg"
            className="flex-1"
            disabled={!selectedWordBookId}
            onClick={() => {
              if (!selectedWordBookId) return;
              sessionStorage.setItem("lb_mode", "review");
              sessionStorage.setItem("lb_review_wordbook_id", selectedWordBookId);
              sessionStorage.setItem("lb_review_return", "/word-training");
              if (isCoach && studentId) {
                sessionStorage.setItem("lb_review_student_id", studentId);
              } else {
                sessionStorage.removeItem("lb_review_student_id");
              }
              const studentQ =
                isCoach && studentId
                  ? `&studentId=${encodeURIComponent(studentId)}`
                  : "";
              navigate(
                `/review-word-list?wordBookId=${encodeURIComponent(selectedWordBookId)}&lighthouse=1${studentQ}`
              );
            }}
          >
            {t("word_training.start_review")}
          </CloudButton>
          <CloudButton
            variant="brand"
            size="pillLg"
            className="flex-1"
            disabled={!selectedWordBookId || continueLoading}
            loading={continueLoading}
            loadingText={t("practice.starting")}
            onClick={() => {
              void (async () => {
                if (!selectedWordBookId || continueLoading) return;
                setContinueLoading(true);
                try {
                  if (isCoach) {
                    const link = await ensurePracticeBillingActive();
                    if (!link) return;
                  }
                  navigate("/pre-training-check");
                } finally {
                  setContinueLoading(false);
                }
              })();
            }}
          >
            {t("word_training.continue_practice")}
          </CloudButton>
        </div>
      </div>
    </FlowPageShell>
  );
}
