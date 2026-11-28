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
// The individual desk buttons and the enrichment bar can request the same step.
function cardGenerator<T>(part: string) {
  const pending = new Map<string, Promise<T>>();
  return (id: string, body?: string) => {
    const key = JSON.stringify([id, body]);
    const existing = pending.get(key);
    if (existing) return existing;
    const request = apiFetch<T>(`/api/v1/local/cards/${encodeURIComponent(id)}/${part}`, {
      method: "POST", body,
    }, local).finally(() => pending.delete(key));
    pending.set(key, request);
    return request;
  };
}
export const generateCardProof = cardGenerator<unknown>("proof");
export const generateCardVisual = cardGenerator<{visual: CardVisual}>("visual");
const requestExercises = cardGenerator<{exercises: ExerciseDto[]}>("exercises");
export function generateCardExercises(id: string, count: 1 | 2 = 1, focus: "concept" | "proof" | "calculation" = "concept") {
  return requestExercises(id, JSON.stringify({count, focus}));
}

export async function buildTextbook(book: LocalBook, start: number, end: number, options: {
  stopped: () => boolean;
  progress: (text: string) => void;
  cardsAdded: (firstId: string) => void;
  renderPages: (pages: number[]) => Promise<OCRPageImage[]>;
  refresh: () => Promise<void>;
  windowSize?: number;
}) {
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || start > end || end > book.page_count) {
    throw new Error(`请选择 1 至 ${book.page_count} 页内的连续页码范围。`);
  }
  const step = Math.max(1, Math.min(15, options.windowSize ?? 10));
  let total = 0;
  let pages = book.pages;
  for (let first = start; first <= end && !options.stopped(); first += step) {
    const last = Math.min(first + step - 1, end);
    const scans = pages.slice(first - 1, last).filter(page => page.needs_ocr).map(page => page.page);
    for (let i = 0; i < scans.length; i += 3) {
      const group = scans.slice(i, i + 3);
      options.progress(`正在识别扫描页：第 ${group[0]}–${group[group.length - 1]} / ${end} 页…`);
      const images = await options.renderPages(group);
      pages = (await cacheOCRPages(book.id, images)).pages;
      await options.refresh();
      if (options.stopped()) return total;
    }
    const progress = () => options.progress(`正在快速建书：第 ${first}–${last} / ${end} 页 · 已生成 ${total} 张学习卡片…`);
    progress();
    if (!pages.slice(first - 1, last).some(page => page.char_count > 0)) continue;
    const { cards } = await extractCards(book.id, first, last);
    if (cards.length) {
      total += cards.length;
      options.cardsAdded(cards[0].id);
      progress();
      await options.refresh();
    }
  }
  return total;
}
export function textbookPageUrl(id: string, page: number) {
  return `${bookPath(id)}/file#page=${page}`;
}
export function pageLabel(start: number, end = start) {
  return start === end ? `第 ${start} 页` : `第 ${start}–${end} 页`;
}
export type ReadingPosition = { bookId: string; page: number };
