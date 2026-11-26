import { useState } from "react";
import { Boxes, Grid3X3, RotateCcw, SlidersHorizontal, Undo2, Wand2 } from "lucide-react";
import { normalizeSurfaceScene } from "./engine";
import { applySurfaceActions } from "./companionScene";
import { useWorkspaceEndpoint } from "../../../app/useWorkspaceEndpoint";
import { sceneRange } from "../scene/companionActions";
import { SurfacePlot3D } from "./SurfacePlot3D";
import {
  defaultSurfaceScene,
  surfacePresets,
  type SurfacePalette,
  type SurfaceScene,
} from "./types";
import "./surface.css";

const STORAGE_SCENE = "axiom-surface-scene";

function readStoredScene(): SurfaceScene {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_SCENE) || "null");
    return stored ? normalizeSurfaceScene(stored) : defaultSurfaceScene;
  } catch {
    return defaultSurfaceScene;
  }
}

function persist(scene: SurfaceScene) {
  try {
    localStorage.setItem(STORAGE_SCENE, JSON.stringify(scene));
  } catch {
    /* browsing remains available */
  }
}

export default function SurfaceWorkspace() {
  const [scene, setScene] = useState<SurfaceScene>(readStoredScene);
  const [draft, setDraft] = useState(scene.expression);
  const [undo, setUndo] = useState<SurfaceScene[]>([]);
  const [error, setError] = useState("");

  const commit = (
    next: SurfaceScene,
    options: { record?: boolean; keepDraft?: boolean } = {},
  ) => {
    const normalized = normalizeSurfaceScene(next);
    if (options.record !== false) {
      setUndo(history => [...history.slice(-14), scene]);
    }
    setScene(normalized);
    if (!options.keepDraft) setDraft(normalized.expression);
    persist(normalized);
    setError("");
  };

  const dirty = draft !== scene.expression;
  useWorkspaceEndpoint("surface", JSON.stringify([scene, draft]), {
    query: () => ({
      surface_scene: {
        expression: scene.expression,
        range: sceneRange(scene),
        view: scene.view,
      },
    }),
    command: (actions) => {
      if (dirty) return { reason: "请先应用正在编辑的曲面公式" };
      return applySurfaceActions(scene, actions, next => commit(next, { record: true }));
    },
  });

  const updateView = (patch: Partial<SurfaceScene["view"]>, record = true) => {
    commit({ ...scene, view: { ...scene.view, ...patch } }, { record, keepDraft: true });
  };

  const updateDisplay = (patch: Partial<SurfaceScene["display"]>) => {
    commit({ ...scene, display: { ...scene.display, ...patch } }, { keepDraft: true });
  };

  const updateRange = (patch: Partial<SurfaceScene>) => {
    try {
      commit({ ...scene, ...patch }, { keepDraft: true });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "范围不合法");
    }
  };

  const applyExpression = () => {
    try {
      commit({ ...scene, expression: draft });
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
    persist(previous);
    setError("");
  };

  const applyPreset = (expression: string) => {
    try {
      commit({ ...scene, expression });
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
            拖动旋转、滚轮缩放，或在右侧向 Hiyori 描述想观察的曲面、范围和视角。
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
            onClick={() => commit(defaultSurfaceScene)}
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
              onViewChange={patch => updateView(patch, false)}
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

      </div>
    </div>
  );
}
