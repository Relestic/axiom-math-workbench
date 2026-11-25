import { useEffect, useMemo, useRef, useState } from "react";
import {
  applyFunctionScene,
  FUNCTION_MODES,
  loadFunctionScene,
  type Scene,
} from "../scene/functionScene";
import { requestPlotChange, testAIConnection } from "../api";
import { useAIConnection } from "../../ai/connection";
import { analyze } from "../../../pages/FunctionPlot";

export type FunctionWorkspaceProps = {
  onNavigate: (page: string) => void;
  onSaveNote: (text: string) => void;
  notify: (text: string) => void;
};

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

function loadMessages(): ChatMessage[] {
  try {
    const value = JSON.parse(
      localStorage.getItem("axiom-function-chat") || "[]",
    );
    return Array.isArray(value)
      ? value
          .filter(
            (message) =>
              message &&
              ["user", "assistant"].includes(message.role) &&
              typeof message.content === "string",
          )
          .slice(-20)
      : [];
  } catch {
    return [];
  }
}

export function useFunctionWorkspace(props: FunctionWorkspaceProps) {
  const [scene, setScene] = useState<Scene>(loadFunctionScene);
  const [draft, setDraft] = useState<Scene>(loadFunctionScene);
  const [history, setHistory] = useState<Scene[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>(loadMessages);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [settings, setSettings] = useState(false);
  const [classic, setClassic] = useState(false);
  const { effective: status, refresh: refreshStatus } = useAIConnection();
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState("");
  const controller = useRef<AbortController | null>(null);
  const chatEnd = useRef<HTMLDivElement>(null);
  const math = useMemo(() => analyze(scene), [scene]);

  const testConnection = async () => {
    setTesting(true);
    setTestResult("");
    try {
      const result = await testAIConnection();
      setTestResult(
        `连接成功：${result.provider_label} · ${result.model} · ${result.latency_ms} ms`,
      );
      refreshStatus();
    } catch (cause) {
      setTestResult(
        cause instanceof Error ? cause.message : "连接测试失败，请检查密钥",
      );
    } finally {
      setTesting(false);
    }
  };

  useEffect(() => {
    localStorage.removeItem("axiom-explore-request");
    return () => controller.current?.abort();
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("axiom-function-scene", JSON.stringify(scene));
      localStorage.setItem(
        "axiom-function-chat",
        JSON.stringify(messages.slice(-20)),
      );
    } catch {
      setError("浏览器无法保存记录，请导出或复制重要内容");
    }
  }, [scene, messages]);

  useEffect(() => {
    const container = chatEnd.current?.parentElement;
    if (container) container.scrollTop = container.scrollHeight;
  }, [messages, busy]);

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

  async function send(value = input) {
    if (!value.trim() || busy) return;
    if (JSON.stringify(draft) !== JSON.stringify(scene)) {
      setError("请先应用正在编辑的公式与范围，再让 AI 继续修改。");
      return;
    }
    if (!status?.configured) {
      setSettings(true);
      setError(
        "请先连接模型，再通过自然语言修改函数。",
      );
      return;
    }
    const request = new AbortController();
    controller.current = request;
    setBusy(true);
    setError("");
    setInput("");
    const userMessage: ChatMessage = { role: "user", content: value.trim() };
    setMessages((current) => [...current, userMessage]);
    try {
      const result = await requestPlotChange({
        message: value.trim(),
        scene,
        history: messages.slice(-8),
        signal: request.signal,
      });
      if (request.signal.aborted) return;
      if (result.scene && !commit(result.scene))
        throw new Error("AI 返回的函数配置未通过校验");
      setMessages((current) => [
        ...current,
        { role: "assistant", content: result.message },
      ]);
    } catch (cause) {
      const message = request.signal.aborted
        ? "本次修改已取消，图像保持不变。"
        : cause instanceof Error
          ? cause.message
          : "请求失败，请重试";
      setError(message);
      setMessages((current) => [
        ...current,
        { role: "assistant", content: message },
      ]);
      setInput(value);
    } finally {
      if (controller.current === request) {
        controller.current = null;
        setBusy(false);
      }
    }
  }

  function save() {
    props.onSaveNote(
      `函数探索：${scene.curves.map((curve) => `${curve.label}=${curve.expression}`).join("；")}\n参数：${scene.parameters.map((parameter) => `${parameter.name}=${parameter.value}`).join("，") || "无"}\n工具：${FUNCTION_MODES.find((mode) => mode[0] === scene.mode)?.[1]}；x₀=${scene.x0}；显示区间[${scene.xMin},${scene.xMax}]`,
    );
  }

  const dirty = JSON.stringify(draft) !== JSON.stringify(scene);
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
    messages,
    input,
    setInput,
    busy,
    error,
    setError,
    settings,
    setSettings,
    classic,
    setClassic,
    status,
    testing,
    testResult,
    controller,
    chatEnd,
    math,
    dirty,
    commit,
    patch,
    undo,
    send,
    save,
    setCurve,
    refreshStatus,
    testConnection,
  };
}

export type FunctionWorkspaceState = ReturnType<typeof useFunctionWorkspace>;
