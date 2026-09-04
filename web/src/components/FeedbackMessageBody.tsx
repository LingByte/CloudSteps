import { resolveMediaUrl } from "../utils/mediaUrl";
import { parseFeedbackContent } from "../utils/feedbackContent";
import { cn } from "../utils/cn";

type FeedbackMessageBodyProps = {
  content: string;
  className?: string;
  /** 用户气泡用浅色图框，官方气泡用默认 */
  inverted?: boolean;
};

export function FeedbackMessageBody({ content, className, inverted }: FeedbackMessageBodyProps) {
  const { text, images } = parseFeedbackContent(content);

  return (
    <div className={cn("space-y-2", className)}>
      {text ? (
        <p className="text-sm whitespace-pre-wrap leading-relaxed break-words">{text}</p>
      ) : null}
      {images.length > 0 ? (
        <div className={cn("flex flex-col gap-2", text ? "mt-1" : undefined)}>
          {images.map((url) => {
            const src = resolveMediaUrl(url) || url;
            return (
              <a
                key={url}
                href={src}
                target="_blank"
                rel="noreferrer"
                className={cn(
                  "block overflow-hidden rounded-xl border max-w-[220px]",
                  inverted ? "border-primary-foreground/25 bg-primary-foreground/10" : "border-border bg-muted/40",
                )}
              >
                <img src={src} alt="" className="w-full max-h-52 object-contain bg-black/5" loading="lazy" />
              </a>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
