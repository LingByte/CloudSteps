import { ArrowLeft } from "lucide-react";

import type { ReactNode } from "react";

type Props = {
  title: string;
  onBack: () => void;
  rightSlot?: ReactNode;
};

export function TopBar({ title, onBack, rightSlot }: Props) {
  return (
    <div className="bg-white sticky top-0 z-10 shadow-sm">
      <div className="flex items-center px-4 py-4">
        <button
          onClick={onBack}
          className="relative z-10 p-2 -ml-2 hover:bg-gray-100 rounded-full transition-colors"
        >
          <ArrowLeft size={24} className="text-[#2D3748]" />
        </button>
        <h1 className="flex-1 text-center text-lg font-semibold text-[#2D3748] -ml-10 pointer-events-none">
          {title}
        </h1>
        <div className="w-10 flex items-center justify-end">{rightSlot}</div>
      </div>
    </div>
  );
}
