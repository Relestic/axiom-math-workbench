import {
  useCallback,
  type Dispatch,
  type SetStateAction,
} from "react";
import type { AppData, Note } from "../../domain/types";
import { mapNotes } from "../../domain/mappers";
import { saveOfflineNotes } from "../../data/offline";
import type { SessionValue } from "../../lib/session";
import {
  createNoteTyped,
  deleteNoteRequest,
  toggleBookmarkRequest,
} from "./api";
import { saveOfflineBookmarks } from "./offline";

type Params = {
  session: SessionValue;
  data: AppData;
  setData: Dispatch<SetStateAction<AppData>>;
};

export function useRecordActions({ session, data, setData }: Params) {
  const saveNote = useCallback(
    async (text: string, conceptId?: string): Promise<Note> => {
      if (session.mode === "server") {
        const dto = await createNoteTyped(text, conceptId);
        const note = mapNotes([dto])[0];
        setData((current) => ({
          ...current,
          notes: [note, ...current.notes],
        }));
        return note;
      }
      const note: Note = {
        id: crypto.randomUUID(),
        text,
        date: new Date().toLocaleString("zh-CN"),
        conceptId: conceptId || null,
      };
      setData((current) => {
        const notes = [note, ...current.notes];
        saveOfflineNotes(notes);
        return { ...current, notes };
      });
      return note;
    },
    [session.mode, setData],
  );

  const deleteNote = useCallback(
    async (id: string) => {
      if (session.mode === "server") {
        await deleteNoteRequest(id);
      }
      setData((current) => {
        const notes = current.notes.filter((note) => note.id !== id);
        if (session.mode === "offline") saveOfflineNotes(notes);
        return { ...current, notes };
      });
    },
    [session.mode, setData],
  );

  const toggleBookmark = useCallback(
    async (conceptId: string) => {
      const active = data.bookmarks.includes(conceptId);
      if (session.mode === "server") {
        await toggleBookmarkRequest(conceptId, !active);
      }
      setData((current) => {
        const bookmarks = active
          ? current.bookmarks.filter((id) => id !== conceptId)
          : [...current.bookmarks, conceptId];
        if (session.mode === "offline") saveOfflineBookmarks(bookmarks);
        return { ...current, bookmarks };
      });
    },
    [data.bookmarks, session.mode, setData],
  );

  return { saveNote, deleteNote, toggleBookmark };
}
