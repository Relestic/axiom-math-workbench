import type { LocalBook } from "../../domain/types";
import { apiFetch } from "../../lib/api";

const libraryPath = "/api/v1/local/textbooks";
const local = { auth: false };
const bookPath = (id: string) => `${libraryPath}/${encodeURIComponent(id)}`;

export function uploadTextbook(file: File) {
  const body = new FormData();
  body.append("file", file);
  return apiFetch<LocalBook>(libraryPath, { method: "POST", body }, local);
}
export function renameTextbook(id: string, title: string) {
  return apiFetch<LocalBook>(bookPath(id), { method: "PATCH", body: JSON.stringify({ title }) }, local);
}
export function deleteTextbook(id: string) {
  return apiFetch(bookPath(id), { method: "DELETE" }, local);
}
export function extractCards(id: string, start: number, end: number) {
  return apiFetch<{ cards: { id: string; title: string }[] }>(`${bookPath(id)}/extract-cards`, {
    method: "POST", body: JSON.stringify({ page_start: start, page_end: end }),
  }, local);
}
export function textbookPageUrl(id: string, page: number) {
  return `${bookPath(id)}/file#page=${page}`;
}
export function pageLabel(start: number, end = start) {
  return start === end ? `第 ${start} 页` : `第 ${start}–${end} 页`;
}
export type ReadingPosition = { bookId: string; page: number };
