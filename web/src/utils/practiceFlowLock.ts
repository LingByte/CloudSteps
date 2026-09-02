import { create } from "zustand";

/**
 * 练习流锁：进行中不可随意返回上一页（类似考试）。
 * 顶栏返回 / 浏览器后退 → 打开暂停菜单；仅显式放行后可离开练习路由。
 */
type PracticeFlowLockState = {
  /** 允许离开练习路由一次（结束训练、学完进抗遗忘等） */
  leaveAllowed: boolean;
  pauseMenuOpen: boolean;
  allowLeaveOnce: () => void;
  consumeLeaveAllowance: () => boolean;
  requestPauseMenu: () => void;
  setPauseMenuOpen: (open: boolean) => void;
};

export const usePracticeFlowLockStore = create<PracticeFlowLockState>((set, get) => ({
  leaveAllowed: false,
  pauseMenuOpen: false,
  allowLeaveOnce: () => set({ leaveAllowed: true }),
  consumeLeaveAllowance: () => {
    if (!get().leaveAllowed) return false;
    set({ leaveAllowed: false });
    return true;
  },
  requestPauseMenu: () => set({ pauseMenuOpen: true }),
  setPauseMenuOpen: (open) => set({ pauseMenuOpen: open }),
}));

const LOCKED_PREFIXES = [
  "/word-training",
  "/pre-training-check",
  "/word-practice",
  "/flash-review",
  "/listen-identify",
  "/post-training-check",
  "/review-check",
];

/** 上课定时仅在这些路由展示；离开至区外且计时中 → 确认后结束定时 */
export const TIMER_ZONE_PREFIXES = LOCKED_PREFIXES;

export function isPracticeLockedPath(pathname: string): boolean {
  return LOCKED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );
}

export function isTimerZonePath(pathname: string): boolean {
  return isPracticeLockedPath(pathname);
}

export function allowPracticeLeaveOnce() {
  usePracticeFlowLockStore.getState().allowLeaveOnce();
}

export function requestPracticePauseMenu() {
  usePracticeFlowLockStore.getState().requestPauseMenu();
}
