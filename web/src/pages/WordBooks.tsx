import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import {
  HomeFeatureCard,
  HomeLetterWatermark,
  HomeSectionHeader,
} from "../components/HomeFeatureCard";
import { CoachOnboarding } from "../components/CoachOnboarding";
import { MobileSelectSheet } from "../components/cloudsteps/MobileWheelPicker";
import { useAuthStore } from "../stores/authStore";
import { listAllTeacherCoachingQuotas, type TeacherCoachingQuotaRow } from "../api/coaching";
import {
  clearTrainingStudent,
  getTrainingStudent,
  setTrainingStudent,
  studentLabelFromQuota,
} from "../utils/trainingStudent";
import { shouldShowCoachOnboarding, setCoachOnboardingUiActive } from "../utils/coachOnboarding";
import { sameSnowflakeId } from "../utils/json-snowflake";
import { showToast } from "../utils/toast";

import { kickoffVocabTestPrefetch } from "../utils/vocabTestCache";
import { kickoffWordBooksPrefetch } from "../utils/wordBooksCache";

export default function WordBooks() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const hasHydrated = useAuthStore((s) => s.hasHydrated);
  const role = user?.role || "user";
  const isCoach = role === "user" || role === "admin" || role === "teacher";
  const userId = user?.id ? Number(user.id) : 0;
  const [students, setStudents] = useState<TeacherCoachingQuotaRow[]>([]);
  const [studentId, setStudentId] = useState(() => String(getTrainingStudent()?.id || ""));
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    if (!hasHydrated || !userId) return;
    const show = shouldShowCoachOnboarding(role, userId);
    setShowOnboarding(show);
    setCoachOnboardingUiActive(show);
  }, [hasHydrated, userId, role]);

  useEffect(() => {
    if (!isCoach) return;
    let mounted = true;
    setLoadingStudents(true);
    listAllTeacherCoachingQuotas({ includeSelf: true })
      .then((rows) => {
        if (!mounted) return;
        setStudents(rows);
        if (!rows.length) {
          clearTrainingStudent();
          setStudentId("");
          return;
        }
        const saved = getTrainingStudent();
        const selected = (saved?.id && rows.find((row) => sameSnowflakeId(row.studentId, saved.id))) || rows[0];
        if (selected) {
          setStudentId(String(selected.studentId));
          setTrainingStudent(String(selected.studentId), studentLabelFromQuota(selected));
        }
      })
      .catch(() => {
        if (mounted) setStudents([]);
      })
      .finally(() => {
        if (mounted) setLoadingStudents(false);
      });
    return () => {
      mounted = false;
    };
  }, [isCoach]);

  const studentOptions = useMemo(
    () => students.map((row) => ({ label: studentLabelFromQuota(row), value: String(row.studentId) })),
    [students],
  );

  const goVocabTest = () => {
    if (isCoach && !loadingStudents && students.length === 0) {
      showToast.info(t("home.add_student_first_vocab"));
      navigate("/my-students/new");
      return;
    }
    if (isCoach && !studentId) {
      showToast.info(t("home.select_student_first_vocab"));
      return;
    }
    kickoffVocabTestPrefetch();
    navigate("/vocabulary-test");
  };

  const goWordTraining = () => {
    if (isCoach && !loadingStudents && students.length === 0) {
      showToast.info(t("home.add_student_first_training"));
      navigate("/my-students/new");
      return;
    }
    kickoffWordBooksPrefetch();
    navigate("/word-training");
  };

  let cardIndex = 0;
  const nextIndex = () => {
    cardIndex += 1;
    return cardIndex;
  };

  return (
    <div className="relative min-w-0 w-full space-y-5 pb-2">
      <HomeLetterWatermark />

      <section className="relative">
        <HomeSectionHeader title={t("home.common")} subtitle={t("home.common_en")}>
          {isCoach ? (
            <div
              className="flex shrink-0 items-center gap-2 rounded-xl border border-border/60 bg-card/90 px-2.5 py-1.5 shadow-[var(--shadow-rest)] backdrop-blur-sm"
              data-coach="picker"
            >
              <span className="text-[11px] font-medium text-muted-foreground">{t("home.student")}</span>
              <MobileSelectSheet
                title={t("home.select_student")}
                className="w-36 shrink-0"
                style={{ minWidth: 144 }}
                size="small"
                placeholder={
                  loadingStudents
                    ? t("home.loading")
                    : studentOptions.length
                      ? t("home.select_student")
                      : t("home.no_students")
                }
                options={studentOptions}
                value={studentId || undefined}
                showSearch={studentOptions.length > 4}
                disabled={loadingStudents || studentOptions.length === 0}
                onChange={(value) => {
                  const row = students.find((item) => sameSnowflakeId(item.studentId, value));
                  if (!row) return;
                  setStudentId(String(row.studentId));
                  setTrainingStudent(String(row.studentId), studentLabelFromQuota(row));
                }}
              />
            </div>
          ) : null}
        </HomeSectionHeader>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <HomeFeatureCard
            index={nextIndex()}
            title={t("home.vocab_test")}
            description={t("home.vocab_test_detail")}
            meta={t("home.enter_test")}
            tags={[t("home.tag_level"), t("home.tag_vocab_size"), t("home.tag_report")]}
            onClick={goVocabTest}
          />
          <HomeFeatureCard
            index={nextIndex()}
            title={t("home.word_training")}
            description={t("home.word_training_detail")}
            meta={t("home.select_wordbook")}
            tags={[t("home.tag_memorize"), t("home.tag_dictation"), t("home.tag_review")]}
            onClick={goWordTraining}
            data-coach="training"
          />
        </div>
      </section>

      <section className="relative">
        <HomeSectionHeader title={t("home.training_materials")} subtitle={t("home.training_materials_en")} />
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <HomeFeatureCard
            index={nextIndex()}
            title={t("home.grammar")}
            description={t("home.grammar_detail")}
            meta={t("home.grammar_desc")}
            tags={[t("home.tag_morphology"), t("home.tag_syntax"), t("home.tag_drill")]}
            onClick={() => navigate("/grammar-analysis")}
          />
          <HomeFeatureCard
            index={nextIndex()}
            title={t("home.reading")}
            description={t("home.reading_detail")}
            meta={t("home.reading_desc")}
            tags={[t("home.tag_passage"), t("home.tag_questions"), t("home.tag_vocab")]}
            onClick={() => navigate("/reading-comprehension")}
          />
          <HomeFeatureCard
            index={nextIndex()}
            title={t("home.cloze")}
            description={t("home.cloze_detail")}
            meta={t("home.cloze_desc")}
            tags={[t("home.tag_context"), t("home.tag_options"), t("home.tag_drill")]}
            onClick={() => navigate("/cloze-practice")}
          />
          <HomeFeatureCard
            index={nextIndex()}
            title={t("home.scenario")}
            description={t("home.scenario_detail")}
            meta={t("home.scenario_desc")}
            tags={[t("home.tag_dialogue"), t("home.tag_ai"), t("home.tag_speaking")]}
            onClick={() => navigate("/scenario-dialogues")}
          />
        </div>
      </section>

      <section className="relative">
        <HomeSectionHeader title={t("home.data_management")} subtitle={t("home.data_management_en")} />
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <HomeFeatureCard
            index={nextIndex()}
            title={t("home.my_shelf")}
            description={t("home.shelf_detail")}
            meta={t("home.browse_wordbook")}
            tags={[t("home.tag_wordbook"), t("home.tag_collection")]}
            onClick={() => navigate("/word-books")}
          />
          {isCoach ? (
            <HomeFeatureCard
              index={nextIndex()}
              title={t("home.student_management")}
              description={t("home.students_detail")}
              meta={t("home.student_and_duration")}
              tags={[t("home.tag_quota"), t("home.tag_schedule")]}
              onClick={() => navigate("/my-students")}
              data-coach="students"
            />
          ) : null}
          <HomeFeatureCard
            index={nextIndex()}
            title={t("home.study_records")}
            description={t("home.records_detail")}
            meta={t("home.lessons_and_review")}
            tags={[t("home.tag_lesson"), t("home.tag_review"), t("home.tag_export")]}
            onClick={() => navigate("/training-records")}
          />
        </div>
      </section>

      {userId > 0 ? (
        <CoachOnboarding
          open={showOnboarding}
          userId={userId}
          onDone={() => {
            setShowOnboarding(false);
            setCoachOnboardingUiActive(false);
          }}
        />
      ) : null}
    </div>
  );
}
