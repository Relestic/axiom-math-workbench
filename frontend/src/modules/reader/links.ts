import type { ReaderCase, ReaderLink } from "./storage";

export type LinkPreset = {
  key: string;
  label: string;
  description: string;
  conceptId: string;
  caseId: ReaderCase;
};

export const LINK_PRESETS: LinkPreset[] = [
  {
    key: "continuity-epsilon",
    label: "查看连续性的 ε–δ 图像",
    description: "在 ε–δ 视图中检查 δ 如何随 ε 选择，并区分连续与一致连续。",
    conceptId: "uniform",
    caseId: "positive",
  },
  {
    key: "continuity-reciprocal",
    label: "查看反例：1/x 在 (0,1) 上不一致连续",
    description: "比较连续与一致连续：同一个 δ 是否要对所有位置同时有效。",
    conceptId: "uniform",
    caseId: "negative",
  },
  {
    key: "derivative-x2",
    label: "查看正例：x² 在原点的切线",
    description: "在原点观察割线斜率随 h 变化，并检查 x² 的差商化简。",
    conceptId: "derivative",
    caseId: "positive",
  },
  {
    key: "derivative-abs",
    label: "查看反例：|x| 连续但不可导",
    description: "比较原点左右差商，观察尖角以及“连续必可导”为何不成立。",
    conceptId: "derivative",
    caseId: "negative",
  },
  {
    key: "taylor-exp",
    label: "查看 eˣ 的 Taylor 多项式逼近",
    description: "比较函数与有限阶多项式，观察展开点和阶数对近似的影响。",
    conceptId: "taylor",
    caseId: "explore",
  },
  {
    key: "riemann-sum",
    label: "查看 Riemann 和随分割变化",
    description: "调整分割与取点，观察 Riemann 和如何随细分变化。",
    conceptId: "riemann",
    caseId: "positive",
  },
  {
    key: "dirichlet",
    label: "查看反例：Dirichlet 函数不可积",
    description: "用精确说明代替浮点图像，解释有界但不 Riemann 可积的原因。",
    conceptId: "riemann",
    caseId: "negative",
  },
  {
    key: "integral-area",
    label: "查看定积分与有向面积",
    description: "在积分模式中观察区间、分割和累积量之间的联系。",
    conceptId: "integral",
    caseId: "explore",
  },
];

export const DEMO_LINKS: ReaderLink[] = [
  {
    id: "demo-continuity-epsilon",
    pageIndex: 1,
    label: "查看连续性的 ε–δ 图像",
    description: "检查 δ 的选择如何依赖 ε，并比较逐点连续与一致连续。",
    conceptId: "uniform",
    caseId: "positive",
    builtIn: true,
  },
  {
    id: "demo-continuity-reciprocal",
    pageIndex: 2,
    label: "查看反例：1/x 在 (0,1) 上不一致连续",
    description: "沿着趋于 0 的两列点，观察函数值之差为什么不趋于 0。",
    conceptId: "uniform",
    caseId: "negative",
    builtIn: true,
  },
  {
    id: "demo-derivative-x2",
    pageIndex: 3,
    label: "查看正例：x² 在原点的切线",
    description: "在原点改变 h，观察割线趋近切线；差商可代数化简为 h。",
    conceptId: "derivative",
    caseId: "positive",
    builtIn: true,
  },
  {
    id: "demo-derivative-abs",
    pageIndex: 4,
    label: "查看反例：|x| 连续但不可导",
    description: "分别观察左右差商为 1 与 −1，理解不可导的准确含义。",
    conceptId: "derivative",
    caseId: "negative",
    builtIn: true,
  },
  {
    id: "demo-taylor",
    pageIndex: 5,
    label: "查看 eˣ 的 Taylor 多项式逼近",
    description: "比较函数与有限阶多项式；有限图像不替代余项估计。",
    conceptId: "taylor",
    caseId: "explore",
    builtIn: true,
  },
  {
    id: "demo-riemann",
    pageIndex: 6,
    label: "查看 Riemann 和随分割变化",
    description: "改变分割数与积分区间，观察 Riemann 和的数值变化。",
    conceptId: "riemann",
    caseId: "positive",
    builtIn: true,
  },
  {
    id: "demo-dirichlet",
    pageIndex: 6,
    label: "查看反例：Dirichlet 函数不可积",
    description: "不绘制浮点伪曲线，保留精确定义与不可积结论。",
    conceptId: "riemann",
    caseId: "negative",
    builtIn: true,
  },
];

export function presetToLink(
  preset: LinkPreset,
  pageIndex: number,
): ReaderLink {
  return {
    id: `user-${preset.key}-${pageIndex}-${Date.now().toString(36)}`,
    pageIndex,
    label: preset.label,
    description: preset.description,
    conceptId: preset.conceptId,
    caseId: preset.caseId,
  };
}

export function linksForPage(
  links: ReaderLink[],
  pageIndex: number,
): ReaderLink[] {
  return links.filter((link) => link.pageIndex === pageIndex);
}
