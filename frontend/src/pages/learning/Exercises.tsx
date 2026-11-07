import "../learning.css";
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
  MessageCircle,
  RefreshCw,
  Send,
  Sparkles,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useAppData } from "../../app/DataProvider";
import { mapAttempt } from "../../domain/mappers";
import type { Attempt } from "../../domain/types";
import { ExerciseDiscussion } from "../../modules/practice/ExerciseDiscussion";
import {
  submitExerciseWithAI,
  type DiscussionTurn,
} from "../../modules/practice/api";
import "../grading.css";
import { Heading, ModuleSelect, useUnit, type Props } from "./shared";

function savedVariant(id: string) {
  const n = Number(localStorage.getItem(`axiom-exercise-variant-${id}`));
  return Number.isInteger(n) && n >= 2 && n <= 5 ? n : 2;
}

export function Exercises({ onNavigate, onSaveNote, notify }: Props) {
  const app = useAppData();
  const { unit, select } = useUnit();
  const [coefficient, setCoefficient] = useState(() => savedVariant(unit.id));
  useEffect(() => setCoefficient(savedVariant(unit.id)), [unit.id]);
  const exercise = (app.getExercise(unit.id, coefficient) ||
    app.data.exercises.find((item) => item.topicId === unit.id) ||
    app.data.exercises[0]) as (typeof app.data.exercises)[number];
  const [answer, setAnswer] = useState("");
  const [hint, setHint] = useState(false);
  const [solution, setSolution] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [hintText, setHintText] = useState("");
  const [serverSolution, setServerSolution] = useState<string[] | null>(null);
  const [feedback, setFeedback] = useState<Attempt["feedback"] | null>(null);
  const [usedHint, setUsedHint] = useState(false);
  const [seenSolution, setSeenSolution] = useState(false);
  const [selfChecks, setSelfChecks] = useState<number[]>([]);
  const [discussionOpen, setDiscussionOpen] = useState(false);
  const [discussion, setDiscussion] = useState<DiscussionTurn[]>([]);
  useEffect(() => {
    try {
      setAnswer(localStorage.getItem(`axiom-draft-${exercise.id}`) || "");
    } catch {
      setAnswer("");
    }
    setHint(false);
    setSolution(false);
    setSaved(false);
    setSaving(false);
    setHintText(exercise.hint);
    setServerSolution(null);
    setFeedback(null);
    setDiscussionOpen(false);
    setDiscussion([]);
    let assistance = { hint: false, solution: false };
    try {
      assistance =
        JSON.parse(
          localStorage.getItem(`axiom-assistance-${exercise.id}`) || "null",
        ) || assistance;
    } catch {}
    setUsedHint(assistance.hint);
    setSeenSolution(assistance.solution);
    setSelfChecks([]);
  }, [exercise.id]);
  const recordAssistance = (kind: "hint" | "solution") => {
    const next = {
      hint: usedHint || kind === "hint",
      solution: seenSolution || kind === "solution",
    };
    setUsedHint(next.hint);
    setSeenSolution(next.solution);
    try {
      localStorage.setItem(
        `axiom-assistance-${exercise.id}`,
        JSON.stringify(next),
      );
    } catch {}
  };
  const updateAnswer = (value: string) => {
    setAnswer(value);
    setSaved(false);
    try {
      localStorage.setItem(`axiom-draft-${exercise.id}`, value);
    } catch {}
  };
  const submitAnswer = async () => {
    if (!answer.trim()) {
      notify("请先写下你的思路或证明，再提交答案");
      return;
    }
    setSaving(true);
    try {
      const dto = await submitExerciseWithAI({
        exercise_id: exercise.id,
        answer_text: answer.trim(),
        history: discussion,
        hints_used: usedHint ? 1 : 0,
        solution_viewed: seenSolution,
      });
      const attempt = mapAttempt(dto);
      app.recordAttempt(attempt);
      setFeedback(attempt.feedback || null);
      setSaved(true);
      setDiscussionOpen(false);
      notify(
        typeof attempt.feedback?.score === "number"
          ? `AI 批改完成：${attempt.feedback.score} / 100`
          : "AI 已给出反馈",
      );
    } catch (cause) {
      notify(
        cause instanceof Error
          ? cause.message
          : "AI 批改失败，请保留作答后重试",
      );
    } finally {
      setSaving(false);
    }
  };
  const generate = () => {
    const next = coefficient === 5 ? 2 : coefficient + 1;
    setCoefficient(next);
    localStorage.setItem(`axiom-exercise-variant-${unit.id}`, String(next));
    notify("已切换到本地模板的下一道参数变式");
  };
  const aiGraded =
    feedback?.grading_scope === "ai" || feedback?.status === "ai_reviewed";
  return (
    <div className="learning-page exercises-page">
      <Heading
        step="第 5 步 / 共 6 步"
        title="练习题库 · 从理解到独立证明"
        description="围绕当前知识点练习。每道题都有提示、思路和完整解答。"
      >
        <button className="btn" onClick={() => onNavigate("review")}>
          <Clock size={15} />
          作答记录
        </button>
      </Heading>
      <div className="exercise-settings card">
        <ModuleSelect unit={unit} select={select} />
        <div className="exercise-mode">
          <span className="badge purple">基础证明与条件辨析</span>
          <small>
            {app.data.source === "server"
              ? "服务端已审核模板 · 作答写入学习记录"
              : "本地模板练习 · 未连接后端"}
          </small>
        </div>
        <button className="btn primary" onClick={generate}>
          <RefreshCw size={15} />
          生成一道变式
        </button>
      </div>
      <div className="exercise-layout">
        <section className="card exercise-main">
          <div className="section-title">
            <span className="badge purple">练习 {coefficient - 1} / 4</span>
            <h3>{unit.title}</h3>
            <span className="badge">模板 {exercise.id}</span>
          </div>
          <h2 className="exercise-question">{exercise.title}</h2>
          <div className="allowed-tools">
            <span>可使用</span>
            {unit.tools.map((x) => (
              <span className="badge green" key={x}>
                {x}
              </span>
            ))}
          </div>
          <label className="answer-label" htmlFor="exercise-answer">
            <FileText size={15} />
            {exercise.type === "computation"
              ? "我的解答与最终答案"
              : "我的证明与思路"}{" "}
            <span>
              {app.data.source === "server"
                ? "可以先和 AI 讨论，再提交最终答案"
                : "离线模式只保存草稿"}
            </span>
          </label>
          <textarea
            id="exercise-answer"
            value={answer}
            onChange={(e) => updateAnswer(e.target.value)}
            placeholder={
              exercise.type === "computation"
                ? "写出关键步骤和最终答案。\n卡住时可以先点“和 AI 讨论”，讨论不会提交。"
                : "从定义和条件出发，写下你的证明。\n卡住时可以先点“和 AI 讨论”，让 AI 追问你的思路。"
            }
            rows={9}
          />
          <div className="answer-footer">
            <span className="muted">
              {answer.length} 字 · {saved ? "已提交" : "草稿自动保存"}
            </span>
            <div className="answer-actions">
              <button
                className={"btn " + (discussionOpen ? "selected" : "")}
                disabled={saved || saving}
                onClick={() => setDiscussionOpen((value) => !value)}
              >
                <MessageCircle size={15} />
                {discussionOpen ? "收起讨论" : "和 AI 讨论"}
              </button>
              <button
                className="btn primary"
                disabled={saved || saving}
                onClick={() => void submitAnswer()}
              >
                <Send size={15} />
                {saved ? "已提交" : saving ? "AI 批改中…" : "提交答案"}
              </button>
            </div>
          </div>
          <div className="grading-guide">
            <Check size={13} />
            讨论只帮你理清思路；“提交答案”才会让 AI 写最终评语并记录。
          </div>
          {discussionOpen && !saved && (
            <ExerciseDiscussion
              exerciseId={exercise.id}
              answer={answer}
              messages={discussion}
              setMessages={setDiscussion}
              onClose={() => setDiscussionOpen(false)}
            />
          )}
          <div className="exercise-disclosure">
            <button
              className={"btn " + (hint ? "selected" : "")}
              onClick={() => {
                const opening = !hint;
                setHint(opening);
                recordAssistance("hint");
                if (opening) {
                  void app
                    .loadHint(exercise.id)
                    .then((text) => {
                      if (text) setHintText(text);
                    })
                    .catch(() => {});
                }
              }}
            >
              <Lightbulb size={15} />
              {hint ? "收起提示" : "给我一个提示"}
            </button>
            <button
              className={"btn " + (solution ? "selected" : "")}
              onClick={() => {
                const opening = !solution;
                setSolution(opening);
                recordAssistance("solution");
                if (opening) {
                  void app
                    .loadSolution(exercise.id)
                    .then((steps) => {
                      if (steps.length) setServerSolution(steps);
                    })
                    .catch(() => {});
                }
              }}
            >
              <Eye size={15} />
              {solution ? "收起完整解答" : "查看完整解答"}
            </button>
            <button
              className="btn"
              onClick={() => {
                onSaveNote(
                  `${exercise.title}\n我的思路：${answer || "尚未作答"}`,
                  unit.id,
                );
                notify("练习已保存到我的笔记");
              }}
            >
              <Bookmark size={15} />
              记入笔记
            </button>
          </div>
          {feedback && (
            <div className="grading-result">
              <div className="grading-result-head">
                {typeof feedback.score === "number" && (
                  <div
                    className={
                      "grading-score " +
                      (aiGraded
                        ? "ai"
                        : feedback.correct === true
                          ? "correct"
                          : feedback.correct === false
                            ? "wrong"
                            : "structural")
                    }
                  >
                    <strong>{feedback.score}</strong>
                    <span>/ 100</span>
                  </div>
                )}
                <div className="grading-result-copy">
                  <span
                    className={
                      "badge " +
                      (aiGraded
                        ? "purple"
                        : feedback.correct === true
                          ? "green"
                          : feedback.correct === false
                            ? "rose"
                            : "purple")
                    }
                  >
                    {aiGraded
                      ? "AI 批改"
                      : feedback.correct === true
                        ? "自动批改通过"
                        : feedback.correct === false
                          ? "答案需要订正"
                          : typeof feedback.score === "number"
                            ? "结构批改"
                            : "已保存，待人工复核"}
                  </span>
                  <p>
                    {feedback.summary ||
                      (feedback.correct === true
                        ? "最终答案与参考结果等价。"
                        : "已记录本次作答。")}
                  </p>
                </div>
              </div>

              {feedback.criteria && feedback.criteria.length > 0 && (
                <ul className="grading-criteria">
                  {feedback.criteria.map((criterion) => (
                    <li
                      key={criterion.id}
                      className={criterion.met ? "met" : "missing"}
                    >
                      <span className="criterion-icon">
                        {criterion.met ? (
                          <Check size={13} />
                        ) : (
                          <X size={13} />
                        )}
                      </span>
                      <span>{criterion.label}</span>
                      <em>{criterion.weight} 分</em>
                    </li>
                  ))}
                </ul>
              )}

              {feedback.reference_answer && (
                <div className="grading-reference">
                  参考最终结果：
                  <code>{feedback.reference_answer}</code>
                  {feedback.correct === false &&
                    "（只比较最终表达式，不否定中间方法）"}
                </div>
              )}

              {feedback.ai && (
                <div className="ai-review-details">
                  <h4>AI 批改详情</h4>
                  {feedback.ai.strengths && feedback.ai.strengths.length > 0 && (
                    <ul>
                      <strong>做得好的地方</strong>
                      {feedback.ai.strengths.map((item, index) => (
                        <li key={`strength-${index}`}>{item}</li>
                      ))}
                    </ul>
                  )}
                  {feedback.ai.gaps && feedback.ai.gaps.length > 0 && (
                    <ul>
                      <strong>可以补强的地方</strong>
                      {feedback.ai.gaps.map((item, index) => (
                        <li key={`gap-${index}`}>{item}</li>
                      ))}
                    </ul>
                  )}
                  {feedback.ai.next_steps &&
                    feedback.ai.next_steps.length > 0 && (
                      <p>
                        <strong>下一步：</strong>
                        {feedback.ai.next_steps.join("；")}
                      </p>
                    )}
                </div>
              )}

              {feedback.observations
                ?.filter(
                  (item) =>
                    !item.type?.startsWith("criterion_") &&
                    !item.type?.startsWith("ai_") &&
                    item.type !== "symbolic_check" &&
                    item.type !== "symbolic_mismatch",
                )
                .map((item, index) => (
                  <div className="grading-observation" key={index}>
                    · {item.message}
                  </div>
                ))}

              <div className="grading-caveat">
                {aiGraded
                  ? "AI 批改基于当前答案和讨论记录，仍可能误判；不同但有效的证明路径应同样被接受。"
                  : feedback.grading_scope === "structural"
                    ? "结构分只检查关键步骤是否出现，不能证明推理论证正确；不同解法只要满足题意同样有效。"
                    : feedback.grading_scope === "symbolic"
                      ? "符号检查只验证最终表达式，不评价证明方法；无法化简时会保留不确定性。"
                      : "自动批改有边界，请结合完整解答和教师反馈复核。"}
              </div>
            </div>
          )}
          {hint && (
            <div className="learning-callout exercise-hint">
              <Lightbulb size={18} />
              <span>{hintText || exercise.hint}</span>
            </div>
          )}
          {solution && (
            <div className="solution-panel">
              <div className="section-title">
                <CheckCircle2 size={18} />
                <h3>完整解答</h3>
                <span className="badge green">
                  {app.data.source === "server" ? "服务端已审核解答" : "本地示例内容"}
                </span>
              </div>
              <ol>
                {(serverSolution || exercise.solution).map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ol>
              <div className="solution-note">
                参考解答展示一种完整路径。提交答案后由 AI 结合讨论记录批改；AI 评语仍可能出错，不排斥其他有效证明。
              </div>
            </div>
          )}
        </section>
        <aside className="exercise-sidebar">
          <section className="card">
            <div className="section-title">
              <ListChecks size={17} />
              <h3>证明自查</h3>
            </div>
            <p className="muted">对照下面的要点，检查自己的论证。</p>
            {exercise.checks.map((c, i) => (
              <label className="self-check" key={c}>
                <input
                  type="checkbox"
                  checked={selfChecks.includes(i)}
                  onChange={() =>
                    setSelfChecks(
                      selfChecks.includes(i)
                        ? selfChecks.filter((x) => x !== i)
                        : [...selfChecks, i],
                    )
                  }
                />
                <span>{c}</span>
              </label>
            ))}
            <div className="check-progress">
              <div style={{ width: `${(selfChecks.length / 3) * 100}%` }} />
            </div>
            <small className="muted">
              已检查 {selfChecks.length} / 3 项 · 自查不等同于证明正确
            </small>
          </section>
          <section className="card">
            <div className="section-title">
              <BookOpen size={17} />
              <h3>需要回顾？</h3>
            </div>
            <button
              className="review-link"
              onClick={() => onNavigate("textbook")}
            >
              <div>
                <b>定义与条件</b>
                <small>{unit.title}</small>
              </div>
              <ArrowRight size={16} />
            </button>
            <button className="review-link" onClick={() => onNavigate("proof")}>
              <div>
                <b>证明思路</b>
                <small>关键构造与引用依据</small>
              </div>
              <ArrowRight size={16} />
            </button>
            <button
              className="review-link"
              onClick={() => onNavigate("examples")}
            >
              <div>
                <b>正反例实验室</b>
                <small>检查命题的边界</small>
              </div>
              <ArrowRight size={16} />
            </button>
          </section>
          <section className="exercise-tip">
            <Sparkles size={22} />
            <h3>把“看懂”再往前推一步</h3>
            <p>
              完整解答可以随时查看。读完后换一道变式，不借助解答再写一次，才能获得更有用的学习证据。
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}
