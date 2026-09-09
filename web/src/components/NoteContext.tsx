import { createContext, useContext, useState, type ReactNode } from "react";
import { useSplitScreenNote } from "../hooks/useSplitScreenNote";

type NoteSide = "left" | "right";

type NoteContextValue = ReturnType<typeof useSplitScreenNote> & {
  storageKey: string;
  setStorageKey: (key: string) => void;
  openNote: (key: string, title?: string) => void;
  openDefaultNote: () => void;
  noteTitle: string;
  setNoteTitle: (title: string) => void;
  defaultTitle: string;
  setDefaultTitle: (title: string) => void;
};

const NoteContext = createContext<NoteContextValue | null>(null);

export function NoteProvider({ children }: { children: ReactNode }) {
  const note = useSplitScreenNote("lb_global_note_width");
  const [storageKey, setStorageKey] = useState("");
  const [noteTitle, setNoteTitle] = useState("随心记");
  const [defaultTitle, setDefaultTitle] = useState("随心记");

  const openNote = (key: string, title?: string) => {
    setStorageKey(key);
    setNoteTitle(title ?? defaultTitle);
    note.setOpen(true);
  };

  const openDefaultNote = () => {
    setStorageKey("");
    setNoteTitle(defaultTitle);
    note.setOpen(true);
  };

  return (
    <NoteContext.Provider
      value={{
        ...note,
        storageKey,
        setStorageKey,
        openNote,
        openDefaultNote,
        noteTitle,
        setNoteTitle,
        defaultTitle,
        setDefaultTitle,
      }}
    >
      {children}
    </NoteContext.Provider>
  );
}

export function useNote() {
  const ctx = useContext(NoteContext);
  if (!ctx) throw new Error("useNote must be used within NoteProvider");
  return ctx;
}
