import { useEffect, useRef, useState } from "react";
import {
  clearKey,
  keyError,
  saveKey,
  testKey,
  type DeepSeekModel,
} from "./api";
import { useAIConnection } from "./connection";
import { deepSeekModels } from "./models";

export function aiStatusLabel(state: "ready" | "unset" | "error") {
  return { ready: "已就绪", unset: "未配置", error: "异常" }[state];
}

export function DeepSeekSettings() {
  const { status, available, failed, setFailed, refresh } = useAIConnection();
  const [model, setModel] = useState<DeepSeekModel>(
    status?.model || deepSeekModels[0],
  );
  const keyInput = useRef<HTMLInputElement>(null);
  const [hasKey, setHasKey] = useState(false);
  const [pending, setPending] = useState<"save" | "test" | "clear" | null>(
    null,
  );
  const [feedback, setFeedback] = useState<{ text: string; error?: boolean }>();
  useEffect(() => {
    setModel(status?.model || deepSeekModels[0]);
  }, [status?.model]);

  async function run(action: "save" | "test" | "clear") {
    if (pending) return;
    const key = keyInput.current?.value.trim() || "";
    if (keyInput.current && action === "save") keyInput.current.value = "";
    if (action === "save") setHasKey(false);
    setPending(action);
    setFeedback(undefined);
    try {
      if (action === "save") await saveKey(model, key);
      if (action === "test") await testKey();
      if (action === "clear") await clearKey();
      setFailed(false);
      setFeedback({
        text: {
          save: "DeepSeek 设置已保存。",
          test: "DeepSeek 连接测试成功。",
          clear: "个人 DeepSeek Key 已清除。",
        }[action],
      });
    } catch (cause) {
      if (action === "test") setFailed(true);
      setFeedback({
        error: true,
        text: keyError(
          cause,
          {
            save: "保存失败，请检查本地服务后重试。",
            test: "连接测试失败，请检查本地服务后重试。",
            clear: "清除失败，请检查本地服务后重试。",
          }[action],
        ),
      });
    } finally {
      await refresh();
      setPending(null);
    }
  }

  return (
    <form
      className="local-settings-form"
      onSubmit={(event) => {
        event.preventDefault();
        void run("save");
      }}
    >
      <p className="muted">
        {available === true
          ? `状态 · ${aiStatusLabel(failed ? "error" : status?.state || "unset")}`
          : available === null
            ? "正在检查本地 AI 服务…"
            : "个人接入需要启动本地 Python 服务。"}
      </p>
      {available === false && (
        <button type="button" className="btn" onClick={() => void refresh()}>
          重新检查服务
        </button>
      )}
      {available === true && (
        <>
          <label className="field-label">
            {status?.configured ? "更换 DeepSeek API Key" : "DeepSeek API Key"}
            <input
              ref={keyInput}
              className="text-input"
              type="password"
              autoComplete="off"
              spellCheck={false}
              maxLength={512}
              onChange={(event) => setHasKey(!!event.target.value.trim())}
              placeholder={
                status?.configured ? "留空可保留当前 Key" : "输入个人 API Key"
              }
              disabled={!!pending}
            />
          </label>
          <label className="field-label">
            模型
            <select
              className="text-input"
              value={model}
              disabled={!!pending}
              onChange={(event) =>
                setModel(event.target.value as DeepSeekModel)
              }
            >
              {deepSeekModels.map((id) => <option key={id} value={id}>{id}</option>)}
            </select>
          </label>
          {status?.migrated_from && (
            <p className="muted">
              已将 {status.migrated_from} 映射为 {status.model}，可继续使用原有 Key。
            </p>
          )}
          <div className="button-row">
            <button
              className="btn primary"
              type="submit"
              disabled={
                !!pending ||
                (!hasKey && (!status?.configured || model === status.model))
              }
            >
              {pending === "save" ? "正在保存…" : "保存"}
            </button>
            <button
              className="btn"
              type="button"
              disabled={!!pending || !status?.configured}
              onClick={() => void run("test")}
            >
              {pending === "test" ? "正在测试…" : "测试连接"}
            </button>
            <button
              className="btn"
              type="button"
              disabled={
                !!pending || (!status?.configured && status?.state !== "error")
              }
              onClick={() => {
                if (window.confirm("清除本机保存的 DeepSeek Key？"))
                  void run("clear");
              }}
            >
              清除 Key
            </button>
          </div>
        </>
      )}
      {feedback && (
        <p role={feedback.error ? "alert" : "status"}>{feedback.text}</p>
      )}
    </form>
  );
}
