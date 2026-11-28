import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ArrowRight, BookOpen, ChevronLeft, ChevronRight, Sparkles } from "lucide-react";
import { useAppData } from "../../app/DataProvider";
import { MathText } from "../../components/Math";
import type { CurriculumUnit } from "../../domain/types";
import { pageLabel } from "../../modules/teaching/localTextbooks";
import { useAIConnection } from "../../modules/ai/connection";

export type Props = {
  onNavigate: (page: string) => void;
  onSaveNote: (text: string, conceptId?: string) => void;
  notify: (text: string) => void;
};
export type SourceProps = Props & { onReadSource: (bookId: string, page: number) => void };

export function CardGenerationButton({ label, generate }: { label: string; generate: () => Promise<void> }) {
  const { status, available } = useAIConnection();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function run() {
    setBusy(true);
    setError("");
    try {
      await generate();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "生成失败，请重试。");
    } finally {
      setBusy(false);
    }
  }
  return <div>
    <button type="button" className="btn primary" disabled={busy || !status?.configured}
      onClick={() => void run()}><Sparkles size={15} />{busy ? "正在生成…" : label}</button>
    {available !== null && !status?.configured && <p className="muted">请先在顶部配置个人 DeepSeek Key</p>}
    {error && <p role="alert">{error}</p>}
  </div>;
}

export function SourcePageButton({ source, read }: {
  source: NonNullable<CurriculumUnit["textbookSource"]>;
  read: SourceProps["onReadSource"];
}) {
  return <button className="btn" type="button" onClick={() => read(source.textbookId, source.pageStart)}>
    <BookOpen size={15} />查看课本原文 · {pageLabel(source.pageStart, source.pageEnd)}
  </button>;
}
export function useUnit() {
  const { data, selectedConceptId, selectConcept } = useAppData();
  const unit = (data.units.find((item) => item.id === selectedConceptId) ||
    data.units[1] ||
    data.units[0]) as CurriculumUnit;
  return {
    unit,
    units: data.units,
    select: selectConcept,
  };
}
export function DeskCardNavigation() {
  const { data, localBooks } = useAppData();
  const { unit, select } = useUnit();
  const courses = useMemo(() => {
    const byBook = new Map<string, CurriculumUnit[]>(localBooks.map(book => [book.id, []]));
    const lectures: CurriculumUnit[] = [];
    for (const card of data.units) {
      if (card.textbookSource) byBook.get(card.textbookSource.textbookId)?.push(card);
      else lectures.push(card);
    }
    const lectureTitle = data.source === "offline" ? "示例讲义 · 数学分析" : "课程讲义";
    return [
      { id: "", title: `${lectureTitle}（${lectures.length} 讲）`, cards: lectures },
      ...localBooks.map(book => {
        // bootstrap supplies creation order, preserved by stable sort for same-page cards.
        const cards = byBook.get(book.id)!;
        cards.sort((a, b) => a.textbookSource!.pageStart - b.textbookSource!.pageStart);
        return { id: book.id, title: `《${book.title}》（${cards.length} 张卡片）`, cards };
      }),
    ];
  }, [data.units, data.source, localBooks]);

  const course = courses.find(item => item.id === (unit.textbookSource?.textbookId ?? "")) ?? courses[0];
  const index = Math.max(0, course.cards.findIndex(card => card.id === unit.id));
  const previous = course.cards[index - 1];
  const next = course.cards[index + 1];
  useEffect(() => {
    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (event.ctrlKey || event.shiftKey || event.metaKey || event.defaultPrevented) return;
      if (event.target instanceof Element && event.target.closest('dialog, [role="dialog"]')) return;
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      if (!event.altKey && event.target instanceof Element && event.target !== document.body &&
        (!event.target.closest("#desk-study") || event.target.closest('input, select, textarea, [contenteditable], [role="tablist"]'))) return;
      event.preventDefault();
      const target = event.key === "ArrowLeft" ? previous : next;
      if (target) select(target.id);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [previous, next, select]);

  return <div className="desk-card-navigation">
    <select aria-label="选择课程或教材" value={course.id} onChange={event => {
      const first = courses.find(item => item.id === event.target.value)?.cards[0];
      if (first) select(first.id);
    }}>
      {courses.map(item => <option key={item.id} value={item.id} disabled={!item.cards.length}>{item.title}</option>)}
    </select>
    <div role="group" aria-label="本册卡片" className="desk-card-controls">
      <button type="button" className="btn" aria-label="上一张卡片" title="上一张卡片（Alt+←）"
        disabled={!previous} onClick={() => previous && select(previous.id)}><ChevronLeft size={16} /></button>
      <span>{index + 1} / {course.cards.length}</span>
      <select aria-label="选择章节知识点" value={unit.id} onChange={event => select(event.target.value)}>
        {course.cards.map(card => <option key={card.id} value={card.id}>{card.title}</option>)}
      </select>
      <button type="button" className="btn" aria-label="下一张卡片" title="下一张卡片（Alt+→）"
        disabled={!next} onClick={() => next && select(next.id)}><ChevronRight size={16} /></button>
    </div>
  </div>;
}
export function Heading({
  step,
  title,
  description,
  children,
}: {
  step: string;
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <div className="page-heading learning-heading">
      <div>
        <div className="learning-step">{step}</div>
        <h1>{title}</h1>
        <p className="muted">{description}</p>
      </div>
      {children}
    </div>
  );
}
export function DefinitionTokens({ unit }: { unit: CurriculumUnit }) {
  const pieces =
    unit.id === "uniform"
      ? [
          ["∀ ε > 0", "精度由外部给定"],
          ["∃ δ > 0", "只依赖 ε，不依赖位置"],
          ["∀ x₁,x₂ ∈ I", "对所有点对适用"],
          ["|Δx| < δ", "距离条件"],
          ["|Δf| < ε", "所需结论"],
        ]
      : unit.conditions.map((c, i) => [String(i + 1).padStart(2, "0"), c]);
  return (
    <div className="definition-tokens">
      {pieces.map(([title, desc], i) => (
        <div className="token-wrap" key={title}>
          <div
            className={
              "definition-token " + (i === pieces.length - 1 ? "last" : "")
            }
          >
            <strong><MathText>{title}</MathText></strong>
            <small><MathText>{desc}</MathText></small>
          </div>
          {i < pieces.length - 1 && <ArrowRight size={15} />}
        </div>
      ))}
    </div>
  );
}
