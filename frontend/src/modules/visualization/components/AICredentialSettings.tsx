import { useEffect, useState } from "react";
import {
  CheckCircle2,
  ExternalLink,
  KeyRound,
  LoaderCircle,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import {
  deleteAICredentials,
  saveAICredentials,
  testAIConnection,
  type AIStatus,
} from "../api";
import "./ai-settings.css";

type Model = "deepseek-chat" | "deepseek-reasoner";

export function AICredentialSettings({
  status,
  onUpdated,
  compact = false,
}: {
  status: AIStatus | null;
  onUpdated: () => void;
  compact?: boolean;
}) {
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState<Model>("deepseek-chat");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (status?.model === "deepseek-reasoner") setModel("deepseek-reasoner");
    else if (status?.model === "deepseek-chat") setModel("deepseek-chat");
  }, [status?.model]);

  const save = async () => {
    if (!apiKey.trim()) {
      setError("请先粘贴 DeepSeek API Key。");
      return;
    }
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await saveAICredentials({ api_key: apiKey.trim(), model });
      setApiKey("");
      setMessage("已保存。后续 AI 改图会使用你的 DeepSeek 账户。");
      onUpdated();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "保存失败，请重试。");
    } finally {
      setSaving(false);
    }
  };

  const test = async () => {
    setTesting(true);
    setError("");
    setMessage("");
    try {
      const result = await testAIConnection();
      setMessage(
        `连接成功：${result.provider_label} · ${result.model} · ${result.latency_ms} ms`,
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "连接测试失败。");
    } finally {
      setTesting(false);
    }
  };

  const remove = async () => {
    if (!window.confirm("移除后，AI 改图将回退到系统默认配置。继续？")) return;
    setSaving(true);
    setError("");
    try {
      await deleteAICredentials();
      setApiKey("");
      setMessage("已移除你的 Key。");
      onUpdated();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "移除失败。");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={`ai-credential-card ${compact ? "compact" : ""}`}>
      <div className="ai-credential-head">
        <span className="ai-credential-icon">
          <KeyRound size={16} />
        </span>
        <div>
          <strong>接入 DeepSeek</strong>
          <p>
            使用自己的 API Key，无需改服务器配置。密钥加密保存，前端只能看到末四位。
          </p>
        </div>
      </div>

      {status?.using_user_key ? (
        <div className="ai-key-connected">
          <CheckCircle2 size={15} />
          <span>
            已接入我的 Key · {status.model} · {status.key_hint || "…"}
          </span>
          <button
            className="text-button"
            onClick={() => void test()}
            disabled={testing || saving}
          >
            {testing ? "测试中…" : "测试连接"}
          </button>
          <button
            className="text-button danger"
            onClick={() => void remove()}
            disabled={saving}
          >
            <Trash2 size={12} /> 移除
          </button>
        </div>
      ) : (
        <div className="ai-key-source">
          {status?.configured
            ? "当前使用系统默认模型；保存自己的 Key 后会优先使用你的账户。"
            : "还没有可用的模型 Key。粘贴 DeepSeek Key 后即可使用 AI 改图。"}
          {status?.configured && (
            <button
              className="text-button"
              onClick={() => void test()}
              disabled={testing || saving}
            >
              {testing ? "测试中…" : "测试当前连接"}
            </button>
          )}
        </div>
      )}

      <div className="ai-key-form">
        <label>
          API Key
          <input
            type="password"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            placeholder="sk-..."
            autoComplete="off"
            spellCheck={false}
            aria-label="DeepSeek API Key"
          />
        </label>
        <label>
          模型
          <select
            value={model}
            onChange={(event) => setModel(event.target.value as Model)}
            aria-label="DeepSeek 模型"
          >
            <option value="deepseek-chat">deepseek-chat · 通用</option>
            <option value="deepseek-reasoner">deepseek-reasoner · 推理</option>
          </select>
        </label>
        <button
          className="btn primary"
          onClick={() => void save()}
          disabled={saving || !apiKey.trim()}
        >
          {saving ? <LoaderCircle size={14} /> : <ShieldCheck size={14} />}
          {saving ? "保存中…" : "保存 Key"}
        </button>
      </div>

      {message && (
        <p className="ai-key-message success" role="status">
          {message}
        </p>
      )}
      {error && (
        <p className="ai-key-message error" role="alert">
          {error}
        </p>
      )}

      {!compact && (
        <div className="ai-key-foot">
          <span>
            <ShieldCheck size={12} /> 服务端使用 Fernet 加密存储，接口不会回传明文。
          </span>
          <a
            href="https://platform.deepseek.com/api_keys"
            target="_blank"
            rel="noreferrer"
          >
            获取 DeepSeek Key <ExternalLink size={11} />
          </a>
        </div>
      )}
    </div>
  );
}
