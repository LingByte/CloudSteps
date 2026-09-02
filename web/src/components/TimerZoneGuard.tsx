import { useEffect, useState } from "react";
import { useBlocker } from "react-router";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { CloudButton } from "./cloudsteps";
import { useClassTimerStore } from "../stores/classTimerStore";
import {
  isTimerZonePath,
  usePracticeFlowLockStore,
} from "../utils/practiceFlowLock";
import { showToast } from "../utils/toast";

/**
 * 离开单词训练流程区且计时器进行中：拦截并确认；确认离开则结束定时。
 */
export function TimerZoneGuard() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  const blocker = useBlocker(({ currentLocation, nextLocation }) => {
    if (!isTimerZonePath(currentLocation.pathname)) return false;
    if (isTimerZonePath(nextLocation.pathname)) return false;
    const timer = useClassTimerStore.getState();
    if (!timer.isActive()) return false;
    if (usePracticeFlowLockStore.getState().consumeLeaveAllowance()) return false;
    return true;
  });

  useEffect(() => {
    if (blocker.state !== "blocked") {
      setOpen(false);
      return;
    }
    setOpen(true);
  }, [blocker.state]);

  const stay = () => {
    setOpen(false);
    blocker.reset?.();
  };

  const leave = () => {
    useClassTimerStore.getState().stop();
    showToast.info(t("coaching.timer_stopped"));
    setOpen(false);
    blocker.proceed?.();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) stay();
      }}
    >
      <DialogContent className="max-w-sm rounded-2xl">
        <DialogHeader>
          <DialogTitle>{t("coaching.timer_leave_title")}</DialogTitle>
          <DialogDescription>{t("coaching.timer_leave_desc")}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2">
          <CloudButton type="button" variant="outline" onClick={stay}>
            {t("ui.cancel")}
          </CloudButton>
          <CloudButton type="button" variant="brand" onClick={leave}>
            {t("coaching.timer_leave_confirm")}
          </CloudButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
