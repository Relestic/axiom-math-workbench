import type { DiagnosticQuestion } from "../../domain/types";

export const offlineDiagnosticQuestions: DiagnosticQuestion[] = [
  {
    id: "uniform-delta",
    text: "证明一致连续时，δ 可以依赖于什么？",
    options: ["ε，但不能依赖具体位置", "ε 和任意基准点 x₀", "只能依赖 x₀"],
    conceptId: "uniform",
    skill: "条件辨析",
    correctIndex: 0,
    reason: "定义要求同一个 δ 对定义域内所有点对有效。",
  },
  {
    id: "heine-cantor",
    text: "下列哪项足以保证实函数一致连续？",
    options: [
      "定义在开区间上且连续",
      "定义在有界闭区间上且连续",
      "存在一个点的导数",
    ],
    conceptId: "uniform",
    skill: "定义理解",
    correctIndex: 1,
    reason: "这是 Heine–Cantor 定理的典型情形；条件充分但并非必要。",
  },
  {
    id: "darboux",
    text: "有界函数在 [a,b] 上 Riemann 可积的一个等价判据是？",
    options: [
      "画出的曲线足够平滑",
      "某次等距采样结果稳定",
      "对任意 ε>0，存在分割使上下和之差小于 ε",
    ],
    conceptId: "riemann",
    skill: "条件辨析",
    correctIndex: 2,
    reason: "Darboux 判据约束上下和差距，有限采样不能证明可积。",
  },
];
