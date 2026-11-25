import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Boxes,
  ChevronDown,
  Grid3X3,
  LoaderCircle,
  RotateCcw,
  Send,
  SlidersHorizontal,
  Sparkles,
  Undo2,
  Wand2,
} from "lucide-react";
import { apiUrl } from "../../../lib/api";
import { requestSurfaceChange } from "../api";
import { normalizeSurfaceScene } from "./engine";
import { SurfacePlot3D } from "./SurfacePlot3D";
import {
  defaultSurfaceScene,
  surfacePresets,
  type SurfacePalette,
  type SurfaceScene,
} from "./types";
import "./surface.css";

type ChatMessage = { role: "user" | "assistant"; content: string };

const STORAGE_SCENE = "axiom-surface-scene";
const STORAGE_CHAT = "axiom-surface-chat";

function readStoredScene(): SurfaceScene {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_SCENE) || "null");
    return stored ? normalizeSurfaceScene(stored) : defaultSurfaceScene;
  } catch {
    return defaultSurfaceScene;
  }
}

function readStoredChat(): ChatMessage[] {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_CHAT) || "[]");
    return Array.isArray(stored) ? stored.slice(-20) : [];
  } catch {
    return [];
  }
}

function persist(scene: SurfaceScene, messages: ChatMessage[]) {
  try {
    localStorage.setItem(STORAGE_SCENE, JSON.stringify(scene));
    localStorage.setItem(STORAGE_CHAT, JSON.stringify(messages.slice(-20)));
  } catch {
    /* browsing remains available */
  }
}

