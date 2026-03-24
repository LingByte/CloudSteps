import { useState } from "react";
import { Outlet, Link, useLocation } from "react-router";
import {
  Home,
  BookOpen,
  RefreshCw,
  Users,
  Menu,
  X,
} from "lucide-react";
import { Header } from "@/components/header";

const navItems = [
  { path: "/", label: "首页", icon: Home },
  { path: "/training-records", label: "训练记录", icon: BookOpen },
  { path: "/anti-forgetting", label: "抗遗忘", icon: RefreshCw },
  { path: "/coach-center", label: "陪练中心", icon: Users },
];

export function Layout() {
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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
              <p className="text-[#2D3748]">Hi, April</p>
            </div>

            {/* 导航菜单 */}
            <nav className="space-y-2">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname === item.path;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                      isActive
                        ? "bg-[#4ECDC4] text-white"
                        : "text-[#718096] hover:bg-[#F7F9FC]"
                    }`}
                  >
                    <Icon size={20} />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>
          </div>
        </aside>

        {/* 移动端侧边栏（抽屉式） */}
        {mobileMenuOpen && (
          <div className="lg:hidden fixed inset-0 z-40" style={{ top: '120px' }}>
            <div className="absolute inset-0 bg-black/20" onClick={() => setMobileMenuOpen(false)} />
            <aside className="absolute left-0 top-0 bottom-0 w-64 bg-white border-r border-[#E2E8F0] overflow-y-auto">
              <div className="p-6">
                {/* 问候区 */}
                <div className="mb-8">
                  <div className="inline-flex items-center gap-2 px-3 py-1 bg-[#4ECDC4]/10 rounded-full mb-3">
                    <span className="text-xs text-[#4ECDC4] font-semibold">正式陪练</span>
                  </div>
                  <p className="text-[#2D3748]">Hi, April</p>
                </div>

                {/* 导航菜单 */}
                <nav className="space-y-2">
                  {navItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = location.pathname === item.path;
                    return (
                      <Link
                        key={item.path}
                        to={item.path}
                        onClick={() => setMobileMenuOpen(false)}
                        className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                          isActive
                            ? "bg-[#4ECDC4] text-white"
                            : "text-[#718096] hover:bg-[#F7F9FC]"
                        }`}
                      >
                        <Icon size={20} />
                        <span>{item.label}</span>
                      </Link>
                    );
                  })}
                </nav>
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
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
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