import { WorkbenchShell, ThemeSwitch } from "./app/layout/WorkbenchShell";
import { NavRail } from "./app/layout/NavRail";
import { MainSplit } from "./app/layout/MainSplit";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import {
  StickyNote,
  Search,
  CircleHelp,
  Bell,
  ChevronDown,
  ChevronRight,
  Upload,
  ArrowRight,
  X,
  Menu,
  Check,
  Sparkles,
  LogOut,
} from "lucide-react";
const Exploration = lazy(() => import("./pages/FunctionWorkspace"));
const Textbook = lazy(() =>
  import("./pages/Learning").then((module) => ({ default: module.Textbook })),
);
const Examples = lazy(() =>
  import("./pages/Learning").then((module) => ({ default: module.Examples })),
);
const Proof = lazy(() =>
  import("./pages/Learning").then((module) => ({ default: module.Proof })),
);
const Exercises = lazy(() =>
  import("./pages/Learning").then((module) => ({ default: module.Exercises })),
);
const Review = lazy(() =>
  import("./pages/Learning").then((module) => ({ default: module.Review })),
);
const KnowledgeMap = lazy(() =>
  import("./pages/Maps").then((module) => ({ default: module.KnowledgeMap })),
);
const PracticeMap = lazy(() =>
  import("./pages/Maps").then((module) => ({ default: module.PracticeMap })),
);
const Dashboard = lazy(() =>
  import("./pages/Dashboard").then((module) => ({ default: module.Dashboard })),
);
const Notes = lazy(() =>
  import("./pages/Notes").then((module) => ({ default: module.Notes })),
);
const Diagnostic = lazy(() =>
  import("./pages/Diagnostic").then((module) => ({ default: module.Diagnostic })),
);
const LocalTextbook = lazy(() =>
  import("./pages/LocalTextbook").then((module) => ({
    default: module.LocalTextbook,
  })),
);
const SurfaceWorkspace = lazy(
  () => import("./modules/visualization/three-d/SurfaceWorkspace"),
);
import { navigation, pageFromHash, validRoutes } from "./navigation";
import { useAppData } from "./app/DataProvider";
import { searchRequest } from "./lib/api";
import { useSession } from "./lib/session";
import { aiStatusLabel, DeepSeekSettings } from "./modules/ai/DeepSeekSettings";
import { useAIConnection } from "./modules/ai/connection";

const LearningArchiveSettings = lazy(() => import("./modules/records/LearningArchiveSettings")
  .then((module) => ({ default: module.LearningArchiveSettings })));

