import { useRef, useState, type ChangeEvent } from "react";
import { useTranslation } from "react-i18next";
import { ImagePlus, Loader2, X } from "lucide-react";
import { CloudButton } from "./cloudsteps";
import { showToast } from "../utils/toast";
import { formatApiMessage } from "../utils/apiMessage";
import { uploadFeedbackImage } from "../api/feedback";
import { resolveMediaUrl } from "../utils/mediaUrl";
import { isFeedbackContentEmpty } from "../utils/feedbackContent";

const fieldClass =
  "w-full px-4 py-3 rounded-xl bg-card border border-input text-charcoal placeholder:text-muted-soft transition-colors outline-none hover:border-border focus:border-primary focus:ring-[3px] focus:ring-primary/25";

type FeedbackComposerProps = {
  text: string;
  images: string[];
  onTextChange: (text: string) => void;
  onImagesChange: (images: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
  submitting?: boolean;
  submitLabel: string;
  onSubmit: () => void;
  minHeightClass?: string;
};

export function FeedbackComposer({
  text,
  images,
  onTextChange,
  onImagesChange,
  placeholder,
  disabled,
  submitting,
  submitLabel,
  onSubmit,
  minHeightClass = "min-h-[72px]",
}: FeedbackComposerProps) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);

  const onPickImage = () => {
    if (disabled || uploading || submitting) return;
    inputRef.current?.click();
  };

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      showToast.error(t("feedback.image_type_invalid"));
      return;
    }
    setUploading(true);
    try {
      const res = await uploadFeedbackImage(file);
      const url = res.data?.url;
      if (!url) throw new Error("missing url");
      onImagesChange([...images, url]);
      showToast.success(t("feedback.image_uploaded"));
    } catch (err: unknown) {
      const apiMsg =
        err && typeof err === "object" && "msg" in err
          ? String((err as { msg: string }).msg)
          : undefined;
      showToast.error(formatApiMessage(apiMsg, "feedback.image_upload_failed"));
    } finally {
      setUploading(false);
    }
  };

  const canSubmit = !isFeedbackContentEmpty(text, images);

  return (
    <div className="space-y-2">
      {images.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {images.map((url) => {
            const src = resolveMediaUrl(url) || url;
            return (
              <div
                key={url}
                className="relative size-16 rounded-lg border border-border overflow-hidden bg-muted shrink-0 group"
              >
                <img src={src} alt="" className="size-full object-cover" />
                <button
                  type="button"
                  className="absolute top-0.5 right-0.5 size-5 rounded-full bg-black/60 text-white flex items-center justify-center opacity-90 hover:bg-black/80"
                  disabled={disabled || submitting || uploading}
                  onClick={() => onImagesChange(images.filter((u) => u !== url))}
                  aria-label={t("feedback.remove_image")}
                >
                  <X size={12} />
                </button>
              </div>
            );
          })}
        </div>
      ) : null}

      <textarea
        className={`${fieldClass} ${minHeightClass} max-h-48 resize-none py-2.5`}
        placeholder={placeholder}
        value={text}
        onChange={(e) => onTextChange(e.target.value)}
        maxLength={8000}
        rows={3}
        disabled={disabled || submitting}
      />
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1 min-w-0">
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => void onFile(e)}
          />
          <CloudButton
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 px-2 text-muted-foreground shrink-0"
            disabled={disabled || uploading || submitting}
            onClick={onPickImage}
          >
            {uploading ? <Loader2 className="size-4 animate-spin" /> : <ImagePlus size={16} />}
            <span className="ml-1 text-[12px]">{t("feedback.add_image")}</span>
          </CloudButton>
        </div>
        <CloudButton
          loading={submitting}
          disabled={disabled || uploading || !canSubmit}
          onClick={onSubmit}
        >
          {submitLabel}
        </CloudButton>
      </div>
    </div>
  );
}
