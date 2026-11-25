import type { PracticeModule } from "../../domain/types";

export const offlinePracticeModules: PracticeModule[] = [
  {
    id: "continuous",
    name: "连续性",
    label: "点与区间上的连续",
    counts: [12, 8, 5, 4, 3],
    scores: [88, 82, 73, 76, 67],
  },
  {
    id: "uniform",
    name: "闭区间性质",
    label: "一致连续与条件辨析",
    counts: [8, 9, 3, 2, 0],
    scores: [78, 85, 45, 42, 0],
  },
  {
    id: "derivative",
    name: "导数与微分",
    label: "差商与局部近似",
    counts: [9, 7, 6, 5, 4],
    scores: [80, 78, 72, 68, 70],
  },
  {
    id: "mean-value",
    name: "中值定理",
    label: "辅助函数与增量估计",
    counts: [6, 5, 8, 4, 3],
    scores: [78, 71, 64, 55, 68],
  },
  {
    id: "taylor",
    name: "Taylor 公式",
    label: "逼近与余项估计",
    counts: [5, 4, 3, 0, 2],
    scores: [64, 58, 36, 0, 32],
  },
  {
    id: "primitive",
    name: "原函数",
    label: "原函数与积分方法",
    counts: [7, 8, 4, 3, 2],
    scores: [78, 84, 67, 62, 57],
  },
  {
    id: "riemann",
    name: "Riemann 积分",
    label: "分割、上下和与可积性",
    counts: [5, 4, 3, 2, 0],
    scores: [63, 57, 45, 38, 0],
  },
  {
    id: "integral",
    name: "微积分基本定理",
    label: "导数与累积量的联系",
    counts: [5, 4, 3, 0, 2],
    scores: [67, 62, 44, 0, 40],
  },
];

export const offlinePracticeSkills = ["定义理解", "条件辨析", "独立证明", "反例构造", "综合迁移"];
