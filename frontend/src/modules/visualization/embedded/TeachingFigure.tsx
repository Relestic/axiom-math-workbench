import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  Bot,
  Check,
  ChevronDown,
  Expand,
  RotateCcw,
  SlidersHorizontal,
  Sparkles,
  Undo2,
  X,
} from "lucide-react";
import FunctionPlot from "../../../pages/FunctionPlot";
import { initialScene, validateScene, type Scene } from "../../../lib/plotScene";
import { parseFormula } from "../../../lib/functionEngine";
import type { ClassicSet, CurriculumUnit } from "../../../domain/types";
import { useSession } from "../../identity/api";
import {
  fetchAIStatus,
  requestPlotChange,
  type AIStatus,
} from "../api";
import { AICredentialSettings } from "../components/AICredentialSettings";
import "../two-d/function-workspace.css";
import "./teaching-figure.css";

type Variant = "positive" | "negative" | "explore";
type Kind = ClassicSet["positiveKind"];

const KIND_EXPRESSION: Record<Kind, string> = {
  line: "x",
  reciprocal: "1/x",
  absolute: "abs(x)",
  square: "x^2",
  step: "x < 0.5 ? 0 : 1",
  dirichlet: "sin(1/x)",
};

const MODE_BY_UNIT: Record<string, Scene["mode"]> = {
  continuous: "continuity",
  uniform: "continuity",
  derivative: "derivative",
  "mean-value": "derivative",
  taylor: "taylor",
  primitive: "integral",
  riemann: "integral",
  integral: "integral",
};

const DEFAULT_EXPRESSION: Record<string, string> = {
  continuous: "sin(x)",
  uniform: "x^2",
  derivative: "x^2",
  "mean-value": "sin(x)",
  taylor: "exp(x)",
  primitive: "x^2",
  riemann: "x^2",
  integral: "x^2",
};

function initialRanges(kind?: Kind) {
  if (kind === "reciprocal")
    return { xMin: 0.05, xMax: 2, yMin: -1, yMax: 8 };
  if (kind === "absolute")
    return { xMin: -2.2, xMax: 2.2, yMin: -1, yMax: 3 };
  if (kind === "square")
    return { xMin: -2.2, xMax: 2.2, yMin: -1, yMax: 4.2 };
  if (kind === "step")
    return { xMin: -0.2, xMax: 1.2, yMin: -0.5, yMax: 1.5 };
  return { xMin: -2.5, xMax: 2.5, yMin: -3, yMax: 6 };
}

function makeScene(
  unit: CurriculumUnit,
  expression: string,
  kind?: Kind,
): Scene {
  const base = structuredClone(initialScene);
  const range = initialRanges(kind);
  const mode = MODE_BY_UNIT[unit.id] || "graph";
  const formula = parseFormula(expression);
  base.mode = mode;
  base.curves = [
    {
      ...base.curves[0],
      id: "embedded",
      label: "f(x)",
      expression,
      visible: true,
      domainMin: null,
      domainMax: null,
      leftOpen: false,
      rightOpen: false,
    },
  ];
  base.activeId = "embedded";
  base.parameters = formula.symbols.map((name) => ({
    name,
    value: 1,
    min: -4,
    max: 4,
  }));
  base.xMin = range.xMin;
  base.xMax = range.xMax;
  base.yMin = range.yMin;
  base.yMax = range.yMax;
  base.x0 = mode === "continuity" ? 0.5 : 0;
  base.h = 0.12;
  base.epsilon = 0.3;
  base.delta = 0.3;
  base.integralStart = unit.id === "integral" ? 0 : 0;
  base.integralEnd = unit.id === "integral" ? 1 : 1;
  base.subdivisions = 32;
  base.order = 2;
  return validateScene(base);
}

