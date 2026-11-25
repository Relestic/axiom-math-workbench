import { useCallback, useMemo, useRef, useState } from "react";
import type { DataBundleDto } from "../../../domain/dto";
import { mapNotes } from "../../../domain/mappers";
import type { DataSource, Note } from "../../../domain/types";
import { useLocalData } from "../../../lib/localData";
import {
  createNoteTyped,
  deleteNoteRequest,
  toggleBookmarkRequest,
} from "../api";

const emptyNotes: Note[] = [];
const emptyBookmarks: string[] = [];

export function useNotes(source: DataSource) {
  const offlineNotes = useLocalData("axiom-offline-notes", emptyNotes);
  const offlineBookmarks = useLocalData(
    "axiom-offline-bookmarks",
    emptyBookmarks,
  );
  const [serverNotes, setServerNotes] = useState<Note[]>([]);
  const [serverBookmarks, setServerBookmarks] = useState<string[]>([]);
  const pendingBookmarks = useRef(new Set<string>());
  const notes = source === "server" ? serverNotes : offlineNotes.value;
  const bookmarks =
    source === "server" ? serverBookmarks : offlineBookmarks.value;

  const loadServer = useCallback(
    (bundle: Pick<DataBundleDto, "notes" | "bookmarks">) => {
      setServerNotes(mapNotes(bundle.notes));
      setServerBookmarks(
        bundle.bookmarks
          .filter((bookmark) => bookmark.target_type === "concept")
          .map((bookmark) => bookmark.target_id),
      );
    },
    [],
  );

  const reloadOffline = useCallback(() => {
    offlineNotes.reload();
    offlineBookmarks.reload();
  }, [offlineNotes.reload, offlineBookmarks.reload]);

  const commands = useMemo(
    () => ({
      async saveNote(text: string, conceptId?: string): Promise<Note> {
        if (source === "server") {
          const [note] = mapNotes([await createNoteTyped(text, conceptId)]);
          setServerNotes((current) => [note, ...current]);
          return note;
        }
        const note: Note = {
          id: crypto.randomUUID(),
          text,
          date: new Date().toLocaleString("zh-CN"),
          conceptId: conceptId || null,
        };
        offlineNotes.write((current) => [note, ...current]);
        return note;
      },
      async deleteNote(id: string) {
        const remove = (current: Note[]) =>
          current.filter((note) => note.id !== id);
        if (source === "server") {
          await deleteNoteRequest(id);
          setServerNotes(remove);
          return;
        }
        offlineNotes.write(remove);
      },
      async toggleBookmark(conceptId: string) {
        if (source === "offline") {
          offlineBookmarks.write((current) =>
            current.includes(conceptId)
              ? current.filter((id) => id !== conceptId)
              : [...current, conceptId],
          );
          return;
        }

        const pending = pendingBookmarks.current;
        if (pending.has(conceptId)) return;
        const active = !bookmarks.includes(conceptId);
        pending.add(conceptId);
        try {
          await toggleBookmarkRequest(conceptId, active);
          setServerBookmarks((current) =>
            active
              ? [...new Set([...current, conceptId])]
              : current.filter((id) => id !== conceptId),
          );
        } finally {
          pending.delete(conceptId);
        }
      },
    }),
    [bookmarks, offlineBookmarks.write, offlineNotes.write, source],
  );

  return { notes, bookmarks, loadServer, reloadOffline, commands };
}
