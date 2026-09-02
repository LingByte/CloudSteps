import { Outlet } from "react-router";
import { CoachingClassReminder } from "./CoachingClassReminder";
import { ClassSessionTimer } from "./ClassSessionTimer";
import { TimerZoneGuard } from "./TimerZoneGuard";

/** Router 内全局壳层：定时器、离开拦截等需 useBlocker / useLocation 的组件放这里。 */
export function AppShell() {
  return (
    <>
      <CoachingClassReminder />
      <ClassSessionTimer />
      <TimerZoneGuard />
      <Outlet />
    </>
  );
}
