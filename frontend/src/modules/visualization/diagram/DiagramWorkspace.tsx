import { useEffect, useRef, useState } from "react";
import { Undo2 } from "lucide-react";
import { useWorkspaceEndpoint } from "../../../app/useWorkspaceEndpoint";
import { apiFetch } from "../../../lib/api";
import { useAIConnection } from "../../ai/connection";
import { useCardBoard } from "../cardBoardContext";
import { applyDiagramActions } from "./actions";
import { DiagramFigure } from "./DiagramFigure";
import { diagramPresets, dirichlet } from "./presets";
import { diagramSceneSchema, type DiagramScene } from "./schema";
import "./diagram.css";

const storageKey = "axiom-diagram-scene";
export default function DiagramWorkspace() {
  const card = useCardBoard();
  const { status } = useAIConnection();
  const [scene, setScene] = useState<DiagramScene>(() => {
    if (card) return diagramSceneSchema.parse(card.scenes.diagramScene ?? dirichlet);
    try { return diagramSceneSchema.parse(JSON.parse(localStorage.getItem(storageKey) ?? "null")); }
    catch { return dirichlet; }
  });
  const [history, setHistory] = useState<DiagramScene[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => {
    try { localStorage.setItem(storageKey, JSON.stringify(scene)); }
    catch { setError("浏览器无法保存图解。"); }
  }, [scene]);

  function display(next: DiagramScene) {
    request.current?.abort();
    setBusy(false);
    setScene(next);
    card?.remember({board:"diagram", diagramScene:next});
    setError("");
  }
  function commit(value: unknown) {
    const next = diagramSceneSchema.parse(value);
    if (JSON.stringify(next) === JSON.stringify(scene)) return;
    setHistory(previous => [...previous.slice(-14), scene]);
    display(next);
  }
  function undo() {
    const previous = history.at(-1);
    if (!previous) return;
    setHistory(items => items.slice(0,-1));
    display(previous);
  }
  useWorkspaceEndpoint("diagram", JSON.stringify(scene), {
    query: () => ({ diagram_scene: JSON.stringify(scene).length < 14000 ? scene : {
      title:scene.title, caption:scene.caption, viewBox:scene.viewBox,
      nodes:scene.nodes.map(({id, kind, tone}) => ({id, kind, tone})),
    } }),
    command: actions => applyDiagramActions(scene, actions, commit),
  });
  async function generate() {
    const controller = new AbortController();
    request.current?.abort();
    request.current = controller;
    setBusy(true);
    setError("");
    try {
      const result = await apiFetch<{scene: unknown}>("/api/v1/ai/local-diagram", {
        method:"POST", body:JSON.stringify({message:message.trim()}), signal:controller.signal,
      }, {auth:false});
      if (!controller.signal.aborted) { commit(result.scene); setMessage(""); }
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "生成图解失败");
    } finally {
      if (request.current === controller) { request.current = null; setBusy(false); }
    }
  }
  return <section className="diagram-workspace">
    <div className="diagram-toolbar"><span className="badge">概念教学示意图 · 非精确数值函数采样</span>
      <button type="button" className="btn" onClick={undo} disabled={!history.length}><Undo2 size={14}/>撤销修改</button>
    </div>
    <DiagramFigure scene={scene}/>
    <div className="diagram-presets" role="group" aria-label="经典图解预设">
      {diagramPresets.map(preset => <button type="button" key={preset.title} className="btn"
        onClick={() => commit(preset)}>{preset.title}</button>)}
    </div>
    <form className="diagram-prompt" onSubmit={e => { e.preventDefault(); void generate(); }}>
      <label htmlFor="diagram-message">用一句话描述图解</label>
      <input id="diagram-message" value={message} onChange={e => setMessage(e.target.value)} maxLength={2000}
        placeholder="例如：画出割线与它平行的切线" required/>
      <button className="btn primary" disabled={busy || !message.trim() || !status?.configured}>{busy ? "正在生成…" : "生成图解"}</button>
      {status && !status.configured && <small className="muted">请先在顶部配置个人 DeepSeek Key</small>}
    </form>
    {error && <p role="alert">{error}</p>}
  </section>;
}
