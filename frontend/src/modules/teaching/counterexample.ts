import { apiFetch } from "../../lib/api";

export const basisLabels = {
  symbolic: "符号推导",
  "numeric-sample": "数值辅助检验，非严格证明",
  "definition-only": "依据函数定义",
  "model-explanation": "AI 辅助解析",
} as const;

export type CounterexampleResult = {
  expression: string;
  interval: string;
  findings: { verdict_basis: keyof typeof basisLabels; text: string }[];
  model_status?: string;
};

export function checkCounterexample(expression: string, a: number, b: number, endpoints: string, includeModel: boolean) {
  return apiFetch<CounterexampleResult>("/api/v1/local/counterexamples/check", {
    method: "POST",
    body: JSON.stringify({ expression, interval: { a, b, left_closed: endpoints[0] === "[", right_closed: endpoints[1] === "]" },
      include_model: includeModel }),
  }, { auth: false });
}

export function counterexampleNote(result: CounterexampleResult) {
  return [`自拟反例检验 · f(x) = ${result.expression} · ${result.interval}`,
    ...result.findings.map(({ verdict_basis, text }) => `[verdict_basis=${verdict_basis}] ${basisLabels[verdict_basis]}：${text}`)].join("\n");
}
