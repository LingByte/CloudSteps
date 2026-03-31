import React from "react";
import { isRouteErrorResponse, useRouteError } from "react-router";

export function RouteErrorBoundary() {
  const error = useRouteError();

  const title = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : "抱歉，页面出现了一点问题";

  const description = isRouteErrorResponse(error)
    ? error.data?.message ?? "请求的页面不存在或暂时不可用"
    : error instanceof Error
      ? error.message
      : "发生了未知错误";

  const rawText = (() => {
    if (isRouteErrorResponse(error)) {
      return JSON.stringify(
        {
          status: error.status,
          statusText: error.statusText,
          data: error.data,
        },
        null,
        2,
      );
    }

    if (error instanceof Error) {
      return `${error.name}: ${error.message}\n${error.stack ?? ""}`.trim();
    }

    return String(error);
  })();

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(rawText);
    } catch {
      // ignore
    }
  };

  return (
    <div className="min-h-screen bg-[#F7F9FC] flex items-center justify-center p-6">
      <div className="w-full max-w-xl bg-white border border-[#E2E8F0] rounded-2xl p-6 shadow-sm">
        <div className="text-[#2D3748] text-xl font-semibold mb-2">{title}</div>
        <div className="text-[#718096] text-sm mb-6">{description}</div>

        <div className="flex gap-3 mb-4">
          <button
            type="button"
            onClick={() => window.history.back()}
            className="px-4 py-2 rounded-lg border border-[#E2E8F0] text-[#2D3748] text-sm font-medium hover:bg-[#F7F9FC] transition-colors"
          >
            返回上一页
          </button>
          <button
            type="button"
            onClick={() => window.location.assign("/")}
            className="px-4 py-2 rounded-lg bg-[#4ECDC4] text-white text-sm font-medium hover:bg-[#45b8b0] transition-colors"
          >
            回到首页
          </button>
          <button
            type="button"
            onClick={copy}
            className="px-4 py-2 rounded-lg border border-[#E2E8F0] text-[#2D3748] text-sm font-medium hover:bg-[#F7F9FC] transition-colors"
          >
            复制错误信息
          </button>
        </div>

        <pre className="text-xs leading-relaxed bg-[#0B1220] text-[#E2E8F0] rounded-xl p-4 overflow-auto max-h-[260px]">
          {rawText}
        </pre>
      </div>
    </div>
  );
}
