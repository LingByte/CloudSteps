import { Pencil } from "lucide-react";
import { useTranslation } from "react-i18next";
import { UserWordEditor } from "./UserWordEditor";
import { useWordEditStore } from "../stores/wordEditStore";
import { formatTranslation, displayTranslationFull, pickPhoneticDisplay } from "../utils/wordFormat";
import type { UserWordView } from "../api/wordbooks";

export function WordEditTrigger({ wordId }: { wordId: string | number }) {
  const { t } = useTranslation();
  const openEditor = useWordEditStore((s) => s.openEditor);
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        openEditor(wordId);
      }}
      className="shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs text-[#718096] hover:bg-[#F1F5F9] hover:text-[#2C7A7B]"
    >
      <Pencil size={12} />
      {t("word.edit")}
    </button>
  );
}

export function WordEditHost({ onSaved }: { onSaved?: (view: UserWordView) => void }) {
  const editingId = useWordEditStore((s) => s.editingId);
  const closeEditor = useWordEditStore((s) => s.closeEditor);

  return (
    <UserWordEditor
      wordId={editingId}
      open={editingId != null}
      onOpenChange={(open) => {
        if (!open) closeEditor();
      }}
      onSaved={onSaved}
    />
  );
}

export function applyUserWordView<
  T extends {
    id: string | number;
    word: string;
    phonetic?: string;
    translation?: string;
    translationShort?: string;
  },
>(items: T[], view: UserWordView): T[] {
  return items.map((item) => {
    if (String(item.id) !== String(view.wordId)) return item;
    const e = view.effective;
    return {
      ...item,
      word: e.word || item.word,
      phonetic:
        pickPhoneticDisplay({
          phonetic: e.phonetic,
          phoneticUk: e.phoneticUk,
          phoneticUs: e.phoneticUs,
        }) || item.phonetic,
      translation: displayTranslationFull(e.translation) || item.translation,
      translationShort: (e.translationShort || "").trim() || item.translationShort,
    };
  });
}
