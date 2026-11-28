import { useEffect, useRef, useState } from "react";
import {
  clearKey,
  keyError,
  saveKey,
  testKey,
} from "./api";
import { useAIConnection } from "./connection";
import { codexEfforts, providerModels, providerLabels, type AIProvider, type CodexEffort } from "./models";

export function aiStatusLabel(state: "ready" | "unset" | "error") {
  return { ready: "已就绪", unset: "未配置", error: "异常" }[state];
}

export function DeepSeekSettings() {
  const { status, available, failed, setFailed, refresh } = useAIConnection();
  const savedProvider = status?.provider || "deepseek";
  const savedEffort: CodexEffort = status?.reasoning_effort || "auto";
  const [provider, setProvider] = useState<AIProvider>(savedProvider);
  const [choice, setChoice] = useState("");
  const [custom, setCustom] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [effort, setEffort] = useState<CodexEffort>(savedEffort);
  const model = choice === ":custom" ? custom.trim() : choice;
  const label = providerLabels[provider];
  const isCodex = provider === "codex";
  const savedEndpoint = provider === savedProvider && baseUrl.trim().replace(/\/+$/, "") === (status?.base_url || "") &&
    (!isCodex || effort === savedEffort);
  const keyInput = useRef<HTMLInputElement>(null);
  const [hasKey, setHasKey] = useState(false);
  const [pending, setPending] = useState<"save" | "test" | "clear" | null>(
    null,
  );
  const [feedback, setFeedback] = useState<{ text: string; error?: boolean }>();
  function selectProvider(next: AIProvider) {
    const saved = next === savedProvider;
    const presets = providerModels[next];
    const value = (saved && status?.model) || presets[0];
    setProvider(next);
    setChoice(presets.includes(value) ? value : ":custom");
    setCustom(presets.includes(value) ? "" : value);
    setBaseUrl((saved && status?.base_url) || "");
    setEffort(saved ? savedEffort : "auto");
    if (keyInput.current) keyInput.current.value = "";
    setHasKey(false);
  }
  useEffect(() => {
    selectProvider(savedProvider);
  }, [savedProvider, savedEffort, status?.model, status?.base_url, status?.configured]);

  async function run(action: "save" | "test" | "clear") {
    if (pending) return;
    const key = keyInput.current?.value.trim() || "";
    setPending(action);
    setFeedback(undefined);
    try {
      if (action === "save") await saveKey(model, key, provider, baseUrl, effort);
      if (action === "test") await testKey();
      if (action === "clear") await clearKey();
      if (keyInput.current) keyInput.current.value = "";
      setHasKey(false);
      setFailed(false);
      setFeedback({
        text: {
          save: `${label} 设置已保存。`,
          test: `${label} 连接测试成功。`,
          clear: isCodex ? "本机 Codex 配置已清除。" : `个人 ${label} Key 已清除。`,
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
          provider,
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
            提供商
            <select className="text-input" aria-label="提供商" value={provider} disabled={!!pending}
              onChange={(event) => {
                setFeedback(undefined);
                selectProvider(event.target.value as AIProvider);
              }}>
              <option value="deepseek">DeepSeek</option>
              <option value="openai">ChatGPT (OpenAI)</option>
              <option value="codex">{providerLabels.codex}</option>
            </select>
          </label>
          {isCodex ? <>
            <p className="muted">无需填写 API Key · 直接调用这台电脑已登录的 Codex CLI（支持看图识公式，单次响应约需数秒）。</p>
            {status?.codex_detected === false && <p role="status">当前未在本机检测到 Codex CLI，请先安装并登录 Codex。</p>}
          </> : <label className="field-label">
            {status?.configured && savedEndpoint ? "更换 " : ""}{provider === "openai" ? "OpenAI" : label} API Key
            <input
              ref={keyInput}
              className="text-input"
              type="password"
              autoComplete="off"
              spellCheck={false}
              maxLength={512}
              onChange={(event) => setHasKey(!!event.target.value.trim())}
              placeholder={
                status?.configured && savedEndpoint ? "留空可保留当前 Key" : "输入个人 API Key"
              }
              disabled={!!pending}
            />
          </label>}
          <label className="field-label">
            模型
            <select
              className="text-input"
              aria-label="模型"
              value={choice}
              disabled={!!pending}
              onChange={(event) => setChoice(event.target.value)}
            >
              {providerModels[provider].map((id) => <option key={id} value={id}>
                {isCodex && id === "auto" ? "auto（跟随本机 Codex 默认模型）" : id}
              </option>)}
              {provider !== "deepseek" && <option value=":custom">自定义模型</option>}
            </select>
          </label>
          {choice === ":custom" && <label className="field-label">
            自定义模型名称
            <input className="text-input" value={custom} required maxLength={80}
              pattern="[a-zA-Z0-9._\-]{2,80}" title="2–80 个字母、数字、点、下划线或连字符"
              disabled={!!pending} onChange={(event) => setCustom(event.target.value)} />
          </label>}
          {isCodex && <label className="field-label">
            思考强度
            <select className="text-input" aria-label="思考强度" value={effort} disabled={!!pending}
              onChange={(event) => setEffort(event.target.value as CodexEffort)}>
              {codexEfforts.map(([id, text]) => <option key={id} value={id}>{text}</option>)}
            </select>
          </label>}
          {!isCodex && <label className="field-label">
            自定义 HTTPS Base URL（可选）
            <input type="url" className="text-input" value={baseUrl} pattern="https://.+" maxLength={2048}
              placeholder={provider === "openai" ? "https://api.openai.com/v1" : "https://api.deepseek.com"}
              disabled={!!pending} onChange={(event) => setBaseUrl(event.target.value)} />
          </label>}
          {provider === savedProvider && status?.migrated_from && (
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
                !model || (!isCodex && !hasKey && (!status?.configured || !savedEndpoint || model === status.model))
              }
            >
              {pending === "save" ? "正在保存…" : "保存"}
            </button>
            <button
              className="btn"
              type="button"
              disabled={!!pending || hasKey || !status?.configured || !savedEndpoint || model !== status.model}
              onClick={() => void run("test")}
            >
              {pending === "test" ? "正在测试…" : "测试连接"}
            </button>
            <button
              className="btn"
              type="button"
              disabled={
                !!pending || provider !== savedProvider || (!status?.configured && status?.state !== "error")
              }
              onClick={() => {
                if (window.confirm(isCodex ? "清除本机 Codex 配置？" : `清除本机保存的 ${label} Key？`))
                  void run("clear");
              }}
            >
              {isCodex ? "清除配置" : "清除 Key"}
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
