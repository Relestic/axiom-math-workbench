import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { Send, Volume2, VolumeX, Square } from "lucide-react";
import { useAppData } from "../../app/DataProvider";
import { MathText, SymbolBar, MathPreview } from "../../components/Math";
import { useAIConnection } from "../ai/connection";
import type { CompanionStage } from "./CompanionStage";
import { localReply, requestReply, type Message } from "./reply";
import { queryWorkspace } from "./workspace";
import "./panel.css";

function BubbleText({text}: {text:string}) {
  // Only the supported Markdown constructs produce elements. All other text is escaped by React.
  return <>{text.split(/\n\s*\n/).map((para, i) =>
    <div className="companion-paragraph" key={i}>{para.split(/(\*\*[^*]+\*\*)/g).map((part,k) =>
      part.startsWith("**") && part.endsWith("**")
        ? <strong key={k}><MathText>{part.slice(2,-2)}</MathText></strong>
        : <MathText key={k}>{part.replace(/^#{1,4}\s+/gm,"").replace(/^\s*[-*]\s+/gm,"• ")}</MathText>
    )}</div>)}</>;
}

type Turn = Message & { scope: string };
function object(value: unknown): Record<string,unknown> {
  return value && typeof value === "object" ? value as Record<string,unknown> : {};
}
function string(value: unknown): string | undefined { return typeof value === "string" ? value : undefined; }

export function CompanionPanel({page, stage}: {page:string; stage:RefObject<CompanionStage | null>}) {
  const {data, selectedConceptId} = useAppData();
  const {status} = useAIConnection();
  const unit = data.units.find(item => item.id === selectedConceptId) ?? data.units[0];
  const [turns,setTurns] = useState<Turn[]>([]);
  const [input,setInput] = useState("");
  const [busy,setBusy] = useState(false);
  const [notice,setNotice] = useState("");
  const [muted,setMuted] = useState(() => localStorage.getItem("axiom-companion-muted") === "true");
  const [speaking,setSpeaking] = useState(false);
  const mutedRef = useRef(muted);
  const request = useRef<AbortController | null>(null);
  const sequence = useRef(0);
  const speechId = useRef(0);
  const field = useRef<HTMLTextAreaElement>(null);
  const transcript = useRef<HTMLDivElement>(null);
  const scope = page + "/" + selectedConceptId;

  function stopVoice() {
    speechId.current++;
    stage.current?.stopSpeaking();
    setSpeaking(false);
  }

  useLayoutEffect(() => {
    setBusy(false);
    setNotice("");
    return () => {
      sequence.current++;
      request.current?.abort();
      stopVoice();
    };
  }, [scope]);

  useEffect(() => {
    const box = transcript.current;
    if (box) box.scrollTop = box.scrollHeight;
  }, [turns,busy]);

  async function read(text: string) {
    stopVoice();
    const id = speechId.current;
    setSpeaking(true);
    try {
      const {createMouthDriver} = await import("./voice");
      if (id !== speechId.current || mutedRef.current) return;
      if (!stage.current) throw new Error("舞台正在载入，请稍后点击朗读。");
      await stage.current.speak({text, driver:createMouthDriver()});
    } catch (cause) {
      if (id === speechId.current) setNotice(cause instanceof Error ? cause.message : "朗读暂不可用。");
    } finally {
      if (id === speechId.current) setSpeaking(false);
    }
  }

  function toggleMute() {
    const next = !muted;
    mutedRef.current = next;
    setMuted(next);
    if (next) stopVoice();
    try { localStorage.setItem("axiom-companion-muted",String(next)); } catch { /* session preference */ }
  }

  async function ask(raw:string) {
    const question = raw.trim();
    if (!question || busy || !unit) return;
    const workspace = queryWorkspace(page);
    if (["proof", "exercises", "surface"].includes(page) && !Object.keys(workspace.context).length) {
      setNotice("正在加载当前学习内容，请稍后再提问。");
      return;
    }
    const id = ++sequence.current;
    const controller = new AbortController();
    request.current = controller;
    stopVoice();
    setBusy(true);
    setNotice("");
    setInput("");
    setTurns(items => [...items.slice(-29), {role:"user", content:question, scope}]);
    const local = !status?.configured;
    try {
      const details = workspace.context;
      const proof = object(details.proof), exercise = object(details.exercise);
      const expression = string(object(details.function_scene).active_expression) ?? string(object(details.surface_scene).expression);
      const reply = local
        ? localReply(question, unit, data.classics.find(c => c.id === unit.id), {
          step: string(object(proof.current_step).text), hint:string(exercise.hint),
          answer:string(exercise.draft_answer), expression,
        })
        : await requestReply(question, {
          page, concept_id:unit.id, title:unit.title, definition:unit.definition, formula:unit.formula, ...details,
        }, turns.filter(turn => turn.scope === scope), controller.signal);
      if (id !== sequence.current) return;
      if (reply.actions.length) {
        const applied = workspace.isCurrent() && workspace.applyActions(reply.actions);
        if (!applied) setNotice("当前步骤或参数与建议不符，已保留原内容。");
      }
      setTurns(items => [...items.slice(-29), {role:"assistant",content:reply.display_markdown,
        spoken:reply.spoken_text, local, scope}]);
      if (mutedRef.current) void stage.current?.playMotion("TapBody");
      else void read(reply.spoken_text);
    } catch (cause) {
      if (id === sequence.current && !controller.signal.aborted) {
        setNotice(cause instanceof Error && cause.name !== "ZodError" ? cause.message : "这次讲解格式有误，请重新提问。");
      }
    } finally {
      if (id === sequence.current) { setBusy(false); request.current = null; }
    }
  }

  return <section className="companion-panel" aria-label="伴学对话">
    <div className="companion-topic"><strong>{unit?.short ?? "数学分析"}</strong>
      <button type="button" className="icon-button" aria-label={muted ? "开启伴学朗读" : "静音只看字幕"}
        title={muted ? "开启朗读" : "静音只看字幕"} aria-pressed={muted} onClick={toggleMute}>
        {muted ? <VolumeX size={16}/> : <Volume2 size={16}/>}
      </button>
    </div>
    <div className="companion-transcript" aria-live="polite" ref={transcript}>
      {!turns.length && <p className="companion-intro">{status?.configured
        ? "可以问我当前的证明、图像或作答。" : "选一个问题，从当前知识点的本地讲义开始。"}</p>}
      {turns.map((m,i) => <article key={i} className={"companion-bubble " + m.role}>
        <small>{m.role === "user" ? "你" : m.local ? "Hiyori · 本地讲义" : "Hiyori · DeepSeek"}</small>
        <BubbleText text={m.content}/>
        {m.spoken && !muted && <button type="button" className="read-reply" onClick={() => void read(m.spoken!)}>朗读</button>}
      </article>)}
      {busy && <p role="status" className="companion-intro">正在准备讲解…</p>}
    </div>
    <div className="companion-compose">
      {notice && <p className="companion-notice" role="status">{notice}</p>}
      {speaking && <button type="button" className="read-reply" onClick={stopVoice}><Square size={11}/> 停止朗读</button>}
      <div className="companion-quick">{["解释这一步","举个反例","给点提示"].map(q =>
        <button className="btn" type="button" key={q} disabled={busy} onClick={() => void ask(q)}>{q}</button>)}</div>
      <form onSubmit={e => { e.preventDefault(); void ask(input); }}>
        <textarea ref={field} rows={2} maxLength={2000} value={input} aria-label="向 Hiyori 提问"
          placeholder="问问当前的步骤或公式…" onChange={e => setInput(e.target.value)} />
        <SymbolBar inputRef={field} value={input} onChange={setInput} />
        <MathPreview value={input} />
        <div className="companion-send">
          {busy ? <button type="button" className="btn" onClick={() => {
            sequence.current++; request.current?.abort(); setBusy(false);
          }}>取消提问</button> : <button className="btn primary" type="submit" disabled={!input.trim()}><Send size={13}/>发送</button>}
        </div>
      </form>
    </div>
  </section>;
}
