import { Link, useLocation } from "react-router";

export default function Forbidden() {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const next = params.get("next") || "/";

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-white border border-[#E2E8F0] rounded-2xl shadow-sm p-6">
        <div className="text-[#2D3748] text-xl font-bold">无权限访问</div>
        <div className="mt-2 text-sm text-[#718096]">你当前账号没有权限访问该页面。</div>
        <div className="mt-6 flex items-center gap-3">
          <Link
            to={next}
            className="inline-flex items-center justify-center rounded-md bg-[#4ECDC4] text-white px-4 h-10 text-sm font-medium transition-transform duration-150 ease-out active:scale-[0.98] hover:brightness-[0.98]"
          >
            返回
          </Link>
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md border border-[#E2E8F0] bg-white text-[#2D3748] px-4 h-10 text-sm font-medium transition-transform duration-150 ease-out active:scale-[0.98] hover:bg-[#F7F9FC]"
          >
            去首页
          </Link>
        </div>
      </div>
    </div>
  );
}
