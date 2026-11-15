import { useEffect, useState } from "react";
import { FlaskConical, Save, Trash2, X } from "lucide-react";
import {
  addReaderExample,
  analyzeDocument,
  deleteReaderExample,
  fetchReaderSettings,
  resetReaderRule,
  saveReaderRule,
  type ReaderExample,
  type ReaderRuleTask,
  type ReaderSettings,
  type VisualizationOption,
} from "./api";
import "./ai-rules.css";

const TABS: { id: ReaderRuleTask; label: string; hint: string }[] = [
  {
    id: "recognition",
    label: "讲义识别",
    hint: "规定什么内容值得链接、哪些同名异义要忽略、重复词如何保守处理。",
  },
  {
    id: "image",
    label: "图像交互",
    hint: "规定 AI 改图时保留哪些设置、如何解释改动；不会取消场景校验。",
  },
  {
    id: "qa",
    label: "教学问答",
    hint: "规定讲解深度、术语和允许引用的课程范围。",
  },
];

export function AIRulesSettings({
  open,
  onClose,
  notify,
  visualizations,
  testText,
}: {
  open: boolean;
  onClose: () => void;
  notify: (text: string) => void;
  visualizations: VisualizationOption[];
  testText?: string;
}) {
  const [settings, setSettings] = useState<ReaderSettings | null>(null);
  const [tab, setTab] = useState<ReaderRuleTask>("recognition");
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [exampleText, setExampleText] = useState(testText || "");
  const [exampleTarget, setExampleTarget] = useState(visualizations[0]?.id || "");
  const [exampleReason, setExampleReason] = useState("");
  const [test, setTest] = useState("");
  const [testResult, setTestResult] = useState("");
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetchReaderSettings()
      .then((value) => {
        setSettings(value);
        setContent(value.rules[tab].content);
      })
      .catch((cause) => notify(cause instanceof Error ? cause.message : "读取规则失败"))
      .finally(() => setLoading(false));
  }, [open, tab, notify]);

  useEffect(() => {
    if (settings) setContent(settings.rules[tab].content);
  }, [tab, settings]);

  if (!open) return null;

  async function save() {
    if (!content.trim()) return;
    setSaving(true);
    try {
      const saved = await saveReaderRule(tab, content.trim());
      setSettings((current) =>
        current
          ? {
              ...current,
              rules: { ...current.rules, [tab]: { ...saved, custom: true } },
            }
          : current,
      );
      notify(`已保存${TABS.find((item) => item.id === tab)?.label}规则 v${saved.version}`);
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : "规则保存失败");
    } finally {
      setSaving(false);
    }
  }

  async function reset() {
    try {
      const saved = await resetReaderRule(tab);
      setContent(saved.content);
      setSettings((current) =>
        current
          ? { ...current, rules: { ...current.rules, [tab]: saved } }
          : current,
      );
      notify("已恢复该任务的默认规则");
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : "恢复默认失败");
    }
  }

  async function addExample() {
    if (!exampleText.trim()) return;
    try {
      const created = await addReaderExample({
        block_text: exampleText,
        exact_text: exampleText,
        target: exampleTarget,
        visualization_id: exampleTarget,
        reason: exampleReason,
        source: "settings-test",
      });
      setSettings((current) =>
        current ? { ...current, examples: [created, ...current.examples] } : current,
      );
      setExampleReason("");
      notify("已保存纠正示例；后续识别会把它作为参考");
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : "示例保存失败");
    }
  }

  async function removeExample(example: ReaderExample) {
    try {
      await deleteReaderExample(example.id);
      setSettings((current) =>
        current
          ? {
              ...current,
              examples: current.examples.filter((item) => item.id !== example.id),
            }
          : current,
      );
      notify("示例已删除");
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : "示例删除失败");
    }
  }

  async function runTest() {
    if (!test.trim()) return;
    setTesting(true);
    setTestResult("");
    try {
      const result = await analyzeDocument({
        documentName: "规则测试",
        docId: "rule-test",
        parserVersion: "settings-test",
        blocks: [{ blockId: "test-1", sectionTitle: "测试", text: test }],
        visualizations,
        maxCandidates: 8,
      });
      setTestResult(
        result.candidates.length
          ? result.candidates
              .map(
                (item) =>
                  `${item.exactText} → ${item.visualizationId}${
                    item.occurrence ? `（第 ${item.occurrence} 次）` : ""
                  }`,
              )
              .join("\n")
          : "模型没有返回通过校验的候选。",
      );
    } catch (cause) {
      setTestResult(
        cause instanceof Error
          ? `${cause.message}\n这可能表示未配置模型或请求失败，不会改动讲义。`
          : "测试失败，不会改动讲义。",
      );
    } finally {
      setTesting(false);
    }
  }

  const currentRule = settings?.rules[tab];

  return (
    <div className="rules-backdrop" role="dialog" aria-modal="true" aria-label="AI 规则与示例">
      <section className="rules-panel">
        <div className="rules-head">
          <div>
            <span className="badge purple">设置 · AI 规则与示例</span>
            <h2>告诉识别器该链接什么、忽略什么</h2>
            <p>规则和示例会实际进入识别请求；不会训练或改写外部模型参数。</p>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="关闭设置">
            <X size={18} />
          </button>
        </div>

        {loading ? (
          <p className="muted">正在读取规则…</p>
        ) : (
          <div className="rules-body">
            <div className="rules-tabs">
              {TABS.map((item) => (
                <button
                  key={item.id}
                  className={tab === item.id ? "active" : ""}
                  onClick={() => setTab(item.id)}
                >
                  {item.label}
                  {settings?.rules[item.id]?.custom && <i>自定义</i>}
                </button>
              ))}
            </div>
            <p className="rules-hint">{TABS.find((item) => item.id === tab)?.hint}</p>
            <label className="rules-editor">
              规则正文
              <textarea
                value={content}
                onChange={(event) => setContent(event.target.value)}
                rows={7}
                maxLength={12000}
              />
            </label>
            <div className="rules-actions">
              <span>
                {currentRule?.custom
                  ? `当前自定义 v${currentRule.version}`
                  : "当前使用产品默认规则"}
              </span>
              <button className="btn" onClick={() => void reset()}>
                恢复默认
              </button>
              <button className="btn primary" onClick={() => void save()} disabled={saving}>
                <Save size={14} /> {saving ? "保存中…" : "保存为新版本"}
              </button>
            </div>

            <div className="rules-test">
              <h3>
                <FlaskConical size={15} /> 测试一段原文
              </h3>
              <p>只预览拟链接的位置和目标准备，不会改动正在阅读的讲义。</p>
              <textarea
                value={test}
                onChange={(event) => setTest(event.target.value)}
                rows={3}
                placeholder="粘贴一段原文，例如：狄利克雷函数处处不连续。"
              />
              <button className="btn" onClick={() => void runTest()} disabled={testing || !test.trim()}>
                {testing ? "正在测试…" : "运行识别测试"}
              </button>
              {testResult && <pre className="rules-result">{testResult}</pre>}
            </div>

            <div className="rules-examples">
              <h3>纠正示例</h3>
              <p>
                这些示例会作为识别参考。保存示例不等于训练模型；要更新已读内容，请回阅读页执行重新识别。
              </p>
              <div className="rules-example-form">
                <input
                  value={exampleText}
                  onChange={(event) => setExampleText(event.target.value)}
                  placeholder="应识别的原文片段"
                  aria-label="示例原文片段"
                />
                <select
                  value={exampleTarget}
                  onChange={(event) => setExampleTarget(event.target.value)}
                  aria-label="示例目标图像"
                >
                  <option value="">不链接（否定示例）</option>
                  {visualizations.map((item) => (
                    <option value={item.id} key={item.id}>
                      {item.label}
                    </option>
                  ))}
                </select>
                <input
                  value={exampleReason}
                  onChange={(event) => setExampleReason(event.target.value)}
                  placeholder="纠正理由（可选）"
                  aria-label="纠正理由"
                />
                <button className="btn" onClick={() => void addExample()} disabled={!exampleText.trim()}>
                  添加示例
                </button>
              </div>
              {settings?.examples.length ? (
                <div className="rules-example-list">
                  {settings.examples.slice(0, 8).map((example) => (
                    <div key={example.id}>
                      <span>
                        <strong>{example.exact_text}</strong>
                        <small>{example.visualization_id || example.target || "不链接"}</small>
                      </span>
                      <button onClick={() => void removeExample(example)} aria-label="删除示例">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="muted">还没有纠正示例。</p>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
