import { FunctionSquare, LoaderCircle, Send, Sparkles } from "lucide-react";
import { useRef } from "react";
import { MathPreview, MathText, SymbolBar } from "../../../components/Math";
import type { FunctionWorkspaceState } from "../hooks/useFunctionWorkspace";

export function AIChatPanel({ state }: { state: FunctionWorkspaceState }) {
  const chatInput = useRef<HTMLTextAreaElement>(null);
  return (
    <section className="card fw-chat">
      <div className="fw-chat-heading">
        <span className="tile-icon">
          <Sparkles size={18} />
        </span>
        <div>
          <h3>与 AI 一起改图</h3>
          <p>描述你想研究的函数与条件。支持连续追问，保留上下文。</p>
        </div>
        <span className="badge">
          {state.status?.configured ? "真实模型接口" : "等待配置"}
        </span>
      </div>
      <div className="fw-suggestions">
        {[
          "换成 sin(a*x)，让 a 在 0.5 到 5 之间变化，保留当前分析工具",
          "添加 exp(-x^2) 与当前函数比较，调整显示范围",
          "把当前函数改成分段函数：x<0 时为 -x，否则为 x^2",
        ].map((text) => (
          <button
            disabled={state.busy}
            key={text}
            onClick={() => state.setInput(text)}
          >
            <MathText>{text}</MathText>
          </button>
        ))}
      </div>
      <div className="fw-messages" aria-live="polite">
        {!state.messages.length && (
          <div className="fw-empty-chat">
            <FunctionSquare size={25} />
            <p>
              “把它换成…”“加入一个参数…”“保留这条曲线，再加一条…”
              <br />
              新的函数，从你的问题开始。
            </p>
          </div>
        )}
        {state.messages.map((message, index) => (
          <div key={index} className={`fw-message ${message.role}`}>
            <small>{message.role === "user" ? "你" : "AI 助手"}</small>
            <p><MathText>{message.content}</MathText></p>
          </div>
        ))}
        {state.busy && (
          <div className="fw-thinking">
            <LoaderCircle size={15} />
            正在理解函数与约束…
          </div>
        )}
        <div ref={state.chatEnd} />
      </div>
      <form
        className="fw-composer"
        onSubmit={(event) => {
          event.preventDefault();
          void state.send();
        }}
      >
        <textarea
          ref={chatInput}
          aria-label="函数修改要求"
          placeholder="例如：换成 sin(x²)，并显示 x=1 处的切线…"
          value={state.input}
          onChange={(event) => state.setInput(event.target.value)}
          maxLength={2000}
          rows={2}
          onKeyDown={(event) => {
            if (
              event.key === "Enter" &&
              !event.shiftKey &&
              !event.nativeEvent.isComposing
            ) {
              event.preventDefault();
              void state.send();
            }
          }}
        />
        <SymbolBar
          inputRef={chatInput}
          value={state.input}
          onChange={state.setInput}
        />
        <MathPreview value={state.input} />
        <div className="fw-composer-foot">
          <span>
            {state.status?.configured
              ? "Enter 发送 · Shift+Enter 换行"
              : "配置模型后即可对话；上方公式编辑始终可用"}
          </span>
          {state.busy ? (
            <button
              type="button"
              className="btn"
              onClick={() => state.controller.current?.abort()}
            >
              取消修改
            </button>
          ) : (
            <button
              type="submit"
              className="btn primary"
              disabled={!state.input.trim()}
            >
              <Send size={15} />
              发送
            </button>
          )}
        </div>
      </form>
    </section>
  );
}
