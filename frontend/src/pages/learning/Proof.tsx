import {
  ArrowRight,
  Bookmark,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  ExternalLink,
  Eye,
  FileText,
  Lightbulb,
  ListChecks,
  Lock,
  RefreshCw,
  Send,
  Sparkles,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { MathText } from "../../components/Math";
import { useAppData } from "../../app/DataProvider";
import { Heading, ModuleSelect, useUnit, type Props } from "./shared";

export function Proof({ onNavigate, onSaveNote, notify }: Props) {
  const { unit, select } = useUnit();
  const [step, setStep] = useState(0);
  const [checked, setChecked] = useState<number[]>([]);
  useEffect(() => {
    setStep(0);
    setChecked([]);
  }, [unit.id]);
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
  return (
    <div className="learning-page proof-page">
      <Heading
        step="第 4 步 / 共 6 步"
        title="证明思路 · 让直觉成为论证"
        description="把每一步为什么成立、条件用在哪里，写成可以检查的数学语言。"
      >
        <ModuleSelect unit={unit} select={select} />
      </Heading>
      <div className="proof-layout">
        <aside className="card proof-outline">
          <h3>{unit.id === "uniform" ? "Heine–Cantor 定理" : unit.title}</h3>
          <p className="muted">完整证明 · {unit.proof.length} 个步骤</p>
          <div className="proof-step-list">
            {titles.map((t, i) => (
              <button
                className={step === i ? "active" : ""}
                key={i}
                onClick={() => setStep(i)}
              >
                <span>{checked.includes(i) ? <Check size={13} /> : i + 1}</span>
                <div>
                  {t}
                  <small>
                    {checked.includes(i) ? "已阅读确认" : "点击查看这一步"}
                  </small>
                </div>
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
            <h3>{titles[step]}</h3>
            <span className="muted">
              {step + 1} / {unit.proof.length}
            </span>
          </div>
          <div className="proof-formula">
            <MathText>{unit.id === "uniform"
              ? [
                  "f 在 [a,b] 上连续 ⇒ f 一致连续",
                  "∃ ε₀>0，∀ n，∃ xₙ,yₙ：|xₙ−yₙ|<1/n，|f(xₙ)−f(yₙ)|≥ε₀",
                  "xₙₖ → c ∈ [a,b]",
                  "|yₙₖ−c| ≤ |yₙₖ−xₙₖ| + |xₙₖ−c| → 0",
                  "|f(xₙₖ)−f(yₙₖ)| → 0，与 ≥ε₀ 矛盾",
                  "因此 f 在 [a,b] 上一致连续",
                ][step]
              : unit.formula}</MathText>
          </div>
          <p className="proof-paragraph"><MathText>{unit.proof[step]}</MathText></p>
          <div className="proof-why">
            <Lightbulb size={20} />
            <div>
              <h4>为什么这样想？</h4>
              <p>
                <MathText>{unit.id === "uniform"
                  ? [
                      "想证明所有点对都能统一控制。反证法把这个全局要求转为一个可以构造的失败序列。",
                      "把任意小的距离具体选为 1/n。必须保留同一个 ε₀，它不随 n 改变。",
                      "有界性提供收敛子列，闭性保证极限点仍在原区间中。",
                      "两点之间越来越近，因此一列靠近 c，另一列也只能靠近 c。",
                      "现在可以在同一点使用连续性。这个局部性质与前面的固定误差冲突。",
                      "证明中每个假设都有位置。对照反例检查，能帮助理解哪些条件是充分条件。",
                    ][step]
                  : unit.hint}</MathText>
              </p>
            </div>
          </div>
          <h4 className="subhead">
            <ListChecks size={16} />
            可引用的依据
          </h4>
          <div className="property-tags">
            {unit.tools.map((x) => (
              <span className="badge green" key={x}>
                <Check size={11} />
                {x}
              </span>
            ))}
          </div>
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
                step < unit.proof.length - 1
                  ? setStep(step + 1)
                  : onNavigate("exercises")
              }
            >
              {step < unit.proof.length - 1 ? "下一步" : "用练习检验理解"}
              <ArrowRight size={15} />
            </button>
          </div>
        </section>
      </div>
      <section className="card complete-proof">
        <div className="section-title">
          <FileText size={17} />
          <h3>完整证明 · 连贯阅读</h3>
          <button
            className="btn small"
            onClick={() => {
              onSaveNote(`${unit.title} · 证明\n${unit.proof.join("\n")}`, unit.id);
              notify("证明已保存到我的笔记");
            }}
          >
            <Bookmark size={13} />
            保存证明笔记
          </button>
        </div>
        <ol>
          {unit.proof.map((p, i) => (
            <li key={i}><MathText>{p}</MathText></li>
          ))}
        </ol>
        <a
          className="source-link"
          href={unit.source}
          target="_blank"
          rel="noreferrer"
        >
          <ExternalLink size={14} />
          查看相关定理的参考讲义
        </a>
      </section>
    </div>
  );
}
