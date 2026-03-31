import { Link } from "react-router";
import type { LucideIcon } from "lucide-react";

export type NavItem = {
  path: string;
  label: string;
  icon: LucideIcon;
};

type NavMenuProps = {
  items: NavItem[];
  activePath: string;
  onNavigate?: () => void;
};

export function NavMenu({ items, activePath, onNavigate }: NavMenuProps) {
  return (
    <nav className="space-y-2">
      {items.map((item) => {
        const Icon = item.icon;
        const isActive = activePath === item.path;

        return (
          <Link
            key={item.path}
            to={item.path}
            onClick={onNavigate}
            className={
              "relative flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 ease-out " +
              (isActive
                ? "text-white"
                : "text-[#718096] hover:bg-[#F7F9FC]")
            }
          >
            <span
              className={
                "absolute inset-0 rounded-lg bg-[#4ECDC4] transition-opacity duration-200 ease-out " +
                (isActive ? "opacity-100" : "opacity-0")
              }
            />
            <span className="relative flex items-center gap-3">
              <Icon size={20} />
              <span>{item.label}</span>
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
