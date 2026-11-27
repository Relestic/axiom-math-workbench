import { AttemptInsights } from "../../modules/practice/AttemptInsights";
import { selectExercise, useExerciseSelection } from "../../modules/practice/selection";
import { variantCode } from "../../modules/practice/review";
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
import { useEffect, useRef, useState } from "react";
import { useAppData } from "../../app/DataProvider";
import { useWorkspaceEndpoint } from "../../app/useWorkspaceEndpoint";
import { MathPreview, MathText, SymbolBar } from "../../components/Math";
import type { Attempt } from "../../domain/types";
import "../grading.css";
import { Heading, useUnit, type Props } from "./shared";

export function Exercises(props: Props) {
  const app = useAppData();
  const {unit} = useUnit();
  if (!app.data.exercises.some(item => item.topicId === unit.id)) {
    return <section className="card"><h2>{unit.title}</h2><p>当前知识点还没有练习题。</p>
      <button className="btn" onClick={() => props.onNavigate("textbook")}>阅读这张知识卡片</button></section>;
  }
  return <ExerciseWorkspace {...props}/>;
}

function ExerciseWorkspace({ onNavigate, onSaveNote, notify }: Props) {
  const app = useAppData();
  const { unit } = useUnit();
  const selection = useExerciseSelection(unit.id);
  const choices = app.data.exercises.filter(item => item.topicId === unit.id);
  const exercise = (variantCode.test(selection) ? choices.find(item => item.id === selection)
    : choices.find(item => item.coefficient === Number(selection))) || choices[0];
  const coefficient = exercise.coefficient;
  const [submittedId,setSubmittedId] = useState("");
  const requestKey = useRef("");
  const submission = useRef(false);
  const currentExercise = useRef(exercise.id);
  currentExercise.current = exercise.id;
  const lastAttempt = app.data.attempts.find(item => item.id === submittedId && item.exerciseId === exercise.id);
  const [answer, setAnswer] = useState("");
  const answerInput = useRef<HTMLTextAreaElement>(null);
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
    setSubmittedId("");
    requestKey.current = "";
    setHintText(exercise.hint);
    setServerSolution(null);
    setFeedback(null);
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
  useWorkspaceEndpoint(
    "exercises",
    JSON.stringify([
      unit.id,
      exercise.id,
      exercise.title,
      exercise.type,
      exercise.hint,
      answer,
    ]),
    {
      query: () => ({
        exercise: {
          id: exercise.id,
          unit_id: unit.id,
          title: exercise.title,
          type: exercise.type,
          draft_answer: answer.slice(0, 6000),
          hint: exercise.hint,
        },
      }),
    },
  );
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
    if (saving) return;
    setAnswer(value);
    setSubmittedId("");
    setFeedback(null);
    requestKey.current = "";
    setSaved(false);
    try {
      localStorage.setItem(`axiom-draft-${exercise.id}`, value);
    } catch {}
  };
  const storeAttempt = async () => {
    if (!answer.trim()) {
      notify("请先写下你的思路或证明，再保存作答");
      return;
    }
    if (submission.current) return;
    submission.current = true;
    const key = requestKey.current ||= crypto.randomUUID();
    setSaving(true);
    try {
      const attempt = await app.submitAttempt({
        exerciseId: exercise.id,
        idempotencyKey: key,
        answer: answer.trim(),
        hintsUsed: usedHint ? 1 : 0,
        solutionViewed: seenSolution,
      });
      if (currentExercise.current !== exercise.id || requestKey.current !== key) return;
      setSubmittedId(attempt.id);
      setFeedback(attempt.feedback || null);
      setSaved(true);
      notify(
        typeof attempt.feedback?.score === "number"
          ? `已批改：${attempt.feedback.score} / 100`
          : attempt.feedback?.summary
            ? `已提交：${attempt.feedback.summary}`
            : app.data.source === "server"
              ? "作答已保存到服务端"
              : "作答已保存到本地，可前往复盘自评",
      );
    } catch (cause) {
      notify(
        cause instanceof Error
          ? cause.message
          : "保存失败，请先复制你的作答",
      );
    } finally {
      submission.current = false;
      setSaving(false);
    }
  };
  const generate = () => {
    const next = coefficient >= 2 && coefficient < 5 ? coefficient + 1 : 2;
    selectExercise(unit.id, String(next));
    notify("已切换到本地模板的下一道参数变式");
  };
  return (
    <div className="learning-page exercises-page">
      <Heading
        step="第 3 步 / 共 3 步"
        title="练习题库 · 从理解到独立证明"
        description="围绕当前知识点练习。每道题都有提示、思路和完整解答。"
      >
        <button className="btn" onClick={() => onNavigate("review")}>
          <Clock size={15} />
          作答记录
        </button>
      </Heading>
      <div className="exercise-settings card">
        <div className="exercise-mode">
          <span className="badge purple">基础证明与条件辨析</span>
          <small>
            {app.data.source === "server"
              ? "已审核模板 · 作答写入学习记录"
              : "本地题库 · 可独立作答"}
          </small>
        </div>
        <button className="btn primary" onClick={generate}>
          <RefreshCw size={15} />
          切换参数题
        </button>
      </div>
      <div className="exercise-layout">
        <section className="card exercise-main">
          <div className="section-title">
            <span className="badge purple">{exercise.source === "ai-variant" ? "错因变式" : `练习 ${coefficient - 1} / 4`}</span>
            <h3>{unit.title}</h3>
            {exercise.source !== "ai-variant" && <span className="badge">模板 {exercise.id}</span>}
          </div>
          {choices.some(item => item.source === "ai-variant") && <label className="field-label">选择练习题
            <select value={exercise.id} onChange={event => {
              const target = choices.find(item => item.id === event.target.value);
              if (target) selectExercise(unit.id,target.source === "ai-variant" ? target.id : String(target.coefficient));
            }}>{choices.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>}
          {exercise.provenance?.target_error && <p className="info-strip">本题针对你在上题中的「{exercise.provenance.target_error}」薄弱点生成。</p>}
          <h2 className="exercise-question">
            <MathText>{exercise.title}</MathText>
          </h2>
          <div className="allowed-tools">
            <span>可使用</span>
            {(exercise.allowedRefs?.length ? exercise.allowedRefs : unit.tools).map((x) => (
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
                ? "提交后自动批改并写入学习记录"
                : "本地保存草稿与作答记录"}
            </span>
          </label>
          <textarea
            ref={answerInput}
            id="exercise-answer"
            value={answer}
            readOnly={saving}
            onChange={(e) => updateAnswer(e.target.value)}
            placeholder={
              exercise.type === "computation"
                ? "写出关键步骤，并在最后单独一行写最终答案，例如：\nF(x)=2*x^3/3\n\n自动批改会提取这一行做符号检查。"
                : "从定义和条件出发，写下你的证明……\n例如：任给 ε > 0，我们选择……"
            }
            rows={9}
          />
          <SymbolBar
            inputRef={answerInput}
            value={answer}
            onChange={updateAnswer}
          />
          <MathPreview value={answer} />
          <div className="answer-footer">
            <span className="muted">
              {answer.length} 字 · {saved ? "已提交保存" : "草稿自动保存"}
            </span>
            <button
              className="btn primary"
              disabled={saved || saving}
              onClick={() => void storeAttempt()}
            >
              <Send size={15} />
              {saved ? "已批改" : saving ? "正在批改…" : "提交批改"}
            </button>
          </div>
          <div className="grading-guide">
            <Check size={13} />
            计算题检查最终表达式；证明题按关键步骤给结构分，不代替人工复核。
          </div>
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
                      (feedback.correct === true
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
                      (feedback.correct === true
                        ? "green"
                        : feedback.correct === false
                          ? "rose"
                          : "purple")
                    }
                  >
                    {feedback.correct === true
                      ? "自动批改通过"
                      : feedback.correct === false
                        ? "答案需要订正"
                        : typeof feedback.score === "number"
                          ? "结构批改"
                          : "已保存，待人工复核"}
                  </span>
                  <p>
                    <MathText>
                      {feedback.summary ||
                        (feedback.correct === true
                          ? "最终答案与参考结果等价。"
                          : "已记录本次作答。")}
                    </MathText>
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
                      <span><MathText>{criterion.label}</MathText></span>
                      <em>{criterion.weight} 分</em>
                    </li>
                  ))}
                </ul>
              )}

              {feedback.reference_answer && (
                <div className="grading-reference">
                  参考最终结果：
                  <code><MathText>{feedback.reference_answer}</MathText></code>
                  {feedback.correct === false &&
                    "（只比较最终表达式，不否定中间方法）"}
                </div>
              )}

              {feedback.observations
                ?.filter(
                  (item) =>
                    !item.type?.startsWith("criterion_") &&
                    item.type !== "symbolic_check" &&
                    item.type !== "symbolic_mismatch",
                )
                .map((item, index) => (
                  <div className="grading-observation" key={index}>
                    · <MathText>{item.message ?? ""}</MathText>
                  </div>
                ))}

              <div className="grading-caveat">
                {feedback.grading_scope === "structural"
                  ? "结构分只检查关键步骤是否出现，不能证明推理论证正确；不同解法只要满足题意同样有效。"
                  : feedback.grading_scope === "symbolic"
                    ? "符号检查只验证最终表达式，不评价证明方法；无法化简时会保留不确定性。"
                    : "自动批改有边界，请结合完整解答和教师反馈复核。"}
              </div>
            </div>
          )}
          {lastAttempt && app.data.source === "offline" && <AttemptInsights attempt={lastAttempt} navigate={onNavigate}/>}
          {hint && (
            <div className="learning-callout exercise-hint">
              <Lightbulb size={18} />
              <span><MathText>{hintText || exercise.hint}</MathText></span>
            </div>
          )}
          {solution && (
            <div className="solution-panel">
              <div className="section-title">
                <CheckCircle2 size={18} />
                <h3>完整解答</h3>
                <span className="badge green">
                  {exercise.source === "ai-variant" ? "AI 生成参考解答" : "参考解答"}
                </span>
              </div>
              <ol>
                {(serverSolution || exercise.solution).map((s, i) => (
                  <li key={i}><MathText>{s}</MathText></li>
                ))}
              </ol>
              <div className="solution-note">
                参考解答展示一种完整路径。提交后计算题会做符号检查，证明题按关键步骤给结构分；结构分不能证明推理正确，也不排斥其他有效证明。
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
                <span><MathText>{c}</MathText></span>
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
