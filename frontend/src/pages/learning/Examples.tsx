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
import { useState } from "react";
import { MathText } from "../../components/Math";
import { useAppData } from "../../app/DataProvider";
import { useWorkspaceEndpoint } from "../../app/useWorkspaceEndpoint";
import { ClassicChart } from "./ClassicChart";
import { CounterexampleChecker } from "./CounterexampleChecker";
import { Heading, type Props } from "./shared";

export function Examples({ onNavigate, onSaveNote, notify }: Props) {
  const app = useAppData();
  const classicSets = app.data.classics;
  const c = classicSets.find((item) => item.id === app.selectedConceptId);
  const [evidence, setEvidence] = useState("");
  useWorkspaceEndpoint("examples", JSON.stringify([c?.id, evidence]), {
    query: () => ({ example: c ? { statement: c.statement, negative: c.negative, repair: c.repair, evidence } : null }),
  });
  const caseTabs = <div className="learning-tabs" role="group" aria-label="经典案例">
    {classicSets.map((item) => (
      <button key={item.id} className={c?.id === item.id ? "active" : ""}
        aria-pressed={c?.id === item.id} onClick={() => {
          setEvidence("");
          app.selectConcept(item.id);
        }}>{item.label}</button>
    ))}
  </div>;
  const checker = <CounterexampleChecker key={app.selectedConceptId} conceptId={app.selectedConceptId} save={onSaveNote} />;
  if (!c) {
    return <div className="learning-page examples-page">
      <Heading step="第 3 步 / 共 6 步" title="正反例实验室"
        description={classicSets.length ? "当前知识点尚未收录正反例，可选择下方已有案例。" : "当前教材尚未收录正反例。"} />
      {caseTabs}
      {checker}
    </div>;
  }
  const sourceFor = (id: string) =>
    app.data.units.find((unit) => unit.id === id)?.source || "";
  const properties = [
    ["在给定区间上连续", true, true, true, true],
    ["一致连续", true, false, true, false],
    ["导数在区间内部有界", true, false, false, false],
    ["定义域为闭且有界区间", true, false, true, false],
    ["Heine–Cantor 定理可直接使用", true, false, true, false],
  ];
  return (
    <div className="learning-page examples-page">
      <Heading
        step="第 3 步 / 共 6 步"
        title="正反例实验室"
        description="先看清一个例子满足哪些性质，再说明它支持或反驳哪个准确命题。"
      >
        <button
          className="btn primary"
          onClick={() => {
            onSaveNote(
              `${c.statement}\n反例：${c.negative}。${c.negativeCopy}`,
              c.id,
            );
            notify("反例已保存到我的笔记");
          }}
        >
          <Bookmark size={15} />
          加入反例收藏
        </button>
      </Heading>
      {caseTabs}
      {checker}
      <section className="card proposition">
        <div className="section-title">
          <span className="badge">待判定命题</span>
          <span className="muted">检查结论是否真的能从条件推出</span>
          <span className="badge red">
            <X size={13} />
            命题为假
          </span>
        </div>
        <div className="false-statement">
          <MathText>{c.statement}</MathText>
        </div>
        <div className="statement-flow">
          <div>
            <small>已给条件</small>
            <b><MathText>{c.given}</MathText></b>
          </div>
          <ArrowRight size={18} />
          <div>
            <small>待讨论结论</small>
            <b><MathText>{c.conclusion}</MathText></b>
          </div>
          <ArrowRight size={18} />
          <div className="missing">
            <small>条件与边界</small>
            <b><MathText>{c.repair}</MathText></b>
          </div>
        </div>
      </section>
      <div className="example-pair">
        {[true, false].map((positive) => (
          <section
            className={
              "card example-card " + (positive ? "positive" : "negative")
            }
            key={String(positive)}
          >
            <div className="section-title">
              <span className="example-status">
                {positive ? <Check size={16} /> : <X size={16} />}
              </span>
              <div>
                <h3>
                  {positive ? "正例" : "反例"} ·{" "}
                  <MathText>{positive ? c.positive : c.negative}</MathText>
                </h3>
                <small className="muted">
                  {positive ? "验证性质与条件" : "精确反驳当前命题"}
                </small>
              </div>
              <span className={"badge " + (positive ? "green" : "red")}>
                经典例子
              </span>
            </div>
            <ClassicChart
              kind={positive ? c.positiveKind : c.negativeKind}
              color={positive ? "var(--green)" : "var(--rose)"}
            />
            <h4 className="subhead">
              <ListChecks size={14} />
              它满足 / 不满足的性质
            </h4>
            <div className="property-tags">
              {(positive ? c.positiveTags : c.negativeTags).map((t, i) => (
                <span
                  className={"badge " + (positive || i === 0 ? "green" : "red")}
                  key={t}
                >
                  {positive || i === 0 ? <Check size={11} /> : <X size={11} />}{" "}
                  <MathText>{t}</MathText>
                </span>
              ))}
            </div>
            <div className="example-explanation">
              <b>{positive ? "为什么成立" : "它精确反驳什么"}</b>
              <p>
                <MathText>{positive ? c.positiveCopy : c.negativeCopy}</MathText>
              </p>
            </div>
            <button
              className="paper-link"
              onClick={() => {
                app.selectConcept(c.id);
                onNavigate("explore");
              }}
            >
              在图像中继续探索 <ArrowRight size={14} />
            </button>
          </section>
        ))}
      </div>
      <section className="card">
        <div className="section-title">
          <ListChecks size={17} />
          <h3>性质矩阵 · 例子与性质的精确对应</h3>
          <small className="muted">点击单元格查看解释</small>
        </div>
        <div className="table-scroll">
          <table className="properties-table">
            <thead>
              <tr>
                <th>性质 / 例子</th>
                <th><MathText>x 在 [0,1]</MathText></th>
                <th><MathText>1/x 在 (0,1)</MathText></th>
                <th><MathText>√x 在 [0,1]</MathText></th>
                <th><MathText>sin(1/x) 在 (0,1)</MathText></th>
              </tr>
            </thead>
            <tbody>
              {properties.map((row) => (
                <tr key={String(row[0])}>
                  <th>{row[0]}</th>
                  {row.slice(1).map((yes, i) => (
                    <td key={i}>
                      <button
                        className={yes ? "truth" : "falsehood"}
                        onClick={() =>
                          setEvidence(
                            i === 2
                              ? "√x 在闭区间上连续，故一致连续；但导数 1/(2√x) 在 x→0⁺ 时无界。这说明导数有界不是一致连续的必要条件。"
                              : i === 1
                                ? "1/x 在开区间 (0,1) 连续。选择越来越接近 0 的两列点，可以让自变量距离趋于 0、函数值差仍恒为 1。"
                                : i === 3
                                  ? "令 xₙ=1/(2πn+π/2)，yₙ=1/(2πn+3π/2)，两列点距离趋于 0，而函数值之差恒为 2，因此不一致连续。"
                                  : "f(x)=x 满足 |f(x)−f(y)|=|x−y|，因此取 δ=ε 即得一致连续。",
                          )
                        }
                      >
                        {yes ? "满足" : "不满足"}
                      </button>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="learning-callout">
          <Sparkles size={15} />
          <span>
            <MathText>
              {evidence ||
                "闭且有界是 Heine–Cantor 定理的充分条件，并不是一致连续的必要条件。例如 f(x)=x 在整个 ℝ 上也一致连续。"}
            </MathText>
          </span>
        </div>
      </section>
      <section className="card classic-index">
        <div className="section-title">
          <BookOpen size={17} />
          <h3>经典案例索引</h3>
          <span className="muted">从例子回到定义与证明</span>
        </div>
        <div className="classic-grid">
          {[
            {
              name: "Heine–Cantor 定理",
              desc: "紧区间上连续函数的一致连续性",
              url: sourceFor("uniform"),
            },
            {
              name: "Darboux 定理",
              desc: "导数即使不连续，仍具有介值性",
              url: sourceFor("derivative"),
            },
            {
              name: "Dirichlet 与 Thomae 函数",
              desc: "不连续和 Riemann 可积性的边界",
              url: sourceFor("riemann"),
            },
          ].map((item) => (
            <a href={item.url} target="_blank" rel="noreferrer" key={item.name}>
              <span className="classic-icon">
                <BookOpen size={19} />
              </span>
              <b>{item.name}</b>
              <p>{item.desc}</p>
              <small>
                UC Davis 参考讲义 <ExternalLink size={12} />
              </small>
            </a>
          ))}
        </div>
      </section>
      <div className="learning-next">
        <div>
          <h3>理解反例之后，回到证明的条件</h3>
          <p>说明每一个假设在哪里发挥作用。</p>
        </div>
        <button className="btn primary" onClick={() => onNavigate("proof")}>
          进入证明思路 <ArrowRight size={16} />
        </button>
      </div>
    </div>
  );
}
