import type { ClassicSet } from "../../domain/types";

export const offlineClassics: ClassicSet[] = [
  {
    id: "uniform",
    label: "连续与一致连续",
    statement: "若函数 f 在区间 I 上连续，则 f 在 I 上一致连续。",
    given: "f 在 I 上逐点连续",
    conclusion: "δ 可对全部位置统一选择",
    repair: "增加“闭且有界”可得到充分条件",
    positive: "f(x) = x 在 [0,1] 上",
    negative: "f(x) = 1/x 在 (0,1) 上",
    positiveKind: "line" as const,
    negativeKind: "reciprocal" as const,
    positiveCopy: "|f(x)−f(y)|=|x−y|。任给 ε>0，取 δ=ε，即可同时控制所有点对。",
    negativeCopy:
      "取 xₙ=1/(n+1)，yₙ=1/(n+2)。两点均在 (0,1)，距离趋于 0，但函数值之差恒为 1，因此不一致连续。",
    positiveTags: ["在 [0,1] 上连续", "一致连续", "Lipschitz 常数 1"],
    negativeTags: ["在 (0,1) 上连续", "不一致连续", "导数无界"],
  },
  {
    id: "derivative",
    label: "连续与可导",
    statement: "若函数在某点连续，则它在该点可导。",
    given: "函数在该点连续",
    conclusion: "双侧差商极限存在",
    repair: "连续不足以保证差商收敛",
    positive: "f(x) = x² 在原点",
    negative: "f(x) = |x| 在原点",
    positiveKind: "square" as const,
    negativeKind: "absolute" as const,
    positiveCopy: "原点处差商为 h，h→0 时趋于 0，因此可导，导数为 0。",
    negativeCopy:
      "右差商恒为 1，左差商恒为 −1。虽然 |x|→0，左右导数不同，故原点不可导。",
    positiveTags: ["原点连续", "原点可导", "导数为 0"],
    negativeTags: ["原点连续", "原点不可导", "左右导数不同"],
  },
  {
    id: "riemann",
    label: "有界与可积",
    statement: "若函数在有限闭区间上有界，则它 Riemann 可积。",
    given: "函数在 [0,1] 上有界",
    conclusion: "上下和可以任意接近",
    repair: "有界之外还需满足可积判据",
    positive: "单个跳跃的阶跃函数",
    negative: "Dirichlet 函数在 [0,1] 上",
    positiveKind: "step" as const,
    negativeKind: "dirichlet" as const,
    positiveCopy:
      "取函数在 x<1/2 时为 0、在 x≥1/2 时为 1。只需用长度任意小的区间包住跳跃点，就能使上下和之差任意小，因此可积。",
    negativeCopy:
      "每个非退化小区间都有有理点和无理点，故上确界为 1、下确界为 0。对任意分割，上和为 1、下和为 0，所以不可积。",
    positiveTags: ["有界", "有间断点", "Riemann 可积"],
    negativeTags: ["有界", "处处不连续", "Riemann 不可积"],
  },
];
