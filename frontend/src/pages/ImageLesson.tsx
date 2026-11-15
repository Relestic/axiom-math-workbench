import "../pages/learning.css";
import { ArrowLeft, FileText, Link2 } from "lucide-react";
import { useState } from "react";
import { useAppData } from "../app/DataProvider";
import type { ClassicSet } from "../domain/types";
import { TeachingFigure } from "../modules/visualization/embedded/TeachingFigure";
import {
  readImageSource,
  type ImageSource,
} from "../modules/reader/session";
import "./reader-page.css";

export function ImageLesson({
  onNavigate,
}: {
  onNavigate: (page: string) => void;
}) {
  const app = useAppData();
  const [source] = useState<ImageSource | null>(() => readImageSource());
  const unit = source
    ? app.data.units.find((item) => item.id === source.link.conceptId)
    : undefined;
  const classic = source
    ? (app.data.classics.find(
        (item) => item.id === source.link.conceptId,
      ) as ClassicSet | undefined)
    : undefined;

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

  if (!unit) {
    return (
      <div className="learning-page image-lesson-page">
        <div className="reader-image-empty">
          <FileText size={28} />
          <h1>图像链接已失效</h1>
          <p>
            这条链接指向的知识点不存在。讲义原文仍在，可以返回第{" "}
            {source.pageIndex + 1} 页重新选择可用链接。
          </p>
          <button className="btn primary" onClick={() => onNavigate("textbook")}>
            <ArrowLeft size={15} /> 返回讲义 · 第 {source.pageIndex + 1} 页
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="learning-page image-lesson-page">
      <div className="page-heading learning-heading image-lesson-heading">
        <div>
          <div className="learning-step">图像学习 · 来自原讲义链接</div>
          <h1>{source.link.label}</h1>
          <p className="muted">
            来源：{source.documentName} · 第 {source.pageIndex + 1} /{" "}
            {source.pageCount} 页。探索后返回仍会回到这一页。
          </p>
        </div>
        <button className="btn primary" onClick={() => onNavigate("textbook")}>
          <ArrowLeft size={15} /> 返回讲义 · 第 {source.pageIndex + 1} 页
        </button>
      </div>

      <div className="image-source-strip">
        <Link2 size={15} />
        <span>{source.link.description}</span>
        {source.isDemo && <span className="badge amber">测试讲义</span>}
      </div>

      <TeachingFigure
        key={source.link.id}
        unit={unit}
        classic={classic}
        initialVariant={source.link.caseId}
        onNavigate={onNavigate}
      />

      <p className="reader-footnote">
        这里的函数、参数和图像是关联的教学场景；返回讲义后原文、页码与缩放不会被改写。
      </p>
    </div>
  );
}
