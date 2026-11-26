import { mapAttempt } from "../../domain/mappers";
import type { AttemptDto } from "../../domain/dto";
import { z } from "zod";
import type { Attempt, CurriculumUnit, Exercise, LocalBook } from "../../domain/types";

const strings = z.array(z.string());
const page = z.number().int().positive();
const book = z.object({
  id:z.string(), title:z.string(), page_count:page,
  pages:z.array(z.object({page, char_count:z.number().int().nonnegative(), needs_ocr:z.boolean()})),
});
const card = z.object({
  id:z.string(), title:z.string(), definition:z.string(), formula:z.string().default(""),
  conditions:strings, theorem:z.string(), proof:strings, textbook_id:z.string(), page_start:page, page_end:page,
  prerequisites: strings.default([]),
});
const exercise = z.object({
  id:z.string(), code:z.string(), topic_id:z.string(), title:z.string(), statement:z.string().optional(),
  hint:z.string().default(""), checks:strings.default([]), allowed_refs:strings.default([]),
  type:z.string().optional(), skill:z.string().optional(), difficulty:z.number().optional(), source:z.string(),
  provenance:z.object({parent_attempt_id:z.string().optional(), target_error:z.string().optional(), model:z.string().optional()}).default({}),
  solution_steps:z.array(z.union([z.string(),z.object({title:z.string().optional(),text:z.string()})])).default([]),
});
const catalog = z.object({textbooks:z.array(book),cards:z.array(card),exercises:z.array(exercise),
  attempts:z.array(z.custom<AttemptDto>(value => !!value && typeof value === "object" && "answer_text" in value && "exercise_id" in value && "created_at" in value)).default([])});

export type LocalCatalog = {books:LocalBook[]; units:CurriculumUnit[]; exercises:Exercise[]; attempts:Attempt[]};
export const emptyCatalog: LocalCatalog = {books:[], units:[], exercises:[], attempts:[]};

export function mapLocalCatalog(input: unknown): LocalCatalog {
  const data = catalog.parse(input);
  const titles = new Map(data.textbooks.map(item => [item.id,item.title]));
  const units = data.cards.map((item): CurriculumUnit => ({
    id:item.id, title:item.title, short:item.title, chapter:titles.get(item.textbook_id) || "本地教材",
    definition:item.definition, formula:item.formula, conditions:item.conditions, proof:item.proof,
    prerequisites:item.prerequisites,
    example:"", exercise:"", solution:[], hint:item.proof[0] || "", tools:[], source:"",
    textbookSource:{textbookId:item.textbook_id,pageStart:item.page_start,pageEnd:item.page_end,theorem:item.theorem},
  }));
  const exercises = data.exercises.map((item): Exercise => ({
    id:item.code, topicId:item.topic_id, coefficient:0, title:item.statement || item.title, hint:item.hint,
    solution:item.solution_steps.map(step => typeof step === "string" ? step : [step.title,step.text].filter(Boolean).join("：")),
    checks:item.checks, allowedRefs:item.allowed_refs, type:item.type, skill:item.skill, difficulty:item.difficulty,
    source:item.source, provenance:item.provenance,
  }));
  return {books:data.textbooks, units, exercises, attempts:data.attempts.map(mapAttempt)};
}
