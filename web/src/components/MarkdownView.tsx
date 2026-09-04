import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useTranslation } from "react-i18next";

import { cn } from "../utils/cn";
import { resolveMediaUrl } from "../utils/mediaUrl";

type MarkdownViewProps = {
  content: string;
  className?: string;
  /** 聊天气泡内更紧凑的排版 */
  compact?: boolean;
};

export function MarkdownView({ content, className, compact }: MarkdownViewProps) {
  const { t } = useTranslation();

  if (!content.trim()) {
    return <p className="text-sm text-muted-foreground">{t("ui.markdown_empty")}</p>;
  }

  return (
    <div
      className={cn(
        "markdown-view max-w-none text-sm leading-relaxed text-[#2D3748]",
        "[&_a]:text-[#4ECDC4] [&_a]:underline",
        "[&_blockquote]:border-s-4 [&_blockquote]:border-[#E2E8F0] [&_blockquote]:ps-4 [&_blockquote]:text-[#718096]",
        "[&_code]:rounded [&_code]:bg-[#F7FAFC] [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-xs",
        "[&_h1]:mt-4 [&_h1]:text-xl [&_h1]:font-semibold",
        "[&_h2]:mt-3 [&_h2]:text-lg [&_h2]:font-semibold",
        "[&_h3]:mt-2 [&_h3]:text-base [&_h3]:font-medium",
        "[&_li]:my-0.5",
        "[&_ol]:my-2 [&_ol]:list-decimal [&_ol]:ps-5",
        compact ? "[&_p]:my-1" : "[&_p]:my-2",
        "[&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-[#F7FAFC] [&_pre]:p-3",
        "[&_pre_code]:bg-transparent [&_pre_code]:p-0",
        "[&_strong]:font-semibold",
        "[&_table]:my-2 [&_table]:w-full [&_table]:border-collapse",
        "[&_td]:border [&_td]:border-[#E2E8F0] [&_td]:px-2 [&_td]:py-1",
        "[&_th]:border [&_th]:border-[#E2E8F0] [&_th]:bg-[#F7FAFC] [&_th]:px-2 [&_th]:py-1 [&_th]:text-start",
        "[&_ul]:my-2 [&_ul]:list-disc [&_ul]:ps-5",
        "[&_img]:my-1.5 [&_img]:max-h-64 [&_img]:max-w-full [&_img]:rounded-lg [&_img]:object-contain",
        className,
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          img: ({ src, alt }) => {
            const resolved = resolveMediaUrl(src) || src || "";
            return (
              <a href={resolved} target="_blank" rel="noreferrer" className="block">
                <img src={resolved} alt={alt || ""} loading="lazy" />
              </a>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
