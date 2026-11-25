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

export function LocalTextbook({ notify }: { notify: (t: string) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState("");
  const input = useRef<HTMLInputElement>(null);
  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url);
    },
    [url],
  );
  function choose(f?: File) {
    if (!f) return;
    if (!f.name.toLowerCase().endsWith(".pdf")) {
      notify("请选择 PDF 文件");
      return;
    }
    if (f.size > 50 * 1024 * 1024) {
      notify("本地预览限 50 MB 以内的 PDF");
      return;
    }
    setFile(f);
    setUrl(URL.createObjectURL(f));
  }
  return (
    <>
      <h2>打开本地教材</h2>
      <p className="muted">
        文件仅在此浏览器中预览，不会上传。自动解析与知识提取将在后端接入后开放。
      </p>
      <input
        type="file"
        accept="application/pdf,.pdf"
        ref={input}
        hidden
        onChange={(e) => choose(e.target.files?.[0])}
      />
      <button
        className="upload-zone"
        onClick={() => input.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          choose(e.dataTransfer.files[0]);
        }}
      >
        <Upload size={28} />
        <strong>{file ? file.name : "点击选择或拖入数学教材 PDF"}</strong>
        <span>
          {file
            ? `${(file.size / 1024 / 1024).toFixed(1)} MB · 点击更换文件`
            : "PDF · 最大 50 MB"}
        </span>
      </button>
      {url && (
        <iframe className="pdf-preview" title="本地教材 PDF 预览" src={url} />
      )}
      <p className="small muted">
        关闭此窗口后需重新选择文件。当前知识卡片使用独立编写的示例讲义。
      </p>
    </>
  );
}
