import { useState } from "react";
import { useAppData } from "../../app/DataProvider";
import { MathText } from "../../components/Math";
import type { Attempt } from "../../domain/types";
import { useAIConnection } from "../ai/connection";
import { configureAIMessage } from "../ai/models";
import { generateLocalVariant } from "./api";
import { explainAttempt } from "./review";
import { selectExercise } from "./selection";

export function AttemptInsights({attempt,navigate}: {attempt:Attempt; navigate:(to:string)=>void}) {
  const { refreshLocal, selectConcept } = useAppData();
  const { status } = useAIConnection();
  const [busy,setBusy] = useState(false);
  const [notice,setNotice] = useState("");
  const review = attempt.aiReview;
  async function generate() {
    if (!status?.configured) {setNotice(configureAIMessage);return;}
    if (!attempt.feedback) {setNotice("请先在本机工作台重新提交这条旧作答，再生成针对它的变式题。");return;}
    setBusy(true);setNotice("");
    try {
      const result = await generateLocalVariant(attempt.id,review?.error_focus || attempt.feedback.missing_steps?.[0]);
      await refreshLocal();
      selectConcept(attempt.topicId);
      selectExercise(attempt.topicId,result.code);
      navigate("exercises");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "暂时无法生成变式题，请重试。");
    } finally {setBusy(false);}
  }
  function explain() {
    window.dispatchEvent(new CustomEvent("axiom:explain-attempt", {detail:{
      content:explainAttempt(attempt), reviewed:!!review, title:attempt.title,
    }}));
  }
  return <section className="attempt-insights" aria-label="作答讲评">
    {review && <><h4>AI 逐步审阅</h4><MathText>{review.summary}</MathText>
      <ol>{review.steps.map((step,i)=><li key={i}><strong><MathText>{step.step}</MathText></strong>
        <p><MathText>{step.assessment}</MathText></p><p><MathText>{step.suggestion}</MathText></p></li>)}</ol>
      <p>练习重点 · <MathText>{review.error_focus}</MathText></p></>}
    {attempt.feedback?.ai_review_notice && <p role="status">{attempt.feedback.ai_review_notice}</p>}
    <div className="button-row">
      <button type="button" className="btn" onClick={explain}>让 Hiyori 讲讲错在哪</button>
      <button type="button" className="btn" disabled={busy} onClick={() => void generate()}>{busy ? "正在生成变式题…" : "针对这个薄弱点再出一道变式题"}</button>
    </div>
    {notice && <p role="status">{notice}</p>}
  </section>;
}
