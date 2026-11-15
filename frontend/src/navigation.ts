import {
  BookOpen,
  Boxes,
  ClipboardList,
  Gauge,
  LayoutGrid,
  Network,
  StickyNote,
} from "lucide-react";

export type NavItem = [string, string, typeof Gauge];
export type NavGroup = { label: string; items: NavItem[] };

export const navigation: NavGroup[] = [
  {
    label: "学习",
    items: [
      ["dashboard", "学习工作台", Gauge],
      ["textbook", "教材学习", BookOpen],
      ["exercises", "练习题库", ClipboardList],
    ],
  },
  {
    label: "可视化视图",
    items: [
      ["practice-map", "知识点练习可视化", LayoutGrid],
      ["knowledge-map", "数学总地图", Network],
      ["surface", "三维曲面实验室", Boxes],
    ],
  },
  {
    label: "个人",
    items: [["notes", "我的笔记", StickyNote]],
  },
];

/** Routes kept alive for old links, search results and browser history. */
export const legacyRouteTargets: Record<
  string,
  { page: string; target?: "image" | "cases" | "proof" }
> = {
  explore: { page: "textbook" },
  examples: { page: "textbook" },
  proof: { page: "textbook" },
  review: { page: "exercises" },
  diagnostic: { page: "textbook" },
};

export const visibleRoutes = navigation.flatMap((group) =>
  group.items.map((item) => item[0]),
);

/** Reachable but not shown in the sidebar. */
export const hiddenRoutes = ["image"];

export const validRoutes = [
  ...visibleRoutes,
  ...hiddenRoutes,
  ...Object.keys(legacyRouteTargets),
];

const TEXTBOOK_TARGET_KEY = "axiom-textbook-target";

export function resolveRoute(id: string): string {
  return legacyRouteTargets[id]?.page || id;
}
export function rememberRouteTarget(id: string): void {
  const target = legacyRouteTargets[id]?.target;
  try {
    if (target) sessionStorage.setItem(TEXTBOOK_TARGET_KEY, target);
    else if (id === "textbook") sessionStorage.removeItem(TEXTBOOK_TARGET_KEY);
  } catch {
    /* browsing still works without storage */
  }
  if (target) {
    window.dispatchEvent(
      new CustomEvent("axiom-textbook-target", { detail: target }),
    );
  }
}

export function consumeTextbookTarget(): string {
  try {
    const value = sessionStorage.getItem(TEXTBOOK_TARGET_KEY) || "";
    sessionStorage.removeItem(TEXTBOOK_TARGET_KEY);
    return value;
  } catch {
    return "";
  }
}

export const pageFromHash = () => {
  const raw = location.hash.slice(1);
  if (!validRoutes.includes(raw)) return "dashboard";
  rememberRouteTarget(raw);
  return resolveRoute(raw);
};