function caseInfo(
  unit: CurriculumUnit,
  classic: ClassicSet | undefined,
  variant: Variant,
): {
  expression: string;
  kind?: Kind;
  copy: string;
  tags: string[];
  title: string;
  claim: string;
} {
  if (classic && variant === "positive") {
    return {
      expression: KIND_EXPRESSION[classic.positiveKind],
      kind: classic.positiveKind,
      copy: classic.positiveCopy,
      tags: classic.positiveTags,
      title: classic.positive,
      claim: `正例：满足「${classic.given}」；${classic.conclusion}`,
    };
  }
  if (classic && variant === "negative") {
    return {
      expression: KIND_EXPRESSION[classic.negativeKind],
      kind: classic.negativeKind,
      copy: classic.negativeCopy,
      tags: classic.negativeTags,
      title: classic.negative,
      claim: `反例：反驳「${classic.statement}」；${classic.repair}`,
    };
  }
  const expression =
    classic && classic.positiveKind
      ? KIND_EXPRESSION[classic.positiveKind]
      : DEFAULT_EXPRESSION[unit.id] || "sin(x)";
  return {
    expression,
    kind: classic?.positiveKind,
    copy: "这是你的探索场景；切换正例/反例不会覆盖这里的改动。",
    tags: ["自由探索"],
    title: "我的探索",
    claim: `当前知识点：${unit.title}`,
  };
}

function defaultScenes(unit: CurriculumUnit, classic?: ClassicSet) {
  const variants: Variant[] = classic
    ? ["positive", "negative", "explore"]
    : ["explore"];
  const scenes = {} as Record<Variant, Scene>;
  for (const variant of variants) {
    const info = caseInfo(unit, classic, variant);
    scenes[variant] = makeScene(unit, info.expression, info.kind);
  }
  return { variants, scenes };
}

function storageKey(userId: string | undefined, unitId: string) {
  return `axiom-textbook-${userId || "offline"}-${unitId}`;
}

