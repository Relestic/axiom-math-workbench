import "../pages/learning.css";
import { ArrowLeft, Bot, FileText, Link2 } from "lucide-react";
import { useState } from "react";
import { useAppData } from "../app/DataProvider";
import type { ClassicSet } from "../domain/types";
import { TeachingFigure } from "../modules/visualization/embedded/TeachingFigure";
import { DirichletDemo } from "../modules/visualization/embedded/DirichletDemo";
import { ReaderAIPanel } from "../modules/reader/ReaderAI";
import { readImageSource, type ImageSource } from "../modules/reader/session";
import "./reader-page.css";

export function ImageLesson({
  onNavigate,
}: {
  onNavigate: (page: string) => void;
}) {
  const app = useAppData();
  const [source] = useState<ImageSource | null>(() => readImageSource());
  const [specialAI, setSpecialAI] = useState(false);
  const specialDirichlet =
    source?.link.visualizationId === "dirichlet-discontinuity";
  const unit = source
    ? app.data.units.find((item) => item.id === source.link.conceptId)
    : undefined;
  const classic = source
    ? (app.data.classics.find(
        (item) => item.id === source.link.conceptId,
      ) as ClassicSet | undefined)
    : undefined;
  const word = source?.format === "docx";
  const location = word
    ? source?.sectionTitle
      ? `第「${source.sectionTitle}」节`
      : "原文段落"
    : `第 ${(source?.pageIndex || 0) + 1} 页`;

  if (!source) {
    return (
      <div className="learning-page image-lesson-page">
        <div className="reader-image-empty">
          <Link2 size={28} />
          <h1>还没有打开讲义来源</h1>
          <p>
            直接打开图像地址时，阅读器无法确认它属于哪份讲义。请先从原讲义页面点击图像文字链接；不会用无关图像冒充已恢复来源。
          </p>
          <button className="btn primary" onClick={() => onNavigate("textbook")}>
            <ArrowLeft size={15} /> 返回教材学习
          </button>
        </div>
      </div>
    );
  }

  if (!specialDirichlet && !unit) {
    return (
      <div className="learning-page image-lesson-page">
        <div className="reader-image-empty">
          <FileText size={28} />
          <h1>图像链接已失效</h1>
          <p>
            这条链接指向的知识点不存在。讲义原文仍在，可以返回{location}重新选择可用链接。
          </p>
          <button className="btn primary" onClick={() => onNavigate("textbook")}>
            <ArrowLeft size={15} /> 返回讲义 · {location}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="learning-page image-lesson-page">
      <div className="page-heading learning-heading image-lesson-heading">
        <div>
          <div className="learning-step">图像学习 · 来自原讲义文字链接</div>
          <h1>{source.link.label}</h1>
          <p className="muted">
            来源：{source.documentName} · {location}
            {source.link.exactText ? ` · 原文「${source.link.exactText}」` : ""}
            。探索后返回仍会回到原段落。
          </p>
        </div>
        <button className="btn primary" onClick={() => onNavigate("textbook")}>
          <ArrowLeft size={15} /> 返回讲义 · {location}
        </button>
      </div>

      <div className="image-source-strip">
        <Link2 size={15} />
        <span>{source.link.description}</span>
        {source.link.origin === "local" && (
          <span className="badge amber">本地词库候选</span>
        )}
        {source.link.origin === "auto" && (
          <span className="badge purple">自动识别</span>
        )}
        {source.isDemo && <span className="badge amber">测试讲义</span>}
        {specialDirichlet && (
          <button className="btn" onClick={() => setSpecialAI(true)}>
            <Bot size={13} /> 与 AI 讨论这个反例
          </button>
        )}
      </div>

      {specialDirichlet ? (
        <DirichletDemo
          focus={source.link.focus}
          sourceLabel={`${source.documentName} · ${location}`}
        />
      ) : (
        <TeachingFigure
          key={source.link.id}
          unit={unit!}
          classic={classic}
          initialVariant={source.link.caseId}
          onNavigate={onNavigate}
        />
      )}

      {specialDirichlet && (
        <ReaderAIPanel
          open={specialAI}
          onClose={() => setSpecialAI(false)}
          documentName="狄利克雷函数专用反例"
          pageIndex={0}
          pageCount={1}
          pageText="狄利克雷函数在有理点取 1、无理点取 0；任意邻域内同时有有理点和无理点，函数值差恒为 1，因此处处不连续、不可导；在 [0,1] 上上下和分别为 1 和 0，不 Riemann 可积。本页点集是有限示意，不是完整函数图像。"
          contextLabel="正在讨论：狄利克雷函数的不连续性"
          contextDescription="只发送这个专用反例的说明；有限点集不构成证明。"
          contextKey={source.link.id}
          sourceType="docx"
          blockId={source.blockId}
          sectionTitle={source.sectionTitle}
          documentId={source.docId}
        />
      )}

      <p className="reader-footnote">
        {specialDirichlet
          ? "这是针对特殊对象的专用示意：点集是有限展示，不能替代不连续、不可导或不可积的证明。"
          : "这里的函数、参数和图像是关联的教学场景；返回讲义后原文、段落和阅读位置不会被改写。"}
      </p>
    </div>
  );
}
