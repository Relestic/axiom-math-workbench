import {
  ChartNoAxesCombined,
  CircleDot,
  ClipboardList,
  Gauge,
  LayoutGrid,
  Network,
  Route,
  SquareCheck,
  Stethoscope,
  StickyNote,
  BookOpen,
  Boxes,
} from "lucide-react";

export const navigation: { label: string; items: [string, string, typeof Gauge][] }[] =
  [
    {
      label: "学习流程",
      items: [
        ["dashboard", "学习工作台", Gauge],
        ["textbook", "教材定义与条件", BookOpen],
        ["explore", "图像探索", ChartNoAxesCombined],
        ["examples", "正反例实验室", CircleDot],
        ["proof", "证明思路", Route],
        ["exercises", "练习题库", ClipboardList],
        ["review", "完整解答与复盘", SquareCheck],
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
      items: [
        ["diagnostic", "前置知识诊断", Stethoscope],
        ["notes", "我的笔记", StickyNote],
      ],
    },
  ];
export const validRoutes = navigation.flatMap((g) =>
  g.items.map((i) => i[0] as string),
);
export const pageFromHash = () =>
  validRoutes.includes(location.hash.slice(1))
    ? location.hash.slice(1)
    : "dashboard";

