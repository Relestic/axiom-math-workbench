import {
  ArrowDownRight,
  ArrowLeft,
  ArrowRight,
  ArrowUpLeft,
  BookOpen,
  Check,
  ChevronRight,
  CircleHelp,
  Download,
  Filter,
  Flame,
  Focus,
  Grid2X2,
  Info,
  Layers,
  ListFilter,
  Network,
  PlayCircle,
  RotateCcw,
  Sparkles,
  Waypoints,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useState } from "react";
import { useAppData } from "../../app/DataProvider";
import { Constellation } from "./Constellation";
import type { GraphNode } from "../../domain/types";
import type { MapProps } from "./shared";

export function KnowledgeMap({ onNavigate, notify }: MapProps) {
  const app = useAppData();
  const nodes = app.data.graph.nodes;
  const edges = app.data.graph.edges;
  const nodeById = (id: string): GraphNode =>
    nodes.find((node) => node.id === id) || nodes[0];
  const [selected, setSelected] = useState("一致连续"),
    [onlyUnlocked, setOnlyUnlocked] = useState(false),
    [showExamples, setShowExamples] = useState(true),
    [highlightGaps, setHighlightGaps] = useState(true),
    [relationsOnly, setRelationsOnly] = useState(false);
  const current = nodes.find((n) => n.name === selected) || nodeById("uniform");
  const openCurrent = (page: string) => {
    const map: Record<string, string> = {
      real: "continuous",
      sequence: "continuous",
      limit: "continuous",
      continuity: "continuous",
      compact: "uniform",
      uniform: "uniform",
      mvt: "mean-value",
      bounded: "mean-value",
      lipschitz: "uniform",
      abs: "derivative",
      reciprocal: "uniform",
      ftc: "integral",
    };
    app.selectConcept(map[current.id] || current.id);
    onNavigate(page);
  };
  const dependencies = edges
    .filter(
      ([a, b, k]) => b === current.id && k !== "case" && k !== "extension",
    )
    .map(([a, , k]) => ({ node: nodeById(a), type: k }));
  const supported = edges
    .filter(([a, , k]) => a === current.id && k !== "case" && k !== "extension")
    .map(([, b, k]) => ({ node: nodeById(b), type: k }));
  const gaps = nodes.filter(
    (n) => n.progress > 0 && n.progress < 50 && n.kind !== "case",
  );
  return (
    <div className="maps-page knowledge-page">
      <div className="page-heading map-heading">
        <div>
          <h1>数学总地图</h1>
          <p>
            看见知识之间的联系。从一个定义出发，追溯它的来路，也找到它的去向。
          </p>
        </div>
        <button
          className="btn primary"
          onClick={() => {
            setSelected("一致连续");
            setOnlyUnlocked(false);
            setRelationsOnly(false);
            notify("已定位到当前学习：一致连续");
          }}
        >
          <Focus size={16} />
          定位当前学习
        </button>
      </div>
      <div className="map-controls">
        <div className="map-segment">
          <button
            className={!relationsOnly ? "active" : ""}
            onClick={() => setRelationsOnly(false)}
          >
            全部关系
          </button>
          <button
            className={relationsOnly ? "active" : ""}
            onClick={() => setRelationsOnly(true)}
          >
            蕴含与反例
          </button>
        </div>
        <div className="map-filter-buttons">
          <button
            className={`btn ${onlyUnlocked ? "selected" : ""}`}
            aria-pressed={onlyUnlocked}
            onClick={() => {
              setOnlyUnlocked((v) => !v);
              if (current.kind === "extension") setSelected("一致连续");
            }}
          >
            <Filter size={14} />
            仅看 MVP
          </button>
          <button
            className={`btn ${highlightGaps ? "map-pink selected" : ""}`}
            aria-pressed={highlightGaps}
            onClick={() => setHighlightGaps((v) => !v)}
          >
            标出待复习
          </button>
          <button
            className={`btn ${showExamples ? "map-orange selected" : ""}`}
            aria-pressed={showExamples}
            onClick={() => {
              setShowExamples((v) => !v);
              if (current.kind === "case") setSelected("一致连续");
            }}
          >
            <CircleHelp size={14} />
            显示反例
          </button>
        </div>
      </div>
      <div className="map-main-grid">
        <div className="map-left-column">
          <Constellation
            onSelect={setSelected}
            selected={selected}
            onlyUnlocked={onlyUnlocked}
            showExamples={showExamples}
            highlightGaps={highlightGaps}
            relationsOnly={relationsOnly}
          />
          <section className="card map-proof-path">
            <div className="map-section-head">
              <h3>
                <Waypoints size={17} />
                可追溯路径 · 从条件走向结论
              </h3>
              <span>点击节点查看准确关系</span>
            </div>
            <div className="proof-path-steps">
              {["中值定理", "导数有界", "Lipschitz 条件", "一致连续"].map(
                (name, i) => (
                  <div className="path-step-wrap" key={name}>
                    <button
                      className={`path-step ${selected === name ? "active" : ""}`}
                      onClick={() => setSelected(name)}
                    >
                      <strong>{name}</strong>
                      <small>
                        {i === 0
                          ? "证明工具"
                          : i === 1
                            ? "区间上的充分条件"
                            : i === 2
                              ? "统一线性估计"
                              : "统一的 δ"}
                      </small>
                    </button>
                    {i < 3 && <ArrowRight size={16} />}
                  </div>
                ),
              )}
            </div>
            <div className="info-strip">
              <Sparkles size={16} />
              <span>
                在区间上，由中值定理把导数上界转成增量估计。注意：一致连续不必具有有界导数。
              </span>
            </div>
          </section>
        </div>
        <aside className="map-right-column">
          <section className="card node-detail">
            <div className="node-detail-top">
              <span className="badge">
                {current.kind === "extension"
                  ? "正式版拓展"
                  : current.kind === "case"
                    ? "经典反例"
                    : "当前选中节点"}
              </span>
              <Network size={16} />
            </div>
            <h2>{current.name}</h2>
            <p className="muted">{current.description}</p>
            <div className="map-progress">
              <div>
                <i style={{ width: `${current.progress}%` }} />
              </div>
              <span>{current.progress}%</span>
            </div>
            <small className="map-demo-caption">
              掌握度由学习记录估算，不是能力标签
            </small>
            <p className="node-explanation">{current.detail}</p>
            <h4>
              <ArrowUpLeft size={14} />
              前置 / 推导来源（{dependencies.length}）
            </h4>
            <div className="relation-tags">
              {dependencies.length ? (
                dependencies.map(({ node, type }) => (
                  <button
                    key={node.id}
                    onClick={() => setSelected(node.name)}
                    title={
                      type === "implication"
                        ? "在所述条件下蕴含"
                        : "教学或证明依赖"
                    }
                  >
                    <Check size={11} />
                    {node.name}
                  </button>
                ))
              ) : (
                <span className="muted">基础节点，查看定义即可开始</span>
              )}
            </div>
            <h4>
              <ArrowDownRight size={14} />
              连接到（{supported.length}）
            </h4>
            <div className="relation-tags purple">
              {supported.length ? (
                supported.map(({ node, type }) => (
                  <button key={node.id} onClick={() => setSelected(node.name)}>
                    {type === "implication" ? "⇒ " : ""}
                    {node.name}
                  </button>
                ))
              ) : (
                <span className="muted">继续探索相邻概念</span>
              )}
            </div>
            <div className="map-action-stack">
              <button
                className="btn primary"
                disabled={current.kind === "extension"}
                onClick={() =>
                  openCurrent(current.kind === "case" ? "examples" : "explore")
                }
              >
                <PlayCircle size={15} />
                {current.kind === "extension"
                  ? "正式版内容 · 规划中"
                  : current.kind === "case"
                    ? "打开正反例实验室"
                    : "回到图像探索"}
              </button>
              <button
                className="btn"
                disabled={current.kind === "extension"}
                onClick={() => openCurrent("textbook")}
              >
                <BookOpen size={15} />
                查看定义与条件
              </button>
            </div>
          </section>
          {gaps.length > 0 && (
            <button
              className="map-gap-strip"
              onClick={() => setSelected(gaps[0].name)}
            >
              <span className="map-gap-dot" />
              <span>待复习 {gaps.length} 个节点</span>
              <ChevronRight size={14} />
            </button>
          )}
          <section className="map-dark-note">
            <h3>
              <Layers size={16} />
              地图阅读方式
            </h3>
            <p>
              实线表示有方向的知识联系；“蕴含与反例”视图只保留逻辑蕴含和反例。
            </p>
            <div>
              <span>MVP 内容节点</span>
              <strong>
                {nodes.filter((n) => n.kind !== "extension").length}
              </strong>
            </div>
            <div>
              <span>正式版拓展</span>
              <strong>
                {nodes.filter((n) => n.kind === "extension").length}
              </strong>
            </div>
            <small>课程地图来自已审核图谱 · 不代表完整教材解析</small>
          </section>
        </aside>
      </div>
    </div>
  );
}
