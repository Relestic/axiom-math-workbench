import type { ReaderLink } from "./storage";
import type { DocxBlock } from "./docxAdapter";

export type LocalRule = {
  key: string;
  terms: string[];
  conceptId: string;
  visualizationId: string;
  caseId: "positive" | "negative" | "explore";
  label: string;
  description: string;
  focus: string[];
};

export const LOCAL_RULES: LocalRule[] = [
  {
    key: "dirichlet-function",
    terms: ["狄利克雷函数", "Dirichlet function"],
    conceptId: "dirichlet_function",
    visualizationId: "dirichlet-discontinuity",
    caseId: "negative",
    label: "查看反例：狄利克雷函数的不连续性",
    description: "用有理/无理点示意与邻域解释处处不连续；不使用浮点有理性连线。",
    focus: ["discontinuity", "non_differentiability"],
  },
  {
    key: "dirichlet-rational-definition",
    terms: ["函数在有理点取 1，在无理点取 0", "函数在有理点取 1、在无理点取 0"],
    conceptId: "dirichlet_function",
    visualizationId: "dirichlet-discontinuity",
    caseId: "negative",
    label: "查看按取值定义的狄利克雷函数",
    description: "从原文中的取值定义进入同一不连续反例，展示有限示意边界。",
    focus: ["discontinuity"],
  },
  {
    key: "uniform-continuity",
    terms: ["一致连续", "uniformly continuous"],
    conceptId: "uniform",
    visualizationId: "uniform",
    caseId: "positive",
    label: "查看一致连续性的 ε–δ 图像",
    description: "比较逐点连续与一致连续中 δ 对位置的依赖。",
    focus: ["uniform_continuity"],
  },
  {
    key: "derivative",
    terms: ["导数", "可导", "differentiable"],
    conceptId: "derivative",
    visualizationId: "derivative",
    caseId: "positive",
    label: "查看导数与差商图像",
    description: "在原点附近观察割线、切线与左右差商。",
    focus: ["derivative"],
  },
  {
    key: "taylor",
    terms: ["Taylor", "泰勒"],
    conceptId: "taylor",
    visualizationId: "taylor",
    caseId: "explore",
    label: "查看 Taylor 多项式逼近",
    description: "比较函数与有限阶多项式，图像不替代余项估计。",
    focus: ["approximation"],
  },
  {
    key: "riemann",
    terms: ["Riemann 和", "黎曼和", "Riemann 可积", "黎曼可积"],
    conceptId: "riemann",
    visualizationId: "riemann",
    caseId: "positive",
    label: "查看 Riemann 和随分割变化",
    description: "调整分割与取点，观察 Riemann 和的数值变化。",
    focus: ["integrability"],
  },
  {
    key: "integral",
    terms: ["定积分", "微积分基本定理"],
    conceptId: "integral",
    visualizationId: "integral",
    caseId: "explore",
    label: "查看定积分与累积量",
    description: "观察区间、分割与累积量的联系。",
    focus: ["integral"],
  },
];

export function isNegativeContext(text: string, start: number): boolean {
  const before = text.slice(Math.max(0, start - 16), start);
  return /不应|不要链接|人物介绍|误连/.test(before);
}

export function localCandidates(blocks: DocxBlock[]): ReaderLink[] {
  const links: ReaderLink[] = [];
  for (const block of blocks) {
    if (
      block.type === "table" ||
      block.type === "heading" ||
      block.type === "list" ||
      !block.text
    )
      continue;
    const occupied: [number, number][] = [];
    for (const rule of LOCAL_RULES) {
      for (const term of rule.terms) {
        let from = 0;
        while (from < block.text.length) {
          const start = block.text.indexOf(term, from);
          if (start < 0) break;
          const end = start + term.length;
          if (
            rule.key === "derivative" &&
            term === "可导" &&
            block.text[start - 1] === "不"
          ) {
            from = end;
            continue;
          }
          if (isNegativeContext(block.text, start)) {
            from = end;
            continue;
          }
          if (occupied.some(([a, b]) => start < b && end > a)) {
            from = end;
            continue;
          }
          occupied.push([start, end]);
          links.push({
            id: `local-${block.blockId}-${start}-${end}`,
            pageIndex: 0,
            blockId: block.blockId,
            start,
            end,
            exactText: term,
            label: rule.label,
            description: rule.description,
            conceptId: rule.conceptId,
            visualizationId: rule.visualizationId,
            caseId: rule.caseId,
            focus: rule.focus,
            status: "candidate",
            origin: "local",
            format: "docx",
          });
          from = end;
        }
      }
    }
  }
  return links;
}

