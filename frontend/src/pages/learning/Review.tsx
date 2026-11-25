import { MathText } from "../../components/Math";
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
import { useAppData } from "../../app/DataProvider";
import type { Attempt } from "../../domain/types";
import { Heading, type Props } from "./shared";

export function Review({ onNavigate, onSaveNote, notify }: Props) {
  const app = useAppData();
  const attempts = app.data.attempts;
  const [filter, setFilter] = useState("all");
  const [active, setActive] = useState<string | null>(null);
  const visible = attempts.filter(
    (a) => filter === "all" || a.selfRating === filter,
  );
  const selected = attempts.find((a) => a.id === active);
  const solutionFor = (a: Attempt) =>
    app.getExercise(a.topicId, a.coefficient)?.solution || [];
  const rate = async (id: string, rating: Attempt["selfRating"]) => {
    try {
      await app.rateAttempt(id, rating);
      notify("已保存本次自评");
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : "保存失败，请重试");
    }
  };
  const download = () => {
    const blob = new Blob([JSON.stringify(attempts, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "axiom-learning-records.json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    notify("学习记录已导出");
  };
  return (
    <div className="learning-page review-page">
      <Heading
        step="第 6 步 / 共 6 步"
        title="完整解答与复盘"
        description="保留自己的推理过程，对照参考解答，把这一次学习变成下一次的进步。"
      >
        <button className="btn" disabled={!attempts.length} onClick={download}>
          <Download size={15} />
          导出记录
        </button>
      </Heading>
      <div className="review-stat-grid">
        {[
          ["已保存作答", attempts.length],
          [
            "独立作答",
            attempts.filter((a) => !a.hints && !a.solutionSeen).length,
          ],
          [
            "标记待复习",
            attempts.filter((a) => a.selfRating === "revisit").length,
          ],
          [
            "自评已理解",
            attempts.filter((a) => a.selfRating === "understood").length,
          ],
        ].map(([label, value]) => (
          <div className="card review-stat" key={label}>
            <span className="muted">{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
      <div className="learning-tabs">
        {[
          ["all", "全部作答"],
          ["pending", "待复盘"],
          ["revisit", "需要再练"],
          ["understood", "自评已理解"],
        ].map(([value, label]) => (
          <button
            key={value}
            className={filter === value ? "active" : ""}
            onClick={() => setFilter(value)}
          >
            {label}
          </button>
        ))}
      </div>
      {!visible.length ? (
        <section className="card empty-review">
          <div className="empty-review-icon">
            <FileText size={35} />
          </div>
          <h2>
            {attempts.length
              ? "这一分类还没有记录"
              : "你的学习记录，从第一道题开始"}
          </h2>
          <p className="muted">
            保存一次作答后，就能在这里查看原始思路、完整解答和使用提示的情况。
          </p>
          <button
            className="btn primary"
            onClick={() => onNavigate("exercises")}
          >
            开始一道练习 <ArrowRight size={16} />
          </button>
        </section>
      ) : (
        <div className="review-list">
          {visible.map((a) => (
            <section
              className={
                "card attempt-card " + (active === a.id ? "active" : "")
              }
              key={a.id}
            >
              <div className="section-title">
                <span className="badge purple">
                  {app.data.units.find((c) => c.id === a.topicId)?.short ||
                    a.topicId}
                </span>
                <span className="badge">
                  {a.solutionSeen
                    ? "查看解答后作答"
                    : a.hints
                      ? "使用过提示"
                      : "独立作答"}
                </span>
                {typeof a.score === "number" && (
                  <span
                    className={
                      "badge " +
                      (a.feedback?.correct === true
                        ? "green"
                        : a.feedback?.correct === false
                          ? "rose"
                          : "teal")
                    }
                  >
                    批改 {a.score} 分
                  </span>
                )}
                <small className="muted">
                  {new Date(a.createdAt).toLocaleString("zh-CN", {
                    month: "2-digit",
                    day: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </small>
              </div>
              <h3><MathText>{a.title}</MathText></h3>
              <p className="answer-preview">
                <MathText>{a.answer}</MathText>
              </p>
              <div className="attempt-actions">
                <button
                  className="btn"
                  onClick={() => setActive(active === a.id ? null : a.id)}
                >
                  <Eye size={14} />
                  {active === a.id ? "收起对照" : "对照完整解答"}
                </button>
                <button
                  className={
                    "btn " + (a.selfRating === "revisit" ? "selected" : "")
                  }
                  onClick={() => rate(a.id, "revisit")}
                >
                  需要再练
                </button>
                <button
                  className={
                    "btn " + (a.selfRating === "understood" ? "selected" : "")
                  }
                  onClick={() => rate(a.id, "understood")}
                >
                  <Check size={14} />
                  自评已理解
                </button>
                <button
                  className="btn"
                  onClick={() => {
                    try {
                      app.selectConcept(a.topicId);
                      localStorage.setItem(
                        `axiom-exercise-variant-${a.topicId}`,
                        String(a.coefficient === 5 ? 2 : a.coefficient + 1),
                      );
                    } catch {}
                    onNavigate("exercises");
                  }}
                >
                  再练一道 <ArrowRight size={14} />
                </button>
              </div>
              {selected?.id === a.id && (
                <div className="solution-panel">
                  <h4>参考解答</h4>
                  <ol>
                    {solutionFor(a).map((step, index) => (
                      <li key={index}><MathText>{step}</MathText></li>
                    ))}
                  </ol>
                  <button
                    className="btn small"
                    onClick={() => {
                      onSaveNote(
                        `${a.title}\n我的作答：${a.answer}\n复盘：${solutionFor(a).join("\n")}`,
                        a.topicId,
                      );
                      notify("作答与解答已保存到笔记");
                    }}
                  >
                    <Bookmark size={14} />
                    保存复盘笔记
                  </button>
                </div>
              )}
            </section>
          ))}
        </div>
      )}
      <div className="learning-callout">
        <Lightbulb size={17} />
        <span>
          自评反映你当前的判断，不是自动评分。建议隔一段时间重新独立作答，检查是否真正掌握了证明方法。
        </span>
      </div>
    </div>
  );
}
