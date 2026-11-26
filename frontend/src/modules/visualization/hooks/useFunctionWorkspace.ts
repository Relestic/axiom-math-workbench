import { useEffect, useMemo, useState } from "react";
import {
  applyFunctionScene,
  FUNCTION_MODES,
  applyFunctionActions,
  functionParameterHints,
  loadFunctionScene,
  type Scene,
} from "../scene/functionScene";
import { analyze } from "../../../pages/FunctionPlot";
import { useWorkspaceEndpoint } from "../../../app/useWorkspaceEndpoint";
import type { WorkspaceAction } from "../../../app/workspaceEndpoints";
import { sceneRange } from "../scene/companionActions";

export type FunctionWorkspaceProps = {
  onNavigate: (page: string) => void;
  onSaveNote: (text: string) => void;
  notify: (text: string) => void;
};

export function useFunctionWorkspace(props: FunctionWorkspaceProps) {
  const [scene, setScene] = useState<Scene>(loadFunctionScene);
  const [draft, setDraft] = useState<Scene>(scene);
  const [history, setHistory] = useState<Scene[]>([]);
  const [error, setError] = useState("");
  const [classic, setClassic] = useState(false);
  const math = useMemo(() => analyze(scene), [scene]);

  useEffect(() => {
    localStorage.removeItem("axiom-explore-request");
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("axiom-function-scene", JSON.stringify(scene));
    } catch {
      setError("浏览器无法保存记录，请导出或复制重要内容");
    }
  }, [scene]);

  function commit(value: unknown, label?: string): boolean {
    try {
      const next = applyFunctionScene(value);
      setHistory((current) => [...current.slice(-19), scene]);
      setScene(next);
      setDraft(next);
      setError("");
      if (label) props.notify(label);
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "配置有误");
      return false;
    }
  }

  function patch(value: Partial<Scene>) {
    commit({ ...scene, ...value });
  }

  function undo() {
    const previous = history.at(-1);
    if (previous) {
      setScene(previous);
      setDraft(previous);
      setHistory((current) => current.slice(0, -1));
      setError("");
      props.notify("已恢复上一个函数配置");
    }
  }

  function save() {
    props.onSaveNote(
      `函数探索：${scene.curves.map((curve) => `${curve.label}=${curve.expression}`).join("；")}\n参数：${scene.parameters.map((parameter) => `${parameter.name}=${parameter.value}`).join("，") || "无"}\n工具：${FUNCTION_MODES.find((mode) => mode[0] === scene.mode)?.[1]}；x₀=${scene.x0}；显示区间[${scene.xMin},${scene.xMax}]`,
    );
  }

  const dirty = JSON.stringify(draft) !== JSON.stringify(scene);
  function onBoardActions(actions: readonly WorkspaceAction[]) {
    if (dirty) return { reason: "请先应用正在编辑的公式或范围" };
    const result = applyFunctionActions(scene, actions, commit);
    if (classic && (result === true || result === "unchanged")) setClassic(false);
    return result;
  }

  useWorkspaceEndpoint(
    classic ? null : "explore",
    JSON.stringify([scene, draft]),
    {
      query: () => ({
        function_scene: {
          mode: scene.mode,
          active_expression: math.curve.expression,
          curves: scene.curves.map(({ id, label, expression, domainMin, domainMax }) =>
            ({ id, label, expression, domainMin, domainMax })),
          parameters: scene.parameters,
          range: sceneRange(scene),
          controls: dirty ? {} : functionParameterHints(scene),
        },
      }),
      command: onBoardActions,
    },
  );
  const setCurve = (id: string, value: Partial<Scene["curves"][number]>) =>
    setDraft((current) => ({
      ...current,
      curves: current.curves.map((curve) =>
        curve.id === id ? { ...curve, ...value } : curve,
      ),
    }));

  return {
    scene,
    draft,
    setDraft,
    history,
    error,
    setError,
    classic,
    setClassic,
    onBoardActions,
    math,
    dirty,
    commit,
    patch,
    undo,
    save,
    setCurve,
  };
}

export type FunctionWorkspaceState = ReturnType<typeof useFunctionWorkspace>;
