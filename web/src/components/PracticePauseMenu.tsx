import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { CloudButton } from "./cloudsteps";
import { getReviewReturnPath } from "../utils/reviewPractice";
import { useClassTimerStore } from "../stores/classTimerStore";
import { allowPracticeLeaveOnce } from "../utils/practiceFlowLock";
import {
  finishPracticeBilling,
  stampLessonPracticeWindow,
} from "../utils/practiceBilling";
import { showToast } from "../utils/toast";

type Props = {
  open: boolean;
  onClose: () => void;
  /** 继续训练文案，默认「继续训练」 */
  continueLabel?: string;
  /**
   * 是否展示「结束定时」。
   * 仅从顶栏计时器暂停入口打开时为 true；顶栏返回 / 浏览器后退只留「返回主页 / 继续」。
   */
  showEndTimer?: boolean;
};

/**
 * 练习流通用暂停菜单：返回主页 / 继续训练；可选结束定时。
 * 「结束定时」只停前端计时器；真正离开练习（返回主页）才结算额度。
 */
export function PracticePauseMenu({
  open,
  onClose,
  continueLabel,
  showEndTimer = false,
}: Props) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const resolvedContinueLabel = continueLabel ?? t("coaching.practice_continue");

  if (!open) return null;

  const isReview = sessionStorage.getItem("lb_mode") === "review";
  const homePath = isReview
    ? getReviewReturnPath("/word-training")
    : "/word-training";

  const leaveTo = (path: string) => {
    allowPracticeLeaveOnce();
    navigate(path, { replace: true });
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50"
      onClick={() => {
        useClassTimerStore.getState().resume();
        onClose();
      }}
    >
      <div
        className="absolute top-20 right-4 bg-white rounded-xl shadow-lg overflow-hidden min-w-[9.5rem]"
        onClick={(e) => e.stopPropagation()}
      >
        <CloudButton
          variant="ghost"
          className="w-full justify-start rounded-none px-6 py-3 h-auto"
          onClick={() => {
            void (async () => {
              stampLessonPracticeWindow();
              useClassTimerStore.getState().stop();
              onClose();
              if (isReview) {
                sessionStorage.removeItem("lb_review_return");
                if (sessionStorage.getItem("lb_mode") === "review") {
                  sessionStorage.removeItem("lb_mode");
                }
              } else {
                await finishPracticeBilling();
              }
              leaveTo(homePath);
            })();
          }}
        >
          {t("coaching.practice_back_home")}
        </CloudButton>
        <CloudButton
          variant="ghost"
          className="w-full justify-start rounded-none px-6 py-3 h-auto"
          onClick={() => {
            useClassTimerStore.getState().resume();
            onClose();
          }}
        >
          {resolvedContinueLabel}
        </CloudButton>
        {showEndTimer ? (
          <CloudButton
            variant="ghost"
            className="w-full justify-start rounded-none px-6 py-3 h-auto text-[#E53E3E]"
            onClick={() => {
              useClassTimerStore.getState().stop();
              onClose();
              showToast.info(t("coaching.timer_stopped"));
            }}
          >
            {t("coaching.practice_end")}
          </CloudButton>
        ) : null}
      </div>
    </div>
  );
}
