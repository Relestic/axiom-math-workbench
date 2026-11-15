import { useEffect, useRef, useState } from "react";
import { ArrowRight, Bot, Sparkles, X } from "lucide-react";
import {
  fetchAIStatus,
  requestReaderQuestion,
  type AIStatus,
} from "./api";
import { AICredentialSettings } from "../visualization/components/AICredentialSettings";
import "./reader.css";

export function ReaderAIPanel({
  open,
  onClose,
  documentName,
  pageIndex,
  pageCount,
  pageText,
  contextLabel,
  contextDescription,
  contextKey,
  sourceType,
  blockId,
  sectionTitle,
  documentId,
}: {
  open: boolean;
  onClose: () => void;
  documentName: string;
  pageIndex: number;
  pageCount: number;
  pageText: string;
  contextLabel?: string;
  contextDescription?: string;
  contextKey?: string;
  sourceType?: "pdf" | "docx";
  blockId?: string;
  sectionTitle?: string;
  documentId?: string;
}) {
  const [status, setStatus] = useState<AIStatus | null>(null);
  const [messages, setMessages] = useState<
    { role: "user" | "assistant"; content: string }[]
  >([]);
  const [input, setInput] = useState("");
  const [pasted, setPasted] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null);
  const requestId = useRef(0);
  const end = useRef<HTMLDivElement>(null);
  const hasText = pageText.trim().length >= 20;

  useEffect(() => {
    fetchAIStatus()
      .then(setStatus)
      .catch(() => setStatus({ configured: false, source: "none" }));
  }, []);

  useEffect(() => {
    controller.current?.abort();
    setMessages([]);
    setError("");
    setBusy(false);
    setPasted("");
  }, [documentName, pageIndex, contextKey]);

  useEffect(() => {
    const box = end.current?.parentElement;
    if (box) box.scrollTop = box.scrollHeight;
  }, [messages, busy]);

  if (!open) return null;

  async function send() {
    if (!input.trim() || busy) return;
    const question = input.trim();
    const next = [...messages, { role: "user" as const, content: question }];
    setMessages(next);
    setInput("");
    setBusy(true);
    setError("");
    const request = new AbortController();
    controller.current = request;
    const current = ++requestId.current;
    const selection =
      (window.getSelection()?.toString() || "").trim().slice(0, 4000) ||
      pasted.trim().slice(0, 4000);
    try {
      const result = await requestReaderQuestion({
        documentName,
        pageIndex,
        pageCount,
        pageText: pageText.slice(0, 20000),
        selectedText: selection,
        question,
        history: messages.slice(-8),
        signal: request.signal,
        sourceType,
        blockId,
        sectionTitle,
        documentId,
      });
      if (!request.signal.aborted && requestId.current === current) {
        setMessages([
          ...next,
          { role: "assistant", content: result.message },
        ]);
      }
    } catch (cause) {
      if (!request.signal.aborted) {
        setError(
          cause instanceof Error
            ? cause.message
            : "AI 暂时不可用；讲义、页码和输入均已保留。",
        );
      }
    } finally {
      if (requestId.current === current) setBusy(false);
    }
  }

  return (
    <aside className="reader-ai-panel" aria-label="与 AI 讨论本页">
      <div className="reader-ai-head">
        <div>
          <span className="badge purple">
            <Bot size={13} /> 与 AI 讨论本页
          </span>
          <h3>
            {contextLabel || `${documentName} · 第 ${pageIndex + 1} / ${pageCount} 页`}
          </h3>
        </div>
        <button className="icon-button" onClick={onClose} aria-label="关闭 AI 面板">
          <X size={17} />
        </button>
      </div>
      <p className="reader-ai-note">
        {contextDescription ||
          (hasText
            ? `已提取本页 ${pageText.trim().length} 字；请求只发送当前页和你的选段。`
            : "这一页没有可提取的文字（可能是扫描页）；请粘贴片段，AI 不会假装已读完整 PDF。")}
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
      <div className="reader-ai-messages" aria-live="polite">
        {messages.length === 0 && (
          <div className="reader-ai-empty">
            <Sparkles size={17} />
            <p>可以问本页的定义、公式条件或证明步骤；AI 只能依据本页文字与选段回答。</p>
          </div>
        )}
        {messages.map((message, index) => (
          <div
            className={`reader-ai-message ${message.role}`}
            key={`${message.role}-${index}`}
          >
            <small>{message.role === "user" ? "你" : "AI 阅读助手"}</small>
            <p>{message.content}</p>
          </div>
        ))}
        {busy && <div className="reader-ai-thinking">正在读当前页…</div>}
        {error && <div className="reader-ai-error">{error}</div>}
        <div ref={end} />
      </div>
      <details className="reader-selection-box">
        <summary>本页文字/粘贴选段</summary>
        {hasText ? (
          <pre>{pageText.slice(0, 12000)}</pre>
        ) : (
          <p>没有可提取文字。</p>
        )}
        <textarea
          value={pasted}
          onChange={(event) => setPasted(event.target.value)}
          rows={3}
          placeholder="可选：从原文复制一段贴在这里，作为本次讨论的选段。"
          maxLength={4000}
        />
      </details>
      <form
        className="reader-ai-composer"
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
      >
        <textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          rows={2}
          maxLength={2000}
          placeholder="例如：这一页的 δ 为什么可以依赖 x₀？"
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
              ? "只根据本页文字回答"
              : "接入 DeepSeek 后即可讨论"}
          </span>
          <button className="btn primary" disabled={busy || !input.trim()}>
            <ArrowRight size={14} /> 发送
          </button>
        </div>
      </form>
      <div className="reader-ai-suggestions">
        {[
          "请解释这一页的核心定义。",
          "这个定理用了哪些条件？",
          "这一页有哪些容易误读的地方？",
        ].map((text) => (
          <button key={text} onClick={() => setInput(text)}>
            {text}
          </button>
        ))}
      </div>
    </aside>
  );
}
