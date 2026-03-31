import React from "react";

type ErrorBoundaryProps = {
  children: React.ReactNode;
};

type ErrorBoundaryState = {
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
  copied: boolean;
};

export class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = {
    error: null,
    errorInfo: null,
    copied: false,
  };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    this.setState({ error, errorInfo });
  }

  private getErrorText() {
    const { error, errorInfo } = this.state;
    const parts = [
      error ? `${error.name}: ${error.message}` : "",
      errorInfo?.componentStack ? `\n${errorInfo.componentStack}` : "",
    ].filter(Boolean);
    return parts.join("\n").trim();
  }

  private copyError = async () => {
    const text = this.getErrorText();
    if (!text) return;

    try {
      await navigator.clipboard.writeText(text);
      this.setState({ copied: true });
      window.setTimeout(() => this.setState({ copied: false }), 1200);
    } catch {
      // ignore
    }
  };

  render() {
    const { children } = this.props;
    const { error, copied } = this.state;

    if (!error) return children;

    const errorText = this.getErrorText();

    return (
      <div className="min-h-screen bg-[#F7F9FC] flex items-center justify-center p-6">
        <div className="w-full max-w-xl bg-white border border-[#E2E8F0] rounded-2xl p-6 shadow-sm">
          <div className="text-[#2D3748] text-xl font-semibold mb-2">
            抱歉，页面出现了一点问题
          </div>
          <div className="text-[#718096] text-sm mb-6">
            你可以复制错误信息并发给开发人员协助排查。
          </div>

          <div className="flex gap-3 mb-4">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-4 py-2 rounded-lg bg-[#4ECDC4] text-white text-sm font-medium hover:bg-[#45b8b0] transition-colors"
            >
              刷新页面
            </button>
            <button
              type="button"
              onClick={this.copyError}
              className="px-4 py-2 rounded-lg border border-[#E2E8F0] text-[#2D3748] text-sm font-medium hover:bg-[#F7F9FC] transition-colors"
            >
              {copied ? "已复制" : "复制错误信息"}
            </button>
          </div>

          <pre className="text-xs leading-relaxed bg-[#0B1220] text-[#E2E8F0] rounded-xl p-4 overflow-auto max-h-[260px]">
            {errorText || "(无错误详情)"}
          </pre>
        </div>
      </div>
    );
  }
}
