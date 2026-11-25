import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  Check,
  ChevronRight,
  Clock3,
  Download,
  Eye,
  FileText,
  Flame,
  Play,
  Plus,
  Search,
  Sparkles,
  StickyNote,
  Trash2,
  TrendingUp,
  Upload,
  X,
} from "lucide-react";
import { useAppData } from "../app/DataProvider";

export function Diagnostic({ onNavigate }: { onNavigate: (p: string) => void }) {
  const app = useAppData();
  const questions = app.data.diagnostic.questions;
  const storedResult = app.data.diagnostic.result;
  const [answers, setAnswers] = useState<Record<number, number>>(
    app.data.diagnostic.answers,
  );
  const [done, setDone] = useState(Boolean(storedResult));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setAnswers(app.data.diagnostic.answers);
    if (app.data.diagnostic.result) setDone(true);
  }, [app.data.diagnostic.answers, app.data.diagnostic.result]);

  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      const keyed = Object.fromEntries(
        Object.entries(answers).map(([index, value]) => [index, value]),
      );
      await app.submitDiagnostic(keyed);
      setDone(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "提交诊断失败，请重试");
    } finally {
      setBusy(false);
    }
  };

  const resultFor = (index: number) =>
    storedResult?.results.find(
      (item) => item.questionId === questions[index]?.id,
    );

  return (
    <>
      <div className="page-heading">
        <div>
          <span className="badge">{questions.length} 个问题 · 约 2 分钟</span>
          <h1>前置知识诊断</h1>
          <p>检查概念是否清楚，找到最值得先补的一步。</p>
        </div>
      </div>
      <div className="diagnostic-list">
        {questions.map((question, index) => {
          const item = resultFor(index);
          return (
            <section className="card" key={question.id}>
              <span className="badge">0{index + 1}</span>
              <h3>{question.text}</h3>
              {question.options.map((option, optionIndex) => (
                <label
                  className={`answer-option ${answers[index] === optionIndex ? "selected" : ""}`}
                  key={`${question.id}-${optionIndex}`}
                >
                  <input
                    type="radio"
                    name={`q${index}`}
                    checked={answers[index] === optionIndex}
                    onChange={() => {
                      setAnswers({ ...answers, [index]: optionIndex });
                      setDone(false);
                    }}
                  />
                  {option}
                </label>
              ))}
              {done && item && (
                <div
                  className={`info-strip ${item.correct ? "success" : "warning"}`}
                >
                  {item.correct ? "判断正确。" : "再想一想。"}
                  {item.reason}
                </div>
              )}
            </section>
          );
        })}
      </div>
      {error && (
        <div className="info-strip warning" role="alert">
          {error}
        </div>
      )}
      <div className="diagnostic-actions">
        <button
          className="btn primary"
          disabled={
            Object.keys(answers).length !== questions.length || busy
          }
          onClick={() => void submit()}
        >
          {busy ? "正在提交…" : done ? "重新查看结果" : "查看诊断结果"}
        </button>
        {done && storedResult && (
          <>
            <strong>
              答对 {storedResult.correctCount} / {storedResult.total}
            </strong>
            <button className="btn" onClick={() => onNavigate("textbook")}>
              返回定义与条件
              <ArrowRight size={16} />
            </button>
          </>
        )}
      </div>
    </>
  );
}
