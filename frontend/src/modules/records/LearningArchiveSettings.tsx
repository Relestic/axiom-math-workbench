import { useRef, useState } from "react";
import {
  ArchiveUnavailable,
  exportBrowserArchive,
  exportFullArchive,
  prepareFullArchive,
  readBrowserArchive,
  readLearningStorage,
  replaceLearningStorage,
  validateLearningStorage,
} from "./archiveApi";

function saveArchive(blob: Blob, extension: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `axiom-learning-${new Date().toISOString().slice(0, 10)}.${extension}`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function LearningArchiveSettings() {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ text: string; error?: boolean }>();

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setFeedback(undefined);
    try {
      await action();
    } catch (cause) {
      setFeedback({
        text: cause instanceof Error ? cause.message : "存档操作失败。",
        error: true,
      });
    } finally {
      setBusy(false);
    }
  }

  async function exportArchive() {
    const storage = validateLearningStorage(readLearningStorage());
    try {
      saveArchive(await exportFullArchive(storage), "zip");
      setFeedback({ text: "已下载完整学习存档（ZIP）。" });
    } catch (cause) {
      if (!(cause instanceof ArchiveUnavailable)) throw cause;
      saveArchive(exportBrowserArchive(storage), "json");
      setFeedback({
        text: "本地 Python 服务不可用，已下载浏览器学习存档（JSON）。",
      });
    }
  }

  async function importArchive(file: File) {
    const browserOnly = /\.json$/i.test(file.name);
    let restore: () => void | Promise<void>;
    try {
      if (browserOnly) {
        const snapshot = await readBrowserArchive(file);
        restore = () => {
          replaceLearningStorage(snapshot);
        };
      } else {
        restore = await prepareFullArchive(file);
      }
    } catch (cause) {
      if (cause instanceof ArchiveUnavailable) {
        throw new Error(
          "导入完整 ZIP 需要启动本地 Python 服务。浏览器 JSON 存档可直接导入。",
        );
      }
      throw cause;
    }
    const scope = browserOnly
      ? "此浏览器中的学习记录"
      : "本机数据库和此浏览器中的学习记录";
    if (!window.confirm(`导入会替换${scope}。继续导入？`)) return;
    await restore();
    window.location.reload();
  }

  return (
    <section
      className="learning-archive-settings"
      aria-labelledby="archive-title"
    >
      <h3 id="archive-title">本地学习存档</h3>
      <p className="muted">
        备份进度、笔记和图像场景。连接本地服务时导出 ZIP，离线时导出浏览器
        JSON。
      </p>
      <div className="button-row">
        <button
          className="btn"
          disabled={busy}
          onClick={() => void run(exportArchive)}
        >
          导出学习存档
        </button>
        <button
          className="btn"
          disabled={busy}
          onClick={() => input.current?.click()}
        >
          导入学习存档
        </button>
      </div>
      <input
        ref={input}
        type="file"
        hidden
        accept=".zip,.json"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void run(() => importArchive(file));
        }}
      />
      {busy && <p role="status">正在处理存档…</p>}
      {feedback && (
        <p role={feedback.error ? "alert" : "status"}>{feedback.text}</p>
      )}
    </section>
  );
}
