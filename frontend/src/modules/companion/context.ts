import { ApiError } from "../../lib/api";

const narrativeFields = new Set(["definition", "formula", "title", "draft_answer", "hint", "text"]);
const excerpt = (text: string, limit: number) => text.length <= limit ? text : text.slice(0, limit) + "…";

/** Keep plot identities and numeric controls intact even for long imported lectures. */
export function fitCompanionContext(context: Record<string, unknown>): Record<string, unknown> {
  if (JSON.stringify(context).length <= 22000) return context;
  for (let limit = 3000; limit >= 1; limit = Math.floor(limit / 2)) {
    const json = JSON.stringify({ ...context, excerpted: true }, (key, value) => {
      if (typeof value === "string" && narrativeFields.has(key)) return excerpt(value, limit);
      if (key === "conditions" && Array.isArray(value)) {
        return value.map(item => typeof item === "string" ? excerpt(item, limit) : item);
      }
      return value;
    });
    if (json.length <= 22000) return JSON.parse(json);
  }
  throw new ApiError(422, "当前学习上下文过长，请缩短作答后重试。", "unprocessable");
}
