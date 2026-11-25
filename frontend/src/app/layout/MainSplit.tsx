import { useState, type ReactNode } from "react";
import { Columns2, PanelTop } from "lucide-react";

export function MainSplit({ page, navigate, lecture, graph }: {
  page: "textbook" | "explore"; navigate: (page: string) => void; lecture: ReactNode; graph: ReactNode;
}) {
  const [compare, setCompare] = useState(false);
  const [opened, setOpened] = useState({ textbook: page === "textbook", explore: page === "explore" });
  if (!opened[page]) setOpened({ ...opened, [page]: true });
  function toggle() {
    setOpened({ textbook: true, explore: true });
    setCompare(!compare);
  }
  return <section className="main-split" data-compare={compare} data-page={page}>
    <div className="split-tools">
      <div className="split-tabs" aria-label="选择工作区">
        <button className="btn" aria-pressed={page === "textbook"} onClick={() => navigate("textbook")}>讲义</button>
        <button className="btn" aria-pressed={page === "explore"} onClick={() => navigate("explore")}>图像</button>
      </div>
      <button className="btn split-toggle" onClick={toggle} aria-pressed={compare}>
        {compare ? <PanelTop size={15} /> : <Columns2 size={15} />}
        {compare ? "单栏阅读" : "讲义与图像对照"}
      </button>
    </div>
    <div className="split-panes">
      <section className="split-pane lecture-pane" aria-label="讲义工作区">{opened.textbook && lecture}</section>
      <section className="split-pane graph-pane" aria-label="图像工作区">{opened.explore && graph}</section>
    </div>
  </section>;
}
