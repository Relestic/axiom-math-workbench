import { ArrowDownRight, ArrowRight, ArrowUpLeft, BookOpen, Crosshair, Maximize, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useAppData } from "../../app/DataProvider";
import { MathText } from "../../components/Math";
import { conceptIdForGraphNode } from "../../domain/graphConcept";
import type { CurriculumUnit, GraphNode } from "../../domain/types";
import { Constellation } from "./Constellation";
import { layoutGraph } from "./layoutGraph";

function conceptId(node: GraphNode) {
  return node.conceptId || conceptIdForGraphNode(node.id);
}

function RelationLinks({ title, nodes, select, outgoing = false }: {
  title: string; nodes: GraphNode[]; select: (id: string) => void; outgoing?: boolean;
}) {
  const Icon = outgoing ? ArrowDownRight : ArrowUpLeft;
  return <section className="atlas-relations">
    <h3><Icon size={15} />{title}<small>{nodes.length}</small></h3>
    {nodes.length ? <div>{nodes.map(node =>
      <button key={node.id} onClick={() => select(node.id)}>{node.name}</button>)}</div> :
      <p>暂无直接{outgoing ? "后继" : "前置"}</p>}
  </section>;
}

export function KnowledgeMap({ onRead }: { onRead: (unit: CurriculumUnit) => void }) {
  const { data, localBooks, selectedConceptId } = useAppData();
  const [scope, setScope] = useState("all");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string>();
  const [reviewOnly, setReviewOnly] = useState(false);
  const [camera, setCamera] = useState<{ id?: string; revision: number }>({ revision: 0 });
  const nodes = useMemo(() => data.graph.nodes.filter(n => n.kind !== "case" && n.kind !== "extension"), [data.graph.nodes]);
  const bookScopes = useMemo(() => {
    const titles = new Map<string, string>(data.source === "offline"
      ? localBooks.map(book => [book.id, book.title]) : []);
    for (const node of nodes) if (node.textbookId) titles.set(node.textbookId, node.textbookTitle || "本地教材");
    return [...titles];
  }, [nodes, localBooks, data.source]);
  const activeScope = scope === "builtin" || bookScopes.some(([id]) => id === scope) ? scope : "all";
  const layout = useMemo(() => layoutGraph(nodes.filter(n =>
    activeScope === "all" || (n.textbookId ?? "builtin") === activeScope), data.graph.edges),
  [nodes, activeScope, data.graph.edges]);
  const visible = useMemo(() => new Map(layout.nodes.map(node => [node.id, node])), [layout]);
  const current = selected ? visible.get(selected) : undefined;
  const unit = current && data.units.find(item => item.id === conceptId(current));
  const direct = layout.edges.filter(([, , kind]) => kind === "prerequisite");
  const predecessors = current ? direct.filter(([, to]) => to === current.id).map(([id]) => visible.get(id)!) : [];
  const successors = current ? direct.filter(([from]) => from === current.id).map(([, id]) => visible.get(id)!) : [];
  const findMatches = (value: string) => {
    const key = value.trim().toLocaleLowerCase();
    return key ? layout.nodes.filter(n => n.name.toLocaleLowerCase().includes(key)).map(n => n.id) : [];
  };
  const matches = findMatches(query);
  function focus(id?: string) {
    setCamera(last => ({ id, revision: last.revision + 1 }));
  }
  function selectAndFocus(id: string) {
    setSelected(id);
    focus(id);
  }
  function changeScope(id: string) {
    setScope(id);
    setSelected(undefined);
    setQuery("");
    focus();
  }
  function search(value: string) {
    setQuery(value);
    const [first] = findMatches(value);
    setSelected(first);
    focus(first);
  }
  const studyNode = nodes.find(n => n.id === selectedConceptId) ||
    nodes.find(n => n.id === "continuity" && conceptId(n) === selectedConceptId) ||
    nodes.find(n => n.id === "mvt" && conceptId(n) === selectedConceptId) ||
    nodes.find(n => conceptId(n) === selectedConceptId);
  function locateStudy() {
    if (!studyNode) return;
    if (!visible.has(studyNode.id)) setScope(studyNode.textbookId ?? "builtin");
    setQuery("");
    selectAndFocus(studyNode.id);
  }
  return <div className="maps-page atlas-page">
    <header className="atlas-heading"><h1>知识星图</h1>
      <span>{layout.nodes.length} 个知识点</span></header>
    <div className="atlas-toolbar">
      <div className="atlas-scopes" role="group" aria-label="教材范围">
        {([["all", "全部"], ["builtin", "内置课程"], ...bookScopes]).map(([id, label]) =>
          <button key={id} type="button" title={label} aria-pressed={activeScope === id}
            onClick={() => changeScope(id)}>{label}</button>)}
      </div>
      <div className="atlas-actions">
        <label className="atlas-search"><Search size={16} aria-hidden="true" />
          <input aria-label="搜索节点" placeholder="搜索节点" value={query} onChange={e => search(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter" && matches.length) {
                const next = (matches.indexOf(selected ?? "") + 1) % matches.length;
                selectAndFocus(matches[next]);
              }
            }}/>
          {query && <small role="status">{matches.length ? `${matches.length} 项` : "无匹配"}</small>}
        </label>
        <button className="atlas-review" type="button" aria-pressed={reviewOnly}
          onClick={() => setReviewOnly(!reviewOnly)}><i aria-hidden="true"/>仅标出待复习</button>
        <button className="btn" onClick={locateStudy} disabled={!studyNode}><Crosshair size={15}/>定位当前学习</button>
        <button className="btn" onClick={() => focus()}><Maximize size={15}/>适屏居中</button>
      </div>
    </div>
    <div className={"atlas-content" + (current ? " with-detail" : "")}>
      {layout.nodes.length ? <Constellation layout={layout} selected={current?.id} onSelect={setSelected}
        matches={new Set(matches)} reviewOnly={reviewOnly} cameraRequest={camera}/> :
        <p className="atlas-empty" role="status">{bookScopes.some(([id]) => id === activeScope)
          ? "这本教材还没有学习卡片。可在书架选取 PDF 页码生成卡片。" : "当前范围还没有知识点。"}</p>}
      {current && <aside className="node-detail atlas-detail" aria-label="节点详情">
        <header><span><BookOpen size={14}/>{current.textbookTitle ?? "内置课程"}{current.pageStart && ` · P.${current.pageStart}`}</span>
          <button type="button" aria-label="关闭节点详情" onClick={() => setSelected(undefined)}><X size={16}/></button></header>
        <h2>{current.name}</h2>
        <small>{current.state === "unpracticed" ? "未练习" : current.progress != null ? `掌握度 ${current.progress}%` : "已作答 · 待评分"}</small>
        <p className="atlas-definition"><MathText>{current.textbookId ? unit?.definition || current.detail : current.detail || unit?.definition || current.description}</MathText></p>
        {unit?.formula && <section className="atlas-formula"><h3>{!current.textbookId && conceptId(current) !== current.id ? "关联讲义公式" : "核心公式"}</h3><MathText>{unit.formula}</MathText></section>}
        <RelationLinks title="前置来源" nodes={predecessors} select={selectAndFocus}/>
        <RelationLinks title="后续推导" nodes={successors} select={selectAndFocus} outgoing/>
        <button className="btn primary atlas-read" disabled={!unit} onClick={() => unit && onRead(unit)}>
          去学习书桌研读<ArrowRight size={15}/></button>
      </aside>}
    </div>
  </div>;
}
