import { Fragment, memo, useMemo, type ReactNode, type RefObject } from "react";
import katex from "katex";
import "katex/dist/katex.css";
import { splitMath, toLatex, type MathPart } from "./notation";
import "./math.css";

function renderLatex(source: string, block: boolean) {
  try {
    return katex.renderToString(source, {
      displayMode: block, throwOnError: true, strict: "ignore", trust: false,
      output: "htmlAndMathml", maxExpand: 500, maxSize: 12,
    });
  } catch { return null; }
}

const Formula = memo(function Formula({ source, block, delimited, fallback }: {
  source: string; block: boolean; delimited: boolean; fallback?: ReactNode;
}) {
  const html = useMemo(() => {
    if (!source.trim() || source.length > 6000) return null;
    const latex = toLatex(source, delimited);
    return renderLatex(latex, block) ?? (latex !== source ? renderLatex(source, block) : null);
  }, [source, block, delimited]);
  return html
    ? <span className={block ? "math-block" : "math-inline"} dangerouslySetInnerHTML={{ __html: html }} />
    : fallback ?? <span className="math-fallback">{source}</span>;
});

function MathSegments({ parts }: { parts: MathPart[] }) {
  return <>{parts.map((part, i) => {
    if (part.kind === "text") return <Fragment key={i}>{part.text}</Fragment>;
    const chainedDisplay = part.kind === "inline" && part.text.length >= 42 && (part.text.match(/=/g)?.length ?? 0) >= 2;
    return <Formula key={i} source={part.text} delimited={part.delimited} block={part.kind === "block" || chainedDisplay} />;
  })}</>;
}

function FormulaField({ children, block }: { children: string; block: boolean }) {
  const source = children.trim().replace(/[。；]+$/u, "").trimEnd();
  const parts = useMemo(() => splitMath(source), [source]);
  const single = parts.length === 1 && parts[0].delimited ? parts[0] : null;
  const segments = <span className={block ? "math-block" : "math-inline"}><MathSegments parts={parts} /></span>;
  if (!single && (/\p{Script=Han}/u.test(source) || parts.some(part => part.delimited))) {
    return segments;
  }
  return <Formula source={single?.text ?? source} delimited={!!single} block={block || single?.kind === "block"}
    fallback={segments} />;
}

export function MathInline({ children }: { children: string }) {
  return <FormulaField block={false}>{children}</FormulaField>;
}
export function MathBlock({ children }: { children: string }) {
  return <FormulaField block>{children}</FormulaField>;
}
export const MathText = memo(function MathText({ children }: { children: string }) {
  const parts = useMemo(() => splitMath(children), [children]);
  return <MathSegments parts={parts} />;
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
