import { useEffect, useRef, useState } from "react";
import { LoaderCircle, MessageCircle, Send, X } from "lucide-react";
import {
  discussExercise,
  type DiscussionTurn,
} from "./api";
import "./discussion.css";

export function ExerciseDiscussion({
  exerciseId,
  answer,
  messages,
  setMessages,
  onClose,
}: {
  exerciseId: string;
  answer: string;
  messages: DiscussionTurn[];
  setMessages: (messages: DiscussionTurn[]) => void;
  onClose: () => void;
}) {
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const started = useRef(false);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "nearest" });
  }, [messages, busy]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (messages.length) return;
    void (async () => {
      setBusy(true);
      setError("");
      try {
        const result = await discussExercise({
          exercise_id: exerciseId,
          answer_text: answer,
          message:
            "请先看我的当前草稿，指出一个最值得改进的点，并问我一个能推进证明的问题。",
          history: [],
        });
        setMessages([{ role: "assistant", content: result.message }]);
      } catch (cause) {
        setError(
          cause instanceof Error
            ? cause.message
            : "AI 讨论暂时不可用，请先接入 DeepSeek。",
        );
      } finally {
        setBusy(false);
      }
    })();
  }, [answer, exerciseId, messages.length, setMessages]);

  const send = async () => {
    const text = input.trim();
    if (!text || busy) return;
    const userTurn: DiscussionTurn = { role: "user", content: text };
    const next = [...messages, userTurn];
    setMessages(next);
    setInput("");
    setBusy(true);
    setError("");
    try {
      const result = await discussExercise({
        exercise_id: exerciseId,
        answer_text: answer,
        message: text,
        history: messages.slice(-8),
      });
      setMessages([
        ...next,
        { role: "assistant", content: result.message },
      ]);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "AI 讨论暂时不可用，请稍后重试。",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="exercise-discussion" aria-label="AI 讨论">
      <div className="exercise-discussion-head">
        <div>
          <span className="badge purple">
            <MessageCircle size={13} /> 讨论中
          </span>
          <h3>先聊清楚，再提交答案</h3>
          <p>AI 只追问和提示，不会在这里提交或打分。</p>
        </div>
        <button className="icon-button" aria-label="关闭讨论" onClick={onClose}>
          <X size={16} />
        </button>
      </div>
      <div className="exercise-discussion-messages" aria-live="polite">
        {!messages.length && !busy && (
          <div className="exercise-discussion-empty">
            <MessageCircle size={20} />
            <p>说说你卡在哪里，或者让 AI 看你的草稿。</p>
          </div>
        )}
        {messages.map((message, index) => (
          <div
            className={`exercise-discussion-message ${message.role}`}
            key={`${message.role}-${index}`}
          >
            <small>{message.role === "user" ? "你" : "AI 导师"}</small>
            <p>{message.content}</p>
          </div>
        ))}
        {busy && (
          <div className="exercise-discussion-thinking">
            <LoaderCircle size={14} /> 正在读你的思路…
          </div>
        )}
        {error && <div className="exercise-discussion-error">{error}</div>}
        <div ref={bottom} />
      </div>
      <form
        className="exercise-discussion-composer"
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
          placeholder="例如：我卡在怎么选 δ；或者：帮我看看这个反例对不对…"
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
          <span>讨论不提交；点“提交答案”才进入 AI 批改</span>
          <button className="btn primary" type="submit" disabled={busy || !input.trim()}>
            {busy ? <LoaderCircle size={14} /> : <Send size={14} />}
            发送
          </button>
        </div>
      </form>
    </section>
  );
}
