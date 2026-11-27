import { z } from "zod";
import type { Attempt } from "../../domain/types";

export const reviewSchema = z.strictObject({
  summary:z.string(), steps:z.array(z.strictObject({step:z.string(),assessment:z.string(),suggestion:z.string()})),
  error_focus:z.string(),
});
export type AiReview = z.infer<typeof reviewSchema>;
export const variantCode = /^(?:variant-|card-ex-)[a-f0-9]{32}$/;

export function explainAttempt(attempt: Attempt): string {
  if (attempt.aiReview) {
    const {summary,steps,error_focus} = attempt.aiReview;
    return [summary,...steps.map(item => [item.step,item.assessment,item.suggestion].filter(Boolean).join("。")),error_focus && "下一步练习可以关注" + error_focus].filter(Boolean).join("\n\n");
  }
  const feedback = attempt.feedback;
  const missing = feedback?.missing_steps?.length ? feedback.missing_steps : feedback?.criteria?.filter(item=>!item.met).map(item=>item.label);
  return [feedback?.summary || "请对照题目的条件，重新读一遍你的作答。",
    missing?.length ? "请先检查这些步骤：" + missing.join("；") : "",
    feedback?.reference_answer ? "可对照的参考结果为：" + feedback.reference_answer : "",
    feedback?.needs_review ? "结构自查仍需要结合你的完整证法复核。" : "",
  ].filter(Boolean).join("\n\n");
}