export type AnalyzeCandidate = {
  blockId: string;
  exactText: string;
  occurrence?: number;
  conceptId: string;
  visualizationId: string;
  caseId?: "positive" | "negative" | "explore";
  focus?: string[];
  label?: string;
  description?: string;
  status?: string;
};

const TARGETS = new Set([
  "dirichlet-discontinuity",
  "uniform",
  "continuous",
  "derivative",
  "mean-value",
  "taylor",
  "primitive",
  "riemann",
  "integral",
]);

const GENERIC_TERMS = new Set([
  "可导",
  "可导性",
  "可积",
  "可积性",
  "连续",
  "连续性",
  "函数",
  "导数",
  "积分",
]);

export function validateCandidates(
  blocks: DocxBlock[],
  candidates: AnalyzeCandidate[],
): { links: ReaderLink[]; rejected: string[] } {
  const byId = new Map(blocks.map((block) => [block.blockId, block]));
  const links: ReaderLink[] = [];
  const rejected: string[] = [];
  for (const candidate of candidates) {
    if (GENERIC_TERMS.has(candidate.exactText.trim())) {
      rejected.push(`${candidate.blockId}: 泛化词不自动链接`);
      continue;
    }
    const block = byId.get(candidate.blockId);
    if (!block || !candidate.exactText?.trim() || !TARGETS.has(candidate.visualizationId)) {
      rejected.push(`${candidate.blockId}: 无效块或目标`);
      continue;
    }
    const matches: number[] = [];
    let from = 0;
    while (from <= block.text.length) {
      const index = block.text.indexOf(candidate.exactText, from);
      if (index < 0) break;
      matches.push(index);
      from = index + Math.max(1, candidate.exactText.length);
    }
    if (!matches.length) {
      rejected.push(`${candidate.blockId}: 原文中不存在「${candidate.exactText}」`);
      continue;
    }
    const occurrence = Math.max(1, Math.min(candidate.occurrence || 1, matches.length));
    if (matches.length > 1 && !candidate.occurrence) {
      rejected.push(`${candidate.blockId}:「${candidate.exactText}」出现多次且未给出 occurrence`);
      continue;
    }
    const start = matches[occurrence - 1];
    const end = start + candidate.exactText.length;
    if (isNegativeContext(block.text, start)) {
      rejected.push(`${candidate.blockId}: 候选处于否定/人物介绍语境`);
      continue;
    }
    if (links.some((link) => link.blockId === block.blockId && link.start !== undefined && start < (link.end || 0) && end > link.start)) {
      rejected.push(`${candidate.blockId}: 链接重叠`);
      continue;
    }
    links.push({
      id: `auto-${block.blockId}-${start}-${end}-${candidate.visualizationId}`,
      pageIndex: 0,
      blockId: block.blockId,
      start,
      end,
      exactText: candidate.exactText,
      label: candidate.label || `查看「${candidate.exactText}」的图像`,
      description: candidate.description || "由自动识别生成，点击查看关联图像。",
      conceptId: candidate.conceptId || candidate.visualizationId,
      visualizationId: candidate.visualizationId,
      caseId: candidate.caseId || "explore",
      focus: candidate.focus || [],
      status: "verified",
      origin: "auto",
      format: "docx",
    });
  }
  return { links, rejected };
}

export function linksForBlock(links: ReaderLink[], blockId: string): ReaderLink[] {
  return links
    .filter((link) => link.blockId === blockId && link.start !== undefined)
    .sort((a, b) => (a.start || 0) - (b.start || 0));
}