export function TeachingFigure({
  unit,
  classic,
  onNavigate,
}: {
  unit: CurriculumUnit;
  classic?: ClassicSet;
  onNavigate: (page: string) => void;
}) {
  const session = useSession();
  const defaults = useMemo(() => defaultScenes(unit, classic), [unit, classic]);
  const [variant, setVariant] = useState<Variant>(
    defaults.variants[0] || "explore",
  );
  const [scenes, setScenes] = useState<Record<Variant, Scene>>(defaults.scenes);
  const [draft, setDraft] = useState(defaults.scenes[defaults.variants[0]].curves[0].expression);
  const [history, setHistory] = useState<Scene[]>([]);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [showAI, setShowAI] = useState(false);
  const [status, setStatus] = useState<AIStatus | null>(null);
  const [messages, setMessages] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const requestId = useRef(0);
  const chatEnd = useRef<HTMLDivElement>(null);
  const key = storageKey(session.user?.id, unit.id);

  useEffect(() => {
    fetchAIStatus()
      .then(setStatus)
      .catch(() => setStatus({ configured: false, source: "none" }));
  }, []);

  useEffect(() => {
    const fallback = defaultScenes(unit, classic);
    let restored: Record<Variant, Scene> = fallback.scenes;
    try {
      const stored = JSON.parse(localStorage.getItem(key) || "null");
      if (stored && typeof stored === "object") {
        const candidate = { ...fallback.scenes };
        for (const name of fallback.variants) {
          try {
            candidate[name] = validateScene(stored[name]);
          } catch {
            /* keep the reviewed default */
          }
        }
        restored = candidate;
      }
    } catch {
      /* use defaults */
    }
    setScenes(restored);
    const nextVariant = fallback.variants[0] || "explore";
    setVariant(nextVariant);
    setDraft(restored[nextVariant].curves[0].expression);
    setHistory([]);
    setError("");
    setShowAI(false);
    try {
      const chat = JSON.parse(
        localStorage.getItem(`${key}-chat`) || "[]",
      );
      setMessages(Array.isArray(chat) ? chat.slice(-20) : []);
    } catch {
      setMessages([]);
    }
    return () => {
      controller.current?.abort();
    };
  }, [unit, classic, key]);

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(scenes));
    } catch {
      /* localStorage may be unavailable */
    }
  }, [key, scenes]);

  useEffect(() => {
    try {
      localStorage.setItem(`${key}-chat`, JSON.stringify(messages.slice(-20)));
    } catch {
      /* ignore */
    }
  }, [key, messages]);

  useEffect(() => {
    const box = chatEnd.current?.parentElement;
    if (box) box.scrollTop = box.scrollHeight;
  }, [messages, busy]);

  const scene = scenes[variant] || scenes.explore;
  const info = caseInfo(unit, classic, variant);
  const staticCase = info.kind === "dirichlet";

  function commit(next: Scene, record = true) {
    try {
      const valid = validateScene(next);
      if (record) setHistory((current) => [...current.slice(-15), scene]);
      setScenes((current) => ({ ...current, [variant]: valid }));
      setDraft(valid.curves[0].expression);
      setError("");
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "图像配置不合法");
      return false;
    }
  }

  function rebuild(expression: string) {
    try {
      const next = makeScene(unit, expression, info.kind);
      next.xMin = scene.xMin;
      next.xMax = scene.xMax;
      next.yMin = scene.yMin;
      next.yMax = scene.yMax;
      next.x0 = scene.x0;
      next.h = scene.h;
      next.epsilon = scene.epsilon;
      next.delta = scene.delta;
      next.integralStart = scene.integralStart;
      next.integralEnd = scene.integralEnd;
      next.subdivisions = scene.subdivisions;
      next.order = scene.order;
      next.parameters = next.parameters.map(
        (parameter) =>
          scene.parameters.find((item) => item.name === parameter.name) ||
          parameter,
      );
      commit(next);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "表达式不合法");
    }
  }

  function setParameter(name: string, value: number) {
    commit({
      ...scene,
      parameters: scene.parameters.map((parameter) =>
        parameter.name === name ? { ...parameter, value } : parameter,
      ),
    });
  }

  function setField<K extends keyof Scene>(keyName: K, value: Scene[K]) {
    commit({ ...scene, [keyName]: value });
  }

  function undo() {
    const previous = history.at(-1);
    if (!previous) return;
    setScenes((current) => ({ ...current, [variant]: previous }));
    setDraft(previous.curves[0].expression);
    setHistory((current) => current.slice(0, -1));
    setError("");
  }

  function reset() {
    const fallback = defaults.scenes[variant];
    if (!fallback) return;
    setScenes((current) => ({ ...current, [variant]: fallback }));
    setDraft(fallback.curves[0].expression);
    setError("");
  }

  async function send(text = input) {
    if (!text.trim() || busy) return;
    const userText = text.trim();
    const nextMessages = [...messages, { role: "user" as const, content: userText }];
    setMessages(nextMessages);
    setInput("");
    setBusy(true);
    setError("");
    const request = new AbortController();
    controller.current = request;
    const currentId = ++requestId.current;
    try {
      const context = [
        "[教材学习上下文]",
        `章节：${unit.chapter}`,
        `知识点：${unit.title}（${unit.id}）`,
        `定义：${unit.definition}`,
        `当前案例：${info.title}`,
        `案例说明：${info.copy}`,
        "请优先解释；如果用户要求改图，返回修改后的完整 scene，否则 scene 为 null。不要改写教材定义或编造页码。",
      ].join("\n");
      const result = await requestPlotChange({
        message: `${context}\n\n用户：${userText}`,
        scene,
        history: messages.slice(-8),
        signal: request.signal,
        context: {
          conceptId: unit.id,
          chapter: unit.chapter,
          title: unit.title,
          definition: unit.definition,
          formula: unit.formula,
          case: info.title,
          caseClaim: info.claim,
          caseTags: info.tags,
          source: unit.source,
        },
      });
      if (!request.signal.aborted && requestId.current === currentId) {
        if (result.scene) commit(result.scene);
        setMessages([
          ...nextMessages,
          { role: "assistant", content: result.message },
        ]);
      }
    } catch (cause) {
      if (!request.signal.aborted) {
        setError(
          cause instanceof Error
            ? cause.message
            : "AI 暂时不可用，当前图像和输入已保留。",
        );
      }
    } finally {
      if (requestId.current === currentId) setBusy(false);
    }
  }

  function openAI() {
    setShowAI(true);
    if (!messages.length) {
      setInput("请解释当前定义和这张图的关系，并指出最值得观察的现象。");
    }
  }

  return (
    <section id="textbook-image" className={`embedded-figure ${expanded ? "expanded" : ""}`}>
      <div className="embedded-heading">
        <div>
          <span className="badge purple">
            <Sparkles size={13} /> 交互图像
          </span>
          <h3>{info.title}</h3>
          <p>{info.claim}</p>
        </div>
        <div className="embedded-actions">
          <button className="btn" onClick={openAI} id="textbook-ai-entry">
            <Bot size={14} /> 让 AI 修改这张图
          </button>
          <button
            className="btn"
            onClick={() => setExpanded((value) => !value)}
            aria-label={expanded ? "收起图像" : "展开图像"}
          >
            {expanded ? <X size={14} /> : <Expand size={14} />}
            {expanded ? "收起" : "展开"}
          </button>
        </div>
      </div>

      <div className="embedded-tabs" role="tablist" aria-label="正例反例切换">
        {defaults.variants.map((name) => (
          <button
            key={name}
            role="tab"
            aria-selected={variant === name}
            className={variant === name ? "active" : ""}
            onClick={() => {
              setVariant(name);
              setDraft(defaults.scenes[name].curves[0].expression);
              setError("");
            }}
          >
            {name === "positive" ? "正例" : name === "negative" ? "反例" : "我的探索"}
          </button>
        ))}
      </div>

      {staticCase ? (
        <div className="embedded-static">
          <strong>这个反例不能用有限浮点采样可靠绘制</strong>
          <p>{info.copy}</p>
          <p>Dirichlet 函数的有理/无理判断不是浮点图像能表达的；这里保留精确定义与结论，不伪造曲线。</p>
        </div>
      ) : (
        <div className="embedded-plot">
          <FunctionPlot
            scene={scene}
            onPoint={(x) => {
              if (!busy) commit({ ...scene, x0: x });
            }}
          />
        </div>
      )}

      <div className="embedded-controls">
        <div className="embedded-formula-row">
          <label>
            当前函数
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") rebuild(draft);
              }}
              aria-label="教材内嵌函数表达式"
              spellCheck={false}
            />
          </label>
          <button className="btn primary" onClick={() => rebuild(draft)} disabled={busy}>
            <Check size={14} /> 应用
          </button>
          <button className="btn" onClick={undo} disabled={!history.length}>
            <Undo2 size={14} /> 撤销
          </button>
          <button className="btn" onClick={reset}>
            <RotateCcw size={14} /> 恢复本例
          </button>
        </div>
        <details className="embedded-more">
          <summary>
            <SlidersHorizontal size={13} /> 更多设置
          </summary>
          <div className="embedded-range-grid">
            {(["xMin", "xMax", "yMin", "yMax"] as const).map((field) => (
              <label key={field}>
                {field === "xMin"
                  ? "x 下限"
                  : field === "xMax"
                    ? "x 上限"
                    : field === "yMin"
                      ? "y 下限"
                      : "y 上限"}
                <input
                  type="number"
                  value={scene[field]}
                  onChange={(event) =>
                    setField(field, Number(event.target.value))
                  }
                />
              </label>
            ))}
            {scene.mode !== "integral" && (
              <label>
                基准点 x₀
                <input
                  type="number"
                  value={scene.x0}
                  onChange={(event) => setField("x0", Number(event.target.value))}
                />
              </label>
            )}
            {scene.mode === "derivative" && (
              <label>
                差商步长 h
                <input
                  type="number"
                  step="0.01"
                  value={scene.h}
                  onChange={(event) => setField("h", Number(event.target.value))}
                />
              </label>
            )}
            {scene.mode === "integral" && (
              <>
                <label>
                  积分起点
                  <input
                    type="number"
                    value={scene.integralStart}
                    onChange={(event) =>
                      setField("integralStart", Number(event.target.value))
                    }
                  />
                </label>
                <label>
                  积分终点
                  <input
                    type="number"
                    value={scene.integralEnd}
                    onChange={(event) =>
                      setField("integralEnd", Number(event.target.value))
                    }
                  />
                </label>
                <label>
                  分割数
                  <input
                    type="number"
                    min={4}
                    max={200}
                    value={scene.subdivisions}
                    onChange={(event) =>
                      setField("subdivisions", Number(event.target.value))
                    }
                  />
                </label>
              </>
            )}
          </div>
          {scene.parameters.length > 0 && (
            <div className="embedded-parameters">
              {scene.parameters.map((parameter) => (
                <label key={parameter.name}>
                  {parameter.name} = {parameter.value}
                  <input
                    type="range"
                    min={parameter.min}
                    max={parameter.max}
                    step={(parameter.max - parameter.min) / 100}
                    value={parameter.value}
                    onChange={(event) =>
                      setParameter(parameter.name, Number(event.target.value))
                    }
                  />
                </label>
              ))}
            </div>
          )}
        </details>
        {error && (
          <div className="embedded-error" role="alert">
            {error}
          </div>
        )}
      </div>

      <div className="embedded-case-note">
        {!classic && (
          <p className="embedded-no-case">
            本节暂未提供经过审核的独立正反例；下面只保留可交互图像，不伪造案例。
          </p>
        )}
        <div className="embedded-tags">
          {info.tags.map((tag) => (
            <span className="badge teal" key={tag}>
              {tag}
            </span>
          ))}
        </div>
        <p>{info.copy}</p>
        <small>
          {classic?.repair ? `准确关系：${classic.repair}。` : ""}
          {unit.source && (
            <a href={unit.source} target="_blank" rel="noreferrer">
              资料来源 <ArrowRight size={11} />
            </a>
          )}
        </small>
      </div>

      {showAI && (
        <aside className="teaching-ai-panel" aria-label="与 AI 探讨本节">
          <div className="teaching-ai-head">
            <div>
              <span className="badge purple">
                <Bot size={13} /> 与 AI 探讨本节
              </span>
              <h3>正在讨论：{unit.title}</h3>
            </div>
            <button
              className="icon-button"
              onClick={() => setShowAI(false)}
              aria-label="关闭 AI 面板"
            >
              <X size={16} />
            </button>
          </div>
          <p className="teaching-ai-context">
            已带入当前定义、案例和图像；可以连续追问，也可以直接让 AI 改图。
          </p>
          {!status?.configured && (
            <AICredentialSettings
              status={status}
              compact
              onUpdated={() => {
                fetchAIStatus()
                  .then(setStatus)
                  .catch(() => setStatus({ configured: false }));
              }}
            />
          )}
          <div className="teaching-ai-messages" aria-live="polite">
            {messages.length === 0 && (
              <div className="teaching-ai-empty">
                <Sparkles size={18} />
                <p>问定义、问条件，或说“把函数换成 |x|，观察原点左右差商”。</p>
              </div>
            )}
            {messages.map((message, index) => (
              <div
                key={`${message.role}-${index}`}
                className={`teaching-ai-message ${message.role}`}
              >
                <small>{message.role === "user" ? "你" : "AI 导师"}</small>
                <p>{message.content}</p>
              </div>
            ))}
            {busy && <div className="teaching-ai-thinking">正在读本节上下文…</div>}
            {error && <div className="teaching-ai-error">{error}</div>}
            <div ref={chatEnd} />
          </div>
          <form
            className="teaching-ai-composer"
            onSubmit={(event) => {
              event.preventDefault();
              void send();
            }}
          >
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              rows={2}
              maxLength={4000}
              placeholder="例如：这个条件为什么不能去掉？ / 把函数换成 |x|…"
              onKeyDown={(event) => {
                if (
                  event.key === "Enter" &&
                  !event.shiftKey &&
                  !event.nativeEvent.isComposing
                ) {
                  event.preventDefault();
                  void send();
                }
              }}
            />
            <div>
              <span>
                {status?.configured
                  ? "解释与改图共用当前上下文"
                  : "接入 DeepSeek 后即可讨论"}
              </span>
              <button className="btn primary" disabled={busy || !input.trim()}>
                <ArrowRight size={14} /> 发送
              </button>
            </div>
          </form>
          <div className="teaching-ai-suggestions">
            {[
              "这个条件为什么不能去掉？",
              "把函数换成 |x|，观察原点左右差商。",
              "这张图和当前定义的关系是什么？",
            ].map((text) => (
              <button key={text} onClick={() => setInput(text)}>
                {text}
              </button>
            ))}
          </div>
          <button
            className="text-button teaching-practice-link"
            onClick={() => onNavigate("exercises")}
          >
            做本节练习 <ArrowRight size={12} />
          </button>
        </aside>
      )}
    </section>
  );
}
