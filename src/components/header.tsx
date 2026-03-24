import { Bell, Menu, Search, Settings, X } from "lucide-react";

type HeaderProps = {
  mobileMenuOpen: boolean;
  onToggleMobileMenu: () => void;
};

export function Header({ mobileMenuOpen, onToggleMobileMenu }: HeaderProps) {
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
          <h1 className="text-[24px] font-bold text-[#4ECDC4]">云阶背词</h1>
        </div>

        <div className="hidden md:flex items-center flex-1 max-w-md mx-8">
          <div className="relative w-full">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 text-[#A0AEC0]"
              size={20}
            />
            <input
              type="text"
              placeholder="搜索训练/词汇"
              className="w-full pl-10 pr-4 py-2 bg-[#F7F9FC] border border-[#E2E8F0] rounded-lg text-[#2D3748] placeholder:text-[#A0AEC0] focus:outline-none focus:border-[#4ECDC4]"
            />
          </div>
        </div>

        <div className="flex items-center gap-4">
          <button className="hidden md:block text-[#718096] hover:text-[#4ECDC4]">
            <Bell size={20} />
          </button>
          <button className="hidden md:block text-[#718096] hover:text-[#4ECDC4]">
            <Settings size={20} />
          </button>
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#4ECDC4] to-[#55A3FF] flex items-center justify-center text-white font-semibold">
            A
          </div>
        </div>
      </div>

      <div className="md:hidden px-4 pb-4 pt-2">
        <div className="relative">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[#A0AEC0]"
            size={18}
          />
          <input
            type="text"
            placeholder="搜索训练/词汇"
            className="w-full pl-10 pr-4 py-2 bg-[#F7F9FC] border border-[#E2E8F0] rounded-lg text-sm text-[#2D3748] placeholder:text-[#A0AEC0] focus:outline-none focus:border-[#4ECDC4]"
          />
        </div>
      </div>
    </header>
  );
}
