import { useRef, useState, type FormEvent } from "react";
import { BookOpen, FileText, Pencil, Sparkles, Trash2, Upload } from "lucide-react";
import { useAppData } from "../app/DataProvider";
import type { LocalBook } from "../domain/types";
import { useAIConnection } from "../modules/ai/connection";
import {
  deleteTextbook, extractCards, renameTextbook, textbookPageUrl, uploadTextbook, type ReadingPosition,
} from "../modules/teaching/localTextbooks";
import "./local-textbooks.css";

const keyMessage = "请先在顶部配置个人 DeepSeek Key";
const scanMessage = (page: number) => `第 ${page} 页疑似图片扫描版，暂不支持自动提取文字卡片，但仍可原页对照阅读`;

function message(cause: unknown) {
  if (cause instanceof TypeError) return "无法连接本机工作台，请检查本地服务后重试。";
  return cause instanceof Error ? cause.message : "操作失败，请重试。";
}

type ShelfActions = {
  read: (id: string, page: number) => void;
  openCard: (id: string) => void;
};

function BookEntry({ book, read, openCard }: ShelfActions & { book: LocalBook }) {
  const { data, refreshLocal } = useAppData();
  const ai = useAIConnection();
  const [editing, setEditing] = useState<"name" | "delete" | null>(null);
  const [name, setName] = useState(book.title);
  const [start, setStart] = useState("1");
  const [end, setEnd] = useState("1");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [newCardId, setNewCardId] = useState("");
  const scans = book.pages.filter((item) => item.needs_ocr);
  const cards = data.units.filter((item) => item.textbookSource?.textbookId === book.id);
  const latest = cards.find((item) => item.id === newCardId) || cards[0];
  const rangeStart = Number(start), rangeEnd = Number(end);
  const selectedScans = scans.filter((item) => item.page >= rangeStart && item.page <= rangeEnd);
  const keyMissing = ai.status?.state === "unset";

  async function run(label: string, action: () => Promise<void>) {
    setBusy(label);
    setError("");
    setStatus("");
    try {
      await action();
      await refreshLocal();
      setEditing(null);
    } catch (cause) {
      setError(message(cause));
    } finally {
      setBusy("");
    }
  }

  function generate(event: FormEvent) {
    event.preventDefault();
    setStatus("");
    if (rangeStart > rangeEnd || rangeEnd - rangeStart >= 15) {
      setError("请选择连续的 1 至 15 页，结束页应大于或等于起始页。");
      return;
    }
    if (selectedScans.length) {
      setError(scanMessage(selectedScans[0].page));
      return;
    }
    void run("正在生成学习卡片…", async () => {
      const result = await extractCards(book.id, rangeStart, rangeEnd);
      if (!result.cards.length) throw new Error("所选页码未生成卡片，请检查原文后重试。");
      setNewCardId(result.cards[0].id);
      setStatus(`已生成 ${result.cards.length} 张学习卡片`);
    });
  }

  return <article className="card shelf-book" aria-label={book.title} aria-busy={Boolean(busy)}>
    <div className="shelf-book-heading">
      <div><FileText size={19} /><h2>{book.title}</h2></div>
      <div className="shelf-actions">
        <button className="btn" disabled={Boolean(busy)} onClick={() => {
          setName(book.title); setEditing("name"); setError("");
        }}><Pencil size={14} />重命名</button>
        <button className="btn" disabled={Boolean(busy)} onClick={() => {
          setEditing("delete"); setError("");
        }}><Trash2 size={14} />删除</button>
      </div>
    </div>
    {editing === "name" && <form className="shelf-inline" onSubmit={(event) => {
      event.preventDefault();
      if (name.trim()) void run("正在保存名称…", async () => { await renameTextbook(book.id, name.trim()); });
    }}>
      <label>教材名称<input value={name} maxLength={200} required autoFocus onChange={(event) => setName(event.target.value)} /></label>
      <button className="btn" disabled={!name.trim() || Boolean(busy)}>保存名称</button>
      <button className="btn" type="button" disabled={Boolean(busy)} onClick={() => setEditing(null)}>取消</button>
    </form>}
    {editing === "delete" && <div className="shelf-inline" role="group" aria-label="删除教材">
      <p>确认删除《{book.title}》？{cards.length > 0 && `关联的 ${cards.length} 张学习卡片也会删除。`}</p>
      <button type="button" className="btn danger" disabled={Boolean(busy)}
        onClick={() => void run("正在删除教材…", async () => { await deleteTextbook(book.id); })}>确认删除</button>
      <button className="btn" disabled={Boolean(busy)} autoFocus onClick={() => setEditing(null)}>取消</button>
    </div>}
    <p className="shelf-meta">共 {book.page_count} 页 · {book.pages.length - scans.length} 个文字页 · {scans.length} 个疑似扫描页</p>
    {scans.length > 0 && <div className="shelf-scan-list" aria-label="扫描页提示">
      {scans.map(({ page }) => <p key={page}>{scanMessage(page)}</p>)}
    </div>}
    <div className="shelf-actions">
      <button className="btn" onClick={() => read(book.id, 1)}><BookOpen size={15} />在书桌阅读</button>
      {latest && <button className="btn" onClick={() => openCard(latest.id)}>查看学习卡片</button>}
    </div>
    <form className="shelf-extract" onSubmit={generate}>
      <div className="shelf-inline">
        <label>起始页<input type="number" min={1} max={book.page_count} required value={start}
          onChange={(event) => {
            const value = event.target.value;
            setStart(value);
            if (Number(value) > Number(end)) setEnd(value);
          }} /></label>
        <label>结束页<input type="number" min={1} max={book.page_count} required value={end}
          onChange={(event) => setEnd(event.target.value)} /></label>
        <button className="btn primary" disabled={Boolean(busy)}><Sparkles size={14} />生成学习卡片</button>
      </div>
      {keyMissing && !error && <p className="muted">{keyMessage}</p>}
    </form>
    {error && <p role="alert" className="shelf-error">{error}</p>}
    {(busy || status) && <p role="status">{busy || status}</p>}
  </article>;
}