export default function SurfaceWorkspace() {
  const [scene, setScene] = useState<SurfaceScene>(readStoredScene);
  const [draft, setDraft] = useState(() => readStoredScene().expression);
  const [undo, setUndo] = useState<SurfaceScene[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>(readStoredChat);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState<{
    configured: boolean;
    provider_label?: string;
    model?: string;
  } | null>(null);
  const chatEnd = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch(apiUrl("/api/ai/status"))
      .then((response) => {
        if (!response.ok) throw new Error();
        return response.json();
      })
      .then(setStatus)
      .catch(() => setStatus({ configured: false }));
  }, []);

  useEffect(() => {
    const container = chatEnd.current?.parentElement;
    if (container) container.scrollTop = container.scrollHeight;
  }, [messages, busy]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_CHAT, JSON.stringify(messages.slice(-20)));
    } catch {
      /* ignore */
    }
  }, [messages]);

  const commit = (
    next: SurfaceScene,
    options: { record?: boolean; message?: string } = {},
  ) => {
    const normalized = normalizeSurfaceScene(next);
    if (options.record !== false) {
      setUndo((history) => [...history.slice(-14), scene]);
    }
    setScene(normalized);
    setDraft(normalized.expression);
    persist(normalized, messages);
    if (options.message) setError("");
  };

  const updateView = (patch: Partial<SurfaceScene["view"]>) => {
    setScene((current) => {
      const next = normalizeSurfaceScene({
        ...current,
        view: { ...current.view, ...patch },
      });
      persist(next, messages);
      return next;
    });
  };

  const updateDisplay = (patch: Partial<SurfaceScene["display"]>) => {
    setScene((current) => {
      const next = normalizeSurfaceScene({
        ...current,
        display: { ...current.display, ...patch },
      });
      persist(next, messages);
      return next;
    });
  };

  const updateRange = (patch: Partial<SurfaceScene>) => {
    try {
      const next = normalizeSurfaceScene({ ...scene, ...patch });
      setScene(next);
      persist(next, messages);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "范围不合法");
    }
  };

  const applyExpression = () => {
    try {
      const next = normalizeSurfaceScene({ ...scene, expression: draft });
      commit(next);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "表达式不合法");
    }
  };

  const undoLast = () => {
    const previous = undo[undo.length - 1];
    if (!previous) return;
    setScene(previous);
    setDraft(previous.expression);
    setUndo(undo.slice(0, -1));
    persist(previous, messages);
  };

  const send = async () => {
    const text = input.trim();
    if (!text || busy) return;
    setBusy(true);
    setError("");
    const userMessage: ChatMessage = { role: "user", content: text };
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setInput("");
    try {
      const result = await requestSurfaceChange({
        message: text,
        scene,
        history: messages.slice(-8),
      });
      const assistant: ChatMessage = {
        role: "assistant",
        content: result.message,
      };
      setMessages([...nextMessages, assistant]);
      if (result.scene) {
        const next = normalizeSurfaceScene(result.scene);
        commit(next, { message: "已应用 AI 修改" });
      }
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "AI 暂时无法修改三维场景",
      );
    } finally {
      setBusy(false);
    }
  };

  const applyPreset = (expression: string) => {
    try {
      commit(normalizeSurfaceScene({ ...scene, expression }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "预设不可用");
    }
  };

  return (
    <div className="surface-page">
      <div className="page-heading surface-heading">
        <div>
          <span className="badge purple">
            <Boxes size={13} /> 三维可视化 · 人机协作
          </span>
          <h1>看见曲面，也看见关系。</h1>
          <p>
            拖动旋转、滚轮缩放，或直接告诉 AI 你想看的曲面、范围和视角。
          </p>
        </div>
        <div className="button-row">
          <button
            className="btn"
            disabled={!undo.length}
            onClick={undoLast}
            title="撤销上一次人工或 AI 修改"
          >
            <Undo2 size={15} /> 撤销
          </button>
          <button
            className="btn"
            onClick={() => {
              commit(defaultSurfaceScene);
              setMessages([]);
            }}
          >
            <RotateCcw size={15} /> 重置
          </button>
        </div>
      </div>

      <div className="surface-layout">
        <aside className="card surface-controls">
          <div className="surface-section-head">
            <span className="badge dark">
              <SlidersHorizontal size={13} /> 人工控制
            </span>
            <small>{scene.view.azimuth.toFixed(0)}° / {scene.view.elevation.toFixed(0)}°</small>
          </div>
          <label className="surface-label" htmlFor="surface-expression">
            曲面 z = f(x, y)
          </label>
          <textarea
            id="surface-expression"
            className="surface-expression"
            value={draft}
            rows={2}
            spellCheck={false}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                applyExpression();
              }
            }}
          />
          <button className="btn primary surface-apply" onClick={applyExpression}>
            <Wand2 size={15} /> 应用曲面
          </button>

          <div className="surface-presets">
            {surfacePresets.map((preset) => (
              <button
                key={preset.id}
                className={scene.expression === preset.expression ? "selected" : ""}
                onClick={() => applyPreset(preset.expression)}
              >
                {preset.label}
              </button>
            ))}
          </div>

          <div className="surface-control-grid">
            <label>
              x 最小
              <input
                type="number"
                value={scene.xMin}
                step={0.2}
                onChange={(event) =>
                  updateRange({ xMin: Number(event.target.value) })
                }
              />
            </label>
            <label>
              x 最大
              <input
                type="number"
                value={scene.xMax}
                step={0.2}
                onChange={(event) =>
                  updateRange({ xMax: Number(event.target.value) })
                }
              />
            </label>
            <label>
              y 最小
              <input
                type="number"
                value={scene.yMin}
                step={0.2}
                onChange={(event) =>
                  updateRange({ yMin: Number(event.target.value) })
                }
              />
            </label>
            <label>
              y 最大
              <input
                type="number"
                value={scene.yMax}
                step={0.2}
                onChange={(event) =>
                  updateRange({ yMax: Number(event.target.value) })
                }
              />
            </label>
          </div>

          <label className="surface-slider">
            <span>网格密度 <b>{scene.resolution}</b></span>
            <input
              type="range"
              min={10}
              max={56}
              step={1}
              value={scene.resolution}
              onChange={(event) =>
                updateRange({ resolution: Number(event.target.value) })
              }
            />
          </label>
          <label className="surface-slider">
            <span>高度缩放 <b>{scene.view.heightScale.toFixed(1)}×</b></span>
            <input
              type="range"
              min={0.2}
              max={3}
              step={0.1}
              value={scene.view.heightScale}
              onChange={(event) =>
                updateView({ heightScale: Number(event.target.value) })
              }
            />
          </label>
          <label className="surface-slider">
            <span>不透明度 <b>{Math.round(scene.display.opacity * 100)}%</b></span>
            <input
              type="range"
              min={0.2}
              max={1}
              step={0.02}
              value={scene.display.opacity}
              onChange={(event) =>
                updateDisplay({ opacity: Number(event.target.value) })
              }
            />
          </label>

          <div className="surface-toggles">
            <label>
              <input
                type="checkbox"
                checked={scene.display.wireframe}
                onChange={(event) =>
                  updateDisplay({ wireframe: event.target.checked })
                }
              />
              <Grid3X3 size={14} /> 网格线
            </label>
            <label>
              <input
                type="checkbox"
                checked={scene.display.showAxes}
                onChange={(event) =>
                  updateDisplay({ showAxes: event.target.checked })
                }
              />
              坐标轴
            </label>
          </div>

          <div className="surface-palette">
            {(
              [
                ["violet", "紫"],
                ["teal", "青"],
                ["amber", "琥珀"],
                ["mono", "灰"],
              ] as [SurfacePalette, string][]
            ).map(([value, label]) => (
              <button
                key={value}
                className={scene.display.palette === value ? "selected" : ""}
                onClick={() => updateDisplay({ palette: value })}
              >
                <i className={`palette-dot ${value}`} />
                {label}
              </button>
            ))}
          </div>
        </aside>

        <section className="surface-main">
          <div className="surface-chart-card">
            <div className="surface-chart-heading">
              <div>
                <span className="badge">当前曲面</span>
                <strong>z = {scene.expression}</strong>
              </div>
              <div className="surface-view-pills">
                <span>方位 {scene.view.azimuth.toFixed(0)}°</span>
                <span>俯仰 {scene.view.elevation.toFixed(0)}°</span>
                <span>缩放 {scene.view.zoom.toFixed(2)}×</span>
              </div>
            </div>
            <SurfacePlot3D
              scene={scene}
              onViewChange={updateView}
              onResetView={() =>
                updateView({ azimuth: 45, elevation: 28, zoom: 1 })
              }
            />
            <div className="surface-chart-foot">
              <span>拖动旋转 · 滚轮缩放 · 双击复位</span>
              <button
                className="text-button"
                onClick={() =>
                  updateView({ azimuth: 45, elevation: 28, zoom: 1 })
                }
              >
                恢复默认视角
              </button>
            </div>
          </div>
          {error && (
            <div className="info-strip warning surface-error" role="alert">
              {error}
            </div>
          )}
        </section>

        <aside className="card surface-chat">
          <div className="surface-chat-heading">
            <div>
              <span className="badge purple">
                <Sparkles size={13} /> AI 协作
              </span>
              <h3>让 AI 改变这张曲面</h3>
            </div>
            <span className={status?.configured ? "fw-online" : "fw-offline"}>
              <i />
              {status?.configured
                ? `${status.provider_label || "模型"} · ${status.model || ""}`
                : "AI 未连接"}
            </span>
          </div>
          <div className="surface-chat-messages" aria-live="polite">
            {!messages.length && (
              <div className="surface-chat-empty">
                <Sparkles size={22} />
                <p>
                  试试说：“把曲面换成 sin(x)cos(y)”“把视角转到 60°/35°”
                  或“高度放大 1.5 倍”。
                </p>
              </div>
            )}
            {messages.map((message, index) => (
              <div
                className={`surface-message ${message.role}`}
                key={`${message.role}-${index}`}
              >
                <small>{message.role === "user" ? "你" : "AI 助手"}</small>
                <p>{message.content}</p>
              </div>
            ))}
            {busy && (
              <div className="surface-thinking">
                <LoaderCircle size={15} /> 正在理解曲面与视角…
              </div>
            )}
            <div ref={chatEnd} />
          </div>
          <div className="surface-quick-prompts">
            {[
              "换成 sin(x)cos(y)，保留范围",
              "把视角转到 60° / 35°",
              "换成马鞍面并显示网格",
            ].map((prompt) => (
              <button key={prompt} onClick={() => setInput(prompt)}>
                {prompt}
                <ArrowRight size={12} />
              </button>
            ))}
          </div>
          <form
            className="surface-composer"
            onSubmit={(event) => {
              event.preventDefault();
              void send();
            }}
          >
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="例如：把高度放大到 1.5 倍，并换成高斯曲面…"
              rows={3}
              maxLength={2000}
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
            <div className="surface-composer-foot">
              <span>
                {status?.configured
                  ? "Enter 发送 · Shift+Enter 换行"
                  : "配置 AI 后即可对话；人工控制仍可用"}
              </span>
              <button
                className="btn primary"
                type="submit"
                disabled={busy || !input.trim()}
              >
                {busy ? <LoaderCircle size={15} /> : <Send size={15} />}
                发送
              </button>
            </div>
          </form>
        </aside>
      </div>
    </div>
  );
}
