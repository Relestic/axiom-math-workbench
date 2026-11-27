import { BookOpen, Gauge, Library, Network } from "lucide-react";

export const navigation = [
  ["dashboard", "学习主页", Gauge],
  ["desk", "学习书桌", BookOpen],
  ["atlas", "知识星图", Network],
  ["shelf", "书架与笔记", Library],
] as const;

export const subpages = {
  desk: { textbook:"讲义定义", proof:"证明思路", exercises:"练习", review:"复盘", explore:"2D 函数", surface:"3D 曲面", diagram:"文字图解", pdf:"课本原文" },
  atlas: { "knowledge-map":"知识地图", "practice-map":"练习分布", diagnostic:"前置诊断" },
  shelf: { books:"教材书架", notes:"我的笔记", archive:"学习存档" },
} as const;

const routes = new Map<string,string>([["dashboard","dashboard"]]);
for (const [section, children] of Object.entries(subpages)) {
  const keys = Object.keys(children);
  routes.set(section, section + "/" + keys[0]);
  for (const key of keys) {
    const address = section + "/" + key;
    routes.set(key,address);
    routes.set(address,address);
  }
}
routes.set("examples", "desk/textbook");
routes.set("desk/examples", "desk/textbook");
export const validRoutes = [...routes.keys()];
export const normalizeRoute = (route: string) => routes.get(route);
export function pageFromHash(current = window.location, stack = window.history, storage = window.localStorage): string {
  const raw = current.hash.slice(1);
  const target = normalizeRoute(raw || storage.getItem("axiom-last-page") || "dashboard") || "dashboard";
  if (raw !== target) stack.replaceState(null, "", "#" + target);
  return target;
}
