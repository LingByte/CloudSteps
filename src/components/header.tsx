import React from "react";
import { Bell, Menu, X } from "lucide-react";
import { useNavigate } from "react-router";

type HeaderProps = {
  mobileMenuOpen: boolean;
  onToggleMobileMenu: () => void;
};

export function Header({ mobileMenuOpen, onToggleMobileMenu }: HeaderProps) {
  const navigate = useNavigate();
  const NOTIFICATION_PATH = "/notifications";

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-white border-b border-[#E2E8F0]">
      <div className="flex items-center justify-between h-16 px-4 lg:px-6">
        <div className="flex items-center gap-4">
          <button
            className="lg:hidden text-[#2D3748]"
            onClick={onToggleMobileMenu}
          >
            {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
          <div className="flex items-center gap-3">
            <img
              src="/logo.png"
              alt="CloudSteps"
              className="w-8 h-8 rounded-lg object-contain"
              loading="eager"
            />
            <h1 className="text-[20px] md:text-[24px] font-bold text-[#4ECDC4]">
              云阶背词
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-2 md:gap-4">
          <button
            className="text-[#718096] hover:text-[#4ECDC4] transition-colors"
            onClick={() => navigate(NOTIFICATION_PATH)}
            aria-label="通知"
          >
            <Bell size={20} />
          </button>
        </div>
      </div>
    </header>
  );
}
