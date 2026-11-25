import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { useAppData } from "../../app/DataProvider";
import { MathText } from "../../components/Math";
import type { CurriculumUnit } from "../../domain/types";

export type Props = {
  onNavigate: (page: string) => void;
  onSaveNote: (text: string, conceptId?: string) => void;
  notify: (text: string) => void;
};
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
export function ModuleSelect({
  unit,
  select,
}: {
  unit: CurriculumUnit;
  select: (id: string) => void;
}) {
  const { data } = useAppData();
  return (
    <label className="module-select">
      <span>当前知识点</span>
      <select
        aria-label="选择章节知识点"
        value={unit.id}
        onChange={(e) => select(e.target.value)}
      >
        {data.units.map((item) => (
          <option value={item.id} key={item.id}>
            {item.chapter} · {item.title}
          </option>
        ))}
      </select>
    </label>
  );
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
