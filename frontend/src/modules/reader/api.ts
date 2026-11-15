import { apiFetch } from "../../lib/api";
import type { AIStatus } from "../visualization/api";

export { fetchAIStatus } from "../visualization/api";

export type ReaderAIResult = {
  message: string;
  provider?: string;
  model?: string;
  page_text_available?: boolean;
};

export async function requestReaderQuestion(input: {
  documentName: string;
  pageIndex: number;
  pageCount: number;
  pageText: string;
  selectedText: string;
  question: string;
  history: { role: "user" | "assistant"; content: string }[];
  signal: AbortSignal;
}): Promise<ReaderAIResult> {
  return apiFetch<ReaderAIResult>("/api/v1/ai/reader/discuss", {
    method: "POST",
    signal: input.signal,
    body: JSON.stringify({
      document_name: input.documentName,
      page_index: input.pageIndex,
      page_count: input.pageCount,
      page_text: input.pageText,
      selected_text: input.selectedText,
      question: input.question,
      history: input.history,
    }),
  });
}

export type { AIStatus };