export function LocalTextbook({ read, openCard }: ShelfActions) {
  const { localBooks, refreshLocal, data } = useAppData();
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  async function upload(files: FileList | null) {
    if (!files?.length || uploading) return;
    const selected = Array.from(files);
    setUploading(true);
    setError("");
    setStatus("");
    const failures: string[] = [];
    let saved = 0;
    try {
      for (const file of selected) {
        try {
          if (!/\.pdf$/i.test(file.name) && file.type !== "application/pdf") throw new Error("请选择 PDF 文件");
          if (file.size > 50 * 1024 * 1024) throw new Error("PDF 不能超过 50 MB");
          await uploadTextbook(file);
          saved++;
        } catch (cause) {
          failures.push(`${file.name} · ${message(cause)}`);
        }
      }
      if (saved) {
        await refreshLocal();
        setStatus(`已收录 ${saved} 本教材`);
      }
    } catch (cause) {
      failures.push(message(cause));
    } finally {
      setError(failures.join("；"));
      setUploading(false);
      if (input.current) input.current.value = "";
    }
  }
  if (data.source !== "offline") return <section className="card">
    <h2>本地教材书架</h2><p>退出当前账号并打开本地学习空间，即可管理这台电脑上的 PDF 教材。</p>
  </section>;
  return <section className="textbook-shelf" aria-label="本地教材书架">
    <h1>本地教材书架</h1>
    <input type="file" accept="application/pdf,.pdf" aria-label="上传 PDF 教材" multiple hidden ref={input}
      onChange={(event) => void upload(event.target.files)} />
    <button className="upload-zone" disabled={uploading} onClick={() => input.current?.click()}
      onDragOver={(event) => event.preventDefault()} onDrop={(event) => {
        event.preventDefault(); void upload(event.dataTransfer.files);
      }}>
      <Upload size={25} /><strong>{uploading ? "正在收录教材…" : "点击选择或拖入教材 PDF"}</strong>
      <span>保存在本机书架 · 每个文件最大 50 MB</span>
    </button>
    {error && <p role="alert" className="shelf-error">{error}</p>}
    {status && <p role="status">{status}</p>}
    {localBooks.map((book) => <BookEntry key={book.id} book={book} read={read} openCard={openCard} />)}
  </section>;
}

export function TextbookReader({ position, change, openShelf }: {
  position: ReadingPosition & { revision: number };
  change: (position: ReadingPosition) => void;
  openShelf: () => void;
}) {
  const { localBooks } = useAppData();
  const book = localBooks.find((item) => item.id === position.bookId) || localBooks[0];
  if (!book) return <section className="card reader-empty">
    <h3>书架暂无教材</h3>
    <button className="btn" onClick={openShelf}>打开教材书架</button>
  </section>;
  const page = position.bookId === book.id ? Math.max(1, Math.min(book.page_count, position.page)) : 1;
  const url = textbookPageUrl(book.id, page);
  return <section className="textbook-reader" aria-label="课本原文阅读器">
    <div className="reader-tools">
      <label>阅读教材<select value={book.id} onChange={(event) => change({ bookId: event.target.value, page: 1 })}>
        {localBooks.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
      </select></label>
      <form key={url} onSubmit={(event) => {
        event.preventDefault();
        change({ bookId: book.id, page: Number(new FormData(event.currentTarget).get("page")) });
      }}>
        <label>阅读页码<input type="number" name="page" min={1} max={book.page_count} defaultValue={page} required /></label>
        <span>共 {book.page_count} 页</span><button className="btn">跳页</button>
      </form>
    </div>
    <iframe key={`${url}:${position.revision}`} title="课本原文 PDF" src={url} />
  </section>;
}
