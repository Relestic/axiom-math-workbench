import { apiFetch } from "../../lib/api";
import type { AIStatus } from "../visualization/api";
import type { AnalyzeCandidate } from "./docxAnalysis";

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
  sourceType?: "pdf" | "docx";
  blockId?: string;
  sectionTitle?: string;
  documentId?: string;
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
      source_type: input.sourceType || "pdf",
      block_id: input.blockId || "",
      section_title: input.sectionTitle || "",
      document_id: input.documentId || "",
    }),
  });
}

export type ReaderRuleTask = "recognition" | "image" | "qa";

export type ReaderRule = {
  content: string;
  version: number;
  custom?: boolean;
};

export type ReaderExample = {
  id: string;
  task: ReaderRuleTask;
  block_text: string;
  exact_text: string;
  target: string;
  visualization_id: string;
  reason: string;
  source: string;
  created_at: string;
};

export type ReaderSettings = {
  rules: Record<ReaderRuleTask, ReaderRule>;
  examples: ReaderExample[];
};

export async function fetchReaderSettings(): Promise<ReaderSettings> {
  return apiFetch<ReaderSettings>("/api/v1/reader/settings");
}

export async function saveReaderRule(
  task: ReaderRuleTask,
  content: string,
): Promise<ReaderRule> {
  return apiFetch<ReaderRule>(`/api/v1/reader/rules/${task}`, {
    method: "PUT",
    body: JSON.stringify({ content }),
  });
}

export async function resetReaderRule(task: ReaderRuleTask): Promise<ReaderRule> {
  return apiFetch<ReaderRule>(`/api/v1/reader/rules/${task}`, {
    method: "DELETE",
  });
}

export async function addReaderExample(input: {
  task?: ReaderRuleTask;
  block_text: string;
  exact_text: string;
  target: string;
  visualization_id: string;
  reason: string;
  source?: string;
}): Promise<ReaderExample> {
  return apiFetch<ReaderExample>("/api/v1/reader/examples", {
    method: "POST",
    body: JSON.stringify({ ...input, task: input.task || "recognition" }),
  });
}

export async function deleteReaderExample(id: string): Promise<void> {
  await apiFetch(`/api/v1/reader/examples/${id}`, { method: "DELETE" });
}

export type VisualizationOption = {
  id: string;
  label: string;
  conceptId: string;
  caseId: string;
  focus: string[];
};

export type ReaderAnalysisResult = {
  candidates: AnalyzeCandidate[];
  rejected: string[];
  rulesVersion: number;
  provider?: string;
  model?: string;
  status: "analyzed";
};

export async function analyzeDocument(input: {
  documentName: string;
  docId: string;
  parserVersion: string;
  blocks: { blockId: string; sectionTitle: string; text: string }[];
  visualizations: VisualizationOption[];
  maxCandidates?: number;
  signal?: AbortSignal;
}): Promise<ReaderAnalysisResult> {
  const data = await apiFetch<{
    candidates: Record<string, unknown>[];
    rejected: string[];
    rules_version: number;
    provider?: string;
    model?: string;
    status: "analyzed";
  }>("/api/v1/ai/reader/analyze", {
    method: "POST",
    signal: input.signal,
    body: JSON.stringify({
      document_name: input.documentName,
      doc_id: input.docId,
      parser_version: input.parserVersion,
      blocks: input.blocks.map((block) => ({
        block_id: block.blockId,
        section_title: block.sectionTitle,
        text: block.text,
      })),
      visualizations: input.visualizations.map((item) => ({
        id: item.id,
        label: item.label,
        concept_id: item.conceptId,
        case_id: item.caseId,
        focus: item.focus,
      })),
      max_candidates: input.maxCandidates || 20,
    }),
  });
  return {
    candidates: data.candidates.map((item) => ({
      blockId: String(item.block_id || ""),
      exactText: String(item.exact_text || ""),
      occurrence:
        typeof item.occurrence === "number" ? item.occurrence : undefined,
      conceptId: String(item.concept_id || ""),
      visualizationId: String(item.visualization_id || ""),
      caseId: (item.case_id as AnalyzeCandidate["caseId"]) || "explore",
      focus: Array.isArray(item.focus) ? item.focus.map(String) : [],
      label: String(item.label || ""),
      description: String(item.description || ""),
      status: String(item.status || "candidate"),
    })),
    rejected: data.rejected || [],
    rulesVersion: data.rules_version,
    provider: data.provider,
    model: data.model,
    status: "analyzed",
  };
}

export type { AIStatus };
