import "../pages/learning.css";
import {
  BookOpen,
  ChevronRight,
  Download,
  FileText,
  LoaderCircle,
  RefreshCw,
  Settings2,
  Sparkles,
  Upload,
  Wand2,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "../modules/identity/api";
import { ReaderAIPanel } from "../modules/reader/ReaderAI";
import { AIRulesSettings } from "../modules/reader/AIRulesSettings";
import { DocxDocument } from "../modules/reader/DocxDocument";
import {
  parseDocx,
  type ParsedDocument,
} from "../modules/reader/docxAdapter";
import {
  localCandidates,
  validateCandidates,
} from "../modules/reader/docxAnalysis";
import {
  addReaderExample,
  analyzeDocument,
  fetchAIStatus,
  type VisualizationOption,
} from "../modules/reader/api";
import type { ReaderLink, StoredDocument } from "../modules/reader/storage";
import {
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
  consumeFocusedLink,
  rememberFocusedLink,
  setImageSource,
} from "../modules/reader/session";
import "./word-reader.css";

const DEMO_WORD_ID = "demo-word-v1";
const WORD_DEMO_URL = "/demo/word-demo.docx";

const VISUALIZATIONS: VisualizationOption[] = [
  {
    id: "dirichlet-discontinuity",
    label: "狄利克雷函数：不连续、不可导与不可积",
    conceptId: "dirichlet_function",
    caseId: "negative",
    focus: ["discontinuity", "non_differentiability", "integrability"],
  },
  {
    id: "uniform",
    label: "一致连续性的 ε–δ 图像",
    conceptId: "uniform",
    caseId: "positive",
    focus: ["uniform_continuity"],
  },
  {
    id: "derivative",
    label: "导数、割线与左右差商",
    conceptId: "derivative",
    caseId: "positive",
    focus: ["derivative"],
  },
  {
    id: "taylor",
    label: "Taylor 多项式逼近",
    conceptId: "taylor",
    caseId: "explore",
    focus: ["approximation"],
  },
  {
    id: "riemann",
    label: "Riemann 和与可积性",
    conceptId: "riemann",
    caseId: "positive",
    focus: ["integrability"],
  },
  {
    id: "integral",
    label: "定积分与累积量",
    conceptId: "integral",
    caseId: "explore",
    focus: ["integral"],
  },
];

export function WordReaderPage({
  onNavigate,
  notify,
}: {
  onNavigate: (page: string) => void;
  notify: (text: string) => void;
}) {
  const session = useSession();
  const userId = session.user?.id || "offline";
  const [stored, setStored] = useState<StoredDocument | null>(null);
  const [legacyPdf, setLegacyPdf] = useState<StoredDocument | null>(null);
  const [parsed, setParsed] = useState<ParsedDocument | null>(null);
  const [links, setLinks] = useState<ReaderLink[]>([]);
  const [booting, setBooting] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [analysis, setAnalysis] = useState("尚未分析");
  const [analyzing, setAnalyzing] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [selectedText, setSelectedText] = useState("");
  const [selectedBlockId, setSelectedBlockId] = useState("");
  const [correctionOpen, setCorrectionOpen] = useState(false);
  const [correctionTarget, setCorrectionTarget] = useState(
    VISUALIZATIONS[0]?.id || "",
  );
  const [correctionReason, setCorrectionReason] = useState("");
  const [activeBlock, setActiveBlock] = useState("");
  const [fontSize, setFontSize] = useState(16);
  const [aiText, setAiText] = useState("");
  const [aiLabel, setAiLabel] = useState("");
  const restoreRef = useRef<{
    blockId?: string;
    fontSize?: number;
  } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const downloadUrl = useMemo(
    () => (stored ? URL.createObjectURL(stored.blob) : ""),
    [stored],
  );

  useEffect(
    () => () => {
      if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    },
    [downloadUrl],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setBooting(true);
      try {
        const saved =
          (await loadStoredDocument(userId, "docx")) ||
          (await loadStoredDocument(userId));
        if (!saved || cancelled) return;
        if ((saved.format || "pdf") === "pdf") {
          setLegacyPdf(saved);
          return;
        }
        const state = await loadReadingState(userId, saved.docId);
        restoreRef.current = state
          ? { blockId: state.blockId, fontSize: state.fontSize }
          : null;
        if (state?.fontSize) setFontSize(state.fontSize);
        const parsedDoc = await parseDocx(
          await saved.blob.arrayBuffer(),
          saved.docId,
          saved.fingerprint,
          saved.name,
        );
        const storedLinks = await loadUserLinks(userId, saved.docId);
        if (cancelled) return;
        setStored(saved);
        setParsed(parsedDoc);
        const candidates = localCandidates(parsedDoc.blocks);
        setLinks(storedLinks.length ? storedLinks : candidates);
        setAnalysis(
          storedLinks.some((link) => link.origin === "auto")
            ? `已恢复 ${storedLinks.filter((link) => link.origin === "auto").length} 条自动链接`
            : `本地词库候选 ${candidates.length} 处；可重新识别`,
        );
      } catch (cause) {
        if (!cancelled)
          setError(cause instanceof Error ? cause.message : "无法恢复 Word 讲义。");
      } finally {
        if (!cancelled) setBooting(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    if (!parsed) return;
    const handler = () => {
      const elements = [
        ...document.querySelectorAll<HTMLElement>("[data-block-id]"),
      ];
      const first = elements.find(
        (element) => element.getBoundingClientRect().bottom > 120,
      );
      if (first?.dataset.blockId && first.dataset.blockId !== activeBlock)
        setActiveBlock(first.dataset.blockId);
    };
    handler();
    window.addEventListener("scroll", handler, { passive: true });
    return () => window.removeEventListener("scroll", handler);
  }, [parsed, activeBlock]);

  useEffect(() => {
    if (!stored || !parsed) return;
    const timer = window.setTimeout(() => {
      void saveReadingState({
        userId,
        docId: stored.docId,
        pageIndex: 0,
        zoom: 1,
        scrollTop: window.scrollY,
        format: "docx",
        blockId: activeBlock || parsed.blocks[0]?.blockId,
        viewportOffset: 0,
        fontSize,
        updatedAt: Date.now(),
      });
    }, 350);
    return () => window.clearTimeout(timer);
  }, [stored, parsed, userId, activeBlock, fontSize]);

  useEffect(() => {
    if (!parsed || !links.length) return;
    const targetId = restoreRef.current?.blockId || activeBlock;
    if (!targetId) return;
    const timer = window.setTimeout(() => {
      document.getElementById(`docx-${targetId}`)?.scrollIntoView({
        block: "center",
      });
      const focused = consumeFocusedLink();
      if (focused) {
        const button = [
          ...document.querySelectorAll<HTMLButtonElement>(".docx-mention"),
        ].find((item) => item.dataset.docxLink === focused);
        button?.focus();
      }
      restoreRef.current = null;
    }, 250);
    return () => window.clearTimeout(timer);
  }, [parsed, links, activeBlock]);

  async function autoAnalyze(document: ParsedDocument, current: ReaderLink[]) {
    try {
      const status = await fetchAIStatus();
      if (!status.configured) {
        setAnalysis(`本地词库候选 ${current.length} 处；未连接 AI，未运行模型识别`);
        return;
      }
      setAnalyzing(true);
      const controller = new AbortController();
      const timer = window.setTimeout(() => controller.abort(), 18000);
      const allBlocks = document.blocks.filter(
        (block) =>
          block.type !== "table" &&
          block.type !== "heading" &&
          block.type !== "list" &&
          block.text.trim(),
      );
      const batches: typeof allBlocks[] = [];
      for (let index = 0; index < allBlocks.length; index += 4)
        batches.push(allBlocks.slice(index, index + 4));
      const results: {
        candidates: Parameters<typeof validateCandidates>[1];
        rejected: string[];
        rulesVersion: number;
      }[] = [];
      setAnalysis(`AI 分析中… ${batches.length} 个段落批次并行`);
      const settled = await Promise.allSettled(
        batches.map((batch) =>
          analyzeDocument({
            documentName: document.fileName,
            docId: document.docId,
            parserVersion: document.parserVersion,
            blocks: batch.map((block) => ({
              blockId: block.blockId,
              sectionTitle: block.sectionTitle,
              text: block.text,
            })),
            visualizations: VISUALIZATIONS,
            maxCandidates: 4,
            signal: controller.signal,
          }),
        ),
      );
      for (const result of settled) {
        if (result.status === "fulfilled") results.push(result.value);
      }
      window.clearTimeout(timer);
      if (results.length === 0) {
        const firstError = settled.find(
          (item): item is PromiseRejectedResult => item.status === "rejected",
        );
        throw firstError?.reason instanceof Error
          ? firstError.reason
          : new Error("所有识别批次都失败或超时");
      }
      const verified = validateCandidates(
        document.blocks,
        results.flatMap((result) => result.candidates),
      );
      const rejected = results.flatMap((result) => result.rejected);
      const rulesVersion = results[0]?.rulesVersion || 0;
      const corrections = current.filter((link) => link.origin === "correction");
      const localExtras = current.filter(
        (link) =>
          link.origin === "local" &&
          !verified.links.some(
            (candidate) =>
              candidate.blockId === link.blockId &&
              (candidate.start || 0) < (link.end || 0) &&
              (candidate.end || 0) > (link.start || 0),
          ),
      );
      const merged = verified.links.length
        ? [...corrections, ...verified.links, ...localExtras]
        : current.filter((link) => link.origin !== "auto");
      setLinks(merged);
      await saveUserLinks(userId, document.docId, merged);
      setAnalysis(
        `自动识别 ${verified.links.length} 处 · 规则 v${rulesVersion}${
          rejected.length ? ` · ${rejected.length} 个候选被校验拒绝` : ""
        }`,
      );
      if (verified.links.length === 0)
        notify("AI 没有返回可用链接；已保留本地候选并记录拒绝原因");
    } catch (cause) {
      setAnalysis(
        `模型识别未完成，保留本地词库候选。${
          cause instanceof Error ? ` ${cause.message}` : ""
        }`,
      );
    } finally {
      setAnalyzing(false);
    }
  }

  async function openFile(file?: File) {
    if (!file) return;
    if (file.name.toLowerCase().endsWith(".doc")) {
      notify("旧 .doc 暂不支持，请用 Word 另存为 .docx");
      return;
    }
    if (!file.name.toLowerCase().endsWith(".docx")) {
      notify("本轮主输入是 .docx；旧 PDF 请使用“旧 PDF 阅读器”");
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      notify("Word 文件需在 50 MB 以内");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const buffer = await file.arrayBuffer();
      const fingerprint = await fingerprintBytes(buffer);
      const docId = makeDocId(fingerprint);
      const document = await parseDocx(buffer, docId, fingerprint, file.name);
      const storedDoc: StoredDocument = {
        key: `${userId}:${docId}`,
        userId,
        docId,
        name: file.name,
        fingerprint,
        size: buffer.byteLength,
        lastModified: file.lastModified,
        isDemo: false,
        format: "docx",
        blob: new Blob([buffer], {
          type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        }),
      };
      try {
        await saveStoredDocument(storedDoc);
      } catch {
        notify("文件已打开，但当前浏览器无法持久保存；刷新后需重新选择。");
      }
      setStored(storedDoc);
      setLegacyPdf(null);
      setParsed(document);
      const state = await loadReadingState(userId, docId);
      restoreRef.current = state ? { blockId: state.blockId, fontSize: state.fontSize } : null;
      if (state?.fontSize) setFontSize(state.fontSize);
      const local = localCandidates(document.blocks);
      setLinks(local);
      setAnalysis(`本地词库候选 ${local.length} 处；正在检查 AI 连接…`);
      notify(`已导入 ${file.name}`);
      void autoAnalyze(document, local);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Word 导入失败。");
    } finally {
      setLoading(false);
    }
  }

  async function loadDemo() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(WORD_DEMO_URL);
      if (!response.ok) throw new Error("演示 Word 讲义加载失败");
      const buffer = await response.arrayBuffer();
      const fingerprint = await fingerprintBytes(buffer);
      const document = await parseDocx(
        buffer,
        DEMO_WORD_ID,
        fingerprint,
        "Axiom Word 测试讲义（演示，非用户原文）",
      );
      const storedDoc: StoredDocument = {
        key: `${userId}:${DEMO_WORD_ID}`,
        userId,
        docId: DEMO_WORD_ID,
        name: "Axiom Word 测试讲义（演示，非用户原文）",
        fingerprint,
        size: buffer.byteLength,
        lastModified: Date.now(),
        isDemo: true,
        format: "docx",
        blob: new Blob([buffer], {
          type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        }),
      };
      try {
        await saveStoredDocument(storedDoc);
      } catch {
        /* still readable */
      }
      setLegacyPdf(null);
      setStored(storedDoc);
      setParsed(document);
      restoreRef.current = null;
      const local = localCandidates(document.blocks);
      const savedLinks = await loadUserLinks(userId, DEMO_WORD_ID);
      setLinks(savedLinks.length ? savedLinks : local);
      setAnalysis(
        savedLinks.length
          ? `已恢复 ${savedLinks.length} 条链接`
          : `本地词库候选 ${local.length} 处；正在检查 AI 连接…`,
      );
      if (!savedLinks.length) void autoAnalyze(document, local);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "演示 Word 加载失败。");
    } finally {
      setLoading(false);
    }
  }

  async function reanalyze() {
    if (!parsed || analyzing) return;
    const status = await fetchAIStatus().catch(() => null);
    if (!status?.configured) {
      notify("尚未接入 AI；当前显示本地词库候选，原文阅读不受影响。");
      setAnalysis(`本地词库候选 ${links.length} 处；未连接 AI，不能执行真实模型识别`);
      return;
    }
    await autoAnalyze(parsed, links);
  }

  function openAI() {
    if (!parsed) return;
    const block =
      parsed.blocks.find((item) => item.blockId === activeBlock) ||
      parsed.blocks.find((item) => item.type !== "heading");
    const sectionBlocks = parsed.blocks.filter(
      (item) => item.sectionId === block?.sectionId,
    );
    const context = sectionBlocks
      .map((item) => item.text)
      .join("\n")
      .slice(0, 20000);
    setAiText(context || block?.text || "");
    setAiLabel(
      `正在讨论：${block?.sectionTitle || "当前原文"} · ${
        block?.blockId || "段落"
      }`,
    );
    setAiOpen(true);
  }

  async function openLink(link: ReaderLink) {
    if (!stored || !parsed) return;
    const block = parsed.blocks.find((item) => item.blockId === link.blockId);
    await saveReadingState({
      userId,
      docId: stored.docId,
      pageIndex: 0,
      zoom: 1,
      scrollTop: window.scrollY,
      format: "docx",
      blockId: link.blockId,
      charOffset: link.start,
      viewportOffset: 0,
      fontSize,
      focusLinkId: link.id,
      updatedAt: Date.now(),
    });
    setImageSource({
      link,
      documentName: stored.name,
      pageIndex: 0,
      pageCount: 1,
      docId: stored.docId,
      isDemo: stored.isDemo,
      format: "docx",
      blockId: link.blockId,
      sectionTitle: block?.sectionTitle,
      exactText: link.exactText,
    });
    rememberFocusedLink(link.id);
    onNavigate("image");
  }

  const sections = parsed?.blocks.filter((block) => block.type === "heading") || [];
  const warnings = parsed?.warnings || [];

  if (booting) {
    return (
      <div className="learning-page word-reader-page">
        <div className="word-booting">
          <LoaderCircle size={20} className="spin" /> 正在恢复 Word 讲义…
        </div>
      </div>
    );
  }

  if (!stored) {
    return (
      <div className="learning-page word-reader-page">
        <input
          ref={fileInput}
          type="file"
          accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          hidden
          onChange={(event) => {
            void openFile(event.target.files?.[0]);
            event.currentTarget.value = "";
          }}
        />
        <div className="page-heading learning-heading word-heading">
          <div>
            <div className="learning-step">教材学习 · Word 原讲义</div>
            <h1>教材学习</h1>
            <p className="muted">
              导入 .docx，阅读真实原文；识别出的数学词会直接变成图像链接，点击进入图像，返回仍在原段落。
            </p>
          </div>
          <div className="word-head-actions">
            <button className="btn primary" onClick={() => fileInput.current?.click()}>
              <Upload size={15} /> 打开 Word 讲义
            </button>
          </div>
        </div>
        {legacyPdf && (
          <section className="word-legacy-pdf card">
            <FileText size={20} />
            <div>
              <h3>上次打开的是 PDF</h3>
              <p>
                旧 PDF 记录没有删除，但 PDF 页码不能当作 Word 段落位置。可以继续打开旧阅读器，或导入新的 Word 讲义。
              </p>
            </div>
            <button className="btn" onClick={() => onNavigate("pdf-reader")}>
              继续旧 PDF 阅读器
            </button>
          </section>
        )}
        <section className="word-empty">
          <div className="word-empty-mark">
            <BookOpen size={30} />
          </div>
          <h2>先打开一份 Word 讲义</h2>
          <p>
            支持现代 .docx；旧 .doc 请先用 Word 另存为 .docx。原文件只在本机保存，不会自动上传整本文档。
          </p>
          <div className="word-empty-actions">
            <button className="btn primary" onClick={() => fileInput.current?.click()}>
              <Upload size={15} /> 选择我的 .docx
            </button>
            <button className="btn" onClick={() => void loadDemo()}>
              <FileText size={15} /> 载入 Word 测试讲义
            </button>
            <button className="btn" onClick={() => onNavigate("pdf-reader")}>
              旧 PDF 阅读器
            </button>
          </div>
          <small>
            测试讲义明确标注“非用户原文”，包含公式、表格、图片、跨格式狄利克雷案例，只用于验证流程。
          </small>
        </section>
        {error && <div className="word-error">{error}</div>}
      </div>
    );
  }

  return (
    <div className="learning-page word-reader-page">
      <input
        ref={fileInput}
        type="file"
        accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        hidden
        onChange={(event) => {
          void openFile(event.target.files?.[0]);
          event.currentTarget.value = "";
        }}
      />
      <div className="page-heading learning-heading word-heading">
        <div>
          <div className="learning-step">教材学习 · Word 原讲义</div>
          <h1>{parsed?.title || stored.name}</h1>
          <p className="muted">
            {stored.name} · 原文连续阅读 · 自动识别候选与 AI 规则会留下来源记录
          </p>
        </div>
        <div className="word-head-actions">
          <button className="btn" onClick={() => fileInput.current?.click()}>
            <Upload size={15} /> 打开讲义
          </button>
          <button className="btn" onClick={() => setRulesOpen(true)}>
            <Settings2 size={15} /> AI 规则与示例
          </button>
          <button className="btn primary" onClick={openAI}>
            <Sparkles size={15} /> 讨论选中内容
          </button>
          <button
            className="btn"
            disabled={!selectedText}
            onClick={() => setCorrectionOpen(true)}
          >
            纠正选中内容
          </button>
        </div>
      </div>

      <div className="word-toolbar">
        <div className="word-file-name">
          <FileText size={15} />
          <strong>{stored.name}</strong>
          {stored.isDemo && <span className="badge amber">演示讲义</span>}
          <span className="badge">{parsed?.blocks.length || 0} 段</span>
        </div>
        <div className="word-toolbar-right">
          <span className="word-analysis-badge">
            {analysis}
          </span>
          <button className="btn" onClick={() => void reanalyze()} disabled={analyzing}>
            <RefreshCw size={14} /> 重新识别
          </button>
          <button
            className="btn icon"
            onClick={() => setFontSize((value) => Math.max(14, value - 1))}
            aria-label="缩小字号"
          >
            A−
          </button>
          <span className="word-font-size">{fontSize}px</span>
          <button
            className="btn icon"
            onClick={() => setFontSize((value) => Math.min(20, value + 1))}
            aria-label="放大字号"
          >
            A+
          </button>
        </div>
      </div>

      {error && <div className="word-error">{error}</div>}

      <div className="word-layout">
        <main
          className="word-main"
          style={{ fontSize }}
          onMouseUp={() => {
            const selection = window.getSelection();
            const text = selection?.toString().trim() || "";
            if (!text) return;
            const anchor = selection?.anchorNode;
            const element =
              anchor instanceof Element
                ? anchor
                : anchor?.parentElement || null;
            const block = element?.closest<HTMLElement>("[data-block-id]");
            setSelectedText(text.slice(0, 500));
            setSelectedBlockId(block?.dataset.blockId || "");
          }}
        >
          <div className="word-document-meta">
            <span>Word 结构化连续阅读</span>
            <span>{parsed?.warnings.length || 0} 处转换提示</span>
            <a href={downloadUrl} download={stored.name}>
              <Download size={13} /> 下载原文件
            </a>
          </div>
          {parsed && (
            <DocxDocument
              blocks={parsed.blocks}
              links={links}
              warnings={parsed.warnings}
              onOpenLink={(link) => void openLink(link)}
            />
          )}
        </main>
        <aside className="word-side">
          {correctionOpen && (
            <section className="card word-side-card word-correction">
              <h3>纠正选中内容</h3>
              <p className="word-selected-text">「{selectedText}」</p>
              <select
                value={correctionTarget}
                onChange={(event) => setCorrectionTarget(event.target.value)}
                aria-label="纠正目标图像"
              >
                <option value="">不链接</option>
                {VISUALIZATIONS.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
              <input
                value={correctionReason}
                onChange={(event) => setCorrectionReason(event.target.value)}
                placeholder="理由（可选）"
                aria-label="纠正理由"
              />
              <div className="word-correction-actions">
                <button className="btn" onClick={() => setCorrectionOpen(false)}>
                  取消
                </button>
                <button
                  className="btn primary"
                  onClick={() => {
                    void (async () => {
                      const block = parsed?.blocks.find(
                        (item) => item.blockId === selectedBlockId,
                      );
                      try {
                        await addReaderExample({
                          block_text: block?.text || selectedText,
                          exact_text: selectedText,
                          target: correctionTarget,
                          visualization_id: correctionTarget,
                          reason: correctionReason,
                          source: "reader-selection",
                        });
                        setCorrectionOpen(false);
                        setCorrectionReason("");
                        notify("已保存纠正示例；重新识别后会作为参考");
                      } catch (cause) {
                        notify(
                          cause instanceof Error
                            ? cause.message
                            : "纠正示例保存失败",
                        );
                      }
                    })();
                  }}
                >
                  保存示例
                </button>
              </div>
            </section>
          )}
          <section className="card word-side-card">
            <h3>章节导航</h3>
            {sections.length ? (
              <nav>
                {sections.map((section) => (
                  <button
                    key={section.blockId}
                    className={`word-section-link level-${section.level || 1}`}
                    onClick={() =>
                      document
                        .getElementById(`docx-${section.blockId}`)
                        ?.scrollIntoView({ block: "start", behavior: "smooth" })
                    }
                  >
                    <ChevronRight size={12} /> {section.text}
                  </button>
                ))}
              </nav>
            ) : (
              <p className="muted">没有可识别的标题层级，按段落阅读。</p>
            )}
          </section>
          <section className="card word-side-card">
            <h3>识别与来源</h3>
            <p>
              当前链接：{links.length} 处
              {links.some((link) => link.origin === "local") && "（含本地词库）"}
              {links.some((link) => link.origin === "auto") && "（含模型）"}
            </p>
            <p className="muted">
              自动候选经过原文存在性、目标和范围校验；模型自报置信度不是唯一依据。
            </p>
            <button className="btn" onClick={() => void reanalyze()} disabled={analyzing}>
              <Wand2 size={14} /> {analyzing ? "识别中…" : "重新识别当前讲义"}
            </button>
          </section>
          <details className="card word-side-card word-warnings" open={warnings.length > 0}>
            <summary>转换提示 {warnings.length ? `(${warnings.length})` : ""}</summary>
            {warnings.length ? (
              warnings.slice(0, 20).map((warning) => (
                <p key={`${warning.blockId}-${warning.message}`}>
                  <strong>{warning.blockId}</strong> {warning.message}
                </p>
              ))
            ) : (
              <p className="muted">没有记录到转换警告。</p>
            )}
          </details>
          <section className="card word-side-card">
            <h3>怎么用</h3>
            <ol>
              <li>读原文；带下划线的词可直接点击。</li>
              <li>进入图像页探索，返回仍回到原段落。</li>
              <li>需要纠正识别时，打开“AI 规则与示例”。</li>
            </ol>
          </section>
        </aside>
      </div>

      <ReaderAIPanel
        open={aiOpen}
        onClose={() => setAiOpen(false)}
        documentName={stored.name}
        pageIndex={0}
        pageCount={1}
        pageText={aiText}
        contextLabel={aiLabel}
        contextDescription="只发送当前章节/段落与选中文字；Word 原文不会上传整本。"
        contextKey={`${stored.docId}-${activeBlock}`}
        sourceType="docx"
        blockId={activeBlock}
        sectionTitle={
          parsed?.blocks.find((block) => block.blockId === activeBlock)?.sectionTitle
        }
        documentId={stored.docId}
      />
      <AIRulesSettings
        open={rulesOpen}
        onClose={() => setRulesOpen(false)}
        notify={notify}
        visualizations={VISUALIZATIONS}
        testText="值得注意的是，狄利克雷函数是处处不连续，也不可导的函数。"
      />
    </div>
  );
}
