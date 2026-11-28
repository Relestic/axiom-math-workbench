import { Fragment, memo, useMemo, type RefObject } from "react";
import katex from "katex";
import "katex/dist/katex.css";
import { splitMath, toLatex } from "./notation";
import "./math.css";

const Formula = memo(function Formula({ source, block = false }: { source: string; block?: boolean }) {
  const html = useMemo(() => {
    if (!source.trim() || source.length > 6000) return null;
    try {
      const result = katex.renderToString(toLatex(source), {
        displayMode: block, throwOnError: false, strict: "ignore", trust: false,
        output: "htmlAndMathml", maxExpand: 500, maxSize: 12,
      });
      return result.includes('class="katex-error"') ? null : result;
    } catch { return null; }
  }, [source, block]);
  return html
    ? <span className={block ? "math-block" : "math-inline"} dangerouslySetInnerHTML={{ __html: html }} />
    : <span className="math-fallback">{source}</span>;
});

export function MathInline({ children }: { children: string }) {
  return <Formula source={children} />;
}
export function MathBlock({ children }: { children: string }) {
  return <Formula source={children} block />;
}
export const MathText = memo(function MathText({ children }: { children: string }) {
  const parts = useMemo(() => splitMath(children), [children]);
  return <>{parts.map((part, i) => {
    if (part.kind === "text") return <Fragment key={i}>{part.text}</Fragment>;
    const chainedDisplay = part.kind === "inline" && part.text.length >= 42 && (part.text.match(/=/g)?.length ?? 0) >= 2;
    return <Formula key={i} source={part.text} block={part.kind === "block" || chainedDisplay} />;
  })}</>;
});

export function SymbolBar({ inputRef, value, onChange }: {
  inputRef: RefObject<HTMLInputElement | HTMLTextAreaElement | null>;
  value: string; onChange: (next: string) => void;
}) {
  function insert(symbol: string) {
    const field = inputRef.current;
    if (!field || field.disabled || field.readOnly) return;
    const start = field.selectionStart ?? value.length;
    const end = field.selectionEnd ?? start;
    const next = value.slice(0, start) + symbol + value.slice(end);
    if (field.maxLength >= 0 && next.length > field.maxLength) return;
    onChange(next);
    field.focus();
    requestAnimationFrame(() => {
      if (field.isConnected) field.setSelectionRange(start + symbol.length, start + symbol.length);
    });
  }
  return <div className="math-symbols" role="group" aria-label="数学符号">
    {Array.from("∀∃εδ∫→≤≥∈∞").map(s => <button type="button" key={s}
      aria-label={"插入 " + s} onMouseDown={e => e.preventDefault()} onClick={() => insert(s)}>{s}</button>)}
  </div>;
}

export function MathPreview({ value }: { value: string }) {
  return value.trim() ? <div className="math-preview" aria-label="公式预览">
    <small>预览</small><span><MathText>{value}</MathText></span>
  </div> : null;
}
