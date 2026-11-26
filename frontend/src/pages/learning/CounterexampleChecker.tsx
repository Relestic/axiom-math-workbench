import { useState, type FormEvent } from "react";
import { Bookmark } from "lucide-react";
import { useAIConnection } from "../../modules/ai/connection";
import { basisLabels, checkCounterexample, counterexampleNote, type CounterexampleResult } from "../../modules/teaching/counterexample";
import type { Props } from "./shared";
import "./counterexamples.css";

export function CounterexampleChecker({ conceptId, save }: { conceptId: string; save: Props["onSaveNote"] }) {
  const [expression, setExpression] = useState("1/x");
  const [left, setLeft] = useState("0");
  const [right, setRight] = useState("1");
  const [endpoints, setEndpoints] = useState("()");
  const [includeModel, setIncludeModel] = useState(false);
  const [result, setResult] = useState<CounterexampleResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const ai = useAIConnection();
  async function submit(event: FormEvent) {
    event.preventDefault();
    const a = Number(left), b = Number(right);
    setError("");
    setResult(null);
    if (!Number.isFinite(a) || !Number.isFinite(b) || a >= b) {
      setError("请输入有限端点，左端点必须小于右端点。");
      return;
    }
    setBusy(true);
    try {
      setResult(await checkCounterexample(expression.trim(), a, b, endpoints, Boolean(ai.status?.configured && includeModel)));
    } catch (cause) {
      setError(cause instanceof TypeError ? "无法连接本机检验服务，请启动本地工作台后重试。"
        : cause instanceof Error ? cause.message : "检验失败，请重试。");
    } finally {
      setBusy(false);
    }
  }
  return <section className="card counterexample-checker" aria-label="我来构造反例">
    <h2>我来构造反例</h2>
    <form onSubmit={submit} onChange={() => { setResult(null); setError(""); }}>
      <fieldset disabled={busy}>
        <label>函数表达式<input value={expression} required maxLength={300} spellCheck={false}
          onChange={(event) => setExpression(event.target.value)} placeholder="例如 1/x 或 sin(1/x)" /></label>
        <small className="muted">可输入 Dirichlet(x) 检验有理点与无理点的定义。</small>
        <div className="candidate-interval">
          <label>区间类型<select value={endpoints} onChange={(event) => setEndpoints(event.target.value)}>
            <option value="()">(a, b)</option><option value="[]">[a, b]</option>
            <option value="[)">[a, b)</option><option value="(]">(a, b]</option>
          </select></label>
          <label>左端点<input type="number" step="any" required value={left} onChange={(event) => setLeft(event.target.value)} /></label>
          <label>右端点<input type="number" step="any" required value={right} onChange={(event) => setRight(event.target.value)} /></label>
        </div>
        {ai.status?.configured && <label className="candidate-model"><input type="checkbox" checked={includeModel}
          onChange={(event) => setIncludeModel(event.target.checked)} />附加 AI 解释</label>}
        <button className="btn primary">{busy ? "正在检验…" : "检验反例"}</button>
      </fieldset>
    </form>
    {error && <p role="alert">{error}</p>}
    {result && <div className="candidate-results" aria-live="polite">
      <h3>f(x) = {result.expression} · {result.interval}</h3>
      <ul>{result.findings.map((row, index) => <li key={index} data-verdict-basis={row.verdict_basis}>
        <span className="badge">{basisLabels[row.verdict_basis]}</span><p>{row.text}</p>
      </li>)}</ul>
      {result.model_status && <p role="status">{result.model_status}</p>}
      <button className="btn" onClick={() => save(counterexampleNote(result), conceptId)}>
        <Bookmark size={14} />保存检验到笔记</button>
    </div>}
  </section>;
}
