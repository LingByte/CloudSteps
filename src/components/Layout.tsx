import { useEffect, useMemo, useRef, useState } from "react";
import { Outlet, Link, useLocation } from "react-router";
import {
  Home,
  RefreshCw,
  Users,
  Library,
  Menu,
  X,
} from "lucide-react";
import { Header } from "@/components/header";
import { NavMenu } from "@/components/NavMenu";
import { useAuthStore } from "@/stores/authStore";

const navItems = [
  { path: "/", label: "首页", icon: Home },
  { path: "/word-books", label: "备课", icon: Library },
  { path: "/anti-forgetting", label: "抗遗忘", icon: RefreshCw },
  { path: "/coach-center", label: "陪练中心", icon: Users },
];

export function Layout() {
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const userRole = useAuthStore((s) => s.user?.role);
  const userName = useAuthStore((s) => s.user?.displayName || s.user?.email || "");

  const greetingText = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
  }, []);

  const mobileMenuCloseTimerRef = useRef<number | null>(null);
  const [mobileMenuMounted, setMobileMenuMounted] = useState(false);
  const [mobileMenuRenderOpen, setMobileMenuRenderOpen] = useState(false);

  const closeMobileMenu = () => {
    setMobileMenuOpen(false);
  };

  useEffect(() => {
    if (mobileMenuCloseTimerRef.current != null) {
      window.clearTimeout(mobileMenuCloseTimerRef.current);
      mobileMenuCloseTimerRef.current = null;
    }

    if (mobileMenuOpen) {
      setMobileMenuMounted(true);
      setMobileMenuRenderOpen(false);
      const raf = window.requestAnimationFrame(() => {
        setMobileMenuRenderOpen(true);
      });
      return () => window.cancelAnimationFrame(raf);
    }

    if (!mobileMenuMounted) return;
    setMobileMenuRenderOpen(false);
    mobileMenuCloseTimerRef.current = window.setTimeout(() => {
      setMobileMenuMounted(false);
      mobileMenuCloseTimerRef.current = null;
    }, 320);
  }, [mobileMenuOpen, mobileMenuMounted]);

  useEffect(() => {
    return () => {
      if (mobileMenuCloseTimerRef.current != null) {
        window.clearTimeout(mobileMenuCloseTimerRef.current);
      }
    };
  }, []);

  const filteredNavItems = useMemo(() => {
    return navItems.filter((item) => {
      const roles = (item as { roles?: Array<"user" | "admin"> }).roles;
      if (!roles || roles.length === 0) return true;
      const role = userRole ?? "user";
      return roles.includes(role);
    });
  }, [userRole]);

  return (
    <div className="min-h-screen bg-[#F7F9FC]">
      <Header
        mobileMenuOpen={mobileMenuOpen}
        onToggleMobileMenu={() => setMobileMenuOpen(!mobileMenuOpen)}
      />

      <div className="pt-[120px] md:pt-16 lg:pt-16 flex">
        {/* 左侧边栏（桌面端） */}
        <aside className="hidden lg:block fixed left-0 top-16 bottom-0 w-60 bg-white border-r border-[#E2E8F0] overflow-y-auto">
          <div className="p-6">
            {/* 问候区 */}
            <div className="mb-8">
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-[#4ECDC4]/10 rounded-full mb-3">
                <span className="text-xs text-[#4ECDC4] font-semibold">正式陪练</span>
              </div>
              <div className="text-xs text-[#718096] mb-1">{greetingText}</div>
              <p className="text-[#2D3748] font-medium">Hi, {userName || "-"}</p>
            </div>

            {/* 导航菜单 */}
            <NavMenu items={filteredNavItems} activePath={location.pathname} />
          </div>
        </aside>

        {/* 移动端侧边栏（抽屉式） */}
        {mobileMenuMounted && (
          <div className="lg:hidden fixed inset-0 z-[60]">
            <div
              className={
                "absolute inset-0 bg-black/20 transition-opacity duration-300 ease-out " +
                (mobileMenuRenderOpen ? "opacity-100" : "opacity-0")
              }
              onClick={closeMobileMenu}
            />
            <aside
              className={
                "absolute left-0 top-0 bottom-0 w-64 bg-white border-r border-[#E2E8F0] overflow-y-auto transform-gpu transition-transform duration-300 ease-out " +
                (mobileMenuRenderOpen ? "translate-x-0" : "-translate-x-full")
              }
            >
              <div className="p-6">
                {/* 问候区 */}
                <div className="mb-8">
                  <div className="inline-flex items-center gap-2 px-3 py-1 bg-[#4ECDC4]/10 rounded-full mb-3">
                    <span className="text-xs text-[#4ECDC4] font-semibold">正式陪练</span>
                  </div>
                  <div className="text-xs text-[#718096] mb-1">{greetingText}</div>
                  <p className="text-[#2D3748] font-medium">Hi, {userName || "-"}</p>
                </div>

                {/* 导航菜单 */}
                <NavMenu
                  items={filteredNavItems}
                  activePath={location.pathname}
                  onNavigate={closeMobileMenu}
                />
              </div>
            </aside>
          </div>
        )}

        {/* 主内容区 */}
        <main className="flex-1 lg:ml-60 pb-20 lg:pb-6">
          <div className="max-w-[1200px] mx-auto px-4 py-6">
            <Outlet />
          </div>
        </main>
      </div>

      {/* 底部导航栏（移动端） */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-[#E2E8F0]">
        <div className="flex items-center justify-around px-4 py-2">
          {filteredNavItems.map((item) => {
            const Icon = item.icon;
            const isActive =
              item.path === "/"
                ? location.pathname === "/"
                : location.pathname === item.path || location.pathname.startsWith(`${item.path}/`);
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex flex-col items-center gap-1 px-3 py-2 transition-colors ${
                  isActive ? "text-[#4ECDC4]" : "text-[#718096]"
                }`}
              >
                <Icon size={22} />
                <span className="text-xs">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}