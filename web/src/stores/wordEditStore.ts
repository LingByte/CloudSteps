import { create } from "zustand";

type WordEditState = {
  editingId: string | number | null;
  openEditor: (wordId: string | number) => void;
  closeEditor: () => void;
};

export const useWordEditStore = create<WordEditState>((set) => ({
  editingId: null,
  openEditor: (wordId) => set({ editingId: wordId }),
  closeEditor: () => set({ editingId: null }),
}));
