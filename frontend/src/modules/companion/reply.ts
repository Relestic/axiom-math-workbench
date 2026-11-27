import { z } from "zod";
import speech from "../../../../backend/app/modules/spoken_math.json";
import { ApiError, apiFetch } from "../../lib/api";
import type { CurriculumUnit, ClassicSet } from "../../domain/types";
import { actionError, actionSchema, type WorkspaceAction } from "./actions";
import { fitCompanionContext } from "./context";
export { actionSchema };

function rules(text: string, entries: string[][]) {
  for (const [pattern, replacement] of entries) text = text.replace(new RegExp(pattern, "g"), replacement);
  return text;
}
export function spokenMath(text: string): string {
  const symbols: Record<string, string> = speech.symbols;
  const converted = Array.from(rules(text, speech.rules), char => symbols[char] ?? char).join("");
  return rules(converted, speech.cleanup).trim();
}
export type Action = WorkspaceAction;
const droppedAction = z.object({index: z.number().int().nonnegative(), type: z.string(), reason: z.string().min(1)});
type DroppedAction = z.infer<typeof droppedAction>;
const responseSchema = z.object({
  display_markdown: z.string().min(1).max(6000),
  spoken_text: z.string().max(3400),
  actions: z.array(z.unknown()).max(6).optional(),
  dropped: z.array(droppedAction).max(6).default([]),
});
export type Reply = {display_markdown: string; spoken_text: string; actions: Action[]; dropped: DroppedAction[]};
export type Message = {role: "user" | "assistant"; content: string; spoken?: string; local?: boolean};

export function formatActionNotice(dropped: DroppedAction[], batch?: {count: number; reason: string}) {
  const count = dropped.length + (batch?.count ?? 0);
  if (!count) return undefined;
  const reasons = dropped.map(item => `第 ${item.index + 1} 项：${item.reason}`);
  if (batch) reasons.push(batch.reason);
  return `有 ${count} 项黑板操作未执行：${reasons.join("；")}`;
}

export function companionErrorMessage(cause: unknown) {
  if (cause instanceof z.ZodError || (cause instanceof ApiError && cause.code === "companion_format")) {
    return "这次讲解格式校验失败，请重新提问。";
  }
  if (cause instanceof ApiError) return "伴学服务请求失败：" + cause.message;
  return "无法连接伴学服务，请检查网络和本地工作台后重试。";
}

export async function requestReply(question: string, context: Record<string, unknown>, history: Message[], signal: AbortSignal): Promise<Reply> {
  const raw = await apiFetch<unknown>("/api/v1/ai/companion", {
    method: "POST", signal,
    body: JSON.stringify({question, context:fitCompanionContext(context),
      history: history.slice(-6).map(({role,content}) => ({role, content:content.slice(0,1400)}))}),
  }, { auth:false });
  const parsed = responseSchema.parse(raw);
  const actions: Action[] = [];
  const dropped = [...parsed.dropped];
  // The server omits rejected actions from its array. Keep its original numbering.
  const serverIndices = new Set(dropped.map(item => item.index));
  let index = 0;
  for (const input of parsed.actions ?? []) {
    while (serverIndices.has(index)) index++;
    const result = actionSchema.safeParse(input);
    if (result.success) actions.push(result.data);
    else {
      const type = input && typeof input === "object" && "type" in input ? input.type : undefined;
      dropped.push({index, type: typeof type === "string" ? type : "未知操作", reason: actionError(result.error)});
    }
    index++;
  }
  dropped.sort((a, b) => a.index - b.index);
  return {display_markdown: parsed.display_markdown, spoken_text: spokenMath(parsed.spoken_text || parsed.display_markdown), actions, dropped};
}

export function localReply(question: string, unit: CurriculumUnit, classic: ClassicSet | undefined,
  lesson: { step?: string; hint?: string; expression?: string; diagram?: string; answer?: string; evidence?: string }): Reply {
  let display: string;
  if (question.includes("反例")) {
    display = classic ? "考察命题「" + classic.statement + "」。\n\n" + classic.negative + "。"
      + classic.negativeCopy : "本单元的条件辨析可以从这个例子入手。\n\n" + unit.example;
  } else if (question.includes("补全条件") && classic) {
    display = classic.repair + (lesson.evidence ? "\n\n" + lesson.evidence : "");
  } else if (question.includes("条件") && unit.conditions.length) {
    display = unit.conditions.map(condition => "• " + condition).join("\n");
  } else if (question.includes("依据") && lesson.step) {
    display = lesson.step + "\n\n本单元可核对的依据：" + unit.tools.join("、") + "。";
  } else if (/提示|怎么做|思路/.test(question)) {
    display = (lesson.answer ? "对照你已写的作答，检查下面的关键条件。\n\n" : "") + (lesson.hint || unit.hint);
  } else if (lesson.diagram) {
    display = lesson.diagram;
  } else if (lesson.expression) {
    display = "当前图像的表达式为 $" + lesson.expression + "$。先固定一个点，改变一个参数或显示范围，观察图像如何变化。";
  } else if (lesson.step) {
    display = lesson.step;
  } else {
    display = unit.definition + "\n\n" + unit.formula;
  }
  return {display_markdown: display, spoken_text: spokenMath(display), actions: [], dropped: []};
}
