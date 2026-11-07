const OFFLINE_BOOKMARKS = "axiom-offline-bookmarks";

export function readOfflineBookmarks(): string[] {
  try {
    return JSON.parse(localStorage.getItem(OFFLINE_BOOKMARKS) || "[]");
  } catch {
    return [];
  }
}

export function saveOfflineBookmarks(ids: string[]): void {
  try {
    localStorage.setItem(OFFLINE_BOOKMARKS, JSON.stringify(ids));
  } catch {
    /* ignore */
  }
}
