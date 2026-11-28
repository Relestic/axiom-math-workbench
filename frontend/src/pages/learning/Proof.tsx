import { ArrowRight, Bookmark, Check, ChevronLeft, ChevronRight, ExternalLink, FileText, Lightbulb, ListChecks } from "lucide-react";
import { useState } from "react";
import { MathBlock, MathText } from "../../components/Math";
import { useWorkspaceEndpoint } from "../../app/useWorkspaceEndpoint";
import { useAppData } from "../../app/DataProvider";
import { generateCardProof } from "../../modules/teaching/localTextbooks";
import { CardGenerationButton, Heading, SourcePageButton, useUnit, type SourceProps } from "./shared";

export function Proof(props: SourceProps) {
  const { unit } = useUnit();
  return <ProofSteps key={unit.id} {...props} />;
}

function ProofSteps({ onNavigate, onSaveNote, notify, onReadSource }: SourceProps) {
  const { unit } = useUnit();
  const { refreshLocal } = useAppData();
  const [selected, setStep] = useState(0);
  const [checked, setChecked] = useState<number[]>([]);
  const titles =
    unit.id === "uniform"
      ? [
          "明确目标与反设",
          "写出定义的否定",
          "用紧性找到子列",
          "两列点趋于同一点",
          "用连续性制造矛盾",
          "回到原命题",
        ]
      : unit.proof.map(
          (_, i) =>
            ["明确对象与目标", "找到关键构造", "引用定义或定理", "完成论证"][
              i
            ] || "补充说明",
        );
  const content = unit.proofSteps?.length ? unit.proofSteps : unit.proof.map((text, i) => ({
    title: titles[i], text,
    formula: unit.id === "uniform" ? [
      "f 在 [a,b] 上连续 ⇒ f 一致连续",
      "∃ ε₀>0，∀ n，∃ xₙ,yₙ：|xₙ−yₙ|<1/n，|f(xₙ)−f(yₙ)|≥ε₀",
      "xₙₖ → c ∈ [a,b]",
      "|yₙₖ−c| ≤ |yₙₖ−xₙₖ| + |xₙₖ−c| → 0",
      "|f(xₙₖ)−f(yₙₖ)| → 0，与 ≥ε₀ 矛盾",
      "因此 f 在 [a,b] 上一致连续",
    ][i] : unit.formula,
    why: unit.id === "uniform" ? [
      "想证明所有点对都能统一控制。反证法把这个全局要求转为一个可以构造的失败序列。",
      "把任意小的距离具体选为 1/n。必须保留同一个 ε₀，它不随 n 改变。",
      "有界性提供收敛子列，闭性保证极限点仍在原区间中。",
      "两点之间越来越近，因此一列靠近 c，另一列也只能靠近 c。",
      "现在可以在同一点使用连续性。这个局部性质与前面的固定误差冲突。",
      "证明中每个假设都有位置。对照反例检查，能帮助理解哪些条件是充分条件。",
    ][i] : unit.textbookSource ? "" : unit.hint,
    uses: unit.tools, conditions: [],
  }));
  const step = Math.max(0, Math.min(selected, content.length - 1));
  const current = content[step];
  const steps = content.map(({ title, text }, index) => ({
    ref: `${unit.id}:${index}`,
    index,
    title,
    text,
  }));
  const proof = { unit_id: unit.id, current_step: steps[step], steps };
  useWorkspaceEndpoint("proof", JSON.stringify(proof), {
    query: () => ({ proof }),
    command: (actions) => {
      let targetIndex = step;
      for (const action of actions) {
        if (action.type !== "highlight_proof_step") return false;
        const target = steps.find(item => item.ref === action.ref);
        if (!target) return false;
        targetIndex = target.index;
      }
      if (targetIndex === step) return "unchanged";
      setStep(targetIndex);
      return true;
    },
  });
  const generateButton = unit.textbookSource && <CardGenerationButton label="AI 生成分步推导思路" generate={async () => {
    await generateCardProof(unit.id);
    await refreshLocal();
    setStep(0);
    setChecked([]);
  }} />;
  if (!current) {
    return <article className="learning-page card local-lecture-card">
      <h1><MathText>{unit.title}</MathText></h1>
      <p>这张教材卡片没有收录证明步骤，可回到原页研读。</p>
      {generateButton}
      {unit.textbookSource && <SourcePageButton source={unit.textbookSource} read={onReadSource} />}
    </article>;
  }
  return (
    <div className="learning-page proof-page">
      <Heading
        step="第 2 步 / 共 3 步"
        title="证明思路 · 让直觉成为论证"
        description="把每一步为什么成立、条件用在哪里，写成可以检查的数学语言。"
      >{generateButton}</Heading>
      {unit.proofStatus === "ai_elaboration" && <p className="info-strip">以下分步推导由 AI 根据本卡定义与条件补充拆解，非教材逐字原文</p>}
      <div className="proof-layout">
        <aside className="card proof-outline">
          <h3><MathText>{unit.id === "uniform" ? "Heine–Cantor 定理" : unit.title}</MathText></h3>
          <p className="muted">分步推导 · {steps.length} 个步骤</p>
          <div className="proof-step-list">
            {steps.map(({ ref, title, index: i }) => (
              <button
                className={step === i ? "active" : ""}
                key={ref}
                data-proof-step-ref={ref}
                aria-current={step === i ? "step" : undefined}
                onClick={() => setStep(i)}
              >
                <span>{checked.includes(i) ? <Check size={13} /> : i + 1}</span>
                <span className="proof-step-copy">
                  <span><MathText>{title}</MathText></span>
                  <small>
                    {checked.includes(i) ? "已阅读确认" : "点击查看这一步"}
                  </small>
                </span>
                <ChevronRight size={14} />
              </button>
            ))}
          </div>
          <div className="learning-callout">
            <Lightbulb size={17} />
            <span>逐步理解之后，尝试关掉证明，独立写出关键构造。</span>
          </div>
        </aside>
        <section className="card proof-detail">
          <div className="section-title">
            <span className="badge purple">步骤 {step + 1}</span>
            <h3><MathText>{current.title}</MathText></h3>
            <span className="muted">
              {step + 1} / {steps.length}
            </span>
          </div>
          {current.formula && <div className="proof-formula"><MathBlock>{current.formula}</MathBlock></div>}
          <p className="proof-paragraph"><MathText>{current.text}</MathText></p>
          {current.why && <div className="proof-why">
            <Lightbulb size={20} />
            <div>
              <h4>为什么这样想？</h4>
              <p><MathText>{current.why}</MathText></p>
            </div>
          </div>}
          {(current.uses.length > 0 || current.conditions.length > 0) && <><h4 className="subhead">
            <ListChecks size={16} />
            可引用的依据
          </h4>
          <div className="property-tags">
            {Array.from(new Set([...current.uses, ...current.conditions])).map((x) => (
              <span className="badge green" key={x}>
                <Check size={11} />
                <MathText>{x}</MathText>
              </span>
            ))}
          </div></>}
          <div className="proof-actions">
            <button
              className="btn"
              disabled={step === 0}
              onClick={() => setStep(step - 1)}
            >
              <ChevronLeft size={14} />
              上一步
            </button>
            <button
              className="btn"
              onClick={() => {
                setChecked([...new Set([...checked, step])]);
                notify("已记录阅读确认，不计为独立掌握");
              }}
            >
              <Check size={14} />
              {checked.includes(step) ? "已读懂此步" : "读懂这一步"}
            </button>
            <button
              className="btn primary"
              onClick={() =>
                step < steps.length - 1
                  ? setStep(step + 1)
                  : onNavigate("exercises")
              }
            >
              {step < steps.length - 1 ? "下一步" : "用练习检验理解"}
              <ArrowRight size={15} />
            </button>
          </div>
        </section>
      </div>
      <section className="card complete-proof">
        <div className="section-title">
          <FileText size={17} />
          <h3>{unit.proofStatus === "ai_elaboration" ? "分步推导" : "完整证明"} · 连贯阅读</h3>
          <button
            className="btn small"
            onClick={() => {
              onSaveNote(`${unit.title} · 证明\n${steps.map(item => item.text).join("\n")}`, unit.id);
              notify("证明已保存到我的笔记");
            }}
          >
            <Bookmark size={13} />
            保存证明笔记
          </button>
        </div>
        <ol>
          {steps.map(({ ref, text }) => (
            <li key={ref}><MathText>{text}</MathText></li>
          ))}
        </ol>
        {unit.textbookSource ? <SourcePageButton source={unit.textbookSource} read={onReadSource} /> : <a
          className="source-link"
          href={unit.source}
          target="_blank"
          rel="noreferrer"
        >
          <ExternalLink size={14} />
          查看相关定理的参考讲义
        </a>}
      </section>
    </div>
  );
}
