import { useEffect, useState, type ReactNode } from "react";
import { AudioMuteToggleButton } from "./AudioMuteToggleButton";
import { ClassTimerBadge, ClassTimerSetupDialog } from "./ClassSessionTimer";
import { PracticeFontSettingsButton } from "./PracticeFontSettings";
import { PracticePauseMenu } from "./PracticePauseMenu";
import { WordEditHost } from "./WordEditControls";
import { useClassTimerStore } from "../stores/classTimerStore";
import { usePracticeFlowLockStore } from "../utils/practiceFlowLock";
import { usePracticeFlowGuard } from "../hooks/usePracticeFlowGuard";
import type { UserWordView } from "../api/wordbooks";

type Props = {
  annotationOpen?: boolean;
  onToggleAnnotation?: () => void;
  extraBefore?: ReactNode;
  pauseContinueLabel?: string;
  wordCount?: number;
  onWordPatched?: (view: UserWordView) => void;
};

/**
 * 练习流通用顶栏操作：音效、定时、设置。
 * 计时未开始时点时钟打开设置；计时中点击倒计时暂停，并出现返回/继续/结束。
 * 练习锁定页拦截浏览器后退，统一打开暂停菜单。
 */
export function PracticeFlowToolbar({
  extraBefore,
  pauseContinueLabel,
  wordCount = 0,
  onWordPatched,
}: Props) {
  const [timerOpen, setTimerOpen] = useState(false);
  const [pauseOpen, setPauseOpen] = useState(false);
  /** timer = 点倒计时；leave = 顶栏返回 / 浏览器后退 */
  const [pauseSource, setPauseSource] = useState<"timer" | "leave">("leave");
  const pauseTimer = useClassTimerStore((s) => s.pause);
  const lockPauseOpen = usePracticeFlowLockStore((s) => s.pauseMenuOpen);
  const setLockPauseOpen = usePracticeFlowLockStore((s) => s.setPauseMenuOpen);

  usePracticeFlowGuard();

  useEffect(() => {
    if (lockPauseOpen) {
      pauseTimer();
      setPauseSource("leave");
      setPauseOpen(true);
      setLockPauseOpen(false);
    }
  }, [lockPauseOpen, pauseTimer, setLockPauseOpen]);

  return (
    <>
      <div className="flex items-center justify-end gap-0.5">
        {extraBefore}
        <AudioMuteToggleButton />
        <ClassTimerBadge
          onClick={() => {
            const { endsAt, pausedRemainingMs } = useClassTimerStore.getState();
            if (endsAt != null || pausedRemainingMs != null) {
              pauseTimer();
              setPauseSource("timer");
              setPauseOpen(true);
              return;
            }
            setTimerOpen(true);
          }}
        />
        <PracticeFontSettingsButton />
      </div>
      <ClassTimerSetupDialog
        open={timerOpen}
        onOpenChange={setTimerOpen}
        wordCount={wordCount}
      />
      <PracticePauseMenu
        open={pauseOpen}
        onClose={() => {
          setPauseOpen(false);
          useClassTimerStore.getState().resume();
        }}
        continueLabel={pauseContinueLabel}
        showEndTimer={pauseSource === "timer"}
      />
      <WordEditHost onSaved={onWordPatched} />
    </>
  );
}
