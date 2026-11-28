import {
  ArrowRight,
  Bookmark,
  Check,
  CheckCircle2,
  ExternalLink,
  Eye,
  FileText,
  Lightbulb,
  ListChecks,
  Lock,
  Sparkles,
} from "lucide-react";
import { useState } from "react";
import { useAppData } from "../../app/DataProvider";
import { useWorkspaceEndpoint } from "../../app/useWorkspaceEndpoint";
import { MathBlock, MathText } from "../../components/Math";
import { DefinitionTokens, Heading, SourcePageButton, useUnit, type SourceProps } from "./shared";

export function Textbook({ onNavigate, onSaveNote, notify, onReadSource }: SourceProps) {
  const app = useAppData();
  const { unit } = useUnit();
  const lecture = {
    conditions: unit.conditions,
    proof_steps: unit.proof.map((text, index) => ({ ref: `${unit.id}:${index}`, text })),
  };
  useWorkspaceEndpoint("textbook", JSON.stringify([unit.id, lecture]), {
    query: () => ({ lecture }),
  });
  const bookmarked = app.data.bookmarks;
  const units = app.data.units;
  const [large, setLarge] = useState(false);
  const toggle = async () => {
    const active = bookmarked.includes(unit.id);
    try {
      await app.toggleBookmark(unit.id);
      notify(active ? "已取消收藏" : "已收藏这个知识点");
    } catch {
      notify("收藏同步失败，请检查后端连接");
    }
  };
  if (unit.textbookSource) {
    const source = unit.textbookSource;
    const book = app.localBooks.find((item) => item.id === source.textbookId);
    const richSteps = unit.proofSteps?.length ? unit.proofSteps : null;
    const showFormula = Boolean(unit.formula && unit.formula.trim() && unit.formula !== source.theorem);
    return <article className="learning-page card local-lecture-card">
      <header className="local-card-header">
        <div className="local-card-topbar">
          <span className="badge purple">{book?.title || "本地教材"}</span>
          <span className="local-card-kicker">学习卡片</span>
          <div className="local-card-source">
            <SourcePageButton source={source} read={onReadSource} />
          </div>
        </div>
        <h1><MathText>{unit.title}</MathText></h1>
      </header>

      {showFormula && <div className="local-formula-showcase" aria-label="核心公式">
        <MathBlock>{unit.formula}</MathBlock>
      </div>}

      <section className="local-section local-definition-box">
        <div className="section-title">
          <span className="badge purple">概念</span>
          <h3>定义</h3>
        </div>
        <div className="local-prose"><MathText>{unit.definition}</MathText></div>
      </section>

      {unit.conditions.length > 0 && <section className="local-section">
        <div className="section-title">
          <span className="badge dark">前提</span>
          <h3>条件</h3>
          <small className="muted">共 {unit.conditions.length} 项适用前提</small>
        </div>
        <ul className="local-condition-list">
          {unit.conditions.map((value, index) => <li className="condition-row" key={index}>
            <span className="check-icon"><Check size={13} /></span>
            <div className="local-condition-text"><MathText>{value}</MathText></div>
            <span className="condition-number">{String(index + 1).padStart(2, "0")}</span>
          </li>)}
        </ul>
      </section>}

      {source.theorem && <section className="local-section local-theorem-box">
        <div className="section-title">
          <span className="badge local-amber-badge">核心命题</span>
          <h3>定理</h3>
        </div>
        <div className="local-prose"><MathText>{source.theorem}</MathText></div>
      </section>}

      {unit.proof.length > 0 && <section className="local-section">
        <div className="section-title">
          <span className="badge local-teal-badge">{unit.proofStatus === "ai_elaboration" ? "AI 拆解" : "教材推导"}</span>
          <h3>{unit.proofStatus === "ai_elaboration" ? "AI 补充分步推导" : "证明思路"}</h3>
          <small className="muted">共 {(richSteps ?? unit.proof).length} 步</small>
        </div>
        <ol className="local-proof-steps">
          {richSteps ? richSteps.map((step) => <li className="local-proof-step" key={step.n}>
            <div className="local-step-head">
              <span className="local-step-num">{String(step.n).padStart(2, "0")}</span>
              <strong className="local-step-title"><MathText>{step.title}</MathText></strong>
            </div>
            {step.formula && <div className="local-step-formula"><MathBlock>{step.formula}</MathBlock></div>}
            <div className="local-step-body"><MathText>{step.text}</MathText></div>
          </li>) : unit.proof.map((value, index) => <li className="local-proof-step local-proof-plain" key={index}>
            <span className="local-step-num">{String(index + 1).padStart(2, "0")}</span>
            <div className="local-step-body"><MathText>{value}</MathText></div>
          </li>)}
        </ol>
      </section>}

      <footer className="button-row local-card-actions">
        <button className="btn" onClick={toggle}><Bookmark size={14} />{bookmarked.includes(unit.id) ? "已收藏" : "收藏"}</button>
        <button className="btn" onClick={() => onSaveNote(`${unit.title}：${unit.definition}`, unit.id)}>记入笔记</button>
        {unit.proof.length > 0 && <button className="btn primary local-proof-cta" onClick={() => onNavigate("proof")}>逐步读证明 <ArrowRight size={14} /></button>}
      </footer>
    </article>;
  }
  return (
    <div className="learning-page textbook-page">
      <Heading
        step="第 1 步 / 共 3 步"
        title="教材定义与条件"
        description="把每一个定义、符号和条件读清楚，让直觉与严谨的论证连接起来。"
      />
      <div className="book-summary">
        <span>原创讲义 · 连续性至定积分</span>
        <button className="btn" onClick={() => setLarge(!large)}>
          <Eye size={15} />
          {large ? "恢复阅读" : "放大讲义"}
        </button>
      </div>
      <div className={"textbook-columns " + (large ? "large-text" : "")}>
        <section className="card manuscript">
          <div className="section-title">
            <FileText size={17} />
            <h3>示例讲义原文</h3>
          </div>
          <div className="paper-content">
            <div className="paper-kicker">
              {unit.chapter} · {unit.title}
              <br />
              项目原创释义，不对应真实教材页码
            </div>
            <div className="paper-highlight amber">
              <b>定义 · {unit.title}</b>
              <p>
                <MathText>{unit.definition}</MathText>
              </p>
            </div>
            <p>
              <MathText>
                {unit.id === "uniform"
                  ? "与逐点连续性对照可见：逐点连续的 δ 可以依赖所选位置。一致连续要求用同一个 δ 同时控制整个定义域内的所有点对。量词的位置表达了这个差别。"
                  : unit.example}
              </MathText>
            </p>
            <div className="paper-highlight purple">
              <b>
                {unit.id === "uniform"
                  ? "定理 · Heine–Cantor（康托尔定理）"
                  : "关键数学关系"}
              </b>
              <p>
                <MathText>
                  {unit.id === "uniform"
                    ? "若实函数 f 在闭且有界区间 [a,b] 上连续，则 f 在该区间上一致连续。"
                    : unit.formula}
                </MathText>
              </p>
            </div>
            <h4>证明思路</h4>
            {unit.proof.slice(0, 3).map((p, i) => (
              <p key={i}>
                <MathText>{p}</MathText>
              </p>
            ))}
            <button className="paper-link" onClick={() => onNavigate("proof")}>
              查看完整证明及条件使用位置 <ArrowRight size={14} />
            </button>
            <div className="paper-footer">
              <span>
                单元 {units.findIndex((u) => u.id === unit.id) + 1}
              </span>
              <span>Axiom · 数学分析示例讲义</span>
            </div>
          </div>
          <div className="manuscript-note">
            <CheckCircle2 size={14} />
            高亮内容对应当前知识点，参考资料可在右侧打开。
          </div>
        </section>
        <div className="textbook-details">
          <section className="card">
            <div className="section-title">
              <span className="badge purple">定义</span>
              <h3>{unit.title}</h3>
              <div className="title-actions">
                <button
                  className={
                    "btn small " +
                    (bookmarked.includes(unit.id) ? "selected" : "")
                  }
                  onClick={toggle}
                >
                  <Bookmark size={13} />
                  {bookmarked.includes(unit.id) ? "已收藏" : "收藏"}
                </button>
                <button
                  className="btn small"
                  onClick={() => onNavigate("explore")}
                >
                  去可视化 <ArrowRight size={13} />
                </button>
              </div>
            </div>
            <p className="definition-copy">
              <MathText>{unit.definition}</MathText>
            </p>
            <h4 className="subhead">
              <Sparkles size={15} />
              定义与条件的结构拆解
            </h4>
            <DefinitionTokens unit={unit} />
            <div className="learning-callout">
              <Sparkles size={16} />
              <span>
                <MathText>
                  {unit.id === "uniform"
                    ? "注意：∃ δ 在 ∀ x₁,x₂ 之前。δ 可以依赖 ε，但不能随点对改变。"
                    : unit.hint}
                </MathText>
              </span>
            </div>
          </section>
          <section className="card">
            <div className="section-title">
              <ListChecks size={16} />
              <h3>符号与记号对照</h3>
              <small className="muted">保留定义中的使用语境</small>
            </div>
            <div className="table-scroll">
              <table className="symbol-table">
                <thead>
                  <tr>
                    <th>符号</th>
                    <th>读法</th>
                    <th>本单元中的含义</th>
                  </tr>
                </thead>
                <tbody>
                  {(unit.symbols?.length
                    ? unit.symbols.map((symbol) => [
                        symbol.symbol,
                        symbol.reading,
                        symbol.meaning,
                      ])
                    : [
                        ["ε", "epsilon", "任意给定的正误差"],
                        ["δ", "delta", "根据误差要求选择的正距离"],
                        ["∀ / ∃", "任意 / 存在", "量词的先后决定依赖关系"],
                        ["I / [a,b]", "区间 / 闭区间", "始终检查函数的定义域"],
                      ]
                  ).map((row) => (
                    <tr key={row[0]}>
                      {row.map((x, i) => (
                        <td key={i}><MathText>{x}</MathText></td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section className="card">
            <div className="section-title">
              <span className="badge dark">条件</span>
              <h3>逐项核对</h3>
            </div>
            <div className="condition-list">
              {unit.conditions.map((x, i) => (
                <div className="condition-row" key={x}>
                  <span className="check-icon">
                    <Check size={13} />
                  </span>
                  <div>
                    <b><MathText>{x}</MathText></b>
                    <small>
                      {i === 0
                        ? "先确定论证对象和范围"
                        : "在引用定义或定理时明确说明"}
                    </small>
                  </div>
                  <span className="condition-number">0{i + 1}</span>
                </div>
              ))}
            </div>
            <a
              className="source-link"
              href={unit.source}
              target="_blank"
              rel="noreferrer"
            >
              <ExternalLink size={14} />
              参考：UC Davis 分析讲义（外部原文）
            </a>
          </section>
        </div>
      </div>
      <section className="card proof-tools">
        <div className="section-title">
          <Sparkles size={17} />
          <h3>当前学习单元可用的证明工具</h3>
          <small className="muted">演示材料按这些前置知识组织</small>
        </div>
        <div className="tools-line">
          <span>可使用</span>
          {unit.tools.map((x) => (
            <span className="tool-chip" key={x}>
              <Check size={13} />
              {x}
            </span>
          ))}
        </div>
        <div className="tools-line locked">
          <span>正式版拓展</span>
          <span>
            <Lock size={12} /> 多元分析
          </span>
          <span>
            <Lock size={12} /> 函数项级数
          </span>
          <span>
            <Lock size={12} /> 测度与 Lebesgue 积分
          </span>
        </div>
      </section>
      <section className="learning-next">
        <div className="next-icon">
          <Lightbulb size={23} />
        </div>
        <div>
          <h3>定义已经读清，去图像中寻找直觉</h3>
          <p>调整参数、比较条件，再把观察写成证明。</p>
        </div>
        <button
          className="btn"
          onClick={() => {
            onSaveNote(`${unit.title}：${unit.definition}`, unit.id);
            notify("定义已保存到我的笔记");
          }}
        >
          <Bookmark size={14} />
          记入笔记
        </button>
        <button className="btn primary" onClick={() => onNavigate("explore")}>
          进入图像探索 <ArrowRight size={16} />
        </button>
      </section>
    </div>
  );
}