export default function App() {
  const session = useSession();
  const app = useAppData();
  const ai = useAIConnection();
  const aiState = ai.failed ? "error" : ai.status?.state || (ai.effective?.configured ? "ready" : "unset");
  const [page, setPage] = useState(pageFromHash);
  const [railCollapsed, setRailCollapsed] = useState(false);
  const [sidebar, setSidebar] = useState(false);
  const [toast, setToast] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [modal, setModal] = useState("");
  const [remoteResults, setRemoteResults] = useState<
    { id: string; label: string; page: string; type: string }[]
  >([]);
  const [name, setName] = useState(
    () => session.user?.display_name || localStorage.getItem("axiom-name") || "林越",
  );
  const notes = app.data.notes;  const title =
    navigation.flatMap((g) => g.items).find((i) => i[0] === page)?.[1] ||
    "学习工作台";
  const notify = (text: string) => {
    setToast(text);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(""), 3500);
  };
  function navigate(id: string) {
    if (!validRoutes.includes(id)) {
      notify("请从左侧选择学习模块");
      return;
    }
    if (
      id === "explore" &&
      ["textbook", "examples", "proof", "exercises", "knowledge-map"].includes(
        page,
      )
    )
      localStorage.setItem("axiom-explore-request", app.selectedConceptId);
    location.hash = id;
    setPage(id);
    setSidebar(false);
    setSearchOpen(false);
    window.scrollTo({ top: 0 });
    if (id !== "dashboard") localStorage.setItem("axiom-last-page", id);
  }
  async function saveNote(text: string, conceptId?: string) {
    try {
      await app.saveNote(text, conceptId);
      notify("已保存到我的笔记");
    } catch (cause) {
      notify(
        cause instanceof Error ? cause.message : "保存笔记失败，请稍后再试",
      );
    }
  }
  useEffect(() => {
    setName(session.user?.display_name || localStorage.getItem("axiom-name") || "林越");
  }, [session.user?.display_name]);
  useEffect(() => {
    if (!query.trim() || !session.serverMode) {
      setRemoteResults([]);
      return;
    }
    let active = true;
    const handle = setTimeout(async () => {
      try {
        const result = await searchRequest(query.trim());
        if (!active) return;
        const pageByType: Record<string, string> = {
          concept: "textbook",
          classic: "examples",
          proposition: "examples",
          proof: "proof",
          exercise: "exercises",
        };
        setRemoteResults(
          result.items.map((item) => ({
            id: item.id,
            label: item.title,
            page: pageByType[item.type] || "textbook",
            type:
              {
                concept: "知识点",
                classic: "经典案例",
                proposition: "命题",
                proof: "证明",
                exercise: "练习",
              }[item.type] || item.type,
          })),
        );
      } catch {
        if (active) setRemoteResults([]);
      }
    }, 220);
    return () => {
      active = false;
      clearTimeout(handle);
    };
  }, [query, session.serverMode]);
  useEffect(() => {
    const hash = () => {
      setPage(pageFromHash());
      setSidebar(false);
      setSearchOpen(false);
      window.scrollTo(0, 0);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setModal("");
        setSearchOpen(false);
        setSidebar(false);
      }
    };
    window.addEventListener("hashchange", hash);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("hashchange", hash);
      window.removeEventListener("keydown", key);
      clearTimeout(timer.current);
    };
  }, []);
  useEffect(() => {
    document.title = `${title} · Axiom 公理`;
  }, [title]);
  const common = { onNavigate: navigate, onSaveNote: saveNote, notify };
  const localSearchResults = [
    ...app.data.units.map((unit) => ({
      id: unit.id,
      label: unit.title,
      page: "textbook",
      type: "知识点",
    })),
    ...navigation
      .flatMap((g) => g.items)
      .map(([id, label]) => ({ id, label, page: id, type: "工作区" })),
  ].filter((x) => x.label.toLowerCase().includes(query.toLowerCase()));
  const searchResults = remoteResults.length
    ? remoteResults
    : localSearchResults;
  return (
    <WorkbenchShell collapsed={railCollapsed} rail={<NavRail page={page} sidebar={sidebar} collapsed={railCollapsed}
      name={name} mastery={app.data.dashboard.summary.mastery.overall} serverMode={session.serverMode}
      role={session.user?.role} onToggle={() => setRailCollapsed(!railCollapsed)}
      closeMobile={() => setSidebar(false)} navigate={navigate} openProfile={() => setModal("profile")} />}>
      <div className="main-shell">
        <header className="topbar">
          <button
            className="icon-button mobile-menu"
            aria-label="打开导航"
            onClick={() => setSidebar(true)}
          >
            <Menu size={21} />
          </button>
          <div className="breadcrumbs">
            <span>{page.includes("map") ? "可视化视图" : "数学分析"}</span>
            <ChevronRight size={14} />
            <strong>{title}</strong>
          </div>
          <div className="topbar-right">
            <ThemeSwitch />
            <button className={`btn ai-status-badge ai-status-${aiState}`} onClick={() => setModal("ai")}
              aria-label={`个人 DeepSeek 接入设置，AI ${aiStatusLabel(aiState)}`}>
              <Sparkles size={14} aria-hidden="true" />
              <span>AI {aiStatusLabel(aiState)}</span>
            </button>
            <label className="search-wrap">
              <Search size={16} />
              <input
                aria-label="搜索知识点、定理、反例"
                placeholder="搜索知识点、定理、反例…"
                value={query}
                onFocus={() => setSearchOpen(true)}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setSearchOpen(true);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && searchResults[0]) {
                    if (searchResults[0].type === "知识点")
                      app.selectConcept(searchResults[0].id);
                    navigate(searchResults[0].page);
                  }
                }}
              />
              {searchOpen && (
                <>
                  <div
                    className="search-dismiss"
                    onClick={() => setSearchOpen(false)}
                  />
                  <div className="search-results">
                    <small>{query ? "搜索结果" : "快速前往"}</small>
                    {searchResults.slice(0, 9).map((r) => (
                      <button
                        key={r.type + r.id}
                        onClick={() => {
                          if (r.type === "知识点") app.selectConcept(r.id);
                          navigate(r.page);
                        }}
                      >
                        <Search size={14} />
                        {r.label}
                        <span>{r.type}</span>
                      </button>
                    ))}
                    {!searchResults.length && (
                      <p>没有找到相关内容，试试“连续”或“积分”。</p>
                    )}
                  </div>
                </>
              )}
            </label>
            <button
              className="icon-button"
              aria-label="使用帮助"
              onClick={() => setModal("help")}
            >
              <CircleHelp size={18} />
            </button>
            <button
              className="icon-button notification"
              aria-label="学习通知"
              onClick={() => setModal("notifications")}
            >
              <Bell size={18} />
              <i />
            </button>
            <div className="top-divider" />
            <button className="top-profile" onClick={() => setModal("profile")}>
              <span className="avatar pale">{name.slice(0, 1)}</span>
              <span>{name}</span>
              <ChevronDown size={13} />
            </button>
          </div>
        </header>
        <main className="page-content">
          <Suspense fallback={<div className="page-loading">正在载入页面…</div>}>
          {page === "dashboard" && (
            <Dashboard
              name={name}
              onNavigate={navigate}
              onUpload={() => setModal("upload")}
            />
          )}
          {(page === "textbook" || page === "explore") && (
            <MainSplit page={page} navigate={navigate} graph={<Exploration {...common} />} lecture={<>
              <div className="page-tools">
                <span className="badge">示例讲义 · 非已解析教材</span>
                <button className="btn" onClick={() => setModal("upload")}>
                  <Upload size={15} />
                  打开本地教材
                </button>
              </div>
              <Textbook {...common} />
            </>} />
          )}
          {page === "examples" && <Examples {...common} />}
          {page === "proof" && <Proof {...common} />}
          {page === "exercises" && <Exercises {...common} />}
          {page === "review" && <Review {...common} />}
          {page === "practice-map" && (
            <PracticeMap onNavigate={navigate} notify={notify} />
          )}
          {page === "knowledge-map" && (
            <KnowledgeMap onNavigate={navigate} notify={notify} />
          )}
          {page === "surface" && <SurfaceWorkspace onOpenSettings={() => setModal("ai")} />}
          {page === "notes" && (
            <Notes
              notes={notes}
              save={async (text) => {
                await app.saveNote(text);
                notify("已保存到我的笔记");
              }}
              remove={(id) => {
                void (async () => {
                  try {
                    await app.deleteNote(id);
                    notify("笔记已删除");
                  } catch (cause) {
                    notify(
                      cause instanceof Error
                        ? cause.message
                        : "删除笔记失败，请稍后再试",
                    );
                  }
                })();
              }}
            />
          )}
          {page === "diagnostic" && <Diagnostic onNavigate={navigate} />}
          </Suspense>
        </main>
        <footer className="app-footer">
          Axiom 公理 <span>从图像直觉，走向严谨证明</span>
          <span>
            {session.serverMode
              ? `已连接后端 · ${session.user?.email || ""}`
              : "离线演示 · 未连接后端"}
          </span>
        </footer>
      </div>
      {toast && (
        <div className="toast" role="status">
          <Check size={17} />
          {toast}
        </div>
      )}
      {modal && (
        <div
          className="modal-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setModal("");
          }}
        >
          <section
            className={`modal ${modal === "upload" ? "upload-modal" : ""}`}
            role="dialog"
            aria-modal="true"
            aria-label={modal === "ai" ? "个人 DeepSeek 接入设置" : modal === "upload" ? "本地教材" : "工作台设置"}
          >
            <button
              className="icon-button modal-close"
              autoFocus
              aria-label="关闭弹窗"
              onClick={() => setModal("")}
            >
              <X size={20} />
            </button>
            {modal === "ai" && (
              <>
                <h2>个人 DeepSeek 接入设置</h2>
                <DeepSeekSettings />
              </>
            )}
            {modal === "help" && (
              <>
                <span className="tile-icon">
                  <CircleHelp />
                </span>
                <h2>从一个问题开始</h2>
                <p className="muted">
                  跟随左侧学习流程：阅读定义、操作图像、对比反例、理解证明，再完成练习。
                </p>
                <div className="info-strip">
                  {session.serverMode
                    ? "当前已登录后端：内容、练习、作答、笔记、诊断和学习进度都来自服务端。"
                    : "当前离线演示：数据保存在浏览器；连接后端后作答与笔记会写入服务端。"}
                  可从顶部 AI 徽章打开个人 DeepSeek 接入设置。
                </div>
                <p>
                  图像页可输入 sin(a*x^2)，或配置模型后发送“换成分段函数”。
                  经典预设和三维投影在“经典教学与三维示例”入口中。
                </p>
                <button
                  className="btn primary"
                  onClick={() => {
                    setModal("");
                    navigate("explore");
                  }}
                >
                  开始图像探索
                  <ArrowRight size={16} />
                </button>
              </>
            )}
            {modal === "notifications" && (
              <>
                <h2>学习通知</h2>
                <div className="notification-item">
                  <span className="tile-icon">
                    <Sparkles size={18} />
                  </span>
                  <div>
                    <strong>学习空间已准备就绪</strong>
                    <p className="muted">
                      从连续性到定积分，8 个主题已开放演示。
                    </p>
                  </div>
                </div>
                <div className="notification-item">
                  <span className="tile-icon teal">
                    <StickyNote size={18} />
                  </span>
                  <div>
                    <strong>
                      {session.serverMode ? "笔记已同步到后端" : "笔记保存在当前浏览器"}
                    </strong>
                    <p className="muted">
                      {session.serverMode
                        ? "换设备登录同一账号后仍可查看。可在“我的笔记”导出 Markdown 备份。"
                        : "可在“我的笔记”导出备份。清除浏览器数据会删除本地记录。"}
                    </p>
                  </div>
                </div>
              </>
            )}
            {modal === "profile" && (
              <>
                <h2>学习者设置</h2>
                <p className="muted">
                  {session.serverMode
                    ? `已登录：${session.user?.email}（${session.user?.role === "admin" ? "管理员" : "学生"}）`
                    : "当前为本地学习空间。"}
                </p>
                <label className="field-label">
                  显示名称
                  <input
                    className="text-input"
                    value={name}
                    maxLength={16}
                    onChange={(e) => setName(e.target.value)}
                  />
                </label>
                <button
                  className="btn primary"
                  onClick={async () => {
                    const next = name.trim() || "学习者";
                    try {
                      await session.updateName(next);
                      setName(next);
                      setModal("");
                      notify("显示名称已保存");
                    } catch {
                      notify("名称保存失败，请检查后端连接");
                    }
                  }}
                >
                  保存设置
                </button>
                {!session.serverMode && (
                  <button className="btn" onClick={session.switchToServer}>切换到服务器模式</button>
                )}
                {session.serverMode && (
                  <button
                    className="btn"
                    style={{ marginTop: 10, width: "100%" }}
                    onClick={() => void session.logout()}
                  >
                    <LogOut size={15} />
                    退出登录
                  </button>
                )}
                <Suspense fallback={<p>正在载入存档设置…</p>}>
                  <LearningArchiveSettings />
                </Suspense>
              </>
            )}
            {modal === "upload" && (
              <Suspense fallback={<p>正在载入本地教材…</p>}>
                <LocalTextbook notify={notify} />
              </Suspense>
            )}
          </section>
        </div>
      )}
    </WorkbenchShell>
  );
}
