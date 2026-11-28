import type { LocalBook } from "../../domain/types";
import type { ExerciseDto } from "../../domain/dto";
import { apiFetch } from "../../lib/api";
import type { CardVisual } from "../visualization/cardVisual";
import type { OCRPageImage } from "./pdfPageRenderer";

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
export function cacheOCRPages(id: string, pages: OCRPageImage[]) {
  return apiFetch<LocalBook>(`${bookPath(id)}/ocr-pages`, {
    method: "POST", body: JSON.stringify({ pages }),
  }, local);
}
export function generateCardProof(id: string) {
  return apiFetch(`/api/v1/local/cards/${encodeURIComponent(id)}/proof`, {method:"POST"}, local);
}
export function generateCardVisual(id: string) {
  return apiFetch<{visual: CardVisual}>(`/api/v1/local/cards/${encodeURIComponent(id)}/visual`, {method:"POST"}, local);
}
export function generateCardExercises(id: string, count: 1 | 2 = 1, focus: "concept" | "proof" | "calculation" = "concept") {
  return apiFetch<{exercises: ExerciseDto[]}>(`/api/v1/local/cards/${encodeURIComponent(id)}/exercises`, {
    method:"POST", body:JSON.stringify({count, focus}),
  }, local);
}

export async function completeCards(cards: {id:string; title:string}[], options: {
  stopped: () => boolean;
  progress: (text:string) => void;
  failed: (context:string, cause:unknown) => void;
  refresh: () => Promise<void>;
}) {
  for (const [index, card] of cards.entries()) {
    if (options.stopped()) break;
    const position = `已提取 ${cards.length} 张卡片 · 正在生成第 ${index + 1} / ${cards.length} 张卡的`;
    for (const [part, generate] of [["证明拆解", generateCardProof], ["配套练习", generateCardExercises],
      ["配套图像", generateCardVisual]] as const) {
      if (options.stopped()) break;
      options.progress(position + part + "…");
      try {
        await generate(card.id);
      } catch (cause) {
        options.failed(`《${card.title}》的${part}`, cause);
      }
    }
    try {
      await options.refresh();
    } catch (cause) {
      options.failed("刷新书桌", cause);
    }
  }
}
export function textbookPageUrl(id: string, page: number) {
  return `${bookPath(id)}/file#page=${page}`;
}
export function pageLabel(start: number, end = start) {
  return start === end ? `第 ${start} 页` : `第 ${start}–${end} 页`;
}
export type ReadingPosition = { bookId: string; page: number };
