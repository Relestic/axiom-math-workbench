import "../learning.css";
import {
  ArrowRight,
  Bookmark,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Lightbulb,
  ListChecks,
  Sparkles,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useAppData } from "../../app/DataProvider";
import { consumeTextbookTarget } from "../../navigation";
import type { ClassicSet } from "../../domain/types";
import { TeachingFigure } from "../../modules/visualization/embedded/TeachingFigure";
import { DefinitionTokens, ModuleSelect, useUnit, type Props } from "./shared";
import "./textbook-study.css";

export function Textbook({ onNavigate, notify }: Props) {
  const app = useAppData();
  const { unit, units, select } = useUnit();
  const classic = app.data.classics.find(
    (item) => item.id === unit.id,
  ) as ClassicSet | undefined;
  const [showProof, setShowProof] = useState(false);
  const bookmarked = app.data.bookmarks.includes(unit.id);

  function focusTextbookTarget(target: string) {
    if (target === "proof") setShowProof(true);
    const id = target === "proof" ? "textbook-proof" : "textbook-image";
    window.setTimeout(() => {
      document.getElementById(id)?.scrollIntoView({
        block: "start",
        behavior: "smooth",
      });
    }, 120);
  }

  useEffect(() => {
    const target = consumeTextbookTarget();
    if (target) focusTextbookTarget(target);
    const onTarget = (event: Event) => {
      const value = (event as CustomEvent<string>).detail;
      if (value) focusTextbookTarget(value);
    };
    window.addEventListener("axiom-textbook-target", onTarget);
    return () =>
      window.removeEventListener("axiom-textbook-target", onTarget);
  }, []);

  const toggleBookmark = async () => {
    try {
      await app.toggleBookmark(unit.id);
      notify(bookmarked ? "已取消收藏" : "已收藏这个知识点");
    } catch {
      notify("收藏同步失败，请检查后端连接");
    }
  };

  return (
    <div className="learning-page textbook-page">
      <div className="page-heading learning-heading textbook-heading">
        <div>
          <div className="learning-step">教材学习 · 数学分析</div>
          <h1>教材学习</h1>
          <p className="muted">
            读当前定义，就地操作图像、比较正反例，再和 AI 讨论或完成本节练习。
          </p>
        </div>
        <div className="textbook-heading-actions">
          <button
            className="btn primary"
            onClick={() =>
              document.getElementById("textbook-ai-entry")?.click()
            }
          >
            <Sparkles size={15} /> 与 AI 探讨本节
          </button>
          <button
            className={"btn " + (bookmarked ? "selected" : "")}
            onClick={() => void toggleBookmark()}
          >
            <Bookmark size={14} /> {bookmarked ? "已收藏" : "收藏"}
          </button>
        </div>
      </div>

      <div className="textbook-study">
        <main className="textbook-main">
          <div className="textbook-context-row">
            <ModuleSelect unit={unit} select={select} />
            <div className="textbook-pager">
              <button
                className="btn icon"
                aria-label="上一个知识点"
                onClick={() =>
                  select(
                    units[
                      (units.findIndex((item) => item.id === unit.id) +
                        units.length -
                        1) %
                        units.length
                    ].id,
                  )
                }
              >
                <ChevronLeft size={15} />
              </button>
              <span>
                {units.findIndex((item) => item.id === unit.id) + 1} /{" "}
                {units.length}
              </span>
              <button
                className="btn icon"
                aria-label="下一个知识点"
                onClick={() =>
                  select(
                    units[
                      (units.findIndex((item) => item.id === unit.id) + 1) %
                        units.length
                    ].id,
                  )
                }
              >
                <ChevronRight size={15} />
              </button>
            </div>
          </div>

          <section className="card textbook-definition-card">
            <div className="textbook-definition-head">
              <span className="badge purple">
                <BookOpen size={13} /> 当前知识点
              </span>
              <span className="textbook-chapter">{unit.chapter}</span>
            </div>
            <h2>{unit.title}</h2>
            <p className="definition-copy">{unit.definition}</p>
            <div className="textbook-relation">
              <strong>关键关系</strong>
              <span>{unit.formula}</span>
            </div>
            <details className="textbook-token-details" open>
              <summary>
                <ListChecks size={14} /> 定义与条件拆解
              </summary>
              <DefinitionTokens unit={unit} />
            </details>
            <div className="learning-callout">
              <Lightbulb size={16} />
              <span>{unit.hint}</span>
            </div>
          </section>

          <TeachingFigure
            unit={unit}
            classic={classic}
            onNavigate={onNavigate}
          />

          <details
            id="textbook-proof"
            className="proof-details card"
            open={showProof}
            onToggle={(event) =>
              setShowProof((event.currentTarget as HTMLDetailsElement).open)
            }
          >
            <summary>
              <span>
                <CheckCircle2 size={15} />
                查看证明：关键思路、完整论证与条件使用位置
              </span>
              <span className="badge green">{unit.proof.length} 步</span>
            </summary>
            <ol className="proof-details-steps">
              {unit.proof.map((step, index) => (
                <li key={index}>{step}</li>
              ))}
            </ol>
            <div className="proof-details-conditions">
              <strong>本证明使用的条件</strong>
              <div>
                {unit.conditions.map((condition) => (
                  <span className="badge teal" key={condition}>
                    {condition}
                  </span>
                ))}
              </div>
              <p>
                图像变化不会自动改变定理成立条件；自定义场景不自动继承本证明的结论。
              </p>
            </div>
          </details>

          <div className="textbook-actions card">
            <div>
              <h3>把这一节走到下一步</h3>
              <p>练习会携带当前知识点；提示、讨论、提交和完整解答都在题目内。</p>
            </div>
            <button
              className="btn primary"
              onClick={() => onNavigate("exercises")}
            >
              <ArrowRight size={15} /> 做本节练习
            </button>
          </div>
        </main>

        <aside className="textbook-side">
          <section className="card textbook-side-card">
            <div className="section-title">
              <ListChecks size={16} />
              <h3>符号与记号</h3>
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
                        ["条件", "condition", "使用定理前必须检查的假设"],
                      ]
                  ).map((row) => (
                    <tr key={row[0]}>
                      {row.map((cell, index) => (
                        <td key={index}>{cell}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="card textbook-side-card">
            <div className="section-title">
              <BookOpen size={16} />
              <h3>本节工具与出处</h3>
            </div>
            <div className="allowed-tools">
              {unit.tools.map((tool) => (
                <span className="badge green" key={tool}>
                  {tool}
                </span>
              ))}
            </div>
            {unit.source && (
              <a
                className="textbook-source"
                href={unit.source}
                target="_blank"
                rel="noreferrer"
              >
                阅读原始讲义 <ExternalLink size={12} />
              </a>
            )}
            <p className="textbook-source-note">
              这是项目原创示例讲义，不对应真实教材页码；证明与案例的可靠出处以链接为准。
            </p>
          </section>

          <section className="card textbook-side-card textbook-checklist">
            <div className="section-title">
              <Check size={16} />
              <h3>阅读时检查</h3>
            </div>
            {unit.conditions.map((check) => (
              <p key={check}>
                <CheckCircle2 size={12} /> {check}
              </p>
            ))}
          </section>
        </aside>
      </div>
    </div>
  );
}
