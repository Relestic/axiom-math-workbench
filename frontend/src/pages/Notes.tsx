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
import { download } from "../lib/download";
import type { Note } from "../domain/types";

export function Notes({
  notes,
  save,
  remove,
}: {
  notes: Note[];
  save: (s: string) => Promise<void>;
  remove: (id: string) => void;
}) {
  const [text, setText] = useState("");
  const [filter, setFilter] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const submit = async () => {
    if (!text.trim() || saving) return;
    setSaving(true);
    setError("");
    try {
      await save(text.trim());
      setText("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "保存笔记失败，请重试");
    } finally {
      setSaving(false);
    }
  };
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="badge">个人学习空间</span>
          <h1>我的笔记</h1>
          <p>留住那些“原来如此”的瞬间，把观察写成自己的理解。</p>
        </div>
        <button
          className="btn"
          disabled={!notes.length}
          onClick={() =>
            download(
              "axiom-notes.md",
              notes.map((n) => `## ${n.date}\n\n${n.text}`).join("\n\n"),
            )
          }
        >
          <Download size={16} />
          导出笔记
        </button>
      </div>
      <div className="card note-editor">
        <h3>记录一个想法</h3>
        <textarea
          aria-label="新笔记"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="写下图像中的观察、证明里的关键一步，或一个尚未解开的疑问…"
        />
        <button
          className="btn primary"
          disabled={!text.trim() || saving}
          onClick={() => void submit()}
        >
          <Plus size={16} />
          {saving ? "正在保存…" : "保存笔记"}
        </button>
      </div>
      {error && (
        <div className="info-strip warning" role="alert">
          {error}
        </div>
      )}
      <input
        className="text-input note-search"
        aria-label="搜索笔记"
        placeholder="搜索我的笔记…"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
      />
      <div className="notes-grid">
        {notes
          .filter((n) => n.text.includes(filter))
          .map((n) => (
            <article className="card note-card" key={n.id}>
              <div>
                <span className="badge">学习观察</span>
                <button
                  className="icon-button"
                  aria-label="删除笔记"
                  onClick={() => remove(n.id)}
                >
                  <Trash2 size={16} />
                </button>
              </div>
              <p>{n.text}</p>
              <small className="muted">{n.date}</small>
            </article>
          ))}
      </div>
      {!notes.length && (
        <div className="empty-state">
          <StickyNote size={34} />
          <h3>你的思考，值得留下</h3>
          <p>在这里写第一条笔记，或者在图像探索中保存观察。</p>
        </div>
      )}
    </>
  );
}
