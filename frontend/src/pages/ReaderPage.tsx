import "../pages/learning.css";
import { useEffect, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  FileText,
  Link2,
  LoaderCircle,
  Minus,
  Plus,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react";
import { useSession } from "../modules/identity/api";
import { ReaderAIPanel } from "../modules/reader/ReaderAI";
import type { ReaderLink, StoredDocument } from "../modules/reader/storage";
import {
  DEMO_DOC_ID,
  fetchDemoBuffer,
  fingerprintBytes,
  loadReadingState,
  loadStoredDocument,
  loadUserLinks,
  makeDocId,
  saveReadingState,
  saveStoredDocument,
  saveUserLinks,
} from "../modules/reader/storage";
import {
  DEMO_LINKS,
  LINK_PRESETS,
  linksForPage,
  presetToLink,
} from "../modules/reader/links";
import { setImageSource } from "../modules/reader/session";
import {
  consumeFocusedLink,
  rememberFocusedLink,
} from "../modules/reader/session";
import "./reader-page.css";

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

export function ReaderPage({
  onNavigate,
  notify,
}: {
  onNavigate: (page: string) => void;
  notify: (text: string) => void;
}) {
  const session = useSession();
  const userId = session.user?.id || "offline";
  const [stored, setStored] = useState<StoredDocument | null>(null);
  const [bytes, setBytes] = useState<ArrayBuffer | null>(null);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [pageIndex, setPageIndex] = useState(0);
  const [zoom, setZoom] = useState(() => (window.innerWidth >= 1360 ? 1.08 : 0.98));
  const [scrollTop, setScrollTop] = useState(0);
  const [pageText, setPageText] = useState("");
  const [links, setLinks] = useState<ReaderLink[]>([]);
  const [booting, setBooting] = useState(true);
  const [docLoading, setDocLoading] = useState(false);
  const [renderLoading, setRenderLoading] = useState(false);
  const [error, setError] = useState("");
  const [aiOpen, setAiOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [presetKey, setPresetKey] = useState(LINK_PRESETS[0].key);
  const restoreRef = useRef<{
    pageIndex: number;
    zoom: number;
    scrollTop: number;
  } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pageLinks = linksForPage(links, pageIndex);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setBooting(true);
      try {
        const saved = await loadStoredDocument(userId);
        if (!saved || cancelled) return;
        const state = await loadReadingState(userId, saved.docId);
        restoreRef.current = state;
        const buffer = await saved.blob.arrayBuffer();
        if (!cancelled) {
          setStored(saved);
          setBytes(buffer);
        }
      } catch (cause) {
        if (!cancelled)
          setError(
            cause instanceof Error
              ? cause.message
              : "读取上次讲义失败，请重新选择文件。",
          );
      } finally {
        if (!cancelled) setBooting(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    if (!stored) {
      setLinks([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const saved = await loadUserLinks(stored.docId);
        if (cancelled) return;
        const merged = stored.isDemo
          ? [...DEMO_LINKS, ...saved.filter((link) => !link.builtIn)]
          : saved;
        setLinks(merged);
      } catch {
        if (!cancelled) setLinks(stored.isDemo ? DEMO_LINKS : []);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [stored]);

  useEffect(() => {
    if (!bytes) {
      setPdf(null);
      setPageCount(0);
      return;
    }
    let cancelled = false;
    setDocLoading(true);
    setError("");
    const loading = pdfjsLib.getDocument({
      data: new Uint8Array(bytes),
      isEvalSupported: false,
      useWorkerFetch: false,
    });
    loading.promise
      .then((document) => {
        if (cancelled) {
          void document.destroy();
          return;
        }
        const restored = restoreRef.current;
        const nextPage = Math.min(
          Math.max(restored?.pageIndex ?? 0, 0),
          document.numPages - 1,
        );
        setPdf(document);
        setPageCount(document.numPages);
        setPageIndex(nextPage);
        setZoom(restored?.zoom ?? (window.innerWidth >= 1360 ? 1.08 : 0.98));
        setScrollTop(restored?.scrollTop ?? 0);
        setDocLoading(false);
      })
      .catch((cause) => {
        if (cancelled) return;
        setError(
          cause instanceof Error
            ? `讲义加载失败：${cause.message}`
            : "讲义加载失败，请确认文件没有损坏。",
        );
        setDocLoading(false);
      });
    return () => {
      cancelled = true;
      void loading.destroy();
    };
  }, [bytes]);

  useEffect(() => {
    if (!pdf || !canvasRef.current) return;
    let cancelled = false;
    let task: RenderTask | null = null;
    setRenderLoading(true);
    (async () => {
      try {
        const page = await pdf.getPage(pageIndex + 1);
        const dpr = window.devicePixelRatio || 1;
        const viewport = page.getViewport({ scale: zoom * dpr });
        const canvas = canvasRef.current;
        if (!canvas || cancelled) return;
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        canvas.style.width = `${Math.floor(viewport.width / dpr)}px`;
        canvas.style.height = `${Math.floor(viewport.height / dpr)}px`;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("当前浏览器无法创建 PDF 画布");
        task = page.render({ canvasContext: context, viewport });
        await task.promise;
        const text = await page.getTextContent();
        const content = text.items
          .map((item) => ("str" in item ? item.str : ""))
          .join(" ")
          .replace(/\s+/g, " ")
          .trim();
        if (!cancelled) {
          setPageText(content);
          setRenderLoading(false);
          window.requestAnimationFrame(() => {
            if (scrollRef.current)
              scrollRef.current.scrollTop = restoreRef.current?.scrollTop ?? 0;
            restoreRef.current = null;
          });
        }
        page.cleanup();
      } catch (cause) {
        if (!cancelled)
          setError(
            cause instanceof Error
              ? `第 ${pageIndex + 1} 页渲染失败：${cause.message}`
              : "讲义页面渲染失败。",
          );
        if (!cancelled) setRenderLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [pdf, pageIndex, zoom]);

  useEffect(() => {
    if (!stored || links.length === 0) return;
    const linkId = consumeFocusedLink();
    if (!linkId) return;
    const timer = window.setTimeout(() => {
      const target = [
        ...document.querySelectorAll<HTMLButtonElement>(".reader-link"),
      ].find((element) => element.dataset.readerLink === linkId);
      target?.focus();
    }, 180);
    return () => window.clearTimeout(timer);
  }, [stored, links]);

  useEffect(() => {
    if (!stored || !pdf) return;
    const timer = window.setTimeout(() => {
      void saveReadingState({
        userId,
        docId: stored.docId,
        pageIndex,
        zoom,
        scrollTop,
        updatedAt: Date.now(),
      });
    }, 350);
    return () => window.clearTimeout(timer);
  }, [stored, pdf, userId, pageIndex, zoom, scrollTop]);

  function validFile(file: File): boolean {
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      notify("请选择 PDF 文件");
      return false;
    }
    if (file.size > 50 * 1024 * 1024) {
      notify("讲义文件需在 50 MB 以内");
      return false;
    }
    return true;
  }

  async function loadBuffer(
    buffer: ArrayBuffer,
    name: string,
    lastModified: number,
    isDemo: boolean,
    fixedDocId?: string,
  ) {
    try {
      setError("");
      const fingerprint = await fingerprintBytes(buffer);
      const docId = fixedDocId || makeDocId(fingerprint);
      const previous = await loadReadingState(userId, docId);
      const document: StoredDocument = {
        key: `${userId}:${docId}`,
        userId,
        docId,
        name,
        fingerprint,
        size: buffer.byteLength,
        lastModified,
        isDemo,
        blob: new Blob([buffer], { type: "application/pdf" }),
      };
      try {
        await saveStoredDocument(document);
      } catch {
        notify("文件已打开，但当前浏览器无法持久保存；刷新后需重新选择。");
      }
      restoreRef.current = previous
        ? {
            pageIndex: previous.pageIndex,
            zoom: previous.zoom,
            scrollTop: previous.scrollTop,
          }
        : { pageIndex: 0, zoom: window.innerWidth >= 1360 ? 1.08 : 0.98, scrollTop: 0 };
      setStored(document);
      setPageText("");
      setBytes(buffer);
      notify(
        previous
          ? `已恢复 ${name} · 第 ${previous.pageIndex + 1} 页`
          : `已打开 ${name}`,
      );
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "讲义保存或读取失败。",
      );
      notify("讲义加载失败，未切换到其他文件");
    }
  }

  async function choose(file?: File) {
    if (!file || !validFile(file)) return;
    try {
      const buffer = await file.arrayBuffer();
      await loadBuffer(
        buffer,
        file.name,
        file.lastModified,
        false,
      );
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "无法读取这个 PDF 文件。",
      );
    }
  }

  async function loadDemo() {
    try {
      const buffer = await fetchDemoBuffer();
      await loadBuffer(
        buffer,
        "Axiom 数学分析测试讲义（演示，非用户原文）",
        Date.now(),
        true,
        DEMO_DOC_ID,
      );
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "演示讲义加载失败。",
      );
    }
  }

  function changePage(next: number) {
    if (!pageCount) return;
    const value = Math.min(Math.max(Math.round(next), 0), pageCount - 1);
    setPageIndex(value);
    setScrollTop(0);
    restoreRef.current = null;
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }

  function changeZoom(next: number) {
    setZoom(Math.min(Math.max(Number(next.toFixed(2)), 0.65), 2.2));
    setScrollTop(0);
  }

  async function openLink(link: ReaderLink) {
    if (!stored) return;
    await saveReadingState({
      userId,
      docId: stored.docId,
      pageIndex,
      zoom,
      scrollTop,
      updatedAt: Date.now(),
    });
    setImageSource({
      link,
      documentName: stored.name,
      pageIndex,
      pageCount,
      docId: stored.docId,
      isDemo: stored.isDemo,
    });
    rememberFocusedLink(link.id);
    onNavigate("image");
  }

  async function addLink() {
    if (!stored) return;
    const preset = LINK_PRESETS.find((item) => item.key === presetKey);
    if (!preset) return;
    if (
      links.some(
        (link) =>
          link.pageIndex === pageIndex &&
          link.conceptId === preset.conceptId &&
          link.caseId === preset.caseId,
      )
    ) {
      notify("这一页已经有同类图像链接");
      return;
    }
    const link = presetToLink(preset, pageIndex);
    const next = [...links, link];
    setLinks(next);
    try {
      const saved = next.filter((item) => !item.builtIn);
      await saveUserLinks(stored.docId, saved);
      notify("已添加本页图像链接");
      setAddOpen(false);
    } catch {
      notify("链接已显示，但本机保存失败");
    }
  }

  async function removeLink(link: ReaderLink) {
    if (!stored || link.builtIn) return;
    const next = links.filter((item) => item.id !== link.id);
    setLinks(next);
    try {
      await saveUserLinks(
        stored.docId,
        next.filter((item) => !item.builtIn),
      );
      notify("已移除本页图像链接");
    } catch {
      notify("移除链接失败");
    }
  }

  return (
    <div className="learning-page reader-page">
      <input
        ref={fileInput}
        type="file"
        accept="application/pdf,.pdf"
        hidden
        onChange={(event) => {
          void choose(event.target.files?.[0]);
          event.currentTarget.value = "";
        }}
      />
      <div className="page-heading learning-heading reader-heading">
        <div>
          <div className="learning-step">教材学习 · 原讲义阅读</div>
          <h1>{stored ? stored.name : "教材学习"}</h1>
          <p className="muted">
            {stored
              ? "阅读原讲义，点本页文字链接进入交互图像；返回时恢复文件、页码、缩放和阅读位置。"
              : "加载自己的 PDF 讲义。文件只在本机浏览器读取，不会自动上传整本讲义。"}
          </p>
        </div>
        <div className="reader-head-actions">
          <button className="btn" onClick={() => fileInput.current?.click()}>
            <Upload size={15} /> 打开讲义
          </button>
          {stored && (
            <button className="btn primary" onClick={() => setAiOpen(true)}>
              <Sparkles size={15} /> 与 AI 讨论本页
            </button>
          )}
        </div>
      </div>

      {!stored && !booting ? (
        <>
          {error && (
            <div className="reader-error" role="alert">
              {error}
            </div>
          )}
          <section className="reader-empty">
            <div className="reader-empty-mark">
              <FileText size={30} />
            </div>
            <h2>先打开一份讲义</h2>
            <p>
              当前没有读取任何 PDF。可以选择自己的讲义，或载入项目测试讲义验证“原文 →
              文字链接 → 图像 → 返回原页”的完整流程。
            </p>
            <div className="reader-empty-actions">
              <button className="btn primary" onClick={() => fileInput.current?.click()}>
                <Upload size={15} /> 选择我的 PDF
              </button>
              <button className="btn" onClick={() => void loadDemo()}>
                <FileText size={15} /> 载入项目测试讲义
              </button>
            </div>
            <small>
              项目测试讲义明确标注为“非用户原文”，只用于验证界面流程；不会被当作你的讲义。
            </small>
          </section>
        </>
      ) : booting ? (
        <div className="reader-loading">
          <LoaderCircle size={20} className="spin" /> 正在恢复上次讲义…
        </div>
      ) : (
        <div className="reader-body">
          <main className="reader-main">
            <div className="reader-toolbar">
              <div className="reader-file-name">
                <FileText size={15} />
                <strong>{stored?.name}</strong>
                {stored?.isDemo && <span className="badge amber">演示讲义</span>}
              </div>
              <div className="reader-page-controls">
                <button
                  className="btn icon"
                  aria-label="上一页"
                  disabled={pageIndex <= 0}
                  onClick={() => changePage(pageIndex - 1)}
                >
                  <ChevronLeft size={16} />
                </button>
                <label className="reader-page-number">
                  第
                  <input
                    type="number"
                    min={1}
                    max={pageCount || 1}
                    value={pageIndex + 1}
                    aria-label="跳到页码"
                    onChange={(event) =>
                      changePage(Number(event.target.value) - 1)
                    }
                  />
                  / {pageCount || "…"} 页
                </label>
                <button
                  className="btn icon"
                  aria-label="下一页"
                  disabled={!pageCount || pageIndex >= pageCount - 1}
                  onClick={() => changePage(pageIndex + 1)}
                >
                  <ChevronRight size={16} />
                </button>
                <span className="reader-toolbar-divider" />
                <button
                  className="btn icon"
                  aria-label="缩小"
                  onClick={() => changeZoom(zoom - 0.1)}
                >
                  <Minus size={15} />
                </button>
                <button
                  className="reader-zoom-value"
                  onClick={() => changeZoom(window.innerWidth >= 1360 ? 1.08 : 0.98)}
                  title="恢复默认缩放"
                >
                  {Math.round(zoom * 100)}%
                </button>
                <button
                  className="btn icon"
                  aria-label="放大"
                  onClick={() => changeZoom(zoom + 0.1)}
                >
                  <Plus size={15} />
                </button>
              </div>
            </div>

            <div
              className="reader-canvas-scroll"
              ref={scrollRef}
              onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
            >
              <canvas
                ref={canvasRef}
                className="reader-canvas"
                aria-label={`${stored?.name || "讲义"}第 ${pageIndex + 1} 页`}
              />
              {(docLoading || renderLoading) && (
                <div className="reader-canvas-loading">
                  <LoaderCircle size={18} className="spin" /> 正在排版第{" "}
                  {pageIndex + 1} 页…
                </div>
              )}
            </div>

            {error && (
              <div className="reader-error" role="alert">
                {error}
              </div>
            )}

            <p className="reader-footnote">
              图像链接是阅读器的辅助层，不会修改原 PDF。有限采样和交互图像不能代替讲义中的证明。
            </p>
          </main>

          <aside className="reader-side">
            <section className="card reader-links">
              <div className="reader-links-head">
                <div>
                  <Link2 size={16} />
                  <h3>本页图像</h3>
                </div>
                <span className="badge">{pageLinks.length} 个关联</span>
              </div>
              {pageLinks.length === 0 ? (
                <p className="reader-no-links">
                  本页暂无关联图像。可以按页添加一个经过审核的目标场景；没有映射时不会套用其他页面的图像。
                </p>
              ) : (
                pageLinks.map((link) => (
                  <div className="reader-link-row" key={link.id}>
                    <button className="reader-link" onClick={() => void openLink(link)} data-reader-link={link.id}>
                      <span>
                        <strong>{link.label}</strong>
                        <small>{link.description}</small>
                      </span>
                      <ArrowRight size={16} />
                    </button>
                    {!link.builtIn && (
                      <button
                        className="reader-link-remove"
                        aria-label={`移除链接 ${link.label}`}
                        onClick={() => void removeLink(link)}
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                ))
              )}
              <div className="reader-add-link">
                <button
                  className="text-button"
                  onClick={() => setAddOpen((value) => !value)}
                >
                  {addOpen ? "收起" : "为本页添加图像链接"}
                </button>
                {addOpen && (
                  <div className="reader-add-form">
                    <select
                      value={presetKey}
                      onChange={(event) => setPresetKey(event.target.value)}
                      aria-label="选择图像目标"
                    >
                      {LINK_PRESETS.map((preset) => (
                        <option value={preset.key} key={preset.key}>
                          {preset.label}
                        </option>
                      ))}
                    </select>
                    <button className="btn" onClick={() => void addLink()}>
                      添加
                    </button>
                  </div>
                )}
              </div>
            </section>

            <section className="card reader-side-card">
              <h3>讲义信息</h3>
              <dl>
                <div>
                  <dt>文件</dt>
                  <dd>{stored?.name}</dd>
                </div>
                <div>
                  <dt>总页数</dt>
                  <dd>{pageCount || "—"}</dd>
                </div>
                <div>
                  <dt>文件指纹</dt>
                  <dd>{stored?.fingerprint.slice(0, 12)}…</dd>
                </div>
                <div>
                  <dt>存储</dt>
                  <dd>仅本机浏览器</dd>
                </div>
              </dl>
              {stored?.isDemo && (
                <p className="reader-demo-note">
                  这是 Axiom 生成的项目测试讲义，不是用户原文，也不对应出版教材页码。
                </p>
              )}
            </section>
            <section className="card reader-side-card">
              <h3>阅读状态</h3>
              <p>
                第 {pageIndex + 1} / {pageCount || "—"} 页 ·{" "}
                {Math.round(zoom * 100)}%
              </p>
              <p className="muted">
                页码、缩放和页内滚动位置会自动保存；从图像返回时恢复。
              </p>
            </section>
            <details className="card reader-side-card reader-text-details">
              <summary>本页文字（供讨论与选择）</summary>
              {pageText ? (
                <pre>{pageText.slice(0, 12000)}</pre>
              ) : (
                <p className="muted">
                  这一页没有可提取文字，可能是扫描页；阅读器不会假装已经识别。
                </p>
              )}
            </details>
            <section className="card reader-side-card">
              <h3>怎么用</h3>
              <ol>
                <li>读原文，不必先进入图像页。</li>
                <li>点“本页图像”中的文字链接。</li>
                <li>探索后点“返回讲义”恢复原页。</li>
              </ol>
            </section>
          </aside>
        </div>
      )}

      {stored && (
        <ReaderAIPanel
          open={aiOpen}
          onClose={() => setAiOpen(false)}
          documentName={stored.name}
          pageIndex={pageIndex}
          pageCount={pageCount}
          pageText={pageText}
        />
      )}
    </div>
  );
}
